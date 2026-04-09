import assert from "node:assert/strict";
import { buildCreditScenario } from "./credit-scenario.ts";

{
  const result = buildCreditScenario({
    inputs: {
      loanAmount: 3000000,
      annualInterestRatePercent: 10,
      loanTermYears: 5,
      amortizationYears: 10,
      collateralValue: 5000000
    },
    ebitda: 1200000
  });

  assert.equal(Math.round(result.annualInterestExpense ?? 0), 300000);
  assert.equal(Math.round(result.annualDebtService ?? 0), 488236);
  assert.equal(Math.round(result.annualPrincipalPayment ?? 0), 188236);
  assert.equal(Math.round(((result.metrics.dscr.value ?? 0) as number) * 100) / 100, 2.46);
  assert.equal(
    Math.round(((result.metrics.debtToEbitda.value ?? 0) as number) * 100) / 100,
    2.5
  );
  assert.equal(
    Math.round(((result.metrics.interestCoverage.value ?? 0) as number) * 100) / 100,
    4
  );
  assert.equal(Math.round((result.metrics.ltv.value ?? 0) * 100) / 100, 0.6);
  assert.equal(result.metrics.dscr.status, "strong");
  assert.equal(result.metrics.debtToEbitda.status, "strong");
  assert.equal(result.metrics.interestCoverage.status, "strong");
  assert.equal(result.metrics.ltv.status, "strong");
}

{
  const computedResult = buildCreditScenario({
    inputs: {
      loanAmount: 3000000,
      annualInterestRatePercent: 10,
      loanTermYears: 5,
      amortizationYears: 10,
      collateralValue: 5000000
    },
    ebitda: 1200000
  });
  const adjustedResult = buildCreditScenario({
    inputs: {
      loanAmount: 3000000,
      annualInterestRatePercent: 10,
      loanTermYears: 5,
      amortizationYears: 10,
      collateralValue: 5000000
    },
    ebitda: 1500000
  });

  assert.ok((adjustedResult.metrics.dscr.value ?? 0) > (computedResult.metrics.dscr.value ?? 0));
  assert.ok(
    (adjustedResult.metrics.debtToEbitda.value ?? Number.POSITIVE_INFINITY) <
      (computedResult.metrics.debtToEbitda.value ?? Number.POSITIVE_INFINITY)
  );
  assert.ok(
    (adjustedResult.metrics.interestCoverage.value ?? 0) >
      (computedResult.metrics.interestCoverage.value ?? 0)
  );
}

{
  const result = buildCreditScenario({
    inputs: {
      loanAmount: 4500000,
      annualInterestRatePercent: 12,
      loanTermYears: 5,
      amortizationYears: 20,
      collateralValue: 5200000
    },
    ebitda: 900000
  });

  assert.equal(result.metrics.dscr.status, "moderate");
  assert.equal(result.metrics.debtToEbitda.status, "weak");
  assert.equal(result.metrics.interestCoverage.status, "moderate");
  assert.equal(result.metrics.ltv.status, "weak");
  assert.ok((result.balanceAtMaturity ?? 0) > 0);
}

{
  const result = buildCreditScenario({
    inputs: {
      loanAmount: null,
      annualInterestRatePercent: 8,
      loanTermYears: 5,
      amortizationYears: 10,
      collateralValue: 5000000
    },
    ebitda: 1200000
  });

  assert.equal(result.canComputeDebtService, false);
  assert.equal(result.annualDebtService, null);
  assert.equal(result.metrics.dscr.status, "insufficient");
  assert.equal(result.metrics.debtToEbitda.status, "insufficient");
}

console.log("credit-scenario tests passed");
