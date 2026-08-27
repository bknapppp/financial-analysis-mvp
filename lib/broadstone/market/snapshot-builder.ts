import type {
  CalculationSnapshotManifest,
  CalculationSnapshotManifestInput,
  MarketAvailabilityIssue,
  MarketObservationBundle,
  MarketObservationBundleInput,
  MarketOverrideReference,
  SnapshotObservation
} from "./contracts.ts";
import { deterministicContentHash, stableSerialize } from "./hashing.ts";

function detachedCopy<T>(value: T): T {
  return structuredClone(value);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function compareCanonical(left: unknown, right: unknown): number {
  return stableSerialize(left).localeCompare(stableSerialize(right));
}

function sortedIssues(issues: readonly MarketAvailabilityIssue[]) {
  return [...issues].sort(compareCanonical);
}

function sortedObservations(observations: readonly SnapshotObservation[]) {
  return [...observations].sort((left, right) => {
    const leftKey = `${left.kind}:${left.observation.id}`;
    const rightKey = `${right.kind}:${right.observation.id}`;
    return leftKey.localeCompare(rightKey) || compareCanonical(left, right);
  });
}

function sortedOverrides(overrides: readonly MarketOverrideReference[]) {
  return [...overrides].sort(compareCanonical);
}

function bundleHashContent(bundle: Omit<MarketObservationBundle, "contentHash">) {
  const { bundleId: _runtimeIdentity, ...analyticalContent } = bundle;
  return analyticalContent;
}

export function buildMarketObservationBundle(
  input: MarketObservationBundleInput
): MarketObservationBundle {
  const copy = detachedCopy(input);
  const normalized = {
    ...copy,
    company: {
      ...copy.company,
      externalIdentifiers: copy.company.externalIdentifiers
        ? [...copy.company.externalIdentifiers].sort(compareCanonical)
        : undefined
    },
    selectedPeriods: [...copy.selectedPeriods].sort((left, right) => left.id.localeCompare(right.id)),
    observations: sortedObservations(copy.observations),
    issues: sortedIssues(copy.issues)
  };
  const contentHash = deterministicContentHash(bundleHashContent(normalized));
  return deepFreeze({ ...normalized, contentHash }) as MarketObservationBundle;
}

function manifestHashContent(manifest: Omit<CalculationSnapshotManifest, "contentHash">) {
  const {
    snapshotId: _snapshotId,
    analysisId: _analysisId,
    analysisVersion: _analysisVersion,
    createdAt: _createdAt,
    predecessorSnapshotId: _predecessorSnapshotId,
    observationBundleId: _observationBundleId,
    ...analyticalContent
  } = manifest;
  return analyticalContent;
}

export function buildCalculationSnapshotManifest(
  input: CalculationSnapshotManifestInput
): CalculationSnapshotManifest {
  if (input.valuationDate !== input.observationBundle.valuationDate) {
    throw new Error("Snapshot valuation date must match its observation bundle");
  }

  const copy = detachedCopy(input);
  const { observationBundle, ...manifestInput } = copy;
  const normalized: Omit<CalculationSnapshotManifest, "contentHash"> = {
    ...manifestInput,
    observationBundleId: observationBundle.bundleId,
    observationBundleHash: observationBundle.contentHash,
    selectedPeriodIds: observationBundle.selectedPeriods.map((period) => period.id).sort(),
    issues: sortedIssues(manifestInput.issues),
    warnings: [...manifestInput.warnings].sort(),
    overrideReferences: sortedOverrides(manifestInput.overrideReferences)
  };
  const contentHash = deterministicContentHash(manifestHashContent(normalized));
  return deepFreeze({ ...normalized, contentHash }) as CalculationSnapshotManifest;
}

