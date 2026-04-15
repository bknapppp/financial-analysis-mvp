export const SOURCE_DATA_UPLOAD_SECTION_ID = "source-data-upload";
export const SOURCE_DATA_FILE_FIELD_ID = "source-data-file";
export const UNDERWRITING_WORKBENCH_SECTION_ID = "underwriting-workbench";
export const ADD_BACK_LAYER_SECTION_ID = "add-back-layer";

type FixItTarget = {
  pathname?: string;
  sectionId: string;
  fieldId?: string;
  step?: string;
  tab?: string;
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

  url.hash = target.sectionId;

  return `${url.pathname}${url.search}${url.hash}`;
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

  if (
    normalizedAction.includes("review add-backs") ||
    normalizedAction.includes("review addbacks") ||
    normalizedAction.includes("add-back layer") ||
    normalizedAction.includes("addback layer")
  ) {
    return buildHrefWithTarget(fallbackHref, {
      sectionId: ADD_BACK_LAYER_SECTION_ID,
      tab: "financials"
    });
  }

  if (
    normalizedAction.includes("upload financials") ||
    normalizedAction.includes("load reported financials") ||
    normalizedAction.includes("complete mapping") ||
    normalizedAction.includes("load or map") ||
    normalizedAction.includes("mapping") ||
    normalizedAction.includes("unmapped rows") ||
    normalizedAction.includes("low-confidence") ||
    normalizedAction.includes("classification")
  ) {
    return buildHrefWithTarget(fallbackHref, {
      pathname: "/source-data",
      sectionId: SOURCE_DATA_UPLOAD_SECTION_ID,
      fieldId: SOURCE_DATA_FILE_FIELD_ID,
      step: "1"
    });
  }

  const underwritingFieldId = getUnderwritingFieldId(action);

  if (
    underwritingFieldId ||
    normalizedAction.includes("run structure") ||
    normalizedAction.includes("prepare output") ||
    normalizedAction.includes("continue underwriting")
  ) {
    return buildHrefWithTarget(fallbackHref, {
      sectionId: UNDERWRITING_WORKBENCH_SECTION_ID,
      fieldId: underwritingFieldId,
      tab: "overview"
    });
  }

  return fallbackHref;
}
