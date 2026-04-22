import ExcelJS from "exceljs";
import { buildReportSections, type ReportCell, type ReportSection } from "./report-export.ts";
import type { DashboardData } from "./types.ts";

function sanitizeSheetName(value: string) {
  const cleaned = value.replace(/[:\\/?*\[\]]/g, "").trim();
  return cleaned.length > 31 ? cleaned.slice(0, 31) : cleaned || "Sheet";
}

function serializeCellValue(cell: ReportCell) {
  return cell.value ?? "";
}

function getCellDisplayLength(cell: ReportCell) {
  if (cell.value === null || cell.value === undefined) {
    return 0;
  }

  if (typeof cell.value === "number") {
    return cell.kind === "percent" ? cell.value.toFixed(1).length : cell.value.toFixed(2).length;
  }

  return String(cell.value).length;
}

function applyWorksheetFormatting(worksheet: ExcelJS.Worksheet, section: ReportSection) {
  worksheet.views = [{ state: "frozen", ySplit: 2 }];
  worksheet.properties.defaultRowHeight = 18;
  const tableBorder = {
    top: { style: "thin", color: { argb: "FFE5E7EB" } },
    bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
    left: { style: "thin", color: { argb: "FFE5E7EB" } },
    right: { style: "thin", color: { argb: "FFE5E7EB" } }
  } satisfies Partial<ExcelJS.Borders>;

  const titleRow = worksheet.getRow(1);
  titleRow.height = 22;
  titleRow.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  titleRow.alignment = { vertical: "middle", horizontal: "left" };
  const titleCell = titleRow.getCell(1);
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF111827" }
  };
  titleCell.border = tableBorder;

  const headerRow = worksheet.getRow(2);
  headerRow.height = 20;

  section.columns.forEach((_, columnIndex) => {
    const headerCell = headerRow.getCell(columnIndex + 1);
    headerCell.font = { bold: true, color: { argb: "FF111827" } };
    headerCell.alignment = { vertical: "middle", horizontal: "left" };
    headerCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF9FAFB" }
    };
    headerCell.border = {
      ...tableBorder,
      bottom: { style: "medium", color: { argb: "FFD1D5DB" } }
    };
  });

  section.rows.forEach((row, rowIndex) => {
    const currentRow = worksheet.getRow(rowIndex + 3);

    row.forEach((cell, columnIndex) => {
      const worksheetCell = currentRow.getCell(columnIndex + 1);

      worksheetCell.alignment = {
        vertical: "middle",
        horizontal:
          typeof cell.value === "number" && columnIndex > 0 ? "right" : "left"
      };

      if (typeof cell.value === "number") {
        worksheetCell.numFmt =
          cell.kind === "percent" ? '0.0"%"' : "#,##0.00";
      }
      worksheetCell.border = tableBorder;
    });

    const firstCellValue = String(row[0]?.value ?? "");
    if (section.keyRowLabels?.includes(firstCellValue)) {
      row.forEach((_, columnIndex) => {
        const worksheetCell = currentRow.getCell(columnIndex + 1);
        worksheetCell.font = { bold: true, color: { argb: "FF111827" } };
      });
    }
  });

  worksheet.columns = section.columns.map((column, index) => {
    const maxLength = Math.max(
      section.title.length,
      column.length,
      ...section.rows.map((row) => getCellDisplayLength(row[index]))
    );

    return {
      width: Math.min(Math.max(maxLength + 4, index === 0 ? 22 : 14), 52)
    };
  });

  worksheet.mergeCells(1, 1, 1, section.columns.length);
}

function appendSectionSheet(workbook: ExcelJS.Workbook, section: ReportSection) {
  const worksheet = workbook.addWorksheet(sanitizeSheetName(section.sheetName));

  worksheet.addRow([section.title, ...Array(Math.max(section.columns.length - 1, 0)).fill("")]);
  worksheet.addRow(section.columns);

  section.rows.forEach((row) => {
    worksheet.addRow(row.map((cell) => serializeCellValue(cell)));
  });

  applyWorksheetFormatting(worksheet, section);
}

export async function buildReportWorkbook(data: DashboardData) {
  const workbook = new ExcelJS.Workbook();
  const sections = buildReportSections(data);
  const companyName = data.company?.name ?? "company";
  const periodLabel = data.snapshot.label || "period";

  workbook.creator = "Codex";
  workbook.created = new Date();
  workbook.title = `${companyName} Financial Diligence Report`;
  workbook.subject = `Adjusted EBITDA review for ${periodLabel}`;
  workbook.company = companyName;
  workbook.keywords = "financial diligence, adjusted ebitda, deal review";

  sections.forEach((section) => appendSectionSheet(workbook, section));

  return {
    filename: `${companyName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")}-${periodLabel
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")}-report.xlsx`,
    buffer: await workbook.xlsx.writeBuffer()
  };
}
