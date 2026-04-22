import type { AddBackReviewItem, DashboardData, NormalizedStatement } from "./types.ts";

export type ReportCellKind = "text" | "number" | "percent";

export type ReportCell = {
  value: string | number | null;
  kind: ReportCellKind;
};

export type ReportSection = {
  title: string;
  sheetName: string;
  columns: string[];
  rows: ReportCell[][];
  keyRowLabels?: string[];
};

type CsvRow = string[];

function textCell(value: string | null | undefined): ReportCell {
  return {
    value: value ?? "",
    kind: "text"
  };
}

function numberCell(value: number | null | undefined): ReportCell {
  return {
    value: value === null || value === undefined || !Number.isFinite(value) ? null : value,
    kind: "number"
  };
}

function percentCell(value: number | null | undefined): ReportCell {
  return {
    value: value === null || value === undefined || !Number.isFinite(value) ? null : value,
    kind: "percent"
  };
}

function calculateUpliftPercent(
  reportedEbitda: number | null,
  adjustedEbitda: number | null
) {
  if (
    reportedEbitda === null ||
    adjustedEbitda === null ||
    reportedEbitda === 0
  ) {
    return null;
  }

  return ((adjustedEbitda - reportedEbitda) / Math.abs(reportedEbitda)) * 100;
}

function sanitizeFilenameSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeCsvCell(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function rowsToCsv(rows: CsvRow[]) {
  return rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(",")).join("\n");
}

function toFixedWidthRow(values: string[], width: number) {
  const row = values.slice(0, width);

  while (row.length < width) {
    row.push("");
  }

  return row;
}

function serializeCellForCsv(cell: ReportCell) {
  if (cell.value === null || cell.value === undefined || cell.value === "") {
    return "";
  }

  if (typeof cell.value === "number") {
    return cell.kind === "percent" ? cell.value.toFixed(1) : cell.value.toFixed(2);
  }

  return cell.value;
}

function appendSectionToCsv(rows: CsvRow[], section: ReportSection) {
  const width = section.columns.length;

  rows.push(toFixedWidthRow([section.title], width));
  rows.push(toFixedWidthRow(section.columns, width));
  rows.push(
    ...section.rows.map((row) =>
      toFixedWidthRow(row.map((cell) => serializeCellForCsv(cell)), width)
    )
  );
  rows.push(toFixedWidthRow([], width));
}

function buildStatementSection(
  title: string,
  sheetName: string,
  statement: NormalizedStatement | null
): ReportSection {
  return {
    title,
    sheetName,
    columns: ["Line Item", "Value"],
    keyRowLabels:
      statement?.statementKey === "income_statement"
        ? ["Reported EBITDA", "Accepted Add-Backs", "Adjusted EBITDA"]
        : ["Working Capital"],
    rows:
      !statement || statement.rows.length === 0
        ? [[textCell("No data available"), textCell("")]]
        : statement.rows.map((row) => [textCell(row.label), numberCell(row.value)])
  };
}

function getAcceptedScheduleItems(data: DashboardData): AddBackReviewItem[] {
  if (!data.ebitdaBridge) {
    return [];
  }

  return data.ebitdaBridge.groups.flatMap((group) => group.items);
}

function buildMultiPeriodSummarySection(data: DashboardData): ReportSection {
  const periods = data.normalizedPeriods;
  const metricLabels = [
    "Revenue",
    "Reported EBITDA",
    "Adjusted EBITDA",
    "Gross Margin Percent",
    "Reported EBITDA Margin Percent",
    "Adjusted EBITDA Margin Percent"
  ] as const;

  if (periods.length === 0) {
    return {
      title: "Multi-Period Summary",
      sheetName: "Multi-Period Summary",
      columns: ["Metric", "Period 1"],
      keyRowLabels: [...metricLabels],
      rows: [[textCell("Revenue"), textCell("No periods available")]]
    };
  }

  const columns = ["Metric", ...periods.map((period) => period.label)];
  const snapshotByPeriodId = new Map(
    data.snapshots.map((snapshot) => [snapshot.periodId, snapshot])
  );

  return {
    title: "Multi-Period Summary",
    sheetName: "Multi-Period Summary",
    columns,
    keyRowLabels: [...metricLabels],
    rows: [
      [
        textCell("Revenue"),
        ...periods.map((period) =>
          numberCell(snapshotByPeriodId.get(period.periodId)?.revenue ?? null)
        )
      ],
      [
        textCell("Reported EBITDA"),
        ...periods.map((period) => numberCell(period.reportedEbitda))
      ],
      [
        textCell("Adjusted EBITDA"),
        ...periods.map((period) => numberCell(period.adjustedEbitda))
      ],
      [
        textCell("Gross Margin Percent"),
        ...periods.map((period) => percentCell(period.grossMarginPercent))
      ],
      [
        textCell("Reported EBITDA Margin Percent"),
        ...periods.map((period) => percentCell(period.reportedEbitdaMarginPercent))
      ],
      [
        textCell("Adjusted EBITDA Margin Percent"),
        ...periods.map((period) => percentCell(period.adjustedEbitdaMarginPercent))
      ]
    ]
  };
}

