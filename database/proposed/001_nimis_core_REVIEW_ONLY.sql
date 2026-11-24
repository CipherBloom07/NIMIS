-- NIMIS CENTRAL SCHEMA PROPOSAL — TECHNICAL REVIEW ONLY (NOT EXECUTED).
-- Based on NIMIS Concept (sections 4-8, 11-12), 13 Nov 2026 briefing,
-- and mWater irrigation questionnaire. Requires ICT/data-steward approval.
-- PostgreSQL 16+ with PostGIS. Apply only to a disposable review database.
-- No personal farmer details or live Ministry dataset is included.
BEGIN;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS nimis_core;

-- Explicit four application roles (technical validation is a delegated permission,
-- not an additional unrestricted login role).
CREATE TABLE IF NOT EXISTS nimis_core.app_user(
 user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 identity_subject text NOT NULL UNIQUE,
 display_name text NOT NULL,
 role_code text NOT NULL CHECK(role_code IN('admin','provincial_officer','district_officer','data_collector')),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 disabled_at timestamptz
);
CREATE TABLE IF NOT EXISTS nimis_core.geography(
 geography_code text PRIMARY KEY,
 geography_name text NOT NULL,
 level_code text NOT NULL CHECK(level_code IN('PROVINCE','DISTRICT','WARD')),
 parent_code text REFERENCES nimis_core.geography(geography_code),
 UNIQUE(geography_code,level_code)
);
CREATE TABLE IF NOT EXISTS nimis_core.user_scope(
 user_id uuid NOT NULL REFERENCES nimis_core.app_user(user_id),
 geography_code text NOT NULL REFERENCES nimis_core.geography(geography_code),
 PRIMARY KEY(user_id,geography_code)
);
CREATE TABLE IF NOT EXISTS nimis_core.scheme(
 scheme_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 scheme_code text NOT NULL UNIQUE,
 scheme_name text NOT NULL,
 aliases text[] NOT NULL DEFAULT '{}',
 category text,
 ownership text,
 province_code text NOT NULL REFERENCES nimis_core.geography(geography_code),
 district_code text NOT NULL REFERENCES nimis_core.geography(geography_code),
 ward_code text REFERENCES nimis_core.geography(geography_code),
 location geography(Point,4326),
 boundary geometry(MultiPolygon,4326),
 commissioned_year int CHECK(commissioned_year BETWEEN 1850 AND 2100),
 design_area_ha numeric(14,3) CHECK(design_area_ha>=0),
 irrigable_area_ha numeric(14,3) CHECK(irrigable_area_ha>=0),
 developed_area_ha numeric(14,3) CHECK(developed_area_ha>=0),
 equipped_area_ha numeric(14,3) CHECK(equipped_area_ha>=0),
 beneficiary_count int CHECK(beneficiary_count>=0),
 active_farmer_count int CHECK(active_farmer_count>=0),
 operational_status text NOT NULL DEFAULT 'UNASSESSED',
 source_reference text,
 master_revision integer NOT NULL DEFAULT 1,
 last_verified_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 retired_at timestamptz,
 CHECK(active_farmer_count IS NULL OR beneficiary_count IS NULL OR active_farmer_count<=beneficiary_count)
);
CREATE INDEX IF NOT EXISTS scheme_location_gix ON nimis_core.scheme USING GIST(location);
CREATE INDEX IF NOT EXISTS scheme_boundary_gix ON nimis_core.scheme USING GIST(boundary);
CREATE INDEX IF NOT EXISTS scheme_admin_idx ON nimis_core.scheme(province_code,district_code);

-- Controlled assignments: collector may only submit to assigned schemes.
CREATE TABLE IF NOT EXISTS nimis_core.collector_assignment(
 assignment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 scheme_id uuid NOT NULL REFERENCES nimis_core.scheme(scheme_id),
 collector_id uuid NOT NULL REFERENCES nimis_core.app_user(user_id),
 assigned_by uuid NOT NULL REFERENCES nimis_core.app_user(user_id),
 effective_from timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz,
 revoked_at timestamptz,
 UNIQUE(scheme_id,collector_id,effective_from)
);

