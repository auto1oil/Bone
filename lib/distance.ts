// Distances as the yard reads them: feet up to half a mile, miles after.
// Everything is stored and measured in metres; this is only how it's shown.
// Client-safe.

export const FEET_PER_METRE = 3.28084;

export const toFeet = (m: number) => m * FEET_PER_METRE;
export const fromFeet = (ft: number) => ft / FEET_PER_METRE;

export function fmtDistance(m: number): string {
  const ft = toFeet(Number(m) || 0);
  if (ft < 2640) return `${Math.round(ft).toLocaleString('en-US')} ft`;
  return `${(ft / 5280).toFixed(1)} mi`;
}