export function buildReportSections(data: DashboardData): ReportSection[] {
  const companyName = data.company?.name ?? "No company selected";
  const periodLabel = data.snapshot.label || "Latest period";
  const acceptedScheduleItems = getAcceptedScheduleItems(data);
  const acceptedAddBackTotal =
    data.normalizedOutput?.acceptedAddBacks ??
    data.ebitdaBridge?.addBackTotal ??
    data.snapshot.acceptedAddBacks;
  const upliftPercent = calculateUpliftPercent(
    data.normalizedOutput?.reportedEbitda ?? data.snapshot.reportedEbitda ?? null,
    data.normalizedOutput?.adjustedEbitda ?? data.snapshot.adjustedEbitda
  );
  const criticalWarnings = data.dataQuality.issueGroups.flatMap((group) =>
    group.issues
      .filter((issue) => issue.severity === "Critical")
      .map((issue) => issue.message)
  );
  const reconciliationHighlights = data.reconciliation.issues
    .filter((issue) => issue.severity !== "info")
    .slice(0, 3)
    .map((issue) => issue.message);

  return [
    {
      title: "Deal Snapshot",
      sheetName: "Deal Snapshot",
      columns: ["Metric", "Value"],
      keyRowLabels: [
        "Reported EBITDA",
        "Accepted Add-Backs",
        "Adjusted EBITDA",
        "Readiness Status",
        "Reconciliation Status"
      ],
      rows: [
        [textCell("Company"), textCell(companyName)],
        [textCell("Reporting Period"), textCell(periodLabel)],
        [textCell("Readiness Status"), textCell(data.readiness.label)],
        [textCell("Readiness Summary"), textCell(data.readiness.summaryMessage)],
        [textCell("Reconciliation Status"), textCell(data.reconciliation.label)],
        [textCell("Reconciliation Summary"), textCell(data.reconciliation.summaryMessage)],
        [
          textCell("Material Reconciliation Issues"),
          textCell(
            reconciliationHighlights.length > 0
              ? reconciliationHighlights.join("; ")
              : "None"
          )
        ],
        [
          textCell("Reported EBITDA"),
          numberCell(
            data.normalizedOutput?.reportedEbitda ?? data.snapshot.reportedEbitda ?? null
          )
        ],
        [textCell("Accepted Add-Backs"), numberCell(acceptedAddBackTotal)],
        [
          textCell("Adjusted EBITDA"),
          numberCell(data.normalizedOutput?.adjustedEbitda ?? data.snapshot.adjustedEbitda)
        ],
        [textCell("Uplift Percent"), percentCell(upliftPercent)],
        [textCell("Gross Margin"), percentCell(data.snapshot.grossMarginPercent)],
        [
          textCell("Reported EBITDA Margin"),
          percentCell(data.normalizedOutput?.reportedEbitdaMarginPercent ?? null)
        ],
        [
          textCell("Adjusted EBITDA Margin"),
          percentCell(data.snapshot.adjustedEbitdaMarginPercent)
        ],
        [textCell("Working Capital"), numberCell(data.snapshot.workingCapital)],
        [textCell("Data Quality Label"), textCell(data.dataQuality.confidenceLabel)]
      ]
    },
    {
      title: "EBITDA Bridge",
      sheetName: "EBITDA Bridge",
      columns: ["Line Item", "Value", "Notes"],
      keyRowLabels: [
        "Canonical EBITDA",
        "Reported EBITDA (Reference)",
        "Accepted Add-Backs",
        "Adjusted EBITDA"
      ],
      rows: !data.ebitdaBridge
        ? [[
            textCell("No bridge available"),
            textCell(""),
            textCell("No bridge data available for the selected period")
          ]]
        : [
            [
              textCell("Canonical EBITDA"),
              numberCell(data.ebitdaBridge.canonicalEbitda),
              textCell("")
            ],
            [
              textCell("Reported EBITDA (Reference)"),
              numberCell(data.ebitdaBridge.reportedEbitdaReference),
              textCell("")
            ],
            ...(data.ebitdaBridge.groups.length === 0
              ? [[
                  textCell("Accepted Add-Backs"),
                  numberCell(0),
                  textCell("No accepted add-backs for this period")
                ]]
              : data.ebitdaBridge.groups.map((group) => [
                  textCell(group.label),
                  numberCell(group.total),
                  textCell(`${group.items.length} item(s)`)
                ])),
            [
              textCell("Accepted Add-Backs"),
              numberCell(data.ebitdaBridge.addBackTotal),
              textCell("Total accepted adjustments")
            ],
            [
              textCell("Adjusted EBITDA"),
              numberCell(data.ebitdaBridge.adjustedEbitda),
              textCell("")
            ],
            ...((data.ebitdaBridge.warnings.length === 0 &&
            data.ebitdaBridge.invalidReasons.length === 0)
              ? [[textCell("Bridge Notes"), textCell(""), textCell("No bridge warnings or invalid reasons")]]
              : [
                  ...data.ebitdaBridge.warnings.map((warning) => [
                    textCell("Bridge Warning"),
                    textCell(""),
                    textCell(warning)
                  ]),
                  ...data.ebitdaBridge.invalidReasons.map((reason) => [
                    textCell("Bridge Invalid Reason"),
                    textCell(""),
                    textCell(reason)
                  ])
                ])
          ]
    },
    {
      title: "Adjustment Schedule",
      sheetName: "Adjustment Schedule",
      columns: [
        "Type",
        "Description",
        "Amount",
        "Justification",
        "Confidence",
        "Mapping Risk"
      ],
      rows:
        acceptedScheduleItems.length === 0
          ? [[
              textCell("No accepted add-backs"),
              textCell("No accepted add-backs are currently included for this period."),
              textCell(""),
              textCell(""),
              textCell(""),
              textCell("")
            ]]
          : acceptedScheduleItems.map((item) => [
              textCell(item.type),
              textCell(item.description),
              numberCell(item.amount),
              textCell(item.justification || "No justification provided"),
              textCell(item.classificationConfidence),
              textCell(item.dependsOnLowConfidenceMapping ? "Low-confidence mapping dependency" : "No elevated mapping risk")
            ])
    },
    {
      title: "Executive Summary",
      sheetName: "Executive Summary",
      columns: ["Section", "Content"],
      rows: [
        [textCell("Readiness"), textCell(data.readiness.label)],
        [textCell("Reconciliation"), textCell(data.reconciliation.label)],
        [
          textCell("Reconciliation Summary"),
          textCell(data.reconciliation.summaryMessage)
        ],
        ...(data.readiness.status !== "ready"
          ? [[
              textCell(data.readiness.status === "blocked" ? "Warning" : "Caution"),
              textCell(
                data.readiness.status === "blocked"
                  ? "This report contains incomplete, inconsistent, or low-confidence data and should not be relied on as decision-grade adjusted EBITDA."
                  : "This report contains caution-level diligence issues and adjusted EBITDA should be reviewed with care."
              )
            ]]
          : []),
        [textCell("Executive Summary"), textCell(data.executiveSummary ?? "No executive summary available")],
        ...(data.insights.length === 0
          ? [[textCell("Insights"), textCell("No key insights available")]]
          : data.insights.map((insight, index) => [
              textCell(`Insight ${index + 1}`),
              textCell(insight.message)
            ])),
        ...(data.recommendedActions.length === 0
          ? [[textCell("Recommendations"), textCell("No recommended actions available")]]
          : data.recommendedActions.map((action, index) => [
              textCell(`Recommendation ${index + 1}`),
              textCell(action.message)
            ]))
      ]
    },
    {
      title: "Data Quality & Reconciliation",
      sheetName: "Data Quality & Reconciliation",
      columns: ["Metric", "Value"],
      rows: [
        [textCell("Readiness Status"), textCell(data.readiness.label)],
        [textCell("Reconciliation Status"), textCell(data.reconciliation.label)],
        [textCell("Reconciliation Summary"), textCell(data.reconciliation.summaryMessage)],
        [textCell("Data Quality Score"), percentCell(data.dataQuality.confidenceScore)],
        [textCell("Data Quality Label"), textCell(data.dataQuality.confidenceLabel)],
        [textCell("Mapping Coverage Percent"), percentCell(data.dataQuality.mappingCoveragePercent)],
        [
          textCell("Missing Categories"),
          textCell(
            data.dataQuality.missingCategories.length > 0
              ? data.dataQuality.missingCategories.join("; ")
              : "None"
          )
        ],
        [
          textCell("Consistency Issues"),
          textCell(
            data.dataQuality.consistencyIssues.length > 0
              ? data.dataQuality.consistencyIssues.join("; ")
              : "None"
          )
        ],
        [
          textCell("Critical Warnings"),
          textCell(criticalWarnings.length > 0 ? criticalWarnings.join("; ") : "None")
        ]
      ]
    },
    buildStatementSection(
      "Income Statement (Normalized)",
      "Income Statement (Normalized)",
      data.normalizedOutput?.incomeStatement ?? null
    ),
    buildStatementSection(
      "Balance Sheet (Normalized)",
      "Balance Sheet (Normalized)",
      data.normalizedOutput?.balanceSheet ?? null
    ),
    buildMultiPeriodSummarySection(data)
  ];
}

export function buildReportExport(data: DashboardData) {
  const sections = buildReportSections(data);
  const rows: CsvRow[] = [];
  const companyName = data.company?.name ?? "No company selected";
  const periodLabel = data.snapshot.label || "Latest period";

  sections.forEach((section) => appendSectionToCsv(rows, section));

  return {
    filename: `${sanitizeFilenameSegment(companyName || "company")}-${sanitizeFilenameSegment(periodLabel || "period")}-report.csv`,
    content: rowsToCsv(rows)
  };
}
