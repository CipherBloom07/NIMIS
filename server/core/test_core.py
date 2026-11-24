import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient

SCHEMA = Path(__file__).resolve().parent / "schema.sql"
ACTORS = {
 "admin":"00000000-0000-4000-8000-000000000001",
 "province":"00000000-0000-4000-8000-000000000002",
 "district":"00000000-0000-4000-8000-000000000003",
 "collector":"00000000-0000-4000-8000-000000000004",
 "other_district":"00000000-0000-4000-8000-000000000005",
}
@pytest.fixture(scope="module")
def env():
    url=os.environ.get("NIMIS_TEST_DATABASE_URL","")
    from urllib.parse import urlparse
    parsed=urlparse(url)
    if parsed.hostname not in ("localhost","127.0.0.1") or parsed.path!="/nimis_core_dev":
        pytest.skip("Run only with an isolated local nimis_core_dev database")
    os.environ["NIMIS_STAGE_ENABLE"]="1"
    os.environ["NIMIS_STAGE_DEV_AUTH"]="1"
    with psycopg.connect(url) as conn:
        conn.execute(SCHEMA.read_text(encoding="utf8"))
        # The runtime API must not execute as the PostgreSQL administrator.
        if conn.execute("SELECT 1 FROM pg_roles WHERE rolname='nimis_stage_demo'").fetchone() is None:
            conn.execute("CREATE ROLE nimis_stage_demo LOGIN PASSWORD 'local-ci-only-demo-password'")
        conn.execute("GRANT CONNECT ON DATABASE nimis_core_dev TO nimis_stage_demo")
        conn.execute("GRANT USAGE ON SCHEMA nimis_stage TO nimis_stage_demo")
        conn.execute("GRANT SELECT ON ALL TABLES IN SCHEMA nimis_stage TO nimis_stage_demo")
        conn.execute("""GRANT INSERT ON nimis_stage.scheme,nimis_stage.assignment,
          nimis_stage.submission,nimis_stage.decision,nimis_stage.audit,
          nimis_stage.field_form_submission,nimis_stage.field_attachment,nimis_stage.field_form_decision TO nimis_stage_demo""")
        conn.execute("""GRANT UPDATE(scheme_name,operational_status,equipped_ha,developed_ha,functional_ha,
             revision,updated_at) ON nimis_stage.scheme TO nimis_stage_demo""")
        conn.execute("GRANT UPDATE(revoked_at,assigned_by) ON nimis_stage.assignment TO nimis_stage_demo")
        conn.execute("GRANT UPDATE(status,latest_decision_at) ON nimis_stage.submission TO nimis_stage_demo")
        conn.execute("GRANT SELECT ON nimis_stage.actor_permission,nimis_stage.approved_field_form TO nimis_stage_demo")
        conn.execute("GRANT UPDATE(status) ON nimis_stage.field_form_submission TO nimis_stage_demo")
        conn.execute("GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA nimis_stage TO nimis_stage_demo")
        conn.execute("REVOKE CREATE ON SCHEMA nimis_stage FROM nimis_stage_demo")
    from urllib.parse import urlunparse
    stage = parsed._replace(netloc='nimis_stage_demo:local-ci-only-demo-password@127.0.0.1:5432')
    os.environ["NIMIS_STAGE_DATABASE_URL"]=urlunparse(stage._replace(path="/nimis_core_dev"))
    with psycopg.connect(url) as conn:

        data=[
          (ACTORS["admin"],"Fictional admin","admin",None,None),
          (ACTORS["province"],"Fictional province","provincial_officer","DEMO-P",None),
          (ACTORS["district"],"Fictional district","district_officer","DEMO-P","DEMO-D"),
          (ACTORS["collector"],"Fictional collector","data_collector","DEMO-P","DEMO-D"),
          (ACTORS["other_district"],"Fictional other district","district_officer","DEMO-P","OTHER-D"),
        ]
        for row in data:
            conn.execute("""INSERT INTO nimis_stage.actor(actor_id,display_name,role_code,province_code,district_code)
                  VALUES (%s,%s,%s,%s,%s) ON CONFLICT (actor_id) DO UPDATE
                  SET is_active=true,role_code=EXCLUDED.role_code,province_code=EXCLUDED.province_code,district_code=EXCLUDED.district_code""",row)
    return url

@pytest.fixture()
def client(env):
    from server.core.app import app
    return TestClient(app)

def headers(who):
    return {"X-Nimis-Dev-Actor":ACTORS[who]}

def new_scheme(client):
    code="DEMO-"+uuid4().hex[:9]
    r=client.post("/api/v1/stage/schemes",headers=headers("district"),json={
        "scheme_code":code,"scheme_name":"Fictional Testing Scheme","province_code":"DEMO-P","district_code":"DEMO-D"})
    assert r.status_code==201,r.text
    return r.json()["scheme_id"]

def new_submission(scheme_id,revision=1):
    now=datetime.now(timezone.utc).isoformat()
    return {
      "submission_id":str(uuid4()),"event_id":str(uuid4()),
      "scheme_id":scheme_id,"device_id":str(uuid4()),
      "form_id":"operational_status","form_version":1,
      "period_code":"2026-11","base_scheme_revision":revision,
      "captured_at":now,
      "measurements":[{"name":"functional_area_ha","value":"12.50",
                       "unit":"ha","observed_at":now,"source":"Fictional field inspection"}],
      "note":"Synthetic baseline example; no real Ministry information."
    }

def test_stage_database_login_cannot_delete_master_or_audit(env):
    with psycopg.connect(os.environ["NIMIS_STAGE_DATABASE_URL"]) as restricted:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            restricted.execute("DELETE FROM nimis_stage.scheme")
    with psycopg.connect(os.environ["NIMIS_STAGE_DATABASE_URL"]) as restricted:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            restricted.execute("UPDATE nimis_stage.audit SET event_type='FORGED'")
    with psycopg.connect(os.environ["NIMIS_STAGE_DATABASE_URL"]) as restricted:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            restricted.execute("DROP TABLE nimis_stage.scheme")

