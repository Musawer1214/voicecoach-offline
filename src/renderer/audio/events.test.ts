import { beforeAll, describe, expect, it, vi } from "vitest";
import { CalibrationProfile, VolumeSample } from "../../shared/types";
import { analyzeSessionSamples, buildSessionSummary, reanalyzeSessionWithCalibration } from "./events";

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

describe("session event analysis", () => {
  beforeAll(() => {
    vi.stubGlobal("crypto", { randomUUID: () => "event-id" });
  });

  it("triggers low-volume only after sustained quiet speech", () => {
    const samples = makeSamples([
      { start: 0, end: 1000, db: -48, speaking: true },
      { start: 1000, end: 3000, db: -49, speaking: true },
      { start: 3000, end: 4000, db: -36, speaking: true }
    ]);

    const events = analyzeSessionSamples(samples, calibration);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("low_volume");
    expect(events[0].startMs).toBe(0);
  });

  it("does not treat silence as low volume", () => {
    const samples = makeSamples([{ start: 0, end: 4000, db: -90, speaking: false }]);
    const events = analyzeSessionSamples(samples, calibration);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("silence");
  });

  it("summarizes target time and event counts", () => {
    const samples: VolumeSample[] = [
      { tMs: 0, db: -36, rms: 0.02, speaking: true },
      { tMs: 100, db: -40, rms: 0.02, speaking: true },
      { tMs: 200, db: -49, rms: 0.01, speaking: true },
      { tMs: 300, db: -90, rms: 0, speaking: false }
    ];
    const events = [
      { id: "1", type: "low_volume" as const, startMs: 0, endMs: 1700 },
      { id: "2", type: "silence" as const, startMs: 2000, endMs: 5400 }
    ];

    expect(buildSessionSummary(samples, events, calibration)).toEqual({
      targetVolumePercent: 67,
      lowVolumeEventCount: 1,
      longestLowVolumeMs: 1700,
      silenceEventCount: 1
    });
  });

  it("reanalyzes an uncalibrated session with the current calibration", () => {
    const session = {
      schemaVersion: 1 as const,
      id: "session-1",
      createdAt: "2026-05-25T00:00:00.000Z",
      durationMs: 4000,
      deviceId: "device-1",
      calibrationId: null,
      recordingFile: "recording.webm" as const,
      samples: makeSamples([
        { start: 0, end: 2000, db: -48, speaking: true },
        { start: 2000, end: 4000, db: -36, speaking: true }
      ]),
      events: [],
      summary: {
        targetVolumePercent: 0,
        lowVolumeEventCount: 0,
        longestLowVolumeMs: 0,
        silenceEventCount: 0
      }
    };

    const updated = reanalyzeSessionWithCalibration(session, calibration);

    expect(updated.calibrationId).toBe("calibration-1");
    expect(updated.summary.targetVolumePercent).toBe(50);
    expect(updated.summary.lowVolumeEventCount).toBe(1);
  });
});

function makeSamples(ranges: Array<{ start: number; end: number; db: number; speaking: boolean }>): VolumeSample[] {
  return ranges.flatMap((range) => {
    const samples: VolumeSample[] = [];
    for (let tMs = range.start; tMs < range.end; tMs += 100) {
      samples.push({ tMs, db: range.db, rms: range.speaking ? 0.02 : 0, speaking: range.speaking });
    }
    return samples;
  });
}
