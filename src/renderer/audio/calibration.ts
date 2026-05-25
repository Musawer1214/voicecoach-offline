import { CalibrationProfile, VolumeSample } from "../../shared/types";

type CreateCalibrationInput = {
  deviceId: string;
  deviceLabel: string;
  samples: VolumeSample[];
  noiseDurationMs?: number;
};

export function createCalibrationProfile(input: CreateCalibrationInput): CalibrationProfile {
  const noiseDurationMs = input.noiseDurationMs ?? 3000;
  const noiseSamples = input.samples.filter((sample) => sample.tMs <= noiseDurationMs);
  const speechWindow = input.samples.filter((sample) => sample.tMs > noiseDurationMs);
  const noiseFloorDb = roundDb(percentile(noiseSamples.map((sample) => sample.db), 0.7, -80));
  const speechCandidates = speechWindow.filter((sample) => sample.db > noiseFloorDb + 6);
  const speechAverageDb = roundDb(average(speechCandidates.length > 0 ? speechCandidates : speechWindow, -45));

  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    deviceId: input.deviceId,
    deviceLabel: input.deviceLabel,
    sampleDurationMs: lastSampleTime(input.samples),
    noiseFloorDb,
    speechAverageDb,
    targetMinDb: roundDb(speechAverageDb - 4),
    targetMaxDb: roundDb(speechAverageDb + 8),
    lowThresholdDb: roundDb(speechAverageDb - 7)
  };
}

function average(samples: VolumeSample[], fallback: number): number {
  if (samples.length === 0) {
    return fallback;
  }

  return samples.reduce((total, sample) => total + sample.db, 0) / samples.length;
}

function percentile(values: number[], percentileValue: number, fallback: number): number {
  if (values.length === 0) {
    return fallback;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * percentileValue)));
  return sorted[index] ?? fallback;
}

function lastSampleTime(samples: VolumeSample[]): number {
  return samples.length === 0 ? 0 : samples[samples.length - 1].tMs;
}

function roundDb(value: number): number {
  return Math.round(value * 10) / 10;
}