def test_gated_without_fake_auth(client,monkeypatch):
    monkeypatch.setenv("NIMIS_STAGE_DEV_AUTH","0")
    try:
        r=client.get("/api/v1/stage/schemes",headers=headers("admin"))
        assert r.status_code==503
    finally:
        monkeypatch.setenv("NIMIS_STAGE_DEV_AUTH","1")

def test_geographic_scopes_and_collector_assignment(client):
    scheme=new_scheme(client)
    assert client.get("/api/v1/stage/schemes",headers=headers("other_district")).json()["items"]==[]
    assert all(row["scheme_id"]!=scheme for row in client.get("/api/v1/stage/schemes",headers=headers("collector")).json()["items"])
    bad=client.post(f"/api/v1/stage/schemes/{scheme}/assign",
                    headers=headers("other_district"),json={"collector_id":ACTORS["collector"]})
    assert bad.status_code==403
    ok=client.post(f"/api/v1/stage/schemes/{scheme}/assign",
                   headers=headers("district"),json={"collector_id":ACTORS["collector"]})
    assert ok.status_code==200,ok.text
    assert any(row["scheme_id"]==scheme for row in client.get("/api/v1/stage/schemes",headers=headers("collector")).json()["items"])

def test_stage_rejects_unapproved_form_and_invalid_measurement_unit(client):
    scheme=new_scheme(client)
    assert client.post(f"/api/v1/stage/schemes/{scheme}/assign",
                        headers=headers("district"),json={"collector_id":ACTORS["collector"]}).status_code==200
    body=new_submission(scheme)
    r=client.post("/api/v1/stage/submissions",headers=headers("collector"),json={**body,"form_id":"farmer_plot"})
    assert r.status_code==422
    body["measurements"][0]["unit"]="litres"
    r=client.post("/api/v1/stage/submissions",headers=headers("collector"),json=body)
    assert r.status_code==422

def test_submission_idempotency_and_full_workflow(client):
    scheme=new_scheme(client)
    payload=new_submission(scheme)
    assert client.post("/api/v1/stage/submissions",headers=headers("collector"),json=payload).status_code==403
    assert client.post(f"/api/v1/stage/schemes/{scheme}/assign",
                       headers=headers("district"),json={"collector_id":ACTORS["collector"]}).status_code==200
    first=client.post("/api/v1/stage/submissions",headers=headers("collector"),json=payload)
    assert first.status_code==200,first.text
    assert first.json()["outcome"]=="accepted"
    duplicate=client.post("/api/v1/stage/submissions",headers=headers("collector"),json=payload)
    assert duplicate.status_code==200,duplicate.text
    assert duplicate.json()["outcome"]=="duplicate"
    changed=client.post("/api/v1/stage/submissions",headers=headers("collector"),json={**payload,"note":"different"})
    assert changed.status_code==409

    sid=payload["submission_id"]
    pull=client.get(f"/api/v1/stage/sync/status/{sid}",headers=headers("collector"))
    assert pull.status_code==200,pull.text
    assert pull.json()["status"]=="SUBMITTED"
    assert client.get(f"/api/v1/stage/sync/status/{sid}",headers=headers("district")).status_code==404
    def decision(who,action,event_id=None,reason=""):
        return client.post(f"/api/v1/stage/submissions/{sid}/decisions",
            headers=headers(who),json={"event_id":event_id or str(uuid4()),"action":action,"reason":reason})
    assert decision("collector","VERIFY").status_code==403
    assert decision("province","REVIEW").status_code==409
    verify_event=str(uuid4())
    verified=decision("district","VERIFY",verify_event)
    assert verified.status_code==200,verified.text
    assert verified.json()["status"]=="DISTRICT_VERIFIED"
    assert decision("district","VERIFY",verify_event).json()["outcome"]=="duplicate"
    assert decision("admin","PUBLISH").status_code==409
    reviewed=decision("province","REVIEW")
    assert reviewed.status_code==200,reviewed.text
    technical=decision("admin","TECHNICAL_APPROVE")
    assert technical.status_code==200,technical.text
    published=decision("admin","PUBLISH")
    assert published.status_code==200,published.text
    assert published.json()["status"]=="PUBLISHED"
    after=client.get(f"/api/v1/stage/sync/status/{sid}",headers=headers("collector"))
    assert after.status_code==200,after.text
    assert after.json()["status"]=="PUBLISHED"
    assert [x["action"] for x in after.json()["decisions"]]==[
        "VERIFY","REVIEW","TECHNICAL_APPROVE","PUBLISH"]
    report=client.get("/api/v1/stage/report/area?period_code=2026-11",headers=headers("province"))
    assert report.status_code==200,report.text
    assert report.json()["official"] is False
    assert report.json()["data_status"]=="PUBLISHED_DEMO_ONLY"
    assert report.json()["total_hectares"]["functional_area_ha"]=="12.50"
    excluded=client.get("/api/v1/stage/report/area?period_code=2026-11",headers=headers("other_district"))
    assert excluded.status_code==200
    assert excluded.json()["schemes_reporting"]==0
    assert client.get("/api/v1/stage/report/area?period_code=2026-11",headers=headers("collector")).status_code==403
    assert decision("district","VERIFY").status_code==409