-- Every submission is immutable. Revisions are separate records, not overwrites.
CREATE TABLE IF NOT EXISTS nimis_core.submission(
 submission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL UNIQUE,
 scheme_id uuid NOT NULL REFERENCES nimis_core.scheme(scheme_id),
 submitted_by uuid NOT NULL REFERENCES nimis_core.app_user(user_id),
 device_id uuid NOT NULL,
 form_id text NOT NULL,
 form_version integer NOT NULL CHECK(form_version>=1),
 base_revision integer,
 reporting_period text,
 captured_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 status text NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN
 ('SUBMITTED','DISTRICT_VERIFIED','PROVINCIAL_REVIEWED','TECHNICAL_APPROVED','PUBLISHED','RETURNED','REJECTED')),
 revision integer NOT NULL DEFAULT 1,
 original_submission_id uuid REFERENCES nimis_core.submission(submission_id),
 UNIQUE(scheme_id,form_id,reporting_period,revision),
 CHECK(octet_length(payload::text)<=1048576)
);
CREATE INDEX IF NOT EXISTS submission_review_idx ON nimis_core.submission(status,received_at DESC);
CREATE INDEX IF NOT EXISTS submission_scheme_idx ON nimis_core.submission(scheme_id,received_at DESC);

CREATE TABLE IF NOT EXISTS nimis_core.workflow_decision(
 decision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 submission_id uuid NOT NULL REFERENCES nimis_core.submission(submission_id),
 decided_by uuid NOT NULL REFERENCES nimis_core.app_user(user_id),
 stage text NOT NULL CHECK(stage IN('DISTRICT','PROVINCE','TECHNICAL','PUBLISH')),
 decision text NOT NULL CHECK(decision IN('VERIFY','REVIEW','APPROVE','PUBLISH','RETURN','REJECT')),
 comment text,
 decided_at timestamptz NOT NULL DEFAULT now(),
 CHECK(decision NOT IN('RETURN','REJECT') OR length(btrim(coalesce(comment,'')))>0)
);
CREATE INDEX IF NOT EXISTS decision_submission_idx
 ON nimis_core.workflow_decision(submission_id,decided_at DESC);

