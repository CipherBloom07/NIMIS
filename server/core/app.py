"""NIMIS core Stage 1: local-only transaction and concurrency proof.

NOT a public Ministry API. No production tokens exist. Dev header authentication
is restricted to loopback AND must be explicitly enabled. Official account SSO,
device enrolment, and every real collector form require further implementation.
"""
from __future__ import annotations

import hashlib
import json
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal
from urllib.parse import urlparse
from uuid import UUID, uuid4

import psycopg
from psycopg.rows import dict_row
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator

app = FastAPI(title="NIMIS Core transactional development API", version="0.1.0")
# Development-only browser integration, restricted to local NIMIS and Collector previews.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:8110", "http://localhost:8110",
        "http://127.0.0.1:5173", "http://localhost:5173",
        "http://127.0.0.1:8081", "http://localhost:8081",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["X-Nimis-Dev-Actor", "Content-Type"],
)


def guarded(request: Request):
    if os.environ.get("NIMIS_STAGE_ENABLE") != "1":
        raise HTTPException(404, detail="Development API disabled")
    if not request.client or request.client.host not in ("127.0.0.1","::1","testclient"):
        raise HTTPException(403, detail="Development API is loopback-only")

@contextmanager
def db():
    url = os.environ.get("NIMIS_STAGE_DATABASE_URL", "")
    parsed = urlparse(url)
    if (parsed.scheme not in ("postgresql","postgres")
        or parsed.hostname not in ("127.0.0.1","localhost")
        or parsed.path != "/nimis_core_dev"):
        raise HTTPException(503, detail="NIMIS development database must be isolated and local")
    try:
        with psycopg.connect(url, row_factory=dict_row, connect_timeout=4) as conn:
            yield conn
    except psycopg.OperationalError:
        raise HTTPException(503, detail="Local PostgreSQL unavailable") from None

def actor(request: Request, x_nimis_dev_actor: str | None = Header(default=None)):
    guarded(request)
    if os.environ.get("NIMIS_STAGE_DEV_AUTH") != "1":
        raise HTTPException(503, detail="No approved identity provider configured")
    try:
        actor_id = UUID(x_nimis_dev_actor or "")
    except ValueError:
        raise HTTPException(401, detail="Explicit synthetic actor header required") from None
    with db() as conn:
        row = conn.execute("SELECT * FROM nimis_stage.actor WHERE actor_id=%s AND is_active=true",
                           (actor_id,)).fetchone()
    if row is None:
        raise HTTPException(403, detail="Unknown or disabled actor")
    return row

def in_scope(user, province, district):
    return (user["role_code"] == "admin" or
        (user["role_code"] == "provincial_officer" and user["province_code"] == province) or
        (user["role_code"] in ("district_officer","data_collector")
         and user["province_code"] == province and user["district_code"] == district))

def need_role(user, *roles):
    if user["role_code"] not in roles:
        raise HTTPException(403, detail="This action is not authorized for the user's role")

def safe_schemes(conn, user):
    role = user["role_code"]
    if role == "admin":
        return conn.execute("SELECT * FROM nimis_stage.scheme ORDER BY scheme_code LIMIT 500").fetchall()
    if role == "provincial_officer":
        return conn.execute("SELECT * FROM nimis_stage.scheme WHERE province_code=%s ORDER BY scheme_code LIMIT 500",
                            (user["province_code"],)).fetchall()
    if role == "district_officer":
        return conn.execute("SELECT * FROM nimis_stage.scheme WHERE province_code=%s AND district_code=%s ORDER BY scheme_code LIMIT 500",
                            (user["province_code"],user["district_code"])).fetchall()
    return conn.execute("""SELECT s.* FROM nimis_stage.scheme s
      JOIN nimis_stage.assignment a ON a.scheme_id=s.scheme_id
      WHERE a.collector_id=%s AND a.revoked_at IS NULL ORDER BY s.scheme_code LIMIT 500""",
      (user["actor_id"],)).fetchall()

class SchemeCreate(BaseModel):
    scheme_code: str = Field(min_length=4,max_length=32,pattern=r"^[A-Za-z0-9_-]+$")
    scheme_name: str = Field(min_length=2,max_length=200)
    province_code: str = Field(min_length=2,max_length=90)
    district_code: str = Field(min_length=2,max_length=90)

