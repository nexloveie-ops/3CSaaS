export const MAX_VARIANT_DIMENSIONS = 3;

export type VariantDimension = { name: string; values: string[] };

export function variantCombinationKey(values: string[]): string {
  return values.map((v) => v.trim()).join('\u0001');
}

export function buildVariantDisplayName(
  parentName: string,
  values: string[],
): string {
  if (!values.length) return parentName;
  return `${parentName} · ${values.join(' · ')}`;
}

/** Cartesian product of dimension value lists (max 3 axes). */
export function cartesianVariantValues(
  dimensions: VariantDimension[],
): string[][] {
  if (!dimensions.length) return [];
  let combos: string[][] = [[]];
  for (const dim of dimensions) {
    const vals = dim.values.map((v) => v.trim()).filter(Boolean);
    if (!vals.length) return [];
    const next: string[][] = [];
    for (const combo of combos) {
      for (const v of vals) {
        next.push([...combo, v]);
      }
    }
    combos = next;
  }
  return combos;
}
