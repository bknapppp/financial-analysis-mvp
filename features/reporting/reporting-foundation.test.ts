import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const loader = readFileSync(new URL("./reporting-loader.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../../services/supabase/phase5-reporting.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/20260828120000_create_phase5_reporting_foundation.sql", import.meta.url), "utf8");

test("ordinary loading is read-only and consumes the authoritative Phase 4 projection", () => {
  assert.match(loader, /loadProjection: getPhase5FindingProjection/);
  assert.doesNotMatch(loader, /initializePhase5Reporting|updateReportingSection|linkReportingFinding|unlinkReportingFinding/);
});

test("initialization is explicit and idempotently creates seven governed sections", () => {
  assert.match(service, /rpc\("initialize_phase5_reporting"/);
  assert.match(migration, /on conflict\(company_id,phase_key\) do nothing/);
  assert.match(migration, /on conflict\(phase_id\) do nothing/);
  assert.match(migration, /on conflict\(report_id,section_key\) do nothing/);
  assert.equal((migration.match(/\(v_report_id,'[a-z_]+','/g) ?? []).length, 7);
});

test("database and service contracts enforce scoped versioned composition", () => {
  assert.match(migration, /Report finding belongs to another deal/);
  assert.match(migration, /v_profile\.approved_version <> new\.expected_approved_version/);
  assert.match(service, /\.eq\("version", section\.version\)/);
  assert.match(service, /finding\.version !== finding\.approvedVersion/);
  assert.match(service, /expected_approved_version: finding\.approvedVersion/);
  assert.match(service, /23505/);
});

test("RLS is enabled without broad anonymous mutation policies", () => {
  assert.equal((migration.match(/enable row level security/g) ?? []).length, 3);
  assert.doesNotMatch(migration, /create policy[\s\S]+\bto\s+(anon|public)\b/i);
  assert.match(migration, /revoke all on function public\.initialize_phase5_reporting\(uuid,text\) from public,anon,authenticated/);
});
