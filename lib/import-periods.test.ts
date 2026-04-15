import assert from "node:assert/strict";
import { normalizeImportedPeriod } from "./import-periods.ts";

function expectPeriod(
  input: Parameters<typeof normalizeImportedPeriod>[0],
  expected: { label: string; periodDate: string }
) {
  const period = normalizeImportedPeriod(input);

  assert.ok(period, `Expected a normalized period for ${JSON.stringify(input)}`);
  assert.equal(period.label, expected.label);
  assert.equal(period.periodDate, expected.periodDate);
}

expectPeriod(
  { periodLabel: "Jan-14" },
  { label: "Jan 2014", periodDate: "2014-01-01" }
);

expectPeriod(
  { periodLabel: "'99" },
  { label: "1999", periodDate: "1999-01-01" }
);

expectPeriod(
  { periodLabel: "FY'23" },
  { label: "2023", periodDate: "2023-01-01" }
);

expectPeriod(
  { periodLabel: "2022A" },
  { label: "2022", periodDate: "2022-01-01" }
);

expectPeriod(
  { periodLabel: "CY '15" },
  { label: "2015", periodDate: "2015-01-01" }
);

expectPeriod(
  { periodLabel: "Q1 2026" },
  { label: "Q1 2026", periodDate: "2026-01-01" }
);

expectPeriod(
  { periodLabel: "2026-01" },
  { label: "Jan 2026", periodDate: "2026-01-01" }
);

console.log("import-periods tests passed");
