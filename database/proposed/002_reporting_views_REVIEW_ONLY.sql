-- PROPOSED CURATED POWER BI DATA ACCESS — REVIEW ONLY / NEVER APPLIES CHANGES.
-- NIMIS Concept + Power BI Addendum §§14-17, 13 Nov 2026.
-- Requires review against approved indicators, fiscal calendar, security
-- and physical PostgreSQL structures BEFORE converting to deployment migrations.
BEGIN;
CREATE SCHEMA IF NOT EXISTS nimis_reporting;

-- Curated dimensions, not direct writeable views. Names and IDs are placeholders
-- for the approved semantic model; never expose sensitive personal details.
CREATE OR REPLACE VIEW nimis_reporting.dim_scheme AS
 SELECT s.scheme_id, s.scheme_code, s.scheme_name,
        s.province_code, s.district_code, s.ward_code,
        s.category, s.ownership, s.commissioned_year,
        s.last_verified_at, s.master_revision
 FROM nimis_core.scheme s
 WHERE s.retired_at IS NULL
   AND s.last_verified_at IS NOT NULL;

-- Only published verified submission-sourced facts are eligible.
CREATE OR REPLACE VIEW nimis_reporting.fact_area_status AS
 SELECT a.area_id, a.scheme_id, a.season_code, a.reporting_date,
        a.equipped_ha, a.functional_ha, a.actually_irrigated_ha,
        CASE WHEN a.equipped_ha>0 AND a.functional_ha IS NOT NULL
             AND a.functional_ha<=a.equipped_ha
             THEN ROUND(100*a.functional_ha/a.equipped_ha,2)
             ELSE NULL END AS functionality_rate_pct,
        sub.submission_id, sub.received_at AS source_received_at
 FROM nimis_core.season_area a
 JOIN nimis_core.submission sub ON sub.submission_id=a.source_submission_id
 WHERE a.verification_status='VERIFIED' AND sub.status='PUBLISHED';

CREATE OR REPLACE VIEW nimis_reporting.fact_production AS
 SELECT c.crop_record_id,c.scheme_id,c.season_code,c.crop_name,
        c.planted_ha,c.harvested_ha,c.production_tonnes,c.market_destination,
        CASE WHEN c.harvested_ha>0
             THEN ROUND(c.production_tonnes/c.harvested_ha,3)
             ELSE NULL END AS tonnes_per_harvested_ha,
        sub.submission_id,sub.received_at AS source_received_at
 FROM nimis_core.crop_record c
 JOIN nimis_core.submission sub ON sub.submission_id=c.source_submission_id
 WHERE sub.status='PUBLISHED';

CREATE OR REPLACE VIEW nimis_reporting.fact_asset_condition AS
 SELECT a.assessment_id,i.scheme_id,a.asset_id,i.asset_type,
        a.assessed_at,a.condition_code,
        sub.submission_id,sub.received_at AS source_received_at
 FROM nimis_core.asset_assessment a
 JOIN nimis_core.infrastructure_asset i ON i.asset_id=a.asset_id
 JOIN nimis_core.submission sub ON sub.submission_id=a.source_submission_id
 WHERE sub.status='PUBLISHED';

-- Proposed role access pattern: BI identity must get SELECT on curated views
-- and must not receive table writes or broad access to the operational schema.
-- Important: standard PostgreSQL views do NOT automatically enforce base-table
-- RLS for invoking users. Implement verified security-invoker or secured data mart
-- with tenant/role scoping and Microsoft Power BI RLS after approval.
-- Never GRANT to PUBLIC or permit a remote browser to connect to database.
ROLLBACK;
