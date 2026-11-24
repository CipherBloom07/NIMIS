"""Read-only/append-only local pilot intake for draft collector datasets.

This module is imported only by the isolated NIMIS Core development API.
No production identity, scheme-master write or published reporting is enabled.
"""
from __future__ import annotations

import hashlib
import json
import re
from decimal import Decimal,InvalidOperation
from datetime import datetime
from pathlib import Path
from uuid import UUID
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Header, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from server.core.app import actor, db, in_scope, need_role

router = APIRouter(prefix="/api/v1/stage/forms", tags=["field-form-staging"])

@router.put("/evidence/{photo_id}")
async def upload_field_evidence(
    photo_id: UUID, request: Request, scheme_id: UUID = Query(...),
    x_content_sha256: str | None = Header(default=None), user=Depends(actor),
):
    """Checksum-verified private photo, <=500 KiB, scoped to assigned scheme."""
    need_role(user,"data_collector")
    mime=request.headers.get("content-type","").split(";")[0].strip().lower()
    if mime not in ("image/jpeg","image/png","image/webp"):
        raise HTTPException(415,detail="Supported field photo JPEG/PNG/WebP required")
    length=request.headers.get("content-length")
    if length and (not length.isdecimal() or int(length)>524288):
        raise HTTPException(413,detail="Field photo exceeds 512 KiB")
    data=await request.body()
    if not data or len(data)>524288:
        raise HTTPException(413,detail="Field photo must contain 1–524288 bytes")
    if ((mime=="image/jpeg" and not data.startswith(bytes.fromhex("ffd8ff"))) or
        (mime=="image/png" and not data.startswith(bytes.fromhex("89504e470d0a1a0a"))) or
        (mime=="image/webp" and not (data.startswith(b"RIFF") and data[8:12]==b"WEBP"))):
        raise HTTPException(422,detail="File content does not match declared image type")
    digest=hashlib.sha256(data).hexdigest()
    if not x_content_sha256 or x_content_sha256.lower()!=digest:
        raise HTTPException(422,detail="Photo checksum does not match")
    with db() as conn:
        scheme=conn.execute(
            "SELECT province_code,district_code FROM nimis_stage.scheme WHERE scheme_id=%s",
            (scheme_id,),
        ).fetchone()
        if not scheme or not in_scope(user,scheme["province_code"],scheme["district_code"]):
            raise HTTPException(403,detail="Scheme outside authorized collector scope")
        assigned=conn.execute(
            """SELECT 1 FROM nimis_stage.assignment WHERE scheme_id=%s AND
               collector_id=%s AND revoked_at IS NULL""",
            (scheme_id,user["actor_id"]),
        ).fetchone()
        if not assigned:
            raise HTTPException(403,detail="Active collector assignment required")
        inserted=conn.execute(
            """INSERT INTO nimis_stage.field_attachment
               (photo_id,uploaded_by,scheme_id,mime_type,sha256,content)
               VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING RETURNING photo_id""",
            (photo_id,user["actor_id"],scheme_id,mime,digest,data),
        ).fetchone()
        if inserted is None:
            existing=conn.execute(
                """SELECT uploaded_by,scheme_id,mime_type,sha256 FROM nimis_stage.field_attachment
                   WHERE photo_id=%s""",(photo_id,),
            ).fetchone()
            if (not existing or existing["uploaded_by"]!=user["actor_id"] or
                existing["scheme_id"]!=scheme_id or existing["sha256"]!=digest or
                existing["mime_type"]!=mime):
                raise HTTPException(409,detail="Photo ID already used for different evidence")
            return {"photo_id":str(photo_id),"sha256":digest,"outcome":"duplicate"}
        conn.execute(
            """INSERT INTO nimis_stage.audit(actor_id,event_type,entity_type,entity_id,details)
               VALUES (%s,'EVIDENCE_STORED','field_attachment',%s,%s::jsonb)""",
            (user["actor_id"],photo_id,json.dumps({"scheme_id":str(scheme_id),
                                                    "sha256":digest,"bytes":len(data)})),
        )
    return {"photo_id":str(photo_id),"sha256":digest,"outcome":"accepted"}


