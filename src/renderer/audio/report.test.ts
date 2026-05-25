import { beforeAll, describe, expect, it, vi } from "vitest";
import { CalibrationProfile, VoiceCoachSession, VolumeSample } from "../../shared/types";
import { buildAudioReport } from "./report";

const calibration: CalibrationProfile = {
  schemaVersion: 1,
  id: "calibration-1",
  createdAt: "2026-05-25T00:00:00.000Z",
  deviceId: "device-1",
  deviceLabel: "Test microphone",
  sampleDurationMs: 23_000,
  noiseFloorDb: -72,
  speechAverageDb: -38,
  targetMinDb: -42,
  targetMaxDb: -30,
  lowThresholdDb: -45
};

describe("audio report", () => {
  beforeAll(() => {
    vi.setSystemTime(new Date("2026-05-25T00:01:00.000Z"));
  });

  it("computes report metrics and suggestions from session samples", () => {
    const session = makeSession([
      { tMs: 0, db: -40, speaking: true },
      { tMs: 100, db: -41, speaking: true },
      { tMs: 200, db: -49, speaking: true },
      { tMs: 300, db: -50, speaking: true },
      { tMs: 400, db: -90, speaking: false },
      { tMs: 500, db: -90, speaking: false }
    ]);

    const report = buildAudioReport(session, calibration);

    expect(report.schemaVersion).toBe(1);
    expect(report.analyzerVersion).toBe("audio-report-v1");
    expect(report.calibrationSnapshot?.id).toBe("calibration-1");
    expect(report.metrics.averageDb).toBe(-45);
    expect(report.metrics.lowVolumePercent).toBe(50);
    expect(report.metrics.speakingRatioPercent).toBe(67);
    expect(report.suggestions.some((suggestion) => suggestion.id === "audio-low-volume")).toBe(true);
  });

  it("warns when calibration is missing", () => {
    const session = makeSession([{ tMs: 0, db: -40, speaking: true }]);
    const report = buildAudioReport(session, null);

    expect(report.calibrationSnapshot).toBeNull();
    expect(report.suggestions[0].id).toBe("audio-calibration-missing");
  });
});

function makeSession(sampleInput: Array<{ tMs: number; db: number; speaking: boolean }>): VoiceCoachSession {
  const samples: VolumeSample[] = sampleInput.map((sample) => ({
    ...sample,
    rms: sample.speaking ? 0.02 : 0
  }));

  return {
    schemaVersion: 1,
    id: "session-1",
    createdAt: "2026-05-25T00:00:00.000Z",
    durationMs: 600,
    deviceId: "device-1",
    calibrationId: calibration.id,
    recordingFile: "recording.webm",
    samples,
    events: [{ id: "low-1", type: "low_volume", startMs: 200, endMs: 400, minDb: -50, averageDb: -49.5 }],
    summary: {
      targetVolumePercent: 50,
      lowVolumeEventCount: 1,
      longestLowVolumeMs: 200,
      silenceEventCount: 0
    }
  };
}
