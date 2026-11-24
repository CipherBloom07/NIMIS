-- EXPLICITLY FICTIONAL, opt-in demonstration seed; never official scheme master.
-- Run only in local nimis_core_dev using -SeedFictional.
INSERT INTO nimis_stage.actor(actor_id,display_name,role_code,province_code,district_code)
VALUES
 ('00000000-0000-4000-8000-000000000001','Demo Admin','admin',NULL,NULL),
 ('00000000-0000-4000-8000-000000000002','Demo Provincial Officer','provincial_officer','DEMO-P',NULL),
 ('00000000-0000-4000-8000-000000000003','Demo District Officer','district_officer','DEMO-P','DEMO-D'),
 ('00000000-0000-4000-8000-000000000004','Demo Data Collector','data_collector','DEMO-P','DEMO-D'),
 ('00000000-0000-4000-8000-000000000005','Demo Different District','district_officer','DEMO-P','OTHER-D')
ON CONFLICT (actor_id) DO NOTHING;
INSERT INTO nimis_stage.scheme(scheme_id,scheme_code,scheme_name,province_code,district_code)
VALUES ('00000000-0000-4000-8000-000000001000','DEMO-NIMIS-0001',
 'Fictional Canal Scheme — Training Only','DEMO-P','DEMO-D')
ON CONFLICT (scheme_id) DO NOTHING;
INSERT INTO nimis_stage.assignment(scheme_id,collector_id,assigned_by)
VALUES ('00000000-0000-4000-8000-000000001000','00000000-0000-4000-8000-000000000004',
        '00000000-0000-4000-8000-000000000003')
ON CONFLICT (scheme_id,collector_id) DO NOTHING;