@router.get("/evidence/{photo_id}")
def read_field_evidence(photo_id: UUID, user=Depends(actor)):
    """Private review-only download, with same geography rules as form detail."""
    need_role(user,"admin","provincial_officer","district_officer","data_collector")
    with db() as conn:
        row=conn.execute(
            """SELECT a.*,s.province_code,s.district_code FROM nimis_stage.field_attachment a
               JOIN nimis_stage.scheme s ON s.scheme_id=a.scheme_id WHERE a.photo_id=%s""",
            (photo_id,),
        ).fetchone()
    if not row:
        raise HTTPException(404,detail="Photo not found")
    if user["role_code"]=="data_collector":
        allowed=(row["uploaded_by"]==user["actor_id"])
    else:
        allowed=in_scope(user,row["province_code"],row["district_code"])
    if not allowed:raise HTTPException(404,detail="Photo not found")
    return Response(content=bytes(row["content"]),media_type=row["mime_type"],
                    headers={"Cache-Control":"private, no-store",
                             "X-Content-SHA256":row["sha256"]})



_CATALOGUE = json.loads(
    (Path(__file__).resolve().parent / "collector_form_catalogue.json").read_text("utf-8")
)
FORMS = {form["form_id"]: form for form in _CATALOGUE["forms"]}


class FormOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_id: UUID
    record_id: UUID
    revision: int = Field(ge=1)
    device_id: UUID
    scheme_id: UUID | None = None
    form_id: str
    form_version: int = Field(ge=1)
    period_code: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    captured_at: datetime
    observed_at: datetime
    source: str = Field(min_length=1, max_length=160)
    base_scheme_revision: int | None = Field(default=None, ge=1)
    answers: dict = Field(min_length=1)

    @field_validator("captured_at", "observed_at")
    @classmethod
    def must_have_timezone(cls, value: datetime):
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Timestamp must contain a timezone")
        return value


class FormBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operations: list[FormOperation] = Field(min_length=1, max_length=25)


