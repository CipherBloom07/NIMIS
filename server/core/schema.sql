-- NIMIS Core Stage 1: ISOLATED LOCAL DEVELOPMENT SCHEMA ONLY.
-- Must run against 'nimis_core_dev' on 127.0.0.1/localhost, never a Ministry database.
-- Approval and production authentication remain separate governance gates.
BEGIN;
CREATE SCHEMA IF NOT EXISTS nimis_stage;

CREATE TABLE IF NOT EXISTS nimis_stage.actor (
 actor_id uuid PRIMARY KEY,
 display_name text NOT NULL,
 role_code text NOT NULL CHECK(role_code IN ('admin','provincial_officer','district_officer','data_collector')),
 province_code text,
 district_code text,
 is_active boolean NOT NULL DEFAULT true,
 CHECK (role_code NOT IN ('district_officer','data_collector') OR district_code IS NOT NULL),
 CHECK (role_code <> 'provincial_officer' OR province_code IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS nimis_stage.scheme (
 scheme_id uuid PRIMARY KEY,
 scheme_code text NOT NULL UNIQUE,
 scheme_name text NOT NULL,
 province_code text NOT NULL,
 district_code text NOT NULL,
 equipped_ha numeric(13,3) CHECK (equipped_ha>=0),
 developed_ha numeric(13,3) CHECK (developed_ha>=0),
 functional_ha numeric(13,3) CHECK (functional_ha>=0),
 operational_status text NOT NULL DEFAULT 'UNASSESSED',
 revision bigint NOT NULL DEFAULT 1 CHECK (revision>0),
 source_type text NOT NULL DEFAULT 'DEMO',
 verified_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (functional_ha IS NULL OR equipped_ha IS NULL OR functional_ha<=equipped_ha)
);
CREATE INDEX IF NOT EXISTS scheme_geography_idx ON nimis_stage.scheme(province_code,district_code);
CREATE TABLE IF NOT EXISTS nimis_stage.assignment (
 scheme_id uuid NOT NULL REFERENCES nimis_stage.scheme(scheme_id),
 collector_id uuid NOT NULL REFERENCES nimis_stage.actor(actor_id),
 assigned_by uuid NOT NULL REFERENCES nimis_stage.actor(actor_id),
 assigned_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 PRIMARY KEY (scheme_id,collector_id)
);
CREATE TABLE IF NOT EXISTS nimis_stage.submission (
 submission_id uuid PRIMARY KEY,
 event_id uuid NOT NULL UNIQUE,
 scheme_id uuid NOT NULL REFERENCES nimis_stage.scheme(scheme_id),
 collector_id uuid NOT NULL REFERENCES nimis_stage.actor(actor_id),
 device_id uuid NOT NULL,
 form_id text NOT NULL,
 form_version integer NOT NULL CHECK (form_version > 0),
 period_code text NOT NULL,
 base_scheme_revision bigint NOT NULL CHECK (base_scheme_revision > 0),
 captured_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 prior_submission_id uuid REFERENCES nimis_stage.submission(submission_id),
 record_revision integer NOT NULL DEFAULT 1 CHECK(record_revision>0),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 content_sha256 char(64) NOT NULL,
 status text NOT NULL DEFAULT 'SUBMITTED' CHECK
  (status IN ('SUBMITTED','CONFLICT','DISTRICT_VERIFIED','PROVINCIAL_REVIEWED','TECHNICAL_APPROVED','PUBLISHED','RETURNED')),
 latest_decision_at timestamptz,
 is_demo boolean NOT NULL DEFAULT true,
 CHECK (octet_length(payload::text)<=524288)
);
-- Existing local Stage 1 clusters can be extended without deleting records.
ALTER TABLE nimis_stage.submission
 ADD COLUMN IF NOT EXISTS prior_submission_id uuid REFERENCES nimis_stage.submission(submission_id);
ALTER TABLE nimis_stage.submission
 ADD COLUMN IF NOT EXISTS record_revision integer NOT NULL DEFAULT 1;
-- A version is unique per scheme + form + reporting period, preventing parallel unlinked copies.
CREATE UNIQUE INDEX IF NOT EXISTS submission_period_revision_uidx
 ON nimis_stage.submission(scheme_id,form_id,period_code,record_revision);
CREATE INDEX IF NOT EXISTS submission_scheme_period_idx
 ON nimis_stage.submission(scheme_id,form_id,period_code,received_at);
CREATE INDEX IF NOT EXISTS submission_status_idx
 ON nimis_stage.submission(status,received_at DESC);
CREATE TABLE IF NOT EXISTS nimis_stage.decision (
 decision_id uuid PRIMARY KEY,
 event_id uuid NOT NULL UNIQUE,
 submission_id uuid NOT NULL REFERENCES nimis_stage.submission(submission_id),
 actor_id uuid NOT NULL REFERENCES nimis_stage.actor(actor_id),
 action text NOT NULL CHECK(action IN ('VERIFY','RETURN','REVIEW','TECHNICAL_APPROVE','PUBLISH')),
 from_status text NOT NULL,
 to_status text NOT NULL,
 reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (action <> 'RETURN' OR length(btrim(coalesce(reason,''))) > 0)
);
CREATE INDEX IF NOT EXISTS decision_submission_idx ON nimis_stage.decision(submission_id,created_at DESC);
CREATE TABLE IF NOT EXISTS nimis_stage.audit (
 audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 actor_id uuid REFERENCES nimis_stage.actor(actor_id),
 event_type text NOT NULL,
 entity_type text NOT NULL,
 entity_id uuid NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb
);
-- This migration contains NO official irrigation records and creates no accounts.
-- No rights are granted to PUBLIC or clients; backend uses an approved limited DB identity later.
COMMIT;

-- Review-only NIMIS Core extension for collection of proposed field-form datasets.
-- Applied solely to isolated nimis_core_dev. Never modifies scheme master or
-- publishes unverified/unapproved values into national reporting views.
BEGIN;
CREATE TABLE IF NOT EXISTS nimis_stage.field_form_submission(
 event_id uuid PRIMARY KEY,
 record_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0),
 scheme_id uuid REFERENCES nimis_stage.scheme(scheme_id),
 collector_id uuid NOT NULL REFERENCES nimis_stage.actor(actor_id),
 device_id uuid NOT NULL,
 form_id text NOT NULL,
 form_version integer NOT NULL CHECK(form_version>0),
 period_code text NOT NULL,
 captured_at timestamptz NOT NULL,
 observed_at timestamptz NOT NULL,
 source text NOT NULL CHECK(length(btrim(source))>0),
 base_scheme_revision bigint,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=131072),
 content_sha256 char(64) NOT NULL,
 status text NOT NULL DEFAULT 'AWAITING_FORM_APPROVAL'
  CHECK(status IN ('AWAITING_FORM_APPROVAL','SCHEME_REVISION_CONFLICT','EVIDENCE_PENDING')),
 evidence_pending boolean NOT NULL DEFAULT false,
 received_at timestamptz NOT NULL DEFAULT now(),
 CHECK (scheme_id IS NOT NULL OR form_id='new_scheme_request'),
 UNIQUE(record_id,revision)
);
CREATE INDEX IF NOT EXISTS field_form_scheme_period
 ON nimis_stage.field_form_submission(scheme_id,form_id,period_code,received_at DESC);
CREATE INDEX IF NOT EXISTS field_form_collector
 ON nimis_stage.field_form_submission(collector_id,received_at DESC);
REVOKE ALL ON nimis_stage.field_form_submission FROM PUBLIC;
-- Only the reviewed local stage runtime may SELECT/INSERT. No UPDATE/DELETE.
COMMIT;
