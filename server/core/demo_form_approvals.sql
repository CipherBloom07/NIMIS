-- FICTIONAL local-only signoff fixture. THIS IS NOT INSTITUTIONAL APPROVAL.
-- This script must be applied only to nimis_core_dev. Never run on real records.
DO $demo$
BEGIN
 IF current_database()<>'nimis_core_dev' THEN
    RAISE EXCEPTION 'FICTIONAL_REVIEW_REFUSES_NON_DEMO_DATABASE';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM nimis_stage.actor WHERE actor_id='00000000-0000-4000-8000-000000000001' AND display_name='Demo Admin' AND role_code='admin') THEN
    RAISE EXCEPTION 'DEMO_ADMIN_NOT_SEEDED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM nimis_stage.scheme WHERE scheme_id='00000000-0000-4000-8000-000000001000' AND scheme_name='Fictional Canal Scheme — Training Only') THEN
    RAISE EXCEPTION 'DEMO_SCHEME_NOT_SEEDED';
 END IF;
END
$demo$;

-- All 10 registered-scheme test forms; new_scheme_request requires separate master registration. Never institutional approval.
INSERT INTO nimis_stage.approved_field_form
 (form_id,form_version,approved_by,reporting_mapping_approved)
VALUES
 ('water_availability',1,'00000000-0000-4000-8000-000000000001',true),
 ('operational_status',1,'00000000-0000-4000-8000-000000000001',true),
 ('seasonal_production',1,'00000000-0000-4000-8000-000000000001',true),
 ('energy_power',1,'00000000-0000-4000-8000-000000000001',true),
 ('baseline',1,'00000000-0000-4000-8000-000000000001',true),
 ('infrastructure_incident',1,'00000000-0000-4000-8000-000000000001',true),
 ('om_finance',1,'00000000-0000-4000-8000-000000000001',true),
 ('project_update',1,'00000000-0000-4000-8000-000000000001',true),
 ('risk_register',1,'00000000-0000-4000-8000-000000000001',true),
 ('farmer_plot',1,'00000000-0000-4000-8000-000000000001',true)
ON CONFLICT(form_id,form_version)
DO UPDATE SET approved_by=EXCLUDED.approved_by,
              reporting_mapping_approved=true
WHERE nimis_stage.approved_field_form.approved_by='00000000-0000-4000-8000-000000000001';

INSERT INTO nimis_stage.actor_permission(actor_id,permission_code,granted_by)
VALUES ('00000000-0000-4000-8000-000000000001',
        'NATIONAL_TECHNICAL_APPROVE',
        '00000000-0000-4000-8000-000000000001')
ON CONFLICT(actor_id,permission_code)
DO UPDATE SET revoked_at=NULL
WHERE nimis_stage.actor_permission.actor_id='00000000-0000-4000-8000-000000000001';

DO $demo$
BEGIN
 RAISE NOTICE 'FICTIONAL_REVIEW_FIXTURE_INSTALLED: THIS IS NOT MINISTRY APPROVAL';
END
$demo$;