def _validate(op: FormOperation):
    definition = FORMS.get(op.form_id)
    if not definition or op.form_version != definition["form_version"]:
        raise ValueError("Unknown or unapproved-for-pilot form version")
    allowed = {f["field_id"]: f for f in definition["fields"]}
    extra = set(op.answers) - set(allowed)
    if extra:
        raise ValueError("Unrecognized form fields: " + ", ".join(sorted(extra)[:3]))
    for key, value in op.answers.items():
        field = allowed[key]
        typ = field["type"]
        if typ.startswith("measurement:") or typ == "integer":
            try:
                amount = float(value)
            except (TypeError, ValueError):
                raise ValueError("Invalid numeric value: " + key)
            if not 0 <= amount < 1e13:
                raise ValueError("Out-of-range value: " + key)
            if key.endswith("_percent") and amount > 100:
                raise ValueError("Invalid percentage: " + key)
        if typ == "point":
            if not isinstance(value, dict) or not isinstance(value.get("latitude"), (int,float)) or not isinstance(value.get("longitude"), (int,float)):
                raise ValueError("Invalid GPS point: " + key)
            if not -90 <= value["latitude"] <= 90 or not -180 <= value["longitude"] <= 180:
                raise ValueError("GPS coordinates out of bounds: " + key)
        if typ in ("photo", "attachments") and not isinstance(value, (str,list)):
            raise ValueError("Invalid media reference: " + key)
        if typ in ("photo", "attachments"):
            ids=value if isinstance(value,list) else [value]
            if len(ids)>30:
                raise ValueError("Too many photographs: " + key)
            if any(not isinstance(x,str) or not x.strip() for x in ids):
                raise ValueError("Invalid evidence reference: " + key)
            try:
                for photo_id in ids:UUID(photo_id)
            except (ValueError,TypeError):
                raise ValueError("Evidence must reference stored photo UUIDs: " + key)
        if typ=="integer" and (isinstance(value,bool) or
            str(value).strip().startswith("-") or not str(value).strip().isdigit()):
            raise ValueError("Expected non-negative whole number: " + key)
        if typ in ("multi","reference_list"):
            if (not isinstance(value,list) or len(value)>100 or
                any(not isinstance(x,str) or not 1<=len(x.strip())<=180
                    for x in value)):
                raise ValueError("Expected a list of concise entries: " + key)
        if typ=="repeating_group":
            if (not isinstance(value,list) or len(value)>100 or
                any(not isinstance(x,dict) or not x or len(x)>30
                    for x in value)):
                raise ValueError("Expected structured repeated records: " + key)
        if typ=="group" and (not isinstance(value,dict) or len(value)>50):
            raise ValueError("Expected a structured record: " + key)
        if typ.startswith("choice") and (not isinstance(value,str) or
            not 1<=len(value.strip())<=160):
            raise ValueError("Select a valid answer: " + key)
        exact_choices={
            "choice:yes_no":{"Yes","No"},
            "choice:good_moderate_bad":{"Good","Moderate","Bad"},
            "choice:gauge_visual_estimate":{"gauge","visual","estimate"},
            "choice:SI87_B1_B2_B3_B4_SIRP_other":{
              "SI87","B1","B2","B3","B4","SIRP","other"},
        }
        if typ in exact_choices and value not in exact_choices[typ]:
            raise ValueError("Unrecognized approved-choice candidate: " + key)
        if typ=="uuid":
            try:UUID(str(value))
            except (ValueError,TypeError):
                raise ValueError("Expected a UUID: " + key)
        if typ=="date" and (not isinstance(value,str) or
            not re.fullmatch(r"\\d{4}-\\d{2}-\\d{2}",value)):
            raise ValueError("Expected YYYY-MM-DD date: " + key)
    if op.scheme_id is None and op.form_id != "new_scheme_request":
        raise ValueError("An existing scheme needs a canonical UUID")
    if op.form_id == "new_scheme_request" and op.scheme_id is not None:
        raise ValueError("A new scheme request cannot claim an existing scheme UUID")
    if op.form_id == "new_scheme_request":
        if not all(op.answers.get(k) for k in ("scheme_name", "province", "district")):
            raise ValueError("New scheme request needs name, province and district")
    if op.form_id != "new_scheme_request" and op.base_scheme_revision is None:
        raise ValueError("Current master revision required")
    def ensure_limit(lower,upper,message):
        a,b=op.answers.get(lower),op.answers.get(upper)
        if a not in (None,"") and b not in (None,"") and Decimal(str(a))>Decimal(str(b)):
            raise ValueError(message)
    ensure_limit("functional_area_ha","equipped_area_ha",
                 "Functional area cannot exceed equipped area")
    ensure_limit("actually_irrigated_area_ha","equipped_area_ha",
                 "Irrigated area cannot exceed equipped area")
    ensure_limit("harvested_area_ha","planted_area_ha",
                 "Harvested area cannot exceed planted area")
    ensure_limit("substantially_complete_ha","target_area_ha",
                 "Completed area cannot exceed project target")
    media_types = {"photo", "attachments"}
    evidence_pending = any(
        allowed[key]["type"] in media_types and bool(value)
        for key, value in op.answers.items()
    )
    body = op.model_dump(mode="json")
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"), allow_nan=False)
    if len(canonical.encode("utf-8")) > 131072:
        raise ValueError("Submission exceeds 128 KB")
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest(), evidence_pending


