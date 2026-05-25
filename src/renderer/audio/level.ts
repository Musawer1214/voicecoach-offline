import { CalibrationProfile, LevelState } from "../../shared/types";

const MIN_RMS = 0.000001;
const MIN_DB = -100;

export function calculateRms(values: Float32Array): number {
  if (values.length === 0) {
    return 0;
  }

  let sum = 0;
  for (const value of values) {
    sum += value * value;
  }

  return Math.sqrt(sum / values.length);
}

export function rmsToDb(rms: number): number {
  if (!Number.isFinite(rms) || rms <= MIN_RMS) {
    return MIN_DB;
  }

  return Math.max(MIN_DB, 20 * Math.log10(rms));
}

export function isSpeakingFrame(db: number, noiseFloorDb: number): boolean {
  return db > Math.max(noiseFloorDb + 6, -65);
}

export function getLevelState(
  db: number,
  speaking: boolean,
  calibration: CalibrationProfile | null
): LevelState {
  if (!speaking) {
    return "silent";
  }

  if (!calibration) {
    return db > -28 ? "strong" : db > -48 ? "good" : "quiet";
  }

  if (db < calibration.lowThresholdDb) {
    return "quiet";
  }

  if (db <= calibration.targetMaxDb) {
    return "good";
  }

  return "strong";
}

export function smoothDb(previous: number | null, next: number, weight = 0.28): number {
  if (previous === null || !Number.isFinite(previous)) {
    return next;
  }

  return previous + (next - previous) * weight;
}