def test_corrections_link_to_previous_revision_and_preserve_season_history(client):
    scheme=new_scheme(client)
    assert client.post(f"/api/v1/stage/schemes/{scheme}/assign",
                       headers=headers("district"),json={"collector_id":ACTORS["collector"]}).status_code==200
    first=new_submission(scheme)
    a=client.post("/api/v1/stage/submissions",headers=headers("collector"),json=first)
    assert a.status_code==200,a.text
    assert a.json()["record_revision"]==1

    second={**new_submission(scheme),"period_code":first["period_code"]}
    rejected=client.post("/api/v1/stage/submissions",headers=headers("collector"),json=second)
    assert rejected.status_code==409,rejected.text
    assert rejected.json()["detail"]["code"]=="CORRECTION_CHAIN_CONFLICT"

    second["prior_submission_id"]=first["submission_id"]
    accepted=client.post("/api/v1/stage/submissions",headers=headers("collector"),json=second)
    assert accepted.status_code==200,accepted.text
    assert accepted.json()["record_revision"]==2
    assert client.post("/api/v1/stage/submissions",headers=headers("collector"),json=second).json()["outcome"]=="duplicate"
    previous=new_submission(scheme)
    previous["period_code"]="2026-10"
    historical=client.post("/api/v1/stage/submissions",headers=headers("collector"),json=previous)
    assert historical.status_code==200,historical.text
    assert historical.json()["record_revision"]==1
    with psycopg.connect(os.environ["NIMIS_TEST_DATABASE_URL"]) as conn:
        rows=conn.execute("""SELECT submission_id,prior_submission_id,period_code,record_revision
            FROM nimis_stage.submission WHERE scheme_id=%s
            ORDER BY period_code,record_revision""",(scheme,)).fetchall()
        assert len(rows)==3
        assert rows[2][1]==first["submission_id"] or str(rows[2][1])==first["submission_id"]

def test_stage_batch_sync_is_idempotent_and_one_rejected_record_does_not_block(client):
    scheme=new_scheme(client)
    assert client.post(f"/api/v1/stage/schemes/{scheme}/assign",
        headers=headers("district"),json={"collector_id":ACTORS["collector"]}).status_code==200
    valid=new_submission(scheme)
    invalid={**new_submission(scheme),"form_id":"unapproved_form"}
    another={**new_submission(scheme),"period_code":"2026-10"}
    request={"operations":[valid,invalid,another]}
    first=client.post("/api/v1/stage/sync/push",
         headers=headers("collector"),json=request)
    assert first.status_code==200,first.text
    assert first.json()["processed"]==3
    assert [r["outcome"] for r in first.json()["results"]]==[
         "accepted","rejected","accepted"]
    second=client.post("/api/v1/stage/sync/push",
         headers=headers("collector"),json=request)
    assert second.status_code==200,second.text
    assert [r["outcome"] for r in second.json()["results"]]==[
         "duplicate","rejected","duplicate"]
    unauthorized=client.post("/api/v1/stage/sync/push",
         headers=headers("province"),json=request)
    assert unauthorized.status_code==403
    assert client.post("/api/v1/stage/sync/push",
         headers=headers("collector"),json={"operations":[]}).status_code==422

def test_optimistic_lock_prevents_two_writers_overwriting(client):
    scheme=new_scheme(client)
    payload={"base_revision":1,"scheme_name":"Test concurrency update","operational_status":"Partially functional",
             "equipped_ha":"20","developed_ha":"20","functional_ha":"12"}
    def update(label):
        body={**payload,"scheme_name":label}
        # Separate requests/connections concurrently; only one can win.
        return client.patch(f"/api/v1/stage/schemes/{scheme}",headers=headers("district"),json=body)
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses=list(pool.map(update,["Writer A","Writer B"]))
    assert sorted(r.status_code for r in statuses)==[200,409],[(r.status_code,r.text) for r in statuses]

def test_stale_scheme_creates_conflict_not_silent_overwrite(client):
    scheme=new_scheme(client)
    assert client.patch(f"/api/v1/stage/schemes/{scheme}",headers=headers("district"),json={
        "base_revision":1,"scheme_name":"Updated master","operational_status":"Functional",
        "equipped_ha":"25","developed_ha":"25","functional_ha":"21"}).status_code==200
    assert client.post(f"/api/v1/stage/schemes/{scheme}/assign",
                        headers=headers("district"),json={"collector_id":ACTORS["collector"]}).status_code==200
    r=client.post("/api/v1/stage/submissions",headers=headers("collector"),json=new_submission(scheme,revision=1))
    assert r.status_code==200,r.text
    assert r.json()["status"]=="CONFLICT"
    assert r.json()["server_scheme_revision"]==2