def _one(op: FormOperation, user: dict):
    result = {"event_id": str(op.event_id)}
    try:
        digest, evidence_pending = _validate(op)
    except (TypeError, ValueError) as error:
        return {**result, "outcome": "rejected", "reason": str(error)}
    with db() as conn:
        if op.scheme_id:
            scheme = conn.execute(
                "SELECT * FROM nimis_stage.scheme WHERE scheme_id=%s FOR SHARE",
                (op.scheme_id,),
            ).fetchone()
            if scheme is None:
                return {**result, "outcome": "rejected", "reason": "Canonical scheme not found"}
            if not in_scope(user, scheme["province_code"], scheme["district_code"]):
                return {**result, "outcome": "rejected", "reason": "Scheme outside collector district"}
            assigned = conn.execute(
                """SELECT 1 FROM nimis_stage.assignment WHERE scheme_id=%s
                   AND collector_id=%s AND revoked_at IS NULL""",
                (op.scheme_id, user["actor_id"]),
            ).fetchone()
            if not assigned:
                return {**result, "outcome": "rejected", "reason": "Scheme not assigned to collector"}
        else:
            # No master row is created. Reviewers must reconcile duplicates.
            if not in_scope(user, op.answers["province"], op.answers["district"]):
                return {**result, "outcome": "rejected", "reason": "New scheme request outside district"}

        existing = conn.execute(
            """SELECT event_id,collector_id,content_sha256 FROM nimis_stage.field_form_submission
               WHERE event_id=%s OR (record_id=%s AND revision=%s)""",
            (op.event_id, op.record_id, op.revision),
        ).fetchall()
        if existing:
            if len(existing) == 1 and existing[0]["event_id"] == op.event_id and \
                    existing[0]["collector_id"] == user["actor_id"] and \
                    existing[0]["content_sha256"] == digest:
                return {**result, "outcome": "duplicate"}
            return {**result, "outcome": "conflict", "reason": "Record revision or event ID already used"}

        if evidence_pending and op.scheme_id:
            media_fields={f["field_id"] for f in FORMS[op.form_id]["fields"]
                          if f["type"] in ("photo","attachments")}
            raw_ids=[]
            for key in media_fields & op.answers.keys():
                value=op.answers[key]
                raw_ids.extend(value if isinstance(value,list) else [value])
            try:
                ids=[UUID(str(photo_id)) for photo_id in raw_ids if photo_id]
            except (ValueError, TypeError):
                return {**result,"outcome":"rejected",
                        "reason":"Evidence references must be valid photo UUIDs"}
            if ids:
                uploaded=conn.execute(
                    """SELECT count(*) AS total FROM nimis_stage.field_attachment
                       WHERE photo_id = ANY(%s::uuid[]) AND uploaded_by=%s AND scheme_id=%s""",
                    (ids,user["actor_id"],op.scheme_id),
                ).fetchone()["total"]
                evidence_pending = uploaded != len(set(ids))
        state = ("SCHEME_REVISION_CONFLICT"
                 if op.scheme_id and scheme["revision"] != op.base_scheme_revision else
                 "EVIDENCE_PENDING" if evidence_pending else "AWAITING_FORM_APPROVAL")
        payload = json.dumps(op.answers, ensure_ascii=False, allow_nan=False)
        inserted = conn.execute(
            """INSERT INTO nimis_stage.field_form_submission
               (event_id,record_id,revision,scheme_id,collector_id,device_id,
                form_id,form_version,period_code,captured_at,observed_at,source,
                base_scheme_revision,payload,content_sha256,status,evidence_pending)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s)
               ON CONFLICT DO NOTHING RETURNING event_id""",
            (op.event_id, op.record_id, op.revision, op.scheme_id,
             user["actor_id"], op.device_id, op.form_id, op.form_version,
             op.period_code, op.captured_at, op.observed_at, op.source,
             op.base_scheme_revision, payload, digest, state, evidence_pending),
        ).fetchone()
        if inserted is None:
            rows = conn.execute(
                """SELECT event_id,collector_id,content_sha256
                   FROM nimis_stage.field_form_submission
                   WHERE event_id=%s OR (record_id=%s AND revision=%s)""",
                (op.event_id, op.record_id, op.revision),
            ).fetchall()
            if (len(rows)==1 and rows[0]["event_id"]==op.event_id and
                rows[0]["collector_id"]==user["actor_id"] and
                rows[0]["content_sha256"]==digest):
                return {**result,"outcome":"duplicate"}
            return {**result,"outcome":"conflict","reason":"Event or record revision exists"}
        conn.execute(
            """INSERT INTO nimis_stage.audit(actor_id,event_type,entity_type,entity_id,details)
               VALUES (%s,'FIELD_FORM_RECEIVED','field_form',%s,%s::jsonb)""",
            (user["actor_id"],op.event_id,json.dumps({"form_id":op.form_id,"status":state})),
        )
    return {**result, "outcome": "accepted", "status": state}


