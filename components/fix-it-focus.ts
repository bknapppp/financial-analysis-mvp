"use client";

function highlightElement(element: HTMLElement | null) {
  if (!element) {
    return;
  }

  element.setAttribute("data-fix-highlight", "true");

  window.setTimeout(() => {
    element.removeAttribute("data-fix-highlight");
  }, 2200);
}

function focusElement(element: HTMLElement | null) {
  if (!element) {
    return;
  }

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLButtonElement ||
    element instanceof HTMLAnchorElement
  ) {
    element.focus({ preventScroll: true });
    return;
  }

  element.setAttribute("tabindex", "-1");
  element.focus({ preventScroll: true });
}

export function focusFixItTarget(sectionId: string | null, fieldId: string | null) {
  if (typeof window === "undefined") {
    return false;
  }

  const section = sectionId ? document.getElementById(sectionId) : null;
  const field = fieldId ? document.getElementById(fieldId) : null;
  const target = field ?? section;

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const scrollTarget = field instanceof HTMLElement ? field : target;
  scrollTarget.scrollIntoView({ behavior: "smooth", block: "center" });

  highlightElement(section instanceof HTMLElement ? section : null);
  if (field instanceof HTMLElement && field !== section) {
    highlightElement(field);
  }

  focusElement(target);
  return true;
}
