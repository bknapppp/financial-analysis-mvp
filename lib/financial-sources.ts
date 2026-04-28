import {
  FINANCIAL_ENTRY_AUDIT_SELECT,
  FINANCIAL_ENTRY_BASE_SELECT,
  isFinancialEntryTraceabilitySchemaError
} from "./financial-entry-schema.ts";
import { getSupabaseServerClient } from "./supabase.ts";
import type {
  AuditConfidence,
  AuditMatchedBy,
  FinancialEntry,
  FinancialSourceConfidence,
  FinancialSourceType,
  NormalizedCategory,
  ReportingPeriod,
  SourceDocument,
  SourceFinancialContext,
  SourceFinancialEntry,
  SourceReportingPeriod,
  StatementType
} from "./types.ts";

type TaxImportRowPayload = {
  accountName: string;
  amount: number;
  statementType: StatementType;
  category: NormalizedCategory | null;
  addbackFlag?: boolean;
  matchedBy?: AuditMatchedBy | null;
  confidence?: AuditConfidence | null;
  mappingExplanation?: string | null;
};

type TaxSourceImportParams = {
  companyId: string;
  sourceFileName?: string | null;
  uploadId?: string | null;
  sourceDocumentId?: string | null;
  periodLabel: string;
  periodDate: string;
  sourcePeriodLabel?: string | null;
  sourceYear?: number | null;
  sourceCurrency?: string | null;
  sourceConfidence?: FinancialSourceConfidence | null;
  rows: TaxImportRowPayload[];
  supabaseClient?: ReturnType<typeof getSupabaseServerClient>;
};

type SourcePeriodRow = {
  id: string;
  source_document_id: string;
  label: string;
  period_date: string;
  source_period_label: string | null;
  source_year: number | null;
  created_at: string;
  source_documents: SourceDocument;
};

type SourceEntryRow = {
  id: string;
  account_name: string;
  statement_type: StatementType;
  amount: number;
  category: NormalizedCategory | null;
  addback_flag: boolean;
  matched_by?: AuditMatchedBy | null;
  confidence?: AuditConfidence | null;
  mapping_explanation?: string | null;
  created_at: string;
  source_period_id: string;
};

const SOURCE_DOCUMENT_SELECT =
  "id, company_id, name, document_type, period_label, fiscal_year, uploaded_at, uploaded_by, source_kind, status, source_type, source_file_name, upload_id, source_currency, source_confidence, created_at";

const SOURCE_PERIOD_SELECT = `
  id,
  source_document_id,
  label,
  period_date,
  source_period_label,
  source_year,
  created_at,
  source_documents!inner(${SOURCE_DOCUMENT_SELECT})
`;

const SOURCE_ENTRY_BASE_SELECT =
  "id, account_name, statement_type, amount, category, addback_flag, created_at, source_period_id";

const SOURCE_ENTRY_AUDIT_SELECT = `${SOURCE_ENTRY_BASE_SELECT}, matched_by, confidence, mapping_explanation`;

function buildEntryKey(
  accountName: string,
  statementType: StatementType,
  _amount: number,
  _category: NormalizedCategory | null,
  _addbackFlag: boolean
) {
  return [accountName.trim().toLowerCase(), statementType].join("::");
}

function mapReportedPeriodToSourcePeriod(period: ReportingPeriod): SourceReportingPeriod {
  return {
    id: period.id,
    source_document_id: null,
    label: period.label,
    period_date: period.period_date,
    source_period_label: period.label,
    source_year: Number.parseInt(period.period_date.slice(0, 4), 10) || null,
    created_at: period.created_at,
    source_type: "reported_financials",
    source_file_name: null,
    upload_id: null,
    source_currency: null,
    source_confidence: null
  };
}

function mapReportedEntryToSourceEntry(entry: FinancialEntry): SourceFinancialEntry {
  return {
    id: entry.id,
    account_name: entry.account_name,
    statement_type: entry.statement_type,
    amount: Number(entry.amount),
    category: entry.category,
    addback_flag: entry.addback_flag,
    matched_by: entry.matched_by ?? null,
    confidence: entry.confidence ?? null,
    mapping_explanation: entry.mapping_explanation ?? null,
    created_at: entry.created_at,
    source_period_id: entry.period_id,
    source_document_id: null,
    source_type: "reported_financials",
    source_file_name: null,
    upload_id: null,
    source_period_label: null,
    source_year: null,
    source_currency: null,
    source_confidence: null
  };
}