@router.post("/sync/push")
def push_field_forms(batch: FormBatch, user=Depends(actor)):
    need_role(user, "data_collector")
    if len({op.event_id for op in batch.operations}) != len(batch.operations):
        raise HTTPException(422, detail="Duplicate event UUIDs in batch")
    results=[]
    for index, op in enumerate(batch.operations):
        try:
            item=_one(op, user)
            results.append({"index":index, **item})
        except Exception:
            # A failed row must not cause client deletion of any queued operation.
            results.append({"index":index, "event_id":str(op.event_id),
                            "outcome":"rejected", "reason":"Staging write unavailable"})
    return {"source":"ISOLATED_DEVELOPMENT","official":False,"results":results}


@router.get("/inbox")
def field_forms_inbox(user=Depends(actor)):
    need_role(user, "admin","provincial_officer","district_officer","data_collector")
    role=user["role_code"]
    if role=="admin":
        clause, params="TRUE",()
    elif role=="provincial_officer":
        clause, params="(s.province_code=%s OR (s.scheme_id IS NULL AND f.payload->>'province'=%s))",(user["province_code"],user["province_code"])
    elif role=="district_officer":
        clause, params="""((s.province_code=%s AND s.district_code=%s) OR
           (s.scheme_id IS NULL AND f.payload->>'province'=%s
            AND f.payload->>'district'=%s))""",(
             user["province_code"],user["district_code"],
             user["province_code"],user["district_code"])
    else:
        clause, params="f.collector_id=%s",(user["actor_id"],)
    with db() as conn:
        rows=conn.execute(
            f"""SELECT f.event_id,f.record_id,f.scheme_id,f.form_id,f.form_version,
                       f.period_code,f.status,f.evidence_pending,f.received_at,
                       s.scheme_name
                 FROM nimis_stage.field_form_submission f
                 LEFT JOIN nimis_stage.scheme s ON s.scheme_id=f.scheme_id
                 WHERE {clause}
                 ORDER BY f.received_at DESC,f.event_id DESC LIMIT 100""",params,
        ).fetchall()
    return {"source":"ISOLATED_DEVELOPMENT","official":False,
            "items":[{k:(str(v) if isinstance(v,UUID) else
                         v.isoformat() if isinstance(v,datetime) else v)
                      for k,v in row.items()} for row in rows],
            "note":"Review-only records, not eligible for publication or dashboard totals."}


@router.get("/submissions/{event_id}")
def field_form_detail(event_id: UUID, user=Depends(actor)):
    """Development-only scoped draft answers; never an official publication API."""
    need_role(user,"admin","provincial_officer","district_officer","data_collector")
    with db() as conn:
        row=conn.execute(
            """SELECT f.event_id,f.record_id,f.revision,f.form_id,f.form_version,
                      f.scheme_id,f.collector_id,f.period_code,f.observed_at,
                      f.source,f.status,f.payload,f.evidence_pending,
                      s.province_code,s.district_code
               FROM nimis_stage.field_form_submission f
               LEFT JOIN nimis_stage.scheme s USING(scheme_id)
               WHERE f.event_id=%s""",(event_id,)
        ).fetchone()
    if row is None:raise HTTPException(404,detail="Form submission not found")
    if row["scheme_id"] is None:
        province=row["payload"].get("province")
        district=row["payload"].get("district")
    else:
        province=row["province_code"]
        district=row["district_code"]
    role=user["role_code"]
    permitted=(
        role=="admin" or
        (role=="data_collector" and row["collector_id"]==user["actor_id"]) or
        (role=="provincial_officer" and user["province_code"]==province) or
        (role=="district_officer" and user["province_code"]==province
         and user["district_code"]==district)
    )
    if not permitted:raise HTTPException(404,detail="Form submission not found")
    return {"event_id":str(row["event_id"]),"record_id":str(row["record_id"]),
            "scheme_id":str(row["scheme_id"]) if row["scheme_id"] else None,
            "form_id":row["form_id"],"form_version":row["form_version"],
            "revision":row["revision"],"period_code":row["period_code"],
            "observed_at":row["observed_at"].isoformat(),"source":row["source"],
            "status":row["status"],"evidence_pending":row["evidence_pending"],
            "answers":row["payload"],"official":False,
            "note":"Proposed form fields are not approved or published."}


