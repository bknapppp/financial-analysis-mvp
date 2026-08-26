import assert from "node:assert/strict";
import { buildSnapshots } from "../../calculations.ts";
import { calculationParityFixtures } from "./parity-fixtures.ts";

for (const fixture of calculationParityFixtures) {
  const snapshot = buildSnapshots(
    [fixture.period],
    fixture.entries,
    fixture.addBacks
  )[0];

  assert.ok(snapshot, fixture.name);
  assert.deepEqual(
    {
      revenue: snapshot.revenue,
      reportedEbitda: snapshot.reportedEbitda ?? null,
      calculatedEbitda: snapshot.ebitdaExplainability?.computedEbitda ?? null,
      selectedEbitda: snapshot.ebitda,
      normalizedEbitda: snapshot.adjustedEbitda,
      acceptedAdjustments: snapshot.acceptedAddBacks
    },
    fixture.expected,
    fixture.name
  );
}

console.log("canonical financial parity fixtures passed");
