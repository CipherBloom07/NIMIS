-- ISOLATED LOCAL ONLY. Run as postgres on nimis_core_dev.
-- App runtime may write only to the approved development tables and columns.
SELECT format('CREATE ROLE nimis_stage_demo LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='nimis_stage_demo')
\gexec
SELECT format('ALTER ROLE nimis_stage_demo PASSWORD %L', :'app_password')
\gexec
GRANT CONNECT ON DATABASE nimis_core_dev TO nimis_stage_demo;
GRANT USAGE ON SCHEMA nimis_stage TO nimis_stage_demo;
GRANT SELECT ON ALL TABLES IN SCHEMA nimis_stage TO nimis_stage_demo;
GRANT INSERT ON nimis_stage.scheme,nimis_stage.assignment,nimis_stage.submission,
 nimis_stage.decision,nimis_stage.audit TO nimis_stage_demo;
GRANT UPDATE(scheme_name,operational_status,equipped_ha,developed_ha,functional_ha,revision,updated_at)
 ON nimis_stage.scheme TO nimis_stage_demo;
GRANT UPDATE(revoked_at,assigned_by) ON nimis_stage.assignment TO nimis_stage_demo;
GRANT UPDATE(status,latest_decision_at) ON nimis_stage.submission TO nimis_stage_demo;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA nimis_stage TO nimis_stage_demo;
REVOKE CREATE ON SCHEMA nimis_stage FROM nimis_stage_demo;

-- Read/insert only proposed unapproved field submissions; never update/delete.
GRANT SELECT,INSERT ON nimis_stage.field_form_submission TO nimis_stage_demo;