class SchemePatch(BaseModel):
    base_revision: int = Field(ge=1)
    scheme_name: str = Field(min_length=2,max_length=200)
    operational_status: str = Field(max_length=60)
    equipped_ha: Decimal | None = Field(default=None,ge=0)
    developed_ha: Decimal | None = Field(default=None,ge=0)
    functional_ha: Decimal | None = Field(default=None,ge=0)
    @model_validator(mode="after")
    def area_rules(self):
        if self.functional_ha is not None and self.equipped_ha is not None and self.functional_ha > self.equipped_ha:
            raise ValueError("Functional area must not exceed equipped area")
        return self

class Assign(BaseModel):
    collector_id: UUID

class Measure(BaseModel):
    name: str = Field(min_length=2,max_length=80)
    value: Decimal = Field(ge=0)
    unit: str = Field(min_length=1,max_length=30)
    observed_at: datetime
    source: str = Field(min_length=2,max_length=140)

class Submit(BaseModel):
    event_id: UUID
    submission_id: UUID
    scheme_id: UUID
    device_id: UUID
    form_id: str = Field(min_length=3,max_length=80)
    form_version: int = Field(ge=1)
    period_code: str = Field(min_length=4,max_length=40)
    prior_submission_id: UUID | None = None
    base_scheme_revision: int = Field(ge=1)
    captured_at: datetime
    measurements: list[Measure] = Field(min_length=1,max_length=70)
    note: str = Field(default="",max_length=500)
    @model_validator(mode="after")
    def valid_measurements(self):
        # Only the operational status form is implemented in this Stage 1 API.
        # The other ten versioned form definitions require approved field mappings.
        if self.form_id != "operational_status" or self.form_version != 1:
            raise ValueError("Stage 1 currently accepts operational_status form version 1 only")
        allowed = {"equipped_area_ha":"ha","developed_area_ha":"ha",
                   "functional_area_ha":"ha","actually_irrigated_area_ha":"ha",
                   "active_beneficiaries":"count"}
        for item in self.measurements:
            if allowed.get(item.name) != item.unit:
                raise ValueError(f"Unknown measurement or invalid unit: {item.name}")
        amounts = {item.name:item.value for item in self.measurements}
        if ("functional_area_ha" in amounts and "equipped_area_ha" in amounts
              and amounts["functional_area_ha"] > amounts["equipped_area_ha"]):
            raise ValueError("Functional area cannot exceed equipped area")
        if self.captured_at.tzinfo is None or any(m.observed_at.tzinfo is None for m in self.measurements):
            raise ValueError("Capture and measurement times must include timezone")
        names=[m.name.casefold() for m in self.measurements]
        if len(set(names))!=len(names):
            raise ValueError("Measurement names must be unique within this submission")
        return self

class Decision(BaseModel):
    event_id: UUID
    action: str
    reason: str = Field(default="",max_length=500)

def as_json(rows):
    return json.loads(json.dumps(rows,default=str))

@app.get("/api/v1/stage/health")
def health(request: Request):
    guarded(request)
    with db() as conn:
        conn.execute("SELECT 1")
    return {"service":"nimis-core","mode":"isolated-development","status":"ok","production_ready":False}

@app.get("/api/v1/stage/me")
def me(user=Depends(actor)):
    return as_json({k:v for k,v in user.items() if k!="is_active"})

@app.get("/api/v1/stage/schemes")
def schemes(user=Depends(actor)):
    with db() as conn:
        rows=safe_schemes(conn,user)
    return {"items":as_json(rows),"source":"ISOLATED_DEVELOPMENT","has_more":len(rows)==500}

@app.post("/api/v1/stage/schemes",status_code=201)
def create_scheme(body: SchemeCreate,user=Depends(actor)):
    need_role(user,"admin","district_officer")
    if not in_scope(user,body.province_code,body.district_code):
        raise HTTPException(403,detail="District outside user scope")
    sid=uuid4()
    with db() as conn:
        try:
            conn.execute("""INSERT INTO nimis_stage.scheme
               (scheme_id,scheme_code,scheme_name,province_code,district_code)
               VALUES (%s,%s,%s,%s,%s)""",
               (sid,body.scheme_code,body.scheme_name,body.province_code,body.district_code))
        except psycopg.errors.UniqueViolation:
            raise HTTPException(409,detail="Scheme code already exists") from None
        conn.execute("""INSERT INTO nimis_stage.audit(actor_id,event_type,entity_type,entity_id)
                       VALUES (%s,'SCHEME_CREATE','scheme',%s)""",(user["actor_id"],sid))
    return {"scheme_id":str(sid),"revision":1}