class FieldReviewDecision(BaseModel):
    model_config=ConfigDict(extra="forbid")
    decision_id:UUID
    action:Literal["VERIFY","RETURN","REVIEW","TECHNICAL_APPROVE","PUBLISH"]
    reason:str=Field(default="",max_length=500)

    @model_validator(mode="after")
    def check_reason(self):
        self.reason=self.reason.strip()
        if self.action=="RETURN" and not self.reason:
            raise ValueError("Returning a form requires a reason")
        return self


@router.post("/submissions/{event_id}/decisions")
def decide_field_form(event_id:UUID,body:FieldReviewDecision,user=Depends(actor)):
    """Server-owned, atomic review; unapproved/unmapped forms cannot publish."""
    need_role(user,"district_officer","provincial_officer","admin")
    with db() as conn:
        row=conn.execute(
            """SELECT f.*,s.province_code,s.district_code FROM nimis_stage.field_form_submission f
               LEFT JOIN nimis_stage.scheme s ON s.scheme_id=f.scheme_id
               WHERE f.event_id=%s FOR UPDATE OF f""",(event_id,),
        ).fetchone()
        if not row:raise HTTPException(404,detail="Form submission not found")
        if row["scheme_id"] is None:
            # A request for a new scheme is not a registered master record.
            raise HTTPException(409,detail="Unregistered proposed schemes require separate deduplication")
        if not in_scope(user,row["province_code"],row["district_code"]):
            raise HTTPException(403,detail="Outside the officer's authorized geography")
        if user["actor_id"]==row["collector_id"]:
            raise HTTPException(403,detail="Officers cannot review their own submissions")
        existing=conn.execute(
            "SELECT * FROM nimis_stage.field_form_decision WHERE decision_id=%s",
            (body.decision_id,),
        ).fetchone()
        if existing:
            if (existing["submission_event_id"]==event_id and
                existing["actor_id"]==user["actor_id"] and
                existing["action"]==body.action and
                (existing["reason"] or "")==body.reason):
                return {"outcome":"duplicate","event_id":str(event_id),
                        "decision_id":str(body.decision_id),
                        "status":existing["to_status"],"official":False}
            raise HTTPException(409,detail="Decision UUID reused with different content")
        status=row["status"]
        transitions={
            "VERIFY":("AWAITING_FORM_APPROVAL","DISTRICT_VERIFIED","district_officer"),
            "REVIEW":("DISTRICT_VERIFIED","PROVINCIAL_REVIEWED","provincial_officer"),
            "TECHNICAL_APPROVE":("PROVINCIAL_REVIEWED","TECHNICAL_APPROVED","admin"),
            "PUBLISH":("TECHNICAL_APPROVED","PUBLISHED","admin"),
        }
        if body.action=="RETURN":
            allowed={"AWAITING_FORM_APPROVAL":"district_officer",
                     "DISTRICT_VERIFIED":"provincial_officer"}
            needed=allowed.get(status)
            if not needed:raise HTTPException(409,detail="Return not allowed at this stage")
            to_status="RETURNED"
        else:
            expected,to_status,needed=transitions[body.action]
            if status!=expected:raise HTTPException(409,detail="Incorrect review stage")
        need_role(user,needed)
        if body.action in ("VERIFY","PUBLISH"):
            approved=conn.execute(
                """SELECT reporting_mapping_approved
                   FROM nimis_stage.approved_field_form
                   WHERE form_id=%s AND form_version=%s""",
                (row["form_id"],row["form_version"]),
            ).fetchone()
            if not approved:
                raise HTTPException(409,detail="Institutional form version has not been approved")
            if body.action=="PUBLISH" and not approved["reporting_mapping_approved"]:
                raise HTTPException(409,detail="Reporting mapping is not approved")
        if body.action=="VERIFY" and row["evidence_pending"]:
            raise HTTPException(409,detail="Photo evidence remains incomplete")
        if body.action=="TECHNICAL_APPROVE":
            delegated=conn.execute(
                """SELECT 1 FROM nimis_stage.actor_permission
                   WHERE actor_id=%s AND permission_code='NATIONAL_TECHNICAL_APPROVE'
                     AND revoked_at IS NULL""",(user["actor_id"],),
            ).fetchone()
            if not delegated:
                raise HTTPException(403,detail="National technical delegation required")
        conn.execute(
            "UPDATE nimis_stage.field_form_submission SET status=%s WHERE event_id=%s",
            (to_status,event_id),
        )
        conn.execute(
            """INSERT INTO nimis_stage.field_form_decision
               (decision_id,submission_event_id,actor_id,action,from_status,to_status,reason)
               VALUES (%s,%s,%s,%s,%s,%s,%s)""",
            (body.decision_id,event_id,user["actor_id"],body.action,status,to_status,
             body.reason or None),
        )
        conn.execute(
            """INSERT INTO nimis_stage.audit(actor_id,event_type,entity_type,entity_id,details)
               VALUES (%s,'FIELD_FORM_DECISION','field_form',%s,%s::jsonb)""",
            (user["actor_id"],event_id,json.dumps({"action":body.action,
                "from_status":status,"to_status":to_status})),
        )
    return {"outcome":"accepted","event_id":str(event_id),
            "decision_id":str(body.decision_id),"status":to_status,
            "official":False}


