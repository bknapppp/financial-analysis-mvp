type SchemaErrorLike = {
  code?: string | null;
  message?: string | null;
};

const TRACEABILITY_COLUMNS = ["matched_by", "confidence", "mapping_explanation"];

export const FINANCIAL_ENTRY_BASE_SELECT =
  "id, account_name, statement_type, amount, period_id, category, addback_flag, created_at";

export const FINANCIAL_ENTRY_AUDIT_SELECT = `${FINANCIAL_ENTRY_BASE_SELECT}, matched_by, confidence, mapping_explanation`;

export function isFinancialEntryTraceabilitySchemaError(
  error: SchemaErrorLike | null | undefined
) {
  if (!error) {
    return false;
  }

  const message = (error.message ?? "").toLowerCase();

  return (
    error.code === "PGRST204" ||
    TRACEABILITY_COLUMNS.some((column) => message.includes(column))
  );
}