def test_proposed_collector_form_sync_is_scoped_idempotent_and_stays_unapproved(client,env):
    scheme=new_scheme(client)
    now=datetime.now(timezone.utc).isoformat()
    request={
       "event_id":str(uuid4()),"record_id":str(uuid4()),"revision":1,
       "device_id":str(uuid4()),"scheme_id":scheme,"form_id":"water_availability",
       "form_version":1,"period_code":"2026-11",
       "captured_at":now,"observed_at":now,"source":"Fictional gauge inspection",
       "base_scheme_revision":1,
       "answers":{"water_level":"3.4","flow":"0.20","rainfall":"12.5"},
    }
    target="/api/v1/stage/forms/sync/push"
    def push(body,who="collector"):
        return client.post(target,headers=headers(who),json={"operations":[body]})

    forbidden=push(request)
    assert forbidden.status_code==200
    assert forbidden.json()["results"][0]["outcome"]=="rejected"
    assert client.post(f"/api/v1/stage/schemes/{scheme}/assign",
                       headers=headers("district"),json={"collector_id":ACTORS["collector"]}).status_code==200

    first=push(request)
    assert first.status_code==200,first.text
    assert first.json()["results"][0]["outcome"]=="accepted"
    repeated=push(request)
    assert repeated.json()["results"][0]["outcome"]=="duplicate"
    different=push({**request,"answers":{"water_level":"4.7"}})
    assert different.json()["results"][0]["outcome"]=="conflict"

    invalid=push({**request,"event_id":str(uuid4()),"record_id":str(uuid4()),
                  "answers":{"unknown_property":"value"}})
    assert invalid.json()["results"][0]["outcome"]=="rejected"
    assert push(request,"province").status_code==403

    district=client.get("/api/v1/stage/forms/inbox",headers=headers("district"))
    assert district.status_code==200,district.text
    item=next(x for x in district.json()["items"] if x["event_id"]==request["event_id"])
    assert item["status"]=="AWAITING_FORM_APPROVAL"
    detail_url="/api/v1/stage/forms/submissions/"+request["event_id"]
    permitted=client.get(detail_url,headers=headers("district"))
    assert permitted.status_code==200,permitted.text
    assert permitted.json()["answers"]["water_level"]=="3.4"
    assert client.get(detail_url,headers=headers("other_district")).status_code==404
    assert client.get(detail_url,headers=headers("province")).status_code==200
    assert client.get(detail_url,headers=headers("collector")).status_code==200
    invisible=client.get("/api/v1/stage/forms/inbox",headers=headers("other_district"))
    assert not any(x["event_id"]==request["event_id"] for x in invisible.json()["items"])

    with psycopg.connect(env) as conn:
        count=conn.execute("SELECT count(*) FROM nimis_stage.field_form_submission WHERE event_id=%s",
                           (request["event_id"],)).fetchone()[0]
        assert count==1
        status=conn.execute("SELECT status FROM nimis_stage.field_form_submission WHERE event_id=%s",
                            (request["event_id"],)).fetchone()[0]
        assert status=="AWAITING_FORM_APPROVAL"
        master=conn.execute("SELECT revision FROM nimis_stage.scheme WHERE scheme_id=%s",(scheme,)).fetchone()[0]
        assert master==1


def test_new_scheme_proposal_never_creates_master_record(client,env):
    now=datetime.now(timezone.utc).isoformat()
    name="Proposed fictional "+uuid4().hex[:8]
    body={
       "event_id":str(uuid4()),"record_id":str(uuid4()),"revision":1,
       "device_id":str(uuid4()),"scheme_id":None,"form_id":"new_scheme_request",
       "form_version":1,"period_code":"2026-11","captured_at":now,
       "observed_at":now,"source":"Fictional initial report",
       "base_scheme_revision":None,
       "answers":{"scheme_name":name,"province":"DEMO-P","district":"DEMO-D"},
    }
    r=client.post("/api/v1/stage/forms/sync/push",headers=headers("collector"),
                  json={"operations":[body]})
    assert r.status_code==200,r.text
    assert r.json()["results"][0]["outcome"]=="accepted"
    with psycopg.connect(env) as conn:
        assert conn.execute("SELECT count(*) FROM nimis_stage.scheme WHERE scheme_name=%s",(name,)).fetchone()[0]==0

def test_signed_identity_mode_never_accepts_fake_development_header(client,env,monkeypatch):
    from server.core import oidc_identity
    monkeypatch.setenv("NIMIS_STAGE_OIDC_ENABLED","1")
    monkeypatch.setenv("NIMIS_STAGE_DEV_AUTH","0")
    try:
        # Without credentials, even an existing synthetic UUID must not work.
        blocked=client.get("/api/v1/stage/me",headers=headers("admin"))
        assert blocked.status_code==401,blocked.text

        # Test identity verification is explicitly mocked; this does NOT
        # claim that institutional token/JWKS integration is configured.
        subject="test-issuer|"+uuid4().hex
        with psycopg.connect(env) as conn:
            conn.execute("UPDATE nimis_stage.actor SET oidc_subject=%s WHERE actor_id=%s",
                         (subject,ACTORS["collector"]))
        monkeypatch.setattr(oidc_identity,"verified_subject",lambda authorization:subject)
        good=client.get("/api/v1/stage/me",
                        headers={"Authorization":"Bearer signed-for-test"})
        assert good.status_code==200,good.text
        assert good.json()["role_code"]=="data_collector"

        # The verified subject's DB role is immutable from client-supplied
        # request headers and cannot be elevated to administrator.
        forged=client.get("/api/v1/stage/me",headers={
             **headers("admin"),"Authorization":"Bearer signed-for-test"})
        assert forged.status_code==200,forged.text
        assert forged.json()["role_code"]=="data_collector"
        no_admin=client.post("/api/v1/stage/schemes",headers={
             **headers("admin"),"Authorization":"Bearer signed-for-test"},json={
              "scheme_code":"DEMO-"+uuid4().hex[:8],
              "scheme_name":"Denied privilege elevation",
              "province_code":"DEMO-P","district_code":"DEMO-D"})
        assert no_admin.status_code==403,no_admin.text

        with psycopg.connect(env) as conn:
            conn.execute("UPDATE nimis_stage.actor SET is_active=false WHERE actor_id=%s",
                         (ACTORS["collector"],))
        deactivated=client.get("/api/v1/stage/me",
                               headers={"Authorization":"Bearer signed-for-test"})
        assert deactivated.status_code==403,deactivated.text
    finally:
        with psycopg.connect(env) as conn:
            conn.execute("UPDATE nimis_stage.actor SET oidc_subject=NULL,is_active=true WHERE actor_id=%s",
                         (ACTORS["collector"],))
        monkeypatch.delenv("NIMIS_STAGE_OIDC_ENABLED",raising=False)


def test_identity_provider_config_is_fail_closed(monkeypatch):
    from server.core.oidc_identity import verified_subject
    from fastapi import HTTPException
    monkeypatch.delenv("NIMIS_OIDC_ISSUER",raising=False)
    monkeypatch.delenv("NIMIS_OIDC_JWKS_URL",raising=False)
    monkeypatch.delenv("NIMIS_OIDC_AUDIENCE",raising=False)
    with pytest.raises(HTTPException) as missing:
        verified_subject(None)
    assert missing.value.status_code==401
    with pytest.raises(HTTPException) as config:
        verified_subject("Bearer a.b.c")
    assert config.value.status_code==503