function mapTaxSourcePeriod(period: SourcePeriodRow): SourceReportingPeriod {
  return {
    id: period.id,
    source_document_id: period.source_document_id,
    label: period.label,
    period_date: period.period_date,
    source_period_label: period.source_period_label,
    source_year: period.source_year,
    created_at: period.created_at,
    source_type: period.source_documents.source_type,
    source_file_name: period.source_documents.source_file_name,
    upload_id: period.source_documents.upload_id,
    source_currency: period.source_documents.source_currency,
    source_confidence: period.source_documents.source_confidence
  };
}

function mapTaxSourceEntry(
  entry: SourceEntryRow,
  period: SourceReportingPeriod
): SourceFinancialEntry {
  return {
    id: entry.id,
    account_name: entry.account_name,
    statement_type: entry.statement_type,
    amount: Number(entry.amount),
    category: entry.category,
    addback_flag: entry.addback_flag,
    matched_by: entry.matched_by ?? null,
    confidence: entry.confidence ?? null,
    mapping_explanation: entry.mapping_explanation ?? null,
    created_at: entry.created_at,
    source_period_id: entry.source_period_id,
    source_document_id: period.source_document_id,
    source_type: period.source_type,
    source_file_name: period.source_file_name,
    upload_id: period.upload_id,
    source_period_label: period.source_period_label,
    source_year: period.source_year,
    source_currency: period.source_currency,
    source_confidence: period.source_confidence
  };
}

export function buildMockTaxReturnFixture(params: {
  companyId: string;
  sourceYear: number;
  sourceCurrency?: string;
  periodLabel?: string;
  periodDate?: string;
  sourceFileName?: string;
  uploadId?: string;
}) {
  const sourceYear = params.sourceYear;
  const periodLabel = params.periodLabel ?? `FY ${sourceYear} Tax Return`;
  const periodDate = params.periodDate ?? `${sourceYear}-12-31`;
  const sourceFileName = params.sourceFileName ?? `mock-tax-return-${sourceYear}.json`;
  const uploadId = params.uploadId ?? `dev-mock-tax-return-${params.companyId}-${sourceYear}`;

  return {
    companyId: params.companyId,
    sourceFileName,
    uploadId,
    periodLabel,
    periodDate,
    sourcePeriodLabel: `Form 1120 ${sourceYear}`,
    sourceYear,
    sourceCurrency: params.sourceCurrency ?? "USD",
    sourceConfidence: "unknown" as const,
    rows: [
      {
        accountName: "Tax Gross Receipts",
        amount: 1250000,
        statementType: "income" as const,
        category: "Revenue" as const,
        matchedBy: "manual" as const,
        confidence: "high" as const,
        mappingExplanation: "Mock tax-return revenue line for source-isolation validation."
      },
      {
        accountName: "Tax Cost of Goods Sold",
        amount: 460000,
        statementType: "income" as const,
        category: "COGS" as const,
        matchedBy: "manual" as const,
        confidence: "high" as const,
        mappingExplanation: "Mock tax-return COGS line for source-isolation validation."
      },
      {
        accountName: "Tax Operating Expenses",
        amount: 515000,
        statementType: "income" as const,
        category: "Operating Expenses" as const,
        matchedBy: "manual" as const,
        confidence: "high" as const,
        mappingExplanation:
          "Mock tax-return operating expense line for source-isolation validation."
      },
      {
        accountName: "Tax Depreciation",
        amount: 32000,
        statementType: "income" as const,
        category: "Depreciation / Amortization" as const,
        matchedBy: "manual" as const,
        confidence: "high" as const,
        mappingExplanation:
          "Mock tax-return depreciation line for source-isolation validation."
      },
      {
        accountName: "Taxable Income",
        amount: 243000,
        statementType: "income" as const,
        category: "Pre-tax" as const,
        matchedBy: "manual" as const,
        confidence: "high" as const,
        mappingExplanation: "Mock tax-return pre-tax income line for source-isolation validation."
      }
    ]
  };
}

