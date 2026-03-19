const ADD_BACK_SELECT = [
  "id",
  "company_id",
  "period_id",
  "linked_entry_id",
  "type",
  "description",
  "amount",
  "classification_confidence",
  "source",
  "status",
  "justification",
  "supporting_reference",
  "created_at",
  "updated_at"
].join(", ");

export { ADD_BACK_SELECT };

export function isAddBacksSchemaError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";

  return (
    message.includes("add_backs") &&
    (message.includes("schema cache") ||
      message.includes("does not exist") ||
      message.includes("could not find"))
  );
}