def test_private_evidence_checksum_authorization_and_form_references(client,env):
    import hashlib
    scheme=new_scheme(client)
    assert client.post(f"/api/v1/stage/schemes/{scheme}/assign",
                       headers=headers("district"),
                       json={"collector_id":ACTORS["collector"]}).status_code==200
    photo_id=str(uuid4())
    # Enough JPEG signature for the bounded transport check (not a real photograph).
    photo=bytes.fromhex("ffd8ffdb")+bytes(128)
    digest=hashlib.sha256(photo).hexdigest()
    route=f"/api/v1/stage/forms/evidence/{photo_id}?scheme_id={scheme}"
    auth={**headers("collector"),"Content-Type":"image/jpeg",
          "X-Content-SHA256":digest}
    missing_checksum=client.put(route,headers=headers("collector")|
         {"Content-Type":"image/jpeg"},content=photo)
    assert missing_checksum.status_code==422
    other=client.put(route,headers={**headers("other_district"),
                    "Content-Type":"image/jpeg","X-Content-SHA256":digest},content=photo)
    assert other.status_code==403
    uploaded=client.put(route,headers=auth,content=photo)
    assert uploaded.status_code==200,uploaded.text
    assert uploaded.json()["outcome"]=="accepted"
    assert uploaded.json()["sha256"]==digest
    identical=client.put(route,headers=auth,content=photo)
    assert identical.status_code==200,identical.text
    assert identical.json()["outcome"]=="duplicate"
    changed=bytes.fromhex("ffd8ffdb")+bytes(127)+b"x"
    clash=client.put(route,headers={**auth,
        "X-Content-SHA256":hashlib.sha256(changed).hexdigest()},content=changed)
    assert clash.status_code==409,clash.text
    owner=client.get(f"/api/v1/stage/forms/evidence/{photo_id}",
                     headers=headers("collector"))
    assert owner.status_code==200,owner.text
    assert owner.content==photo
    other_read=client.get(f"/api/v1/stage/forms/evidence/{photo_id}",
                          headers=headers("other_district"))
    assert other_read.status_code==404
    district=client.get(f"/api/v1/stage/forms/evidence/{photo_id}",
                        headers=headers("district"))
    assert district.status_code==200

    now=datetime.now(timezone.utc).isoformat()
    body={"event_id":str(uuid4()),"record_id":str(uuid4()),"revision":1,
        "device_id":str(uuid4()),"scheme_id":scheme,"form_id":"infrastructure_incident",
        "form_version":1,"period_code":"2026-11",
        "captured_at":now,"observed_at":now,"source":"Fictional inspection",
        "base_scheme_revision":1,
        "answers":{"photo_ids":[photo_id],"incident_description":"Synthetic incident"}}
    receipt=client.post("/api/v1/stage/forms/sync/push",
                headers=headers("collector"),json={"operations":[body]})
    assert receipt.status_code==200,receipt.text
    assert receipt.json()["results"][0]["outcome"]=="accepted"
    assert receipt.json()["results"][0]["status"]=="AWAITING_FORM_APPROVAL"
    with psycopg.connect(env) as conn:
        evidence_pending=conn.execute(
            "SELECT evidence_pending FROM nimis_stage.field_form_submission WHERE event_id=%s",
            (body["event_id"],)).fetchone()[0]
        assert evidence_pending is False

    unknown=str(uuid4())
    body2={**body,"event_id":str(uuid4()),"record_id":str(uuid4()),
           "answers":{"photo_ids":[unknown],"incident_description":"Synthetic incident"}}
    receipt2=client.post("/api/v1/stage/forms/sync/push",
                headers=headers("collector"),json={"operations":[body2]})
    assert receipt2.status_code==200,receipt2.text
    assert receipt2.json()["results"][0]["status"]=="EVIDENCE_PENDING"


def test_field_form_review_requires_approved_catalogue_and_delegated_technical_role(client,env):
    scheme=new_scheme(client)
    assert client.post(f"/api/v1/stage/schemes/{scheme}/assign",
      headers=headers("district"),json={"collector_id":ACTORS["collector"]}).status_code==200
    now=datetime.now(timezone.utc).isoformat()
    event_id=str(uuid4())
    body={"event_id":event_id,"record_id":str(uuid4()),"revision":1,
          "device_id":str(uuid4()),"scheme_id":scheme,
          "form_id":"water_availability","form_version":1,
          "period_code":"2026-11","captured_at":now,"observed_at":now,
          "source":"Fictional field measurement","base_scheme_revision":1,
          "answers":{"water_level":"2.8"}}
    received=client.post("/api/v1/stage/forms/sync/push",
        headers=headers("collector"),json={"operations":[body]})
    assert received.status_code==200,received.text
    assert received.json()["results"][0]["outcome"]=="accepted"
    endpoint=f"/api/v1/stage/forms/submissions/{event_id}/decisions"
    def decide(who,action,decision_id=None,reason=""):
        return client.post(endpoint,headers=headers(who),json={
            "decision_id":decision_id or str(uuid4()),"action":action,"reason":reason})
    assert decide("district","VERIFY").status_code==409
    with psycopg.connect(env) as conn:
        conn.execute(
          """INSERT INTO nimis_stage.approved_field_form
             (form_id,form_version,approved_by)
             VALUES ('water_availability',1,%s)
             ON CONFLICT (form_id,form_version) DO NOTHING""",
          (ACTORS["admin"],),
        )
    assert decide("collector","VERIFY").status_code==403
    decision_id=str(uuid4())
    verified=decide("district","VERIFY",decision_id)
    assert verified.status_code==200,verified.text
    assert verified.json()["status"]=="DISTRICT_VERIFIED"
    assert decide("district","VERIFY",decision_id).json()["outcome"]=="duplicate"
    assert decide("admin","PUBLISH").status_code==409
    assert decide("province","REVIEW").json()["status"]=="PROVINCIAL_REVIEWED"
    assert decide("admin","TECHNICAL_APPROVE").status_code==403
    with psycopg.connect(env) as conn:
        conn.execute(
          """INSERT INTO nimis_stage.actor_permission
             (actor_id,permission_code,granted_by)
             VALUES (%s,'NATIONAL_TECHNICAL_APPROVE',%s)
             ON CONFLICT (actor_id,permission_code)
             DO UPDATE SET revoked_at=NULL""",
          (ACTORS["admin"],ACTORS["admin"]),
        )
    technical=decide("admin","TECHNICAL_APPROVE")
    assert technical.status_code==200,technical.text
    assert technical.json()["status"]=="TECHNICAL_APPROVED"
    assert decide("admin","PUBLISH").status_code==409
    with psycopg.connect(env) as conn:
        conn.execute(
          """UPDATE nimis_stage.approved_field_form
             SET reporting_mapping_approved=true
             WHERE form_id='water_availability' AND form_version=1"""
        )
    approved=decide("admin","PUBLISH")
    assert approved.status_code==200,approved.text
    assert approved.json()["status"]=="PUBLISHED"
    with psycopg.connect(env) as conn:
        decisions=conn.execute(
          "SELECT action FROM nimis_stage.field_form_decision WHERE submission_event_id=%s",
          (event_id,),
        ).fetchall()
        assert len(decisions)==4
        # Staged review must never directly overwrite master scheme.
        assert conn.execute(
          "SELECT revision FROM nimis_stage.scheme WHERE scheme_id=%s",
          (scheme,),
        ).fetchone()[0]==1

