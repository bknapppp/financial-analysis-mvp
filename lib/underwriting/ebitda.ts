export function getAdjustedEbitda(params: {
  canonicalEbitda: number | null;
  acceptedAddbacks: number;
}) {
  const { canonicalEbitda, acceptedAddbacks } = params;

  return canonicalEbitda === null ? null : canonicalEbitda + acceptedAddbacks;
}

export function getProFormaEbitda(params: {
  adjustedEbitda: number | null;
  uplift: number | null;
}) {
  const { adjustedEbitda, uplift } = params;

  return adjustedEbitda === null ? null : adjustedEbitda + (uplift ?? 0);
}

export function buildEbitdaChain(params: {
  canonicalEbitda: number | null;
  acceptedAddbacks: number;
  uplift?: number | null;
}) {
  const adjustedEbitda = getAdjustedEbitda({
    canonicalEbitda: params.canonicalEbitda,
    acceptedAddbacks: params.acceptedAddbacks
  });
  const proFormaEbitda = getProFormaEbitda({
    adjustedEbitda,
    uplift: params.uplift ?? null
  });

  return {
    canonicalEbitda: params.canonicalEbitda,
    acceptedAddbacks: params.acceptedAddbacks,
    adjustedEbitda,
    uplift: params.uplift ?? null,
    proFormaEbitda
  };
}
