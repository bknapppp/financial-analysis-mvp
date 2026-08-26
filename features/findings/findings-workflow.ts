export const FINDING_TYPES = ["financial","operational","tax","accounting","data_quality","commercial","legal_compliance","other"] as const;
export const MATERIALITY_VALUES = ["undetermined","immaterial","quantitatively_material","qualitatively_material","both"] as const;
export const REPORTING_TREATMENTS = ["undetermined","internal_only","exclude","report_observation","key_finding"] as const;
export const IMPACT_DIMENSIONS = ["revenue","gross_profit","ebitda","working_capital","net_debt","cash","purchase_price","enterprise_value","equity_value","tax","customer_concentration","revenue_durability","operational_risk","data_quality","accounting_policy","legal_compliance","other"] as const;
export const IMPACT_STATES = ["none","known","estimated","range","unknown"] as const;
export type FindingMateriality = typeof MATERIALITY_VALUES[number];
export type ReportingTreatment = typeof REPORTING_TREATMENTS[number];
export type FindingReviewStatus = "draft"|"ready_for_review"|"changes_requested"|"approved";
export type ManagementResponseStatus = "not_requested"|"requested"|"received"|"under_review"|"accepted"|"insufficient";
export type FindingProfile = {issue_id:string;phase_id:string;reference_code:string;finding_type:typeof FINDING_TYPES[number];materiality:FindingMateriality;materiality_rationale:string|null;finding_narrative:string;transaction_implication:string|null;recommendation:string|null;resolution_narrative:string|null;management_response_status:ManagementResponseStatus;management_response:string|null;management_response_evaluation:string|null;reporting_treatment:ReportingTreatment;reporting_rationale:string|null;executive_summary:boolean;include_in_qoe_adjustments:boolean;transaction_consideration:boolean;approved_report_language:string|null;review_status:FindingReviewStatus;owner_name:string|null;reviewer_name:string|null;due_date:string|null;reviewed_by_name:string|null;reviewed_at:string|null;version:number;created_at:string;updated_at:string};
export type FindingImpact = {id:string;issue_id:string;dimension:typeof IMPACT_DIMENSIONS[number];impact_state:typeof IMPACT_STATES[number];currency:string|null;amount:number|null;range_low:number|null;range_high:number|null;period_id:string|null;basis:string|null;version:number};
export type FindingGateInput = {title:string;severity:"low"|"medium"|"high"|"critical";operationalStatus:"open"|"in_review"|"resolved"|"waived";profile:FindingProfile;impacts:FindingImpact[];evidenceCount:number;responseWaived:boolean};

export function responseRequired(input: Pick<FindingGateInput,"severity"|"profile">) { return ["high","critical"].includes(input.severity)||["quantitatively_material","qualitatively_material","both"].includes(input.profile.materiality); }
export function reportable(treatment:ReportingTreatment){return treatment==="report_observation"||treatment==="key_finding";}
export function validateImpactShape(input:{impactState:string;amount?:number|null;rangeLow?:number|null;rangeHigh?:number|null;currency?:string|null;basis?:string|null}){const{s}= {s:input.impactState};if(["known","estimated"].includes(s))return Number.isFinite(input.amount)&&input.rangeLow==null&&input.rangeHigh==null&&Boolean(input.currency?.trim()&&input.basis?.trim());if(s==="range")return input.amount==null&&Number.isFinite(input.rangeLow)&&Number.isFinite(input.rangeHigh)&&input.rangeLow!<=input.rangeHigh!&&Boolean(input.currency?.trim()&&input.basis?.trim());if(["none","unknown"].includes(s))return input.amount==null&&input.rangeLow==null&&input.rangeHigh==null;return false}
export function deriveFindingGates(input:FindingGateInput){
  const failures:string[]=[]; const p=input.profile;
  if(!input.title.trim()||!p.finding_narrative.trim())failures.push("Finding narrative is required.");
  if(p.materiality==="undetermined")failures.push("Materiality must be determined.");
  if(p.materiality!=="undetermined"&&!p.materiality_rationale?.trim())failures.push("Materiality rationale is required.");
  if(!p.owner_name)failures.push("Owner is required."); if(!p.reviewer_name)failures.push("Reviewer is required.");
  if(["quantitatively_material","qualitatively_material","both"].includes(p.materiality)&&!p.transaction_implication?.trim())failures.push("Material findings require a transaction implication.");
  if(!input.impacts.length)failures.push("At least one explicit impact assessment is required.");
  if(!input.evidenceCount)failures.push("Evidence is required.");
  if(responseRequired(input)&&!input.responseWaived&&!p.management_response?.trim())failures.push("Management response or reviewer waiver is required.");
  if(p.reporting_treatment==="undetermined")failures.push("Reporting treatment is required.");
  if(p.reporting_treatment==="exclude"&&!p.reporting_rationale?.trim())failures.push("Exclusion rationale is required.");
  if(reportable(p.reporting_treatment)&&!p.recommendation?.trim())failures.push("Reportable findings require a recommendation.");
  const approvalFailures=[...failures]; if(reportable(p.reporting_treatment)&&!p.approved_report_language?.trim())approvalFailures.push("Reportable findings require approved report language.");
  if(responseRequired(input)&&!input.responseWaived&&(!p.management_response_evaluation?.trim()||!["accepted","insufficient"].includes(p.management_response_status)))approvalFailures.push("Required management response must be evaluated.");
  if(input.operationalStatus==="resolved"&&!p.resolution_narrative?.trim())approvalFailures.push("Resolved findings require a resolution narrative.");
  return {submissionEligible:failures.length===0,approvalEligible:approvalFailures.length===0,failures,approvalFailures};
}

export type Phase5FindingProjection={issueId:string;reference:string;title:string;narrative:string;category:string;findingType:string;severity:string;materiality:FindingMateriality;impacts:FindingImpact[];linkedAddBacks:Array<{id:string;relationship:string;amount:number;status:string}>;evidence:Array<{type:string;id:string;relationship:string;inherited:boolean}>;sourceInvestigations:Array<{id:string;relationship:string;reference:string|null}>;transactionImplication:string|null;recommendation:string|null;managementResponse:string|null;managementResponseEvaluation:string|null;resolution:string|null;reportingTreatment:ReportingTreatment;executiveSummary:boolean;includeInQoeAdjustments:boolean;transactionConsideration:boolean;approvedReportLanguage:string;reviewedBy:string|null;reviewedAt:string|null;lastActivity:{eventType:string;actor:string;createdAt:string}|null};