@app.patch("/api/v1/stage/schemes/{scheme_id}")
def update_scheme(scheme_id:UUID,body:SchemePatch,user=Depends(actor)):
    need_role(user,"admin","district_officer")
    with db() as conn:
        row=conn.execute("SELECT province_code,district_code,revision FROM nimis_stage.scheme WHERE scheme_id=%s FOR UPDATE",(scheme_id,)).fetchone()
        if not row:raise HTTPException(404,detail="Unknown scheme")
        if not in_scope(user,row["province_code"],row["district_code"]):
            raise HTTPException(403,detail="Out of geographic scope")
        if row["revision"] != body.base_revision:
            raise HTTPException(409,detail={"code":"STALE_SCHEME_REVISION","current_revision":row["revision"]})
        updated=conn.execute("""UPDATE nimis_stage.scheme SET scheme_name=%s,operational_status=%s,
                   equipped_ha=%s,developed_ha=%s,functional_ha=%s,revision=revision+1,updated_at=now()
                   WHERE scheme_id=%s AND revision=%s RETURNING revision""",
                 (body.scheme_name,body.operational_status,body.equipped_ha,
                  body.developed_ha,body.functional_ha,scheme_id,body.base_revision)).fetchone()
        conn.execute("""INSERT INTO nimis_stage.audit(actor_id,event_type,entity_type,entity_id,details)
                        VALUES (%s,'SCHEME_UPDATE','scheme',%s,%s::jsonb)""",
                    (user["actor_id"],scheme_id,json.dumps({"from_revision":body.base_revision})))
    return {"scheme_id":str(scheme_id),"revision":updated["revision"]}

@app.post("/api/v1/stage/schemes/{scheme_id}/assign")
def assign(scheme_id:UUID,body:Assign,user=Depends(actor)):
    need_role(user,"admin","district_officer")
    with db() as conn:
        scheme=conn.execute("SELECT * FROM nimis_stage.scheme WHERE scheme_id=%s",(scheme_id,)).fetchone()
        if not scheme:raise HTTPException(404,detail="Unknown scheme")
        if not in_scope(user,scheme["province_code"],scheme["district_code"]):
            raise HTTPException(403,detail="Out of geographic scope")
        collector=conn.execute("SELECT * FROM nimis_stage.actor WHERE actor_id=%s AND is_active=true",(body.collector_id,)).fetchone()
        if not collector or collector["role_code"]!="data_collector" or not in_scope(collector,scheme["province_code"],scheme["district_code"]):
            raise HTTPException(403,detail="Collector is not active in scheme's district")
        conn.execute("""INSERT INTO nimis_stage.assignment(scheme_id,collector_id,assigned_by)
                        VALUES (%s,%s,%s)
                        ON CONFLICT (scheme_id,collector_id)
                        DO UPDATE SET revoked_at=NULL,assigned_by=EXCLUDED.assigned_by""",
                     (scheme_id,body.collector_id,user["actor_id"]))
        conn.execute("""INSERT INTO nimis_stage.audit(actor_id,event_type,entity_type,entity_id)
                        VALUES (%s,'ASSIGN_COLLECTOR','scheme',%s)""",
                     (user["actor_id"],scheme_id))
    return {"scheme_id":str(scheme_id),"collector_id":str(body.collector_id),"assigned":True}

