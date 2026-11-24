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
          nimis_stage.submission,nimis_stage.decision,nimis_stage.audit TO nimis_stage_demo""")
        conn.execute("""GRANT UPDATE(scheme_name,operational_status,equipped_ha,developed_ha,functional_ha,
             revision,updated_at) ON nimis_stage.scheme TO nimis_stage_demo""")
        conn.execute("GRANT UPDATE(revoked_at,assigned_by) ON nimis_stage.assignment TO nimis_stage_demo")
        conn.execute("GRANT UPDATE(status,latest_decision_at) ON nimis_stage.submission TO nimis_stage_demo")
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
