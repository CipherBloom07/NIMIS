"""Validated, typed reporting read model for PUBLISHED field forms.

Read-only and bounded; no scheme master edits or generalized roll-up assumptions.
This stage API deliberately never presents the values as official national figures.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation
import csv
import io
from fastapi.responses import Response
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from server.core.app import actor, db, need_role

router=APIRouter(prefix="/api/v1/stage/forms", tags=["published-field-reporting"])

# Explicit module/units mapping; disallow arbitrary submitted field names.
# Currency with unspecified USD/ZWL/ZiG is excluded to prevent false totals.
MODULES={
    "baseline": ("scheme_registry", {
        "equipped_area_ha":"ha","functional_area_ha":"ha",
        "expansion_area_ha":"ha","beneficiaries":"count"}),
    "operational_status": ("scheme_operations", {
        "equipped_area_ha":"ha","developed_area_ha":"ha",
        "functional_area_ha":"ha","actually_irrigated_area_ha":"ha",
        "active_beneficiaries":"count"}),
    "seasonal_production": ("agronomy", {
        "planted_area_ha":"ha","harvested_area_ha":"ha",
        "production":"tonnes","yield":"tonnes_per_ha"}),
    "water_availability": ("water_resources", {
        "water_level":"m","storage_percent":"percent",
        "flow":"m3_per_s","abstraction_volume":"m3","rainfall":"mm"}),
    "infrastructure_incident": ("infrastructure", {}),
    "om_finance": ("operations_maintenance", {}),
    "energy_power": ("energy", {"outage_hours":"hours"}),
    "project_update": ("projects", {
        "target_area_ha":"ha","substantially_complete_ha":"ha",
        "progress_percent":"percent"}),
    "risk_register": ("monitoring_risk", {}),
    "farmer_plot": ("beneficiaries", {"plot_area_ha":"ha"}),
}
def _metrics(form_id:str,payload:dict)->list[dict]:
    _,mapping=MODULES[form_id]
    result=[]
    for field,unit in mapping.items():
        raw=payload.get(field)
        if raw is None or raw=="" or isinstance(raw,(dict,list,bool)):
            continue
        try:
            value=Decimal(str(raw))
        except (InvalidOperation,TypeError,ValueError):
            continue
        if not value.is_finite() or value<0:
            continue
        if unit=="percent" and value>100:
            continue
        result.append({"field":field,"value":str(value),"unit":unit})
    return result


@router.get("/reports/published")
def published_form_report(
    period_code:str=Query(...,pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    form_id:str|None=Query(default=None,min_length=3,max_length=90),
    user=Depends(actor),
):
    need_role(user,"admin","provincial_officer","district_officer")
    if form_id is not None and form_id not in MODULES:
        raise HTTPException(422,detail="Form does not have an approved reporting read model")
    role=user["role_code"]
    where=["f.period_code=%s","f.status='PUBLISHED'",
           "approved.reporting_mapping_approved=true"]
    params:list=[period_code]
    if role=="provincial_officer":
        where.append("s.province_code=%s")
        params.append(user["province_code"])
    elif role=="district_officer":
        where.extend(["s.province_code=%s","s.district_code=%s"])
        params.extend([user["province_code"],user["district_code"]])
    if form_id is not None:
        where.append("f.form_id=%s")
        params.append(form_id)
    # One latest published revision per original local record. Do not collapse
    # different crop, plot, source or incident IDs into a fictitious scheme total.
    with db() as conn:
        rows=conn.execute(
            """SELECT * FROM (
               SELECT f.event_id,f.record_id,f.revision,f.scheme_id,
                      f.form_id,f.form_version,f.period_code,f.observed_at,
                      f.received_at,f.source,f.payload,
                      s.scheme_code,s.scheme_name,s.province_code,s.district_code,
                      row_number() OVER (
                        PARTITION BY f.record_id
                        ORDER BY f.revision DESC,f.received_at DESC,f.event_id DESC
                      ) AS version_rank
               FROM nimis_stage.field_form_submission f
               JOIN nimis_stage.scheme s ON s.scheme_id=f.scheme_id
               JOIN nimis_stage.approved_field_form approved
                 ON approved.form_id=f.form_id
                AND approved.form_version=f.form_version
               WHERE """+" AND ".join(where)+
               """) t WHERE t.version_rank=1
                  ORDER BY t.scheme_code,t.form_id,t.observed_at DESC,t.event_id
                  LIMIT 501""",
            tuple(params),
        ).fetchall()
    more=len(rows)>500
    items=[]
    for row in rows[:500]:
        form=row["form_id"]
        if form not in MODULES:
            continue
        module,_=MODULES[form]
        items.append({
            "event_id":str(row["event_id"]),
            "record_id":str(row["record_id"]),
            "revision":row["revision"],
            "scheme_id":str(row["scheme_id"]),
            "scheme_code":row["scheme_code"],
            "scheme_name":row["scheme_name"],
            "province_code":row["province_code"],
            "district_code":row["district_code"],
            "form_id":form,
            "form_version":row["form_version"],
            "module":module,
            "period_code":row["period_code"],
            "observed_at":row["observed_at"].isoformat(),
            "source":row["source"],
            "metrics":_metrics(form,row["payload"]),
            "status":"PUBLISHED",
        })
    return {
        "source":"ISOLATED_DEVELOPMENT","official":False,
        "data_status":"PUBLISHED_DEMO_ONLY",
        "period_code":period_code,
        "record_count":len(items),"has_more":more,
        "items":items,
        "aggregation_policy":"NO_NATIONAL_TOTALS: versioned observations are presented by scheme, form and record; overlapping schemes and mixed units are never summed.",
    }

def _csv_safe(value):
    text="" if value is None else str(value)
    # Prevent spreadsheet formula execution even if source/scheme name is hostile.
    if text.lstrip().startswith(("=","+","-","@")) or text.startswith(("\\t","\\r","\\n")):
        return "'"+text
    return text


@router.get("/reports/published.csv")
def published_form_csv(
    period_code:str=Query(...,pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    form_id:str|None=Query(default=None,min_length=3,max_length=90),
    user=Depends(actor),
):
    """Scoped row-level Power BI/CSV *pilot* export; never official totals."""
    result=published_form_report(period_code=period_code,form_id=form_id,user=user)
    output=io.StringIO(newline="")
    writer=csv.writer(output)
    writer.writerow([
      "record_id","event_id","scheme_id","scheme_code","scheme_name",
      "province_code","district_code","module","form_id","form_version",
      "period_code","observed_at","source","field_id","value","unit","data_status",
    ])
    for row in result["items"]:
        metrics=row["metrics"] or [{"field":"","value":"","unit":""}]
        for metric in metrics:
            writer.writerow([_csv_safe(value) for value in [
              row["record_id"],row["event_id"],row["scheme_id"],row["scheme_code"],
              row["scheme_name"],row["province_code"],row["district_code"],
              row["module"],row["form_id"],row["form_version"],row["period_code"],
              row["observed_at"],row["source"],metric["field"],metric["value"],
              metric["unit"],"PUBLISHED_DEMO_ONLY",
            ]])
    return Response(
      content=output.getvalue(),
      media_type="text/csv; charset=utf-8",
      headers={"Cache-Control":"private, no-store",
               "Content-Disposition":'attachment; filename="nimis-published-pilot.csv"'},
    )