@app.post("/api/v1/stage/submissions")
def submit(body:Submit,user=Depends(actor)):
    """Append-only operational observation; one linked revision per scheme/form/period.
    Lock scheme row to serialize same-key concurrent correction requests.
    """
    need_role(user,"data_collector","district_officer")
    normalized=body.model_dump(mode="json")
    payload={"measurements":normalized["measurements"],"note":body.note}
    canonical=json.dumps(normalized,sort_keys=True,separators=(",",":"),ensure_ascii=False)
    digest=hashlib.sha256(canonical.encode("utf8")).hexdigest()
    with db() as conn:
        scheme=conn.execute("SELECT * FROM nimis_stage.scheme WHERE scheme_id=%s FOR UPDATE",
                            (body.scheme_id,)).fetchone()
        if scheme is None:raise HTTPException(404,detail="Scheme not found")
        if not in_scope(user,scheme["province_code"],scheme["district_code"]):
            raise HTTPException(403,detail="Out of geographic scope")
        if user["role_code"]=="data_collector":
            assigned=conn.execute("""SELECT 1 FROM nimis_stage.assignment WHERE scheme_id=%s
                AND collector_id=%s AND revoked_at IS NULL""",(body.scheme_id,user["actor_id"])).fetchone()
            if not assigned:raise HTTPException(403,detail="No active scheme assignment")
        # Per-event retry must be checked before any current-version tests.
        existing=conn.execute("""SELECT submission_id,collector_id,content_sha256,status,record_revision
           FROM nimis_stage.submission WHERE event_id=%s""",(body.event_id,)).fetchone()
        if existing is not None:
            if (existing["collector_id"]!=user["actor_id"] or existing["content_sha256"]!=digest
                or existing["submission_id"]!=body.submission_id):
                raise HTTPException(409,detail="Event ID reused with changed content or another actor")
            return {"event_id":str(body.event_id),"submission_id":str(existing["submission_id"]),
                    "outcome":"duplicate","status":existing["status"],
                    "record_revision":existing["record_revision"],
                    "server_scheme_revision":scheme["revision"],"source":"ISOLATED_DEVELOPMENT"}
        latest=conn.execute("""SELECT submission_id,record_revision
          FROM nimis_stage.submission
          WHERE scheme_id=%s AND form_id=%s AND period_code=%s
          ORDER BY record_revision DESC LIMIT 1""",
          (body.scheme_id,body.form_id,body.period_code)).fetchone()
        previous=latest["submission_id"] if latest else None
        if body.prior_submission_id != previous:
            raise HTTPException(409,detail={
              "code":"CORRECTION_CHAIN_CONFLICT",
              "message":"Supply the latest submission ID as prior_submission_id, or use a new reporting period.",
              "latest_submission_id":str(previous) if previous else None,
            })
        revision=(latest["record_revision"]+1) if latest else 1
        status="CONFLICT" if body.base_scheme_revision!=scheme["revision"] else "SUBMITTED"
        try:
            conn.execute("""INSERT INTO nimis_stage.submission
             (submission_id,event_id,scheme_id,collector_id,device_id,form_id,form_version,
              period_code,prior_submission_id,record_revision,base_scheme_revision,
              captured_at,payload,content_sha256,status)
             VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s)""",
            (body.submission_id,body.event_id,body.scheme_id,user["actor_id"],body.device_id,
             body.form_id,body.form_version,body.period_code,previous,revision,
             body.base_scheme_revision,body.captured_at,json.dumps(payload),digest,status))
        except psycopg.errors.UniqueViolation:
            raise HTTPException(409,detail="Duplicate UUID or conflicting reporting-period version") from None
        conn.execute("""INSERT INTO nimis_stage.audit(actor_id,event_type,entity_type,entity_id,details)
             VALUES (%s,'SUBMISSION_RECEIVED','submission',%s,%s::jsonb)""",
             (user["actor_id"],body.submission_id,json.dumps({"period":body.period_code,"record_revision":revision})))
    return {"event_id":str(body.event_id),"submission_id":str(body.submission_id),
            "outcome":"accepted","status":status,"record_revision":revision,
            "server_scheme_revision":scheme["revision"],"source":"ISOLATED_DEVELOPMENT"}

@app.get("/api/v1/stage/inbox")
def inbox(user=Depends(actor)):
    need_role(user,"admin","district_officer","provincial_officer")
    with db() as conn:
        conditions={"admin":("TRUE",()),"provincial_officer":("s.province_code=%s",(user["province_code"],)),
                    "district_officer":("s.province_code=%s AND s.district_code=%s",(user["province_code"],user["district_code"]))}
        predicate,params=conditions[user["role_code"]]
        rows=conn.execute(f"""SELECT sub.submission_id,sub.scheme_id,sub.form_id,sub.period_code,
                 sub.status,sub.received_at,s.scheme_name,s.province_code,s.district_code
                 FROM nimis_stage.submission sub JOIN nimis_stage.scheme s USING(scheme_id)
                 WHERE {predicate}
                 ORDER BY sub.received_at DESC,sub.submission_id DESC LIMIT 100""",params).fetchall()
    return {"items":as_json(rows),"source":"ISOLATED_DEVELOPMENT","has_more":len(rows)==100}

