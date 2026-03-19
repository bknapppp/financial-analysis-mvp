import Papa from "papaparse";
import {
  isWideStatementFormat,
  parseWideStatementMatrix
} from "@/lib/statement-parser";

export type ImportFileKind = "csv" | "xlsx";

export type ImportFieldKey =
  | "accountName"
  | "amount"
  | "periodLabel"
  | "periodDate"
  | "statementType"
  | "category"
  | "addbackFlag";

export type ImportColumnMapping = Record<ImportFieldKey, string>;

export type RawImportRow = Record<string, string>;

export type ParsedImportSheet = {
  name: string;
  headers: string[];
  rows: RawImportRow[];
};

export type ParsedImportFile = {
  kind: ImportFileKind;
  fileName: string;
  sheets: ParsedImportSheet[];
};

const HEADER_CANDIDATES: Record<ImportFieldKey, string[]> = {
  accountName: ["account", "name", "description", "line item", "gl account"],
  amount: ["amount", "value", "balance", "total", "actual"],
  periodLabel: ["period", "month", "label"],
  periodDate: ["date", "period end", "as of"],
  statementType: ["statement", "type"],
  category: ["category", "class"],
  addbackFlag: ["addback", "add-back", "adjustment"]
};

function sanitizeHeader(value: string, index: number) {
  const trimmed = value.trim();
  return trimmed || `Column ${index + 1}`;
}

function dedupeHeaders(headers: string[]) {
  const counts = new Map<string, number>();

  return headers.map((header) => {
    const current = counts.get(header) ?? 0;
    counts.set(header, current + 1);

    if (current === 0) {
      return header;
    }

    return `${header} (${current + 1})`;
  });
}

function hasNonEmptyValue(values: string[]) {
  return values.some((value) => value.trim().length > 0);
}

function coerceExcelCellValue(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "object") {
    const maybeRichText = value as { richText?: Array<{ text?: string }> };
    if (Array.isArray(maybeRichText.richText)) {
      return maybeRichText.richText.map((part) => part.text ?? "").join("").trim();
    }

    const maybeText = value as { text?: string; result?: unknown };
    if (typeof maybeText.text === "string") {
      return maybeText.text.trim();
    }

    if (maybeText.result != null) {
      return String(maybeText.result).trim();
    }
  }

  return String(value).trim();
}

function buildRowsFromMatrix(matrix: string[][]) {
  if (matrix.length === 0) {
    return { headers: [], rows: [] as RawImportRow[] };
  }

  if (isWideStatementFormat(matrix)) {
    const normalizedRows = parseWideStatementMatrix(matrix);
    const headers = [
      "Account Name",
      "Amount",
      "Period Label",
      "Period Date",
      "Statement Type"
    ];

    return {
      headers,
      rows: normalizedRows.map((row) => ({
        "Account Name": row.account_name,
        Amount: row.amount,
        "Period Label": row.period_label,
        "Period Date": row.period_date,
        "Statement Type": row.statement_type
      }))
    };
  }

  const headers = dedupeHeaders(
    matrix[0].map((header, index) => sanitizeHeader(header, index))
  );
  const rows = matrix
    .slice(1)
    .map((cells) => {
      const row: RawImportRow = {};

      headers.forEach((header, index) => {
        row[header] = (cells[index] ?? "").trim();
      });

      return row;
    })
    .filter((row) => hasNonEmptyValue(Object.values(row)));

  return { headers, rows };
}

export function getCellValue(row: RawImportRow, key: string) {
  if (!key) {
    return "";
  }

  return String(row[key] ?? "").trim();
}

export function buildInitialColumnMapping(headers: string[]): ImportColumnMapping {
  const findMatch = (field: ImportFieldKey) =>
    headers.find((header) =>
      HEADER_CANDIDATES[field].some((candidate) =>
        header.toLowerCase().includes(candidate)
      )
    ) ?? "";

  return {
    accountName: findMatch("accountName"),
    amount: findMatch("amount"),
    periodLabel: findMatch("periodLabel"),
    periodDate: findMatch("periodDate"),
    statementType: findMatch("statementType"),
    category: findMatch("category"),
    addbackFlag: findMatch("addbackFlag")
  };
}

async function parseCsvImportFile(file: File): Promise<ParsedImportFile> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        const parsedRows = results.data
          .map((row) => {
            const cleanedRow: RawImportRow = {};

            Object.entries(row).forEach(([key, value]) => {
              if (key === "__parsed_extra") {
                return;
              }

              cleanedRow[key.trim()] = String(value ?? "").trim();
            });

            return cleanedRow;
          })
          .filter((row) => hasNonEmptyValue(Object.values(row)));
        const rawHeaders = (results.meta.fields ?? []).filter(
          (field): field is string => Boolean(field)
        );
        const headers =
          rawHeaders.length > 0
            ? dedupeHeaders(
                rawHeaders.map((header, index) => sanitizeHeader(header, index))
              )
            : Object.keys(parsedRows[0] ?? {});

        if (headers.length === 0) {
          reject(new Error("The uploaded CSV did not contain usable headers."));
          return;
        }

        resolve({
          kind: "csv",
          fileName: file.name,
          sheets: [
            {
              name: "CSV import",
              headers,
              rows: parsedRows
            }
          ]
        });
      },
      error: () => {
        reject(new Error("The uploaded CSV could not be parsed."));
      }
    });
  });
}

async function parseExcelImportFile(file: File): Promise<ParsedImportFile> {
  const ExcelJs = await import("exceljs");
  const workbook = new ExcelJs.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const sheets: ParsedImportSheet[] = [];

  workbook.worksheets.forEach((worksheet) => {
    const matrix: string[][] = [];

    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const rawValues = Array.isArray(row.values) ? row.values.slice(1) : [];
      const values = rawValues.map((value) => coerceExcelCellValue(value));

      if (hasNonEmptyValue(values)) {
        matrix.push(values);
      }
    });

    const { headers, rows } = buildRowsFromMatrix(matrix);

    if (headers.length > 0) {
      sheets.push({
        name: worksheet.name,
        headers,
        rows
      });
    }
  });

  if (sheets.length === 0) {
    throw new Error("The uploaded workbook did not contain any usable sheets.");
  }

  return {
    kind: "xlsx",
    fileName: file.name,
    sheets
  };
}

export async function parseImportFile(file: File): Promise<ParsedImportFile> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".csv")) {
    return parseCsvImportFile(file);
  }

  if (lowerName.endsWith(".xlsx")) {
    return parseExcelImportFile(file);
  }

  throw new Error("Only .csv and .xlsx files are supported.");
}
