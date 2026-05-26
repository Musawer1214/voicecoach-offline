import { describe, expect, it } from "vitest";
import { buildMicrophoneConstraints, clampReviewPlaybackGain } from "./constraints";

describe("microphone constraints", () => {
  it("enables browser audio processing in enhanced mode", () => {
    const constraints = buildMicrophoneConstraints("device-1", "enhanced");
    const audio = constraints.audio as MediaTrackConstraints;

    expect(audio.deviceId).toEqual({ exact: "device-1" });
    expect(audio.echoCancellation).toBe(true);
    expect(audio.noiseSuppression).toBe(true);
    expect(audio.autoGainControl).toBe(true);
  });

  it("disables browser audio processing in natural mode", () => {
    const constraints = buildMicrophoneConstraints("", "natural");
    const audio = constraints.audio as MediaTrackConstraints;

    expect(audio.deviceId).toBeUndefined();
    expect(audio.echoCancellation).toBe(false);
    expect(audio.noiseSuppression).toBe(false);
    expect(audio.autoGainControl).toBe(false);
  });

  it("clamps review playback gain to a usable range", () => {
    expect(clampReviewPlaybackGain(0.5)).toBe(1);
    expect(clampReviewPlaybackGain(2.5)).toBe(2.5);
    expect(clampReviewPlaybackGain(9)).toBe(4);
    expect(clampReviewPlaybackGain(Number.NaN)).toBe(2);
  });
});
