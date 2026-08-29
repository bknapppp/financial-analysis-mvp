import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildUnderwritingPageViewModel } from "./underwriting-view-model.ts";
import type { DashboardData } from "../../lib/types.ts";

const data = {
  company: {
    id: "company-x",
    name: "Company X",
    deal_name: "Company X",
    deal_type: "SBA",
    base_currency: "USD"
  },
  snapshot: {
    periodId: "period-2023",
    label: "Jan 2023",
    ebitda: 1890,
    reportedEbitda: 1890,
    acceptedAddBacks: 1000
  },
  normalizedOutput: null,
  ebitdaBridge: null,
  readiness: {
    status: "caution",
    label: "Use with caution"
  },
  completionSummary: {
    completionPercent: 40
  }
} as unknown as DashboardData;

const model = buildUnderwritingPageViewModel(data);
assert(model);
assert.equal(model.companyId, "company-x");
assert.equal(model.companyName, "Company X");
assert.equal(model.currency, "USD");
assert.equal(model.defaultPeriodId, "period-2023");
assert.equal(model.defaultPeriodLabel, "Jan 2023");
assert.deepEqual(model.keyValues, {
  canonicalEbitda: 1890,
  acceptedAddBacks: 1000,
  adjustedEbitda: 2890
});
assert.equal(model.shell.activeKey, "underwriting");
assert.equal(model.shell.activeLabel, "Underwriting");
assert.equal(model.shell.topHeaderTitle, "Underwriting");
assert.equal(model.shell.progressPercent, 40);
assert.equal(
  model.shell.navigation.find((item) => item.key === "underwriting")?.href,
  "/underwriting?companyId=company-x"
);

const canonicalRoute = readFileSync("app/underwriting/page.tsx", "utf8");
const compatibleRoute = readFileSync("app/deal/[companyId]/underwriting/page.tsx", "utf8");
const featurePage = readFileSync("features/underwriting/underwriting-page.tsx", "utf8");
assert(canonicalRoute.includes("<AppShell model={model.shell}>") && canonicalRoute.includes("loadUnderwritingPageViewModel"));
assert(compatibleRoute.includes("<AppShell model={model.shell}>") && compatibleRoute.includes("loadUnderwritingPageViewModel"));
assert(featurePage.includes('layout="canonical"'));
assert(!featurePage.includes("DealPageNavigation"));

console.log("underwriting canonical page view-model tests passed");