TRANSITIONS={
    "VERIFY":("SUBMITTED","DISTRICT_VERIFIED","district_officer"),
    "REVIEW":("DISTRICT_VERIFIED","PROVINCIAL_REVIEWED","provincial_officer"),
    "TECHNICAL_APPROVE":("PROVINCIAL_REVIEWED","TECHNICAL_APPROVED","admin"),
    "PUBLISH":("TECHNICAL_APPROVED","PUBLISHED","admin")
}
@app.post("/api/v1/stage/submissions/{submission_id}/decisions")
def decide(submission_id:UUID,body:Decision,user=Depends(actor)):
    if body.action not in (*TRANSITIONS,"RETURN"):
        raise HTTPException(422,detail="Invalid decision action")
    with db() as conn:
        row=conn.execute("""SELECT sub.*,s.province_code,s.district_code FROM nimis_stage.submission sub
                 JOIN nimis_stage.scheme s USING(scheme_id)
                 WHERE sub.submission_id=%s FOR UPDATE OF sub""",(submission_id,)).fetchone()
        if not row:raise HTTPException(404,detail="Submission not found")
        if not in_scope(user,row["province_code"],row["district_code"]):
            raise HTTPException(403,detail="Outside geographical scope")
        # Check idempotency first: a retried decision may have already advanced status.
        existing=conn.execute("SELECT * FROM nimis_stage.decision WHERE event_id=%s",(body.event_id,)).fetchone()
        if existing:
            if (existing["submission_id"]==submission_id and existing["actor_id"]==user["actor_id"]
                and existing["action"]==body.action and existing["reason"]==(body.reason.strip() or None)):
                return {"outcome":"duplicate","status":row["status"]}
            raise HTTPException(409,detail="Decision event ID reused")
        if body.action=="RETURN":
            allowed={"SUBMITTED":"district_officer","DISTRICT_VERIFIED":"provincial_officer"}
            expected_role=allowed.get(row["status"])
            if expected_role is None:raise HTTPException(409,detail="Return is not valid at this stage")
            target="RETURNED"
            if not body.reason.strip():raise HTTPException(422,detail="Return reason is required")
        else:
            source,target,expected_role=TRANSITIONS[body.action]
            if row["status"]!=source:raise HTTPException(409,detail="Invalid or already processed transition")
        need_role(user,expected_role)
        conn.execute("""UPDATE nimis_stage.submission SET status=%s,latest_decision_at=now()
                       WHERE submission_id=%s""",(target,submission_id))
        conn.execute("""INSERT INTO nimis_stage.decision(decision_id,event_id,submission_id,actor_id,
                       action,from_status,to_status,reason) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (uuid4(),body.event_id,submission_id,user["actor_id"],
                     body.action,row["status"],target,body.reason.strip() or None))
        conn.execute("""INSERT INTO nimis_stage.audit(actor_id,event_type,entity_type,entity_id,details)
             VALUES (%s,'WORKFLOW_DECISION','submission',%s,%s::jsonb)""",
             (user["actor_id"],submission_id,json.dumps({"action":body.action,"from":row["status"],"to":target})))
    return {"outcome":"accepted","status":target,"source":"ISOLATED_DEVELOPMENT"}

@app.get("/api/v1/stage/report/area")
def published_area_report(
    period_code: str = Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    user=Depends(actor),
):
    """Read only the latest published operational status per scheme and period.
    A reporting warehouse is still required for national scale.
    """
    need_role(user,"admin","provincial_officer","district_officer")
    clause,params=(
        ("TRUE",()) if user["role_code"]=="admin" else
        ("s.province_code=%s",(user["province_code"],))
        if user["role_code"]=="provincial_officer" else
        ("s.province_code=%s AND s.district_code=%s",(user["province_code"],user["district_code"]))
    )
    with db() as conn:
        rows=conn.execute(f"""SELECT DISTINCT ON (sub.scheme_id)
              sub.scheme_id,sub.payload,s.province_code,s.district_code,
              sub.received_at FROM nimis_stage.submission sub
              JOIN nimis_stage.scheme s USING(scheme_id)
              WHERE sub.status='PUBLISHED' AND sub.form_id='operational_status'
                AND sub.period_code=%s AND {clause}
              ORDER BY sub.scheme_id,sub.received_at DESC,sub.submission_id DESC
              LIMIT 500""",(period_code,*params)).fetchall()
    total={"equipped_area_ha":Decimal(0),"developed_area_ha":Decimal(0),
           "functional_area_ha":Decimal(0),"actually_irrigated_area_ha":Decimal(0)}
    provinces={}
    for row in rows:
        province=row["province_code"]
        target=provinces.setdefault(province,{k:Decimal(0) for k in total})
        for item in row["payload"].get("measurements",[]):
            key=item.get("name")
            if key in total and item.get("unit")=="ha":
                value=Decimal(str(item["value"]))
                total[key]+=value
                target[key]+=value
    return {
      "source":"ISOLATED_DEVELOPMENT","official":False,
      "period_code":period_code,"schemes_reporting":len(rows),
      "data_status":"PUBLISHED_DEMO_ONLY",
      "total_hectares":{k:str(v) for k,v in total.items()},
      "provinces":[{"province_code":p,
                    **{k:str(v) for k,v in values.items()}}
                   for p,values in sorted(provinces.items())],
      "page_limited":len(rows)==500,
    }
