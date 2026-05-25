import { describe, expect, it } from "vitest";
import { calculateRms, getLevelState, isSpeakingFrame, rmsToDb } from "./level";
import { CalibrationProfile } from "../../shared/types";

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

describe("audio level utilities", () => {
  it("handles silence without Infinity", () => {
    expect(rmsToDb(0)).toBe(-100);
    expect(Number.isFinite(rmsToDb(0))).toBe(true);
  });

  it("calculates RMS from samples", () => {
    const values = new Float32Array([1, -1, 1, -1]);
    expect(calculateRms(values)).toBe(1);
  });

  it("detects speaking above noise floor", () => {
    expect(isSpeakingFrame(-60, -72)).toBe(true);
    expect(isSpeakingFrame(-70, -72)).toBe(false);
  });

  it("returns calibrated level states", () => {
    expect(getLevelState(-80, false, calibration)).toBe("silent");
    expect(getLevelState(-48, true, calibration)).toBe("quiet");
    expect(getLevelState(-36, true, calibration)).toBe("good");
    expect(getLevelState(-20, true, calibration)).toBe("strong");
  });
});
