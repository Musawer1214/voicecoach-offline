import { describe, expect, it } from "vitest";
import { VolumeSample } from "../../shared/types";
import { createCalibrationProfile } from "./calibration";

describe("calibration", () => {
  it("computes thresholds from noise and speech sample data", () => {
    const samples: VolumeSample[] = [
      ...Array.from({ length: 30 }, (_, index) => ({
        tMs: index * 100,
        db: -75,
        rms: 0.001,
        speaking: false
      })),
      ...Array.from({ length: 200 }, (_, index) => ({
        tMs: 3000 + index * 100,
        db: -38,
        rms: 0.02,
        speaking: true
      }))
    ];

    const profile = createCalibrationProfile({
      deviceId: "device-1",
      deviceLabel: "Test microphone",
      samples
    });

    expect(profile.schemaVersion).toBe(1);
    expect(profile.noiseFloorDb).toBe(-75);
    expect(profile.speechAverageDb).toBe(-38);
    expect(profile.targetMinDb).toBe(-42);
    expect(profile.targetMaxDb).toBe(-30);
    expect(profile.lowThresholdDb).toBe(-45);
  });
});
