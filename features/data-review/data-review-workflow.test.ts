import assert from "node:assert/strict";
import { derivePhase3WorkflowState, type Phase3Workflow } from "./data-review-workflow.ts";

const now = "2026-08-23T12:00:00.000Z";
function workflow(): Phase3Workflow {
  return {
    phase: { id:"phase",company_id:"company",phase_key:"data_review",status:"in_progress",submitted_by_name:null,submitted_at:null,reviewed_by_name:null,reviewed_at:null,reviewer_decision:null,reviewer_rationale:null,reopened_at:null,completion_basis:null,version:1,created_at:now,updated_at:now },
    procedures: [{ id:"procedure",phase_id:"phase",procedure_key:"p",template_version:"v1",workstream_key:"quality",title:"Required procedure",required:true,owner_name:null,reviewer_name:null,status:"complete",due_date:null,result_summary:"Complete",started_at:now,completed_at:now,completed_by_name:"Development Analyst",version:1,created_at:now,updated_at:now }],
    investigations: [{ id:"investigation",phase_id:"phase",procedure_id:"procedure",reference_code:"INV-001",title:"Exception",signal_type:"manual",signal_key:null,signal_summary:"Signal",signal_snapshot:null,period_id:null,owner_name:null,reviewer_name:null,priority:"high",status:"closed",notes:null,conclusion:"Below threshold",disposition:"immaterial",materiality_rationale:"Below approved materiality",promoted_issue_id:null,opened_by_name:"Development Analyst",opened_at:now,resolved_by_name:"Development Analyst",resolved_at:now,version:1,created_at:now,updated_at:now }],
    evidence: [], activity: []
  };
}

const blocked = derivePhase3WorkflowState(workflow(), { status:"ready",reasons:[] });
assert.equal(blocked.reviewEligible, false);
assert.ok(blocked.gateFailures.some((item) => item.includes("waiver")));
const approved = workflow();
approved.activity.push({ id:"event",phase_id:"phase",subject_type:"investigation",subject_id:"investigation",event_type:"investigation_waiver_approved",from_state:null,to_state:null,rationale:"Approved",comment_text:null,metadata:null,actor_name:"Development Analyst",created_at:now });
const ready = derivePhase3WorkflowState(approved, { status:"ready",reasons:[] });
assert.equal(ready.reviewEligible, true);
assert.equal(ready.completionEligible, true);
const revoked = structuredClone(approved);
revoked.activity.unshift({ ...revoked.activity[0], id:"revoke",event_type:"investigation_waiver_revoked",created_at:"2026-08-23T13:00:00.000Z" });
assert.equal(derivePhase3WorkflowState(revoked,{status:"ready",reasons:[]}).reviewEligible,false);
assert.equal(derivePhase3WorkflowState(approved,{status:"blocked",reasons:["Blocked"]}).reviewEligible,false);
console.log("data-review workflow tests passed");