def test_collector_web_photo_upload_preflight_is_explicitly_allowlisted(client):
    test_uuid=str(uuid4())
    response=client.options(
      f"/api/v1/stage/forms/evidence/{test_uuid}?scheme_id={test_uuid}",
      headers={
        "Origin":"http://127.0.0.1:5191",
        "Access-Control-Request-Method":"PUT",
        "Access-Control-Request-Headers":"content-type,x-content-sha256,x-nimis-dev-actor",
      })
    assert response.status_code==200,response.text
    assert response.headers["access-control-allow-origin"]=="http://127.0.0.1:5191"
    assert "PUT" in response.headers["access-control-allow-methods"]
    assert "x-content-sha256" in response.headers["access-control-allow-headers"].lower()
    untrusted=client.options(
      f"/api/v1/stage/forms/evidence/{test_uuid}?scheme_id={test_uuid}",
      headers={"Origin":"https://untrusted.invalid",
               "Access-Control-Request-Method":"PUT"})
    assert untrusted.headers.get("access-control-allow-origin") is None


def test_published_form_reporting_requires_approved_mapping_and_officer_chain(client,env):
    from uuid import uuid4
    scheme=new_scheme(client)
    assert client.post(f"/api/v1/stage/schemes/{scheme}/assign",
        headers=headers("district"),json={"collector_id":ACTORS["collector"]}).status_code==200
    now=datetime.now(timezone.utc).isoformat()
    event=str(uuid4())
    payload={
      "event_id":event,"record_id":str(uuid4()),"revision":1,"device_id":str(uuid4()),
      "scheme_id":scheme,"form_id":"water_availability","form_version":1,
      "period_code":"2026-11","captured_at":now,"observed_at":now,
      "source":"Fictional meter test","base_scheme_revision":1,
      "answers":{"water_level":"3.20","rainfall":"17.5","storage_percent":"65"},
    }
    pushed=client.post("/api/v1/stage/forms/sync/push",
        headers=headers("collector"),json={"operations":[payload]})
    assert pushed.status_code==200,pushed.text
    assert pushed.json()["results"][0]["outcome"]=="accepted"
    report_url="/api/v1/stage/forms/reports/published?period_code=2026-11"
    def report(who):
        return client.get(report_url,headers=headers(who))
    before=report("district")
    assert before.status_code==200,before.text
    assert not any(x["event_id"]==event for x in before.json()["items"])
    assert report("collector").status_code==403
    assert not any(x["event_id"]==event for x in report("other_district").json()["items"])

    with psycopg.connect(env) as conn:
        conn.execute(
          """INSERT INTO nimis_stage.approved_field_form
              (form_id,form_version,approved_by,reporting_mapping_approved)
              VALUES ('water_availability',1,%s,false)
              ON CONFLICT (form_id,form_version)
              DO UPDATE SET reporting_mapping_approved=false""",(ACTORS["admin"],))
        conn.execute(
          """INSERT INTO nimis_stage.actor_permission
              (actor_id,permission_code,granted_by)
              VALUES (%s,'NATIONAL_TECHNICAL_APPROVE',%s)
              ON CONFLICT(actor_id,permission_code)
              DO UPDATE SET revoked_at=NULL""",(ACTORS["admin"],ACTORS["admin"]))
    endpoint=f"/api/v1/stage/forms/submissions/{event}/decisions"
    def decide(who,action):
        return client.post(endpoint,headers=headers(who),
              json={"decision_id":str(uuid4()),"action":action,"reason":""})
    assert decide("district","VERIFY").status_code==200
    assert decide("province","REVIEW").status_code==200
    assert decide("admin","TECHNICAL_APPROVE").status_code==200
    assert decide("admin","PUBLISH").status_code==409
    assert not any(x["event_id"]==event for x in report("admin").json()["items"])
    with psycopg.connect(env) as conn:
        conn.execute(
          """UPDATE nimis_stage.approved_field_form
             SET reporting_mapping_approved=true
             WHERE form_id='water_availability' AND form_version=1""")
    assert decide("admin","PUBLISH").status_code==200
    published=report("district")
    assert published.status_code==200,published.text
    row=next(x for x in published.json()["items"] if x["event_id"]==event)
    assert row["module"]=="water_resources"
    assert row["scheme_id"]==scheme
    first_page=client.get(report_url+"&limit=1&offset=0",headers=headers("district"))
    assert first_page.status_code==200,first_page.text
    assert len(first_page.json()["items"])==1
    assert first_page.json()["page_limit"]==1
    beyond=client.get(report_url+"&limit=1&offset=100",headers=headers("district"))
    assert beyond.status_code==200,beyond.text
    assert beyond.json()["items"]==[]
    assert client.get(report_url+"&limit=501",headers=headers("district")).status_code==422
    assert client.get(report_url+"&offset=-1",headers=headers("district")).status_code==422
    assert row["status"]=="PUBLISHED"
    assert row["metrics"]==[
      {"field":"water_level","value":"3.20","unit":"m"},
      {"field":"storage_percent","value":"65","unit":"percent"},
      {"field":"rainfall","value":"17.5","unit":"mm"},
    ]
    assert published.json()["official"] is False
    assert published.json()["aggregation_policy"].startswith("NO_NATIONAL_TOTALS")
    csv_result=client.get("/api/v1/stage/forms/reports/published.csv?period_code=2026-11",
                          headers=headers("district"))
    assert csv_result.status_code==200,csv_result.text
    import csv,io
    csv_rows=list(csv.DictReader(io.StringIO(csv_result.text)))
    assert any(x["event_id"]==event and x["field_id"]=="rainfall" and
               x["unit"]=="mm" and x["data_status"]=="PUBLISHED_DEMO_ONLY"
               for x in csv_rows)
    assert client.get("/api/v1/stage/forms/reports/published.csv?period_code=2026-11",
                      headers=headers("collector")).status_code==403
    district_outside=client.get("/api/v1/stage/forms/reports/published.csv?period_code=2026-11",
                               headers=headers("other_district"))
    assert district_outside.status_code==200
    assert all(x["event_id"]!=event for x in csv.DictReader(io.StringIO(district_outside.text)))
    assert not any(x["event_id"]==event for x in report("other_district").json()["items"])
    assert client.get(report_url+"&form_id=not_approved",
        headers=headers("admin")).status_code==422


