export const usd = (value: number, decimals = 0) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;

export const lbs = (value: number) =>
  `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} lbs`;

export const sqft = (value: number) =>
  `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} sq ft`;

/** Human label for a 0-100 usage score. */
export function usageLabel(score: number): string {
  if (score >= 85) return "Very high usage";
  if (score >= 65) return "High usage";
  if (score >= 40) return "Medium usage";
  if (score >= 20) return "Low usage";
  return "Occasional";
}

export function difficultyLabel(difficulty: string): string {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}

export function waterLabel(requirement: string): string {
  return requirement
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");
}

export const cx = (...values: (string | false | null | undefined)[]) =>
  values.filter(Boolean).join(" ");
