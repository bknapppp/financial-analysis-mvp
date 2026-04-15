type SchemaErrorLike = {
  code?: string | null;
  message?: string | null;
};

const ACCOUNT_MAPPING_TOKENS = [
  "account_mappings",
  "account_name_key",
  "normalized_label",
  "source_type",
  "updated_at",
  "company_id"
];

export function isAccountMappingsSchemaError(
  error: SchemaErrorLike | null | undefined
) {
  if (!error) {
    return false;
  }

  const message = (error.message ?? "").toLowerCase();

  return (
    error.code === "PGRST204" ||
    error.code === "42P01" ||
    ACCOUNT_MAPPING_TOKENS.some((token) => message.includes(token))
  );
}
