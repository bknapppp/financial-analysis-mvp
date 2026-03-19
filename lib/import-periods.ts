import type { ReportingPeriod } from "@/lib/types";

export type NormalizedImportPeriod = {
  key: string;
  label: string;
  periodDate: string;
  rawValue: string;
  source: "periodDate" | "periodLabel";
  granularity: "month" | "quarter";
};

export type DetectedImportPeriod = NormalizedImportPeriod & {
  rowCount: number;
  matchedPeriodId: string | null;
  matchedPeriodLabel: string | null;
  willCreate: boolean;
};

type PeriodInput = {
  periodLabel?: string | null;
  periodDate?: string | null;
};

const MONTH_LOOKUP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
};

function toFourDigitYear(value: string) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (value.length === 2) {
    return numeric >= 70 ? 1900 + numeric : 2000 + numeric;
  }

  return numeric;
}

function buildMonthPeriod(year: number, month: number, rawValue: string, source: "periodDate" | "periodLabel"): NormalizedImportPeriod {
  const date = new Date(Date.UTC(year, month - 1, 1));
  const label = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);

  return {
    key: `${year}-${String(month).padStart(2, "0")}`,
    label,
    periodDate: `${year}-${String(month).padStart(2, "0")}-01`,
    rawValue,
    source,
    granularity: "month"
  };
}

function buildQuarterPeriod(year: number, quarter: number, rawValue: string, source: "periodDate" | "periodLabel"): NormalizedImportPeriod {
  const month = (quarter - 1) * 3 + 1;

  return {
    key: `${year}-Q${quarter}`,
    label: `Q${quarter} ${year}`,
    periodDate: `${year}-${String(month).padStart(2, "0")}-01`,
    rawValue,
    source,
    granularity: "quarter"
  };
}

function normalizeMonthLabel(rawValue: string) {
  const compact = rawValue.trim().replace(/[._]/g, " ");
  const monthYear = compact.match(
    /^([A-Za-z]+)[\s-]+(\d{2}|\d{4})$/
  );

  if (monthYear) {
    const month = MONTH_LOOKUP[monthYear[1].toLowerCase()];
    const year = toFourDigitYear(monthYear[2]);

    if (month && year) {
      return buildMonthPeriod(year, month, rawValue, "periodLabel");
    }
  }

  const yearMonth = compact.match(/^(\d{4})[\s/-]+(\d{1,2})$/);

  if (yearMonth) {
    const year = Number(yearMonth[1]);
    const month = Number(yearMonth[2]);

    if (month >= 1 && month <= 12) {
      return buildMonthPeriod(year, month, rawValue, "periodLabel");
    }
  }

  return null;
}

function normalizeQuarterLabel(rawValue: string) {
  const compact = rawValue.trim().replace(/\s+/g, " ");
  const quarterFirst = compact.match(/^Q([1-4])[\s-]+(\d{4})$/i);

  if (quarterFirst) {
    return buildQuarterPeriod(
      Number(quarterFirst[2]),
      Number(quarterFirst[1]),
      rawValue,
      "periodLabel"
    );
  }

  const yearFirst = compact.match(/^(\d{4})[\s-]+Q([1-4])$/i);

  if (yearFirst) {
    return buildQuarterPeriod(
      Number(yearFirst[1]),
      Number(yearFirst[2]),
      rawValue,
      "periodLabel"
    );
  }

  return null;
}

export function normalizeImportedPeriod(input: PeriodInput): NormalizedImportPeriod | null {
  const rawDate = input.periodDate?.trim() ?? "";

  if (rawDate) {
    const isoDate = rawDate.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);

    if (isoDate) {
      const year = Number(isoDate[1]);
      const month = Number(isoDate[2]);

      if (month >= 1 && month <= 12) {
        return buildMonthPeriod(year, month, rawDate, "periodDate");
      }
    }
  }

  const rawLabel = input.periodLabel?.trim() ?? "";

  if (!rawLabel) {
    return null;
  }

  return normalizeQuarterLabel(rawLabel) ?? normalizeMonthLabel(rawLabel);
}

export function normalizeStoredReportingPeriod(
  period: Pick<ReportingPeriod, "label" | "period_date">
): NormalizedImportPeriod {
  return (
    normalizeImportedPeriod({
      periodLabel: period.label,
      periodDate: period.period_date
    }) ?? {
      key: `${period.period_date}::${period.label.trim().toLowerCase()}`,
      label: period.label,
      periodDate: period.period_date,
      rawValue: period.label,
      source: "periodDate",
      granularity: "month"
    }
  );
}

export function detectImportPeriods(
  rows: Array<{ rowNumber: number; sourcePeriodLabel: string; sourcePeriodDate: string }>
) {
  const detected = new Map<string, DetectedImportPeriod>();
  const unresolvedRows: number[] = [];

  rows.forEach((row) => {
    const normalized = normalizeImportedPeriod({
      periodLabel: row.sourcePeriodLabel,
      periodDate: row.sourcePeriodDate
    });

    if (!normalized) {
      unresolvedRows.push(row.rowNumber);
      return;
    }

    const existing = detected.get(normalized.key);

    if (existing) {
      existing.rowCount += 1;
      return;
    }

    detected.set(normalized.key, {
      ...normalized,
      rowCount: 1,
      matchedPeriodId: null,
      matchedPeriodLabel: null,
      willCreate: false
    });
  });

  return {
    periods: Array.from(detected.values()).sort((left, right) =>
      left.periodDate.localeCompare(right.periodDate)
    ),
    unresolvedRows
  };
}

export function matchDetectedPeriodsToExisting(
  detectedPeriods: DetectedImportPeriod[],
  existingPeriods: ReportingPeriod[]
) {
  const normalizedExisting = existingPeriods.map((period) => ({
    period,
    normalized: normalizeStoredReportingPeriod(period)
  }));

  return detectedPeriods.map((detectedPeriod) => {
    const match =
      normalizedExisting.find(
        ({ normalized }) => normalized.key === detectedPeriod.key
      ) ??
      normalizedExisting.find(
        ({ normalized }) => normalized.periodDate === detectedPeriod.periodDate
      );

    return {
      ...detectedPeriod,
      matchedPeriodId: match?.period.id ?? null,
      matchedPeriodLabel: match?.period.label ?? null,
      willCreate: !match
    };
  });
}
