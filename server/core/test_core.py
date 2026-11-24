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
    os.environ["NIMIS_STAGE_DATABASE_URL"]=url
    with psycopg.connect(url) as conn:
        conn.execute(SCHEMA.read_text(encoding="utf8"))
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
    assert decision("district","VERIFY").status_code==409

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