@router.get("/sync/status/{event_id}")
def field_form_sync_status(event_id:UUID,user=Depends(actor)):
    """Private acknowledgement/review status; collector sees only own receipts."""
    need_role(user,"admin","provincial_officer","district_officer","data_collector")
    with db() as conn:
        row=conn.execute(
          """SELECT f.event_id,f.collector_id,f.status,f.evidence_pending,
                    f.form_id,f.form_version,f.scheme_id,f.record_id,f.revision,
                    s.province_code,s.district_code,f.payload
             FROM nimis_stage.field_form_submission f
             LEFT JOIN nimis_stage.scheme s ON s.scheme_id=f.scheme_id
             WHERE f.event_id=%s""",(event_id,),
        ).fetchone()
        if not row:raise HTTPException(404,detail="Receipt not found")
        if row["scheme_id"] is None:
            province,district=row["payload"].get("province"),row["payload"].get("district")
        else:province,district=row["province_code"],row["district_code"]
        if user["role_code"]=="data_collector":
            permitted=row["collector_id"]==user["actor_id"]
        else:
            permitted=in_scope(user,province,district)
        if not permitted:raise HTTPException(404,detail="Receipt not found")
        history=conn.execute(
          """SELECT action,to_status,reason,decided_at
             FROM nimis_stage.field_form_decision
             WHERE submission_event_id=%s ORDER BY decided_at,decision_id""",
          (event_id,),
        ).fetchall()
    return {
      "source":"ISOLATED_DEVELOPMENT","official":False,
      "event_id":str(row["event_id"]),
      "record_id":str(row["record_id"]),
      "revision":row["revision"],"form_id":row["form_id"],
      "scheme_id":str(row["scheme_id"]) if row["scheme_id"] else None,
      "status":row["status"],"evidence_pending":row["evidence_pending"],
      "decisions":[{
         "action":x["action"],"status":x["to_status"],"reason":x["reason"],
         "decided_at":x["decided_at"].isoformat(),
      } for x in history],
    }
