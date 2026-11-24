/** NIMIS draft indicator rules.
 * Source: NIMIS Concept Power BI Addendum §15.
 * Return null when a valid denominator or comparable measured inputs are missing.
 * Calling these functions does NOT turn unverified input into official statistics.
 */
function measured(value){
  if(value===''||value===null||value===undefined)return null;
  const n=Number(value);
  return Number.isFinite(n)&&n>=0?n:null;
}

export function functionalityRate(equippedArea, functionalArea){
  const equipped=measured(equippedArea);
  const functional=measured(functionalArea);
  if(equipped===null||functional===null||equipped<=0||functional>equipped)return null;
  return Number((100*functional/equipped).toFixed(2));
}

export function reportedYieldTonnesPerHa(productionTonnes, harvestedHa){
  const production=measured(productionTonnes);
  const harvested=measured(harvestedHa);
  if(production===null||harvested===null||harvested<=0)return null;
  return Number((production/harvested).toFixed(3));
}

export function croppingIntensity(cumulativeSeasonalCroppedHa, netIrrigableCommandHa){
  const cumulative=measured(cumulativeSeasonalCroppedHa);
  const command=measured(netIrrigableCommandHa);
  if(cumulative===null||command===null||command<=0)return null;
  // Cropping intensity may exceed 100% where multiple crops per year are counted.
  return Number((100*cumulative/command).toFixed(2));
}

export function physicalMilestoneProgress(milestones){
  if(!Array.isArray(milestones)||milestones.length===0)return null;
  let total=0,done=0;
  for(const row of milestones){
    const w=measured(row?.approvedWeight);
    if(w===null||w===0||typeof row?.verified!=='boolean')return null;
    total+=w;
    if(row.verified)done+=w;
  }
  return total>0?Number((100*done/total).toFixed(2)):null;
}