def test_published_reporting_rejects_mixed_currencies_and_nonadditive_fields():
    from server.core.published_field_reports import _metrics, MODULES
    assert _metrics("om_finance",{"expenditure":"20","farmer_contributions":"10"})==[]
    assert _metrics("water_availability",{"water_level":"Infinity","storage_percent":"125"})==[]
    assert _metrics("water_availability",{"storage_percent":"34.2"})==[
      {"field":"storage_percent","value":"34.2","unit":"percent"}]
    assert "new_scheme_request" not in MODULES
    from server.core.published_field_reports import _csv_safe
    assert _csv_safe("=HYPERLINK(1)")=="'=HYPERLINK(1)"
    assert _csv_safe(" +SUM(3)")=="' +SUM(3)"
    assert _csv_safe("Canal A")=="Canal A"


def test_collector_receipt_status_returns_actual_officer_reason_without_geographic_leak(client):
    scheme=new_scheme(client)
    assert client.post(f"/api/v1/stage/schemes/{scheme}/assign",
      headers=headers("district"),json={"collector_id":ACTORS["collector"]}).status_code==200
    now=datetime.now(timezone.utc).isoformat()
    event=str(uuid4())
    body={"event_id":event,"record_id":str(uuid4()),"revision":1,
          "device_id":str(uuid4()),"scheme_id":scheme,"form_id":"risk_register",
          "form_version":1,"period_code":"2026-11","captured_at":now,
          "observed_at":now,"source":"Fictional risk assessment",
          "base_scheme_revision":1,
          "answers":{"risk_description":"Synthetic power outage","severity":"High"}}
    submitted=client.post("/api/v1/stage/forms/sync/push",
      headers=headers("collector"),json={"operations":[body]})
    assert submitted.status_code==200,submitted.text
    assert submitted.json()["results"][0]["outcome"]=="accepted"
    endpoint=f"/api/v1/stage/forms/sync/status/{event}"
    owner=client.get(endpoint,headers=headers("collector"))
    assert owner.status_code==200,owner.text
    assert owner.json()["status"]=="AWAITING_FORM_APPROVAL"
    assert client.get(endpoint,headers=headers("other_district")).status_code==404
    returned=client.post(f"/api/v1/stage/forms/submissions/{event}/decisions",
      headers=headers("district"),json={
        "decision_id":str(uuid4()),"action":"RETURN",
        "reason":"Please recheck site observation"})
    assert returned.status_code==200,returned.text
    fresh=client.get(endpoint,headers=headers("collector"))
    assert fresh.status_code==200,fresh.text
    assert fresh.json()["status"]=="RETURNED"
    assert fresh.json()["decisions"][-1]["reason"]=="Please recheck site observation"
    assert fresh.json()["official"] is False

def test_unapproved_structured_capture_is_schema_typed_and_areas_constrained():
    from server.core.field_forms import FormOperation,_validate
    now=datetime.now(timezone.utc)
    base={
      "event_id":uuid4(),"record_id":uuid4(),"revision":1,
      "device_id":uuid4(),"scheme_id":uuid4(),"form_id":"baseline",
      "form_version":1,"period_code":"2026-11",
      "captured_at":now,"observed_at":now,"source":"Fictional survey",
      "base_scheme_revision":1,
    }
    valid=FormOperation(**base,answers={
      "officers":[{"reference":"officer-1"}],
      "major_crops":["maize","wheat"],
      "equipped_area_ha":"20","functional_area_ha":"17",
      "water_management":{"allocation":"schedule"},
    })
    digest,evidence=_validate(valid)
    assert len(digest)==64 and evidence is False
    broken=[
      {"officers":"not structured"},
      {"major_crops":"maize,wheat"},
      {"water_management":"plain text"},
      {"functional_area_ha":"25","equipped_area_ha":"20"},
      {"equipped_area_ha":"NaN"},
    ]
    for values in broken:
        with pytest.raises(ValueError):
            _validate(FormOperation(**base,answers=values))

