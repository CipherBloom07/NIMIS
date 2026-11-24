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
