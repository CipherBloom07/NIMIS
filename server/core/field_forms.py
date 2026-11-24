"""Read-only/append-only local pilot intake for draft collector datasets.

This module is imported only by the isolated NIMIS Core development API.
No production identity, scheme-master write or published reporting is enabled.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from server.core.app import actor, db, in_scope, need_role

router = APIRouter(prefix="/api/v1/stage/forms", tags=["field-form-staging"])

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
    if op.scheme_id is None and op.form_id != "new_scheme_request":
        raise ValueError("An existing scheme needs a canonical UUID")
    if op.form_id == "new_scheme_request" and op.scheme_id is not None:
        raise ValueError("A new scheme request cannot claim an existing scheme UUID")
    if op.form_id == "new_scheme_request":
        if not all(op.answers.get(k) for k in ("scheme_name", "province", "district")):
            raise ValueError("New scheme request needs name, province and district")
    if op.form_id != "new_scheme_request" and op.base_scheme_revision is None:
        raise ValueError("Current master revision required")
    equipped = op.answers.get("equipped_area_ha")
    functional = op.answers.get("functional_area_ha")
    if equipped not in (None,"") and functional not in (None,"") and float(functional) > float(equipped):
        raise ValueError("Functional area cannot exceed equipped area")
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
        clause, params="(s.district_code=%s OR (s.scheme_id IS NULL AND f.payload->>'district'=%s))",(user["district_code"],user["district_code"])
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
