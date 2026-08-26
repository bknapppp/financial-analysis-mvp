import assert from "node:assert/strict";
import { buildSnapshots } from "../../calculations.ts";
import { calculationParityFixtures } from "./parity-fixtures.ts";
import { calculatePrivateCompanyPeriods } from "./service.ts";

for (const fixture of calculationParityFixtures) {
  const legacy = buildSnapshots(
    [fixture.period],
    fixture.entries,
    fixture.addBacks
  )[0];
  const authoritative = calculatePrivateCompanyPeriods({
    periods: [fixture.period],
    entries: fixture.entries,
    addBacks: fixture.addBacks
  })[0];

  assert.ok(legacy, fixture.name);
  assert.ok(authoritative, fixture.name);

  const legacyValues = {
    revenue: legacy.revenue,
    reportedEbitda: legacy.reportedEbitda ?? null,
    calculatedEbitda: legacy.ebitdaExplainability?.computedEbitda ?? null,
    selectedEbitda: legacy.ebitda,
    normalizedEbitda: legacy.adjustedEbitda,
    acceptedAdjustments: legacy.acceptedAddBacks
  };
  const authoritativeValues = {
    revenue: authoritative.revenue.value,
    reportedEbitda: authoritative.reportedEbitda.value,
    calculatedEbitda: authoritative.calculatedEbitda.value,
    selectedEbitda: authoritative.selectedEbitda.value,
    normalizedEbitda: authoritative.normalizedEbitda.value,
    acceptedAdjustments: authoritative.acceptedAdjustments.value
  };

  assert.deepEqual(authoritativeValues, legacyValues, `${fixture.name}: legacy parity`);
  assert.deepEqual(authoritativeValues, fixture.expected, `${fixture.name}: golden parity`);
}

assert.equal(
  calculatePrivateCompanyPeriods({
    periods: [calculationParityFixtures[0]!.period],
    entries: calculationParityFixtures[0]!.entries
  })[0]?.ebitdaBasis,
  "reported"
);
assert.equal(
  calculatePrivateCompanyPeriods({
    periods: [calculationParityFixtures[1]!.period],
    entries: calculationParityFixtures[1]!.entries
  })[0]?.ebitdaBasis,
  "calculated"
);
assert.equal(
  calculatePrivateCompanyPeriods({
    periods: [calculationParityFixtures[3]!.period],
    entries: calculationParityFixtures[3]!.entries,
    addBacks: calculationParityFixtures[3]!.addBacks
  })[0]?.ebitdaBasis,
  "unavailable"
);

console.log("authoritative financial calculation facade parity passed");
