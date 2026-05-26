import { describe, expect, it } from "vitest";
import {
  buildAudioTrackConstraints,
  buildCameraConstraints,
  buildMicrophoneConstraints,
  clampReviewPlaybackGain,
  parseCameraResolution
} from "./constraints";

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

  it("builds shared audio track constraints", () => {
    const audio = buildAudioTrackConstraints("mic-2", "enhanced");

    expect(audio.deviceId).toEqual({ exact: "mic-2" });
    expect(audio.echoCancellation).toBe(true);
  });

  it("builds camera constraints with selected device, resolution, and frame rate", () => {
    const constraints = buildCameraConstraints({
      cameraDeviceId: "camera-1",
      frameRate: 24,
      microphoneDeviceId: "mic-1",
      processingMode: "enhanced",
      resolution: "1280x720"
    });
    const video = constraints.video as MediaTrackConstraints;
    const audio = constraints.audio as MediaTrackConstraints;

    expect(video.deviceId).toEqual({ exact: "camera-1" });
    expect(video.width).toEqual({ ideal: 1280 });
    expect(video.height).toEqual({ ideal: 720 });
    expect(video.frameRate).toEqual({ ideal: 24, max: 24 });
    expect(audio.deviceId).toEqual({ exact: "mic-1" });
  });

  it("clamps review playback gain to a usable range", () => {
    expect(clampReviewPlaybackGain(0.5)).toBe(1);
    expect(clampReviewPlaybackGain(2.5)).toBe(2.5);
    expect(clampReviewPlaybackGain(9)).toBe(4);
    expect(clampReviewPlaybackGain(Number.NaN)).toBe(2);
  });

  it("parses camera resolution presets", () => {
    expect(parseCameraResolution("1920x1080")).toEqual([1920, 1080]);
  });
});