-- Asset, water, crop, power, O&M and project facts remain separate from the scheme master.
CREATE TABLE IF NOT EXISTS nimis_core.water_source(
 water_source_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 scheme_id uuid NOT NULL REFERENCES nimis_core.scheme(scheme_id),
 source_type text NOT NULL,
 source_name text,
 source_location geography(Point,4326),
 abstraction_capacity_m3_per_day numeric(16,3) CHECK(abstraction_capacity_m3_per_day>=0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS nimis_core.infrastructure_asset(
 asset_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 scheme_id uuid NOT NULL REFERENCES nimis_core.scheme(scheme_id),
 asset_type text NOT NULL, asset_name text,
 installed_at date, location geography(Point,4326)
);
CREATE TABLE IF NOT EXISTS nimis_core.asset_assessment(
 assessment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 asset_id uuid NOT NULL REFERENCES nimis_core.infrastructure_asset(asset_id),
 assessed_at timestamptz NOT NULL,
 condition_code text NOT NULL CHECK(condition_code IN('GOOD','MODERATE','BAD','NOT_ASSESSED')),
 observations text, source_submission_id uuid REFERENCES nimis_core.submission(submission_id)
);
CREATE TABLE IF NOT EXISTS nimis_core.season_area(
 area_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 scheme_id uuid NOT NULL REFERENCES nimis_core.scheme(scheme_id),
 season_code text NOT NULL,
 reporting_date date NOT NULL,
 equipped_ha numeric(14,3) CHECK(equipped_ha>=0),
 functional_ha numeric(14,3) CHECK(functional_ha>=0),
 actually_irrigated_ha numeric(14,3) CHECK(actually_irrigated_ha>=0),
 source_submission_id uuid REFERENCES nimis_core.submission(submission_id),
 verification_status text NOT NULL DEFAULT 'UNVERIFIED',
 CHECK(functional_ha IS NULL OR equipped_ha IS NULL OR functional_ha<=equipped_ha),
 UNIQUE(scheme_id,season_code,reporting_date)
);
CREATE TABLE IF NOT EXISTS nimis_core.crop_record(
 crop_record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 scheme_id uuid NOT NULL REFERENCES nimis_core.scheme(scheme_id),
 season_code text NOT NULL, crop_name text NOT NULL,
 planted_ha numeric(14,3) CHECK(planted_ha>=0),
 harvested_ha numeric(14,3) CHECK(harvested_ha>=0),
 production_tonnes numeric(16,3) CHECK(production_tonnes>=0),
 market_destination text,
 source_submission_id uuid REFERENCES nimis_core.submission(submission_id)
);
CREATE TABLE IF NOT EXISTS nimis_core.programme_project(
 project_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 scheme_id uuid NOT NULL REFERENCES nimis_core.scheme(scheme_id),
 programme_code text, project_name text NOT NULL,
 budget_currency char(3), approved_budget numeric(20,2) CHECK(approved_budget>=0),
 planned_start date, planned_completion date,
 delivery_status text NOT NULL DEFAULT 'PLANNED'
);
CREATE TABLE IF NOT EXISTS nimis_core.project_milestone(
 milestone_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES nimis_core.programme_project(project_id),
 milestone_name text NOT NULL, weight numeric(10,5) CHECK(weight>0),
 planned_date date, completed_at date, verified boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS nimis_core.energy_observation(
 observation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 scheme_id uuid NOT NULL REFERENCES nimis_core.scheme(scheme_id),
 observed_at timestamptz NOT NULL, energy_source text NOT NULL,
 power_available boolean, outage_hours numeric(12,2) CHECK(outage_hours>=0),
 source_submission_id uuid REFERENCES nimis_core.submission(submission_id)
);
CREATE TABLE IF NOT EXISTS nimis_core.maintenance_record(
 maintenance_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 scheme_id uuid NOT NULL REFERENCES nimis_core.scheme(scheme_id),
 asset_id uuid REFERENCES nimis_core.infrastructure_asset(asset_id),
 work_description text NOT NULL, priority text, work_status text NOT NULL,
 planned_date date, completed_at date,
 cost_amount numeric(18,2) CHECK(cost_amount>=0), cost_currency char(3)
);
CREATE TABLE IF NOT EXISTS nimis_core.document_metadata(
 document_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 submission_id uuid NOT NULL REFERENCES nimis_core.submission(submission_id),
 object_key text NOT NULL UNIQUE, sha256_hex char(64) NOT NULL,
 content_type text NOT NULL, byte_count bigint NOT NULL CHECK(byte_count>=0),
 uploaded_at timestamptz NOT NULL DEFAULT now(),
 CHECK(object_key NOT LIKE 'http%')
);
CREATE TABLE IF NOT EXISTS nimis_core.audit_event(
 audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_at timestamptz NOT NULL DEFAULT now(),
 actor_id uuid REFERENCES nimis_core.app_user(user_id),
 event_type text NOT NULL, entity_type text NOT NULL, entity_id uuid,
 change_summary jsonb NOT NULL DEFAULT '{}'::jsonb
);
-- This DDL only defines structure. Do NOT grant table privileges to browser clients.
-- Required before production: approved access matrix, PostgreSQL RLS policies,
-- auth token verification, secure backend-only DB credentials, policy tests,
-- immutable record triggers, retention policy, auditable ETL and backups.
ROLLBACK; -- SAFETY: executing this file cannot persist any proposed objects.
