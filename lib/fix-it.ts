export const SOURCE_DATA_UPLOAD_SECTION_ID = "source-data-upload";
export const SOURCE_DATA_FILE_FIELD_ID = "source-data-file";
export const SOURCE_DATA_REVIEW_SECTION_ID = "source-data-review";
export const SOURCE_DATA_REVIEW_REQUIRED_FIELD_ID = "source-data-review-required";
export const SOURCE_DATA_FOCUSED_MAPPING_SECTION_ID = "source-data-focused-mapping";
export const SOURCE_DATA_RECONCILIATION_SECTION_ID = "source-data-reconciliation";
export const UNDERWRITING_WORKBENCH_SECTION_ID = "underwriting-workbench";
export const ADD_BACK_LAYER_SECTION_ID = "add-back-layer";

type FixItTarget = {
  pathname?: string;
  sectionId: string;
  fieldId?: string;
  step?: string;
  tab?: string;
  task?: string;
  sheet?: string;
};

function buildHrefWithTarget(href: string, target: FixItTarget) {
  const url = new URL(href, "https://fix-it.local");

  if (target.pathname) {
    url.pathname = target.pathname;
  }

  url.searchParams.set("fixSection", target.sectionId);

  if (target.fieldId) {
    url.searchParams.set("fixField", target.fieldId);
  } else {
    url.searchParams.delete("fixField");
  }

  if (target.step) {
    url.searchParams.set("fixStep", target.step);
  } else {
    url.searchParams.delete("fixStep");
  }

  if (target.tab) {
    url.searchParams.set("tab", target.tab);
  }

  if (target.task) {
    url.searchParams.set("fixTask", target.task);
  } else {
    url.searchParams.delete("fixTask");
  }

  if (target.sheet) {
    url.searchParams.set("fixSheet", target.sheet);
  } else {
    url.searchParams.delete("fixSheet");
  }

  url.hash = target.sectionId;

  return `${url.pathname}${url.search}${url.hash}`;
}

function extractCompanyIdFromHref(href: string) {
  const url = new URL(href, "https://fix-it.local");
  const companyIdFromQuery = url.searchParams.get("companyId");

  if (companyIdFromQuery) {
    return companyIdFromQuery;
  }

  const match = url.pathname.match(/^\/deal\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getUnderwritingFieldId(action: string) {
  const normalizedAction = action.toLowerCase();

  if (normalizedAction.includes("interest rate")) {
    return "underwriting-annualInterestRatePercent";
  }

  if (normalizedAction.includes("debt term") || normalizedAction.includes("loan term")) {
    return "underwriting-loanTermYears";
  }

  if (normalizedAction.includes("amortization")) {
    return "underwriting-amortizationYears";
  }

  if (
    normalizedAction.includes("purchase price") ||
    normalizedAction.includes("collateral support") ||
    normalizedAction.includes("collateral value") ||
    normalizedAction.includes("ltv")
  ) {
    return "underwriting-collateralValue";
  }

  if (
    normalizedAction.includes("loan amount") ||
    normalizedAction.includes("loan terms") ||
    normalizedAction.includes("debt sizing") ||
    normalizedAction.includes("dscr") ||
    normalizedAction.includes("coverage")
  ) {
    return "underwriting-loanAmount";
  }

  return undefined;
}

export function buildFixItHref(action: string, fallbackHref: string) {
  const normalizedAction = action.toLowerCase();
  const companyId = extractCompanyIdFromHref(fallbackHref);
  const underwritingHref = companyId ? `/deal/${companyId}/underwriting` : fallbackHref;
  const sourceDataHref = companyId ? `/source-data?companyId=${companyId}` : "/source-data";

  if (
    normalizedAction.includes("review add-backs") ||
    normalizedAction.includes("review addbacks") ||
    normalizedAction.includes("add-back layer") ||
    normalizedAction.includes("addback layer")
  ) {
    return buildHrefWithTarget(underwritingHref, {
      sectionId: ADD_BACK_LAYER_SECTION_ID
    });
  }

  if (
    normalizedAction.includes("reconciliation") ||
    normalizedAction.includes("ebitda mismatch")
  ) {
    return buildHrefWithTarget(sourceDataHref, {
      sectionId: SOURCE_DATA_RECONCILIATION_SECTION_ID
    });
  }

  if (
    normalizedAction.includes("complete mapping") ||
    normalizedAction.includes("resolve the remaining unmapped rows") ||
    normalizedAction.includes("unmapped rows") ||
    normalizedAction.includes("low-confidence") ||
    normalizedAction.includes("classification")
  ) {
    return buildHrefWithTarget(sourceDataHref, {
      sectionId: SOURCE_DATA_REVIEW_SECTION_ID,
      fieldId: SOURCE_DATA_REVIEW_REQUIRED_FIELD_ID,
      step: "3"
    });
  }

  if (
    normalizedAction.includes("upload financials") ||
    normalizedAction.includes("load reported financials") ||
    normalizedAction.includes("load or map") ||
    normalizedAction.includes("income statement") ||
    normalizedAction.includes("balance sheet") ||
    normalizedAction.includes("workbook") ||
    normalizedAction.includes("sheet selection") ||
    normalizedAction.includes("period mismatch") ||
    normalizedAction.includes("review detected periods")
  ) {
    return buildHrefWithTarget(sourceDataHref, {
      sectionId: SOURCE_DATA_UPLOAD_SECTION_ID,
      fieldId: SOURCE_DATA_FILE_FIELD_ID,
      step:
        normalizedAction.includes("period mismatch") ||
        normalizedAction.includes("review detected periods") ||
        normalizedAction.includes("periods before import")
          ? "2"
          : "1"
    });
  }

  const underwritingFieldId = getUnderwritingFieldId(action);

  if (
    underwritingFieldId ||
    normalizedAction.includes("run structure") ||
    normalizedAction.includes("prepare output") ||
    normalizedAction.includes("continue underwriting")
  ) {
    return buildHrefWithTarget(underwritingHref, {
      sectionId: UNDERWRITING_WORKBENCH_SECTION_ID,
      fieldId: underwritingFieldId
    });
  }

  return fallbackHref;
}