async function fetchReportedFinancialContext(companyId: string): Promise<SourceFinancialContext> {
  const supabase = getSupabaseServerClient();
  const { data: periodsResult } = await supabase
    .from("reporting_periods")
    .select("*")
    .eq("company_id", companyId)
    .order("period_date", { ascending: true })
    .returns<ReportingPeriod[]>();

  const periods = (Array.isArray(periodsResult) ? periodsResult : []).map(
    mapReportedPeriodToSourcePeriod
  );
  const periodIds = periods.map((period) => period.id);

  let entries: FinancialEntry[] = [];
  if (periodIds.length > 0) {
    const auditEntriesQuery = await supabase
      .from("financial_entries")
      .select(FINANCIAL_ENTRY_AUDIT_SELECT)
      .in("period_id", periodIds)
      .returns<FinancialEntry[]>();

    if (
      auditEntriesQuery.error &&
      isFinancialEntryTraceabilitySchemaError(auditEntriesQuery.error)
    ) {
      const fallbackEntriesQuery = await supabase
        .from("financial_entries")
        .select(FINANCIAL_ENTRY_BASE_SELECT)
        .in("period_id", periodIds)
        .returns<FinancialEntry[]>();

      entries = Array.isArray(fallbackEntriesQuery.data) ? fallbackEntriesQuery.data : [];
    } else {
      entries = Array.isArray(auditEntriesQuery.data) ? auditEntriesQuery.data : [];
    }
  }

  return {
    sourceType: "reported_financials",
    documents: [],
    periods,
    entries: entries.map(mapReportedEntryToSourceEntry)
  };
}

async function fetchTaxReturnContext(companyId: string): Promise<SourceFinancialContext> {
  const supabase = getSupabaseServerClient();
  const { data: documentsResult } = await supabase
    .from("source_documents")
    .select(SOURCE_DOCUMENT_SELECT)
    .eq("company_id", companyId)
    .eq("source_type", "tax_return")
    .order("created_at", { ascending: true })
    .returns<SourceDocument[]>();

  const documents = Array.isArray(documentsResult) ? documentsResult : [];

  const { data: periodsResult } = await supabase
    .from("source_reporting_periods")
    .select(SOURCE_PERIOD_SELECT)
    .eq("source_documents.company_id", companyId)
    .eq("source_documents.source_type", "tax_return")
    .order("period_date", { ascending: true })
    .returns<SourcePeriodRow[]>();

  const periods = (Array.isArray(periodsResult) ? periodsResult : []).map(mapTaxSourcePeriod);
  const periodById = new Map(periods.map((period) => [period.id, period]));

  let entries: SourceFinancialEntry[] = [];
  if (periods.length > 0) {
    const { data: entriesResult } = await supabase
      .from("source_financial_entries")
      .select(SOURCE_ENTRY_AUDIT_SELECT)
      .in(
        "source_period_id",
        periods.map((period) => period.id)
      )
      .order("created_at", { ascending: true })
      .returns<SourceEntryRow[]>();

    entries = (Array.isArray(entriesResult) ? entriesResult : [])
      .map((entry) => {
        const period = periodById.get(entry.source_period_id);
        return period ? mapTaxSourceEntry(entry, period) : null;
      })
      .filter((entry): entry is SourceFinancialEntry => Boolean(entry));
  }

  return {
    sourceType: "tax_return",
    documents,
    periods,
    entries
  };
}

export async function getSourceFinancialContext(params: {
  companyId: string;
  sourceType: FinancialSourceType;
}) {
  if (params.sourceType === "reported_financials") {
    return fetchReportedFinancialContext(params.companyId);
  }

  return fetchTaxReturnContext(params.companyId);
}

export async function getReportedFinancialsForDealPeriod(params: {
  companyId: string;
  periodId: string;
}) {
  const context = await fetchReportedFinancialContext(params.companyId);
  return {
    period:
      context.periods.find((period) => period.id === params.periodId) ?? null,
    entries: context.entries.filter((entry) => entry.source_period_id === params.periodId)
  };
}

export async function getTaxFinancialsForDealPeriod(params: {
  companyId: string;
  sourcePeriodId: string;
}) {
  const context = await fetchTaxReturnContext(params.companyId);
  return {
    period:
      context.periods.find((period) => period.id === params.sourcePeriodId) ?? null,
    entries: context.entries.filter(
      (entry) => entry.source_period_id === params.sourcePeriodId
    )
  };
}

