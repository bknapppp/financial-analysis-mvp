export type ReportedValueKind = "revenue" | "expense" | "ebitda";

function hasFiniteValue(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function firstNonZeroReference(
  references: Array<number | null | undefined> | undefined
): number | null {
  if (!Array.isArray(references)) {
    return null;
  }

  for (const reference of references) {
    if (hasFiniteValue(reference) && reference !== 0) {
      return reference;
    }
  }

  return null;
}

export function normalizeReportedValue(params: {
  kind: ReportedValueKind;
  value: number | null | undefined;
  referenceValues?: Array<number | null | undefined>;
}) {
  const { kind, value, referenceValues } = params;

  if (!hasFiniteValue(value)) {
    return null;
  }

  if (kind === "revenue" || kind === "expense") {
    return Math.abs(value);
  }

  if (value === 0) {
    return 0;
  }

  const reference = firstNonZeroReference(referenceValues);

  if (reference === null) {
    return value;
  }

  return Math.sign(value) === Math.sign(reference) ? value : -value;
}