def test_windows_core_launcher_has_complete_admin_password_matcher():
    source=(Path(__file__).resolve().parents[2] / "scripts" / "START_NIMIS_CORE_LOCAL.ps1").read_text(encoding="utf-8")
    assert "'^NIMIS_PG_ADMIN_PASSWORD=[a-fA-F0-9]{64}$' }" in source
    assert "COLLECT_LOCAL_POSTGRESQL_ADMIN_PASSWORD_NOT_FOUND" in source


def test_returned_form_correction_preserves_lineage_and_blocks_unapproved_overwrite(client,env):
    scheme=new_scheme(client)
    assert client.post(f"/api/v1/stage/schemes/{scheme}/assign",
      headers=headers("district"),json={"collector_id":ACTORS["collector"]}).status_code==200
    now=datetime.now(timezone.utc).isoformat()
    record=str(uuid4())
    first_event=str(uuid4())
    body={"event_id":first_event,"record_id":record,"revision":1,
          "device_id":str(uuid4()),"scheme_id":scheme,"form_id":"water_availability",
          "form_version":1,"period_code":"2026-11","captured_at":now,
          "observed_at":now,"source":"Fictional meter reading",
          "base_scheme_revision":1,"answers":{"water_level":"2.1"}}
    url="/api/v1/stage/forms/sync/push"
    def send(item):
        res=client.post(url,headers=headers("collector"),json={"operations":[item]})
        assert res.status_code==200,res.text
        return res.json()["results"][0]
    first=send(body)
    assert first["outcome"]=="accepted"
    assert send(body)["outcome"]=="duplicate"
    in_review={**body,"event_id":str(uuid4()),"revision":2,
               "answers":{"water_level":"2.5"}}
    assert send(in_review)["outcome"]=="conflict"
    returned=client.post(
      f"/api/v1/stage/forms/submissions/{first_event}/decisions",
      headers=headers("district"),json={
        "decision_id":str(uuid4()),"action":"RETURN",
        "reason":"Recheck the meter calibration"})
    assert returned.status_code==200,returned.text
    correction={**in_review,"event_id":str(uuid4())}
    accepted=send(correction)
    assert accepted["outcome"]=="accepted"
    assert accepted["status"]=="AWAITING_FORM_APPROVAL"
    assert send(correction)["outcome"]=="duplicate"
    forged={**correction,"event_id":str(uuid4()),"revision":3,
            "form_id":"energy_power","answers":{"outage_hours":"3"}}
    assert send(forged)["outcome"]=="rejected"
    competing={**correction,"event_id":str(uuid4()),"revision":3,
               "answers":{"water_level":"2.6"}}
    assert send(competing)["outcome"]=="conflict"
    with psycopg.connect(env) as conn:
        rows=conn.execute(
          """SELECT revision,status,payload->>'water_level' AS level
             FROM nimis_stage.field_form_submission
             WHERE record_id=%s ORDER BY revision""",(record,),
        ).fetchall()
        assert [(x[0],x[1],x[2]) for x in rows]==[
          (1,"RETURNED","2.1"),(2,"AWAITING_FORM_APPROVAL","2.5")]
        assert conn.execute(
          "SELECT revision FROM nimis_stage.scheme WHERE scheme_id=%s",
          (scheme,),
        ).fetchone()[0]==1



def test_stage_api_security_headers_origin_and_oversized_request(client,monkeypatch):
    health=client.get("/api/v1/stage/health")
    assert health.status_code==200
    assert health.headers["cache-control"]=="no-store, private"
    assert health.headers["x-content-type-options"]=="nosniff"
    assert health.headers["x-frame-options"]=="DENY"
    refused=client.post("/api/v1/stage/schemes",headers={
        **headers("district"),"Origin":"https://untrusted.example"},
        json={"scheme_code":"DEMO-SECURITY-FAIL","scheme_name":"Fake scheme",
              "province_code":"DEMO-P","district_code":"DEMO-D"})
    assert refused.status_code==403
    assert refused.json()["detail"]=="Untrusted browser origin"
    oversized=client.post("/api/v1/stage/schemes",headers={
        **headers("district"),"Content-Length":"200000"},
        content=b"{}")
    assert oversized.status_code==413
    monkeypatch.setenv("NIMIS_STAGE_OIDC_ENABLED","1")
    monkeypatch.setenv("NIMIS_STAGE_DEV_AUTH","1")
    try:
        assert client.get("/api/v1/stage/me",headers=headers("admin")).status_code==503
        assert client.get("/api/v1/stage/me",headers={
            **headers("admin"),"Authorization":"Bearer fake.token.signature"}).status_code==503
    finally:
        monkeypatch.setenv("NIMIS_STAGE_OIDC_ENABLED","0")


def test_jwks_url_is_restricted_to_approved_issuer_origin(monkeypatch):
    from server.core.oidc_identity import _options
    monkeypatch.setenv("NIMIS_OIDC_ISSUER","https://identity.ministry.example/realm")
    monkeypatch.setenv("NIMIS_OIDC_AUDIENCE","nimis")
    monkeypatch.setenv("NIMIS_OIDC_JWKS_URL",
                       "https://identity.ministry.example/realm/protocol/keys")
    assert _options()[1]=="nimis"
    monkeypatch.setenv("NIMIS_OIDC_JWKS_URL","https://attacker.example/keys")
    with pytest.raises(Exception):
        _options()