export async function insertTaxReturnFinancialContext(params: TaxSourceImportParams) {
  const supabase = params.supabaseClient ?? getSupabaseServerClient();

  let sourceDocument: SourceDocument | null = null;
  if (params.sourceDocumentId) {
    const { data: existingDocument } = await supabase
      .from("source_documents")
      .select(SOURCE_DOCUMENT_SELECT)
      .eq("id", params.sourceDocumentId)
      .eq("company_id", params.companyId)
      .eq("source_type", "tax_return")
      .maybeSingle<SourceDocument>();

    sourceDocument = existingDocument ?? null;
  }

  if (!sourceDocument && params.uploadId) {
    const { data: existingDocument } = await supabase
      .from("source_documents")
      .select(SOURCE_DOCUMENT_SELECT)
      .eq("company_id", params.companyId)
      .eq("source_type", "tax_return")
      .eq("upload_id", params.uploadId)
      .maybeSingle<SourceDocument>();

    sourceDocument = existingDocument ?? null;
  }

  if (!sourceDocument) {
    const { data, error } = await supabase
      .from("source_documents")
      .insert({
        company_id: params.companyId,
        name: params.sourceFileName ?? params.periodLabel,
        document_type: "tax_return",
        period_label: params.periodLabel,
        fiscal_year: params.sourceYear ?? null,
        uploaded_at: new Date().toISOString(),
        source_kind: "import",
        status: "active",
        source_type: "tax_return",
        source_file_name: params.sourceFileName ?? null,
        upload_id: params.uploadId ?? null,
        source_currency: params.sourceCurrency ?? null,
        source_confidence: params.sourceConfidence ?? null
      })
      .select(SOURCE_DOCUMENT_SELECT)
      .single<SourceDocument>();

    if (error) {
      throw new Error(error.message);
    }

    sourceDocument = data;
  }

  const { data: existingPeriod } = await supabase
    .from("source_reporting_periods")
    .select("id")
    .eq("source_document_id", sourceDocument.id)
    .eq("period_date", params.periodDate)
    .eq("label", params.periodLabel)
    .maybeSingle<{ id: string }>();

  let sourcePeriodId = existingPeriod?.id ?? null;

  if (!sourcePeriodId) {
    const { data, error } = await supabase
      .from("source_reporting_periods")
      .insert({
        source_document_id: sourceDocument.id,
        label: params.periodLabel,
        period_date: params.periodDate,
        source_period_label: params.sourcePeriodLabel ?? params.periodLabel,
        source_year: params.sourceYear ?? null
      })
      .select("id")
      .single<{ id: string }>();

    if (error) {
      throw new Error(error.message);
    }

    sourcePeriodId = data.id;
  }

  const rejectedRows: Array<{ accountName: string; reason: string }> = [];
  const seenImportKeys = new Set<string>();
  const rowsToInsert = params.rows
    .map((row) => {
      const entryKey = buildEntryKey(
        row.accountName,
        row.statementType,
        row.amount,
        row.category,
        Boolean(row.addbackFlag)
      );

      if (seenImportKeys.has(entryKey)) {
        rejectedRows.push({
          accountName: row.accountName,
          reason: "Duplicate tax-source row in this import payload"
        });
        return null;
      }

      seenImportKeys.add(entryKey);

      return {
        source_period_id: sourcePeriodId,
        account_name: row.accountName,
        statement_type: row.statementType,
        amount: row.amount,
        category: row.category,
        addback_flag: Boolean(row.addbackFlag),
        matched_by: row.matchedBy ?? "manual",
        confidence: row.confidence ?? "high",
        mapping_explanation:
          row.mappingExplanation ?? "Inserted through the isolated tax-return pipeline."
      };
    })
    .filter(
      (
        row
      ): row is {
        source_period_id: string;
        account_name: string;
        statement_type: StatementType;
        amount: number;
        category: NormalizedCategory | null;
        addback_flag: boolean;
        matched_by: AuditMatchedBy;
        confidence: AuditConfidence;
        mapping_explanation: string;
      } => Boolean(row)
    );

  if (rowsToInsert.length > 0) {
    const { error } = await supabase
      .from("source_financial_entries")
      .upsert(rowsToInsert, {
        onConflict: "source_period_id,account_name,statement_type"
      });

    if (error) {
      throw new Error(error.message);
    }
  }

  return {
    sourceDocumentId: sourceDocument.id,
    sourcePeriodId,
    insertedCount: rowsToInsert.length,
    rejectedRows
  };
}
