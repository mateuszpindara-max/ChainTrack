export const SUGGESTED_THRESHOLD_KM: number | null = 300;

export function effectiveThresholdKm(manualKm: number | null, suggestedKm: number | null): number | null {
  return manualKm ?? suggestedKm;
}

export function wearPercent(activeMeters: number, thresholdKm: number | null): number | null {
  return thresholdKm === null ? null : Math.round((activeMeters / (thresholdKm * 1000)) * 100);
}

export function wearLevel(
  activeMeters: number,
  thresholdKm: number | null,
): "none" | "normal" | "warning" | "critical" {
  if (thresholdKm === null) return "none";
  const ratio = activeMeters / (thresholdKm * 1000);
  if (ratio >= 1) return "critical";
  if (ratio >= 0.75) return "warning";
  return "normal";
}

export function averageCompletedKm(averageMeters: number | null): number | null {
  return averageMeters === null ? null : Math.round(averageMeters / 100) / 10;
}
