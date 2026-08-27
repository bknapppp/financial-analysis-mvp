export type DataSourceType =
  | "file_import"
  | "external_provider"
  | "manual_entry"
  | "broadstone_system";

export type DataSourceLocation = {
  documentName?: string;
  sheetName?: string;
  row?: number;
  column?: string;
  field?: string;
};

export type DataMappingReference = {
  mappingId?: string;
  mappingMethod?: string;
  mappingExplanation?: string;
};

export type DataProvenance = {
  sourceType: DataSourceType;
  sourceSystem: string;
  underlyingSource?: string;
  sourceIdentifier: string;
  sourceDocumentId?: string;
  location?: DataSourceLocation;
  observedAt: string;
  originalFieldName?: string;
  mapping?: DataMappingReference;
  sourceMetadata?: Readonly<Record<string, string | number | boolean | null>>;
};
