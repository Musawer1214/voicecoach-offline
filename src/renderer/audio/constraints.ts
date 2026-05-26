import { CameraResolution, MicrophoneProcessingMode } from "../../shared/types";

export const DEFAULT_MICROPHONE_PROCESSING_MODE: MicrophoneProcessingMode = "enhanced";
export const DEFAULT_REVIEW_PLAYBACK_GAIN = 2;
export const MIN_REVIEW_PLAYBACK_GAIN = 1;
export const MAX_REVIEW_PLAYBACK_GAIN = 4;

export function buildMicrophoneConstraints(
  deviceId: string,
  processingMode: MicrophoneProcessingMode
): MediaStreamConstraints {
  return {
    audio: buildAudioTrackConstraints(deviceId, processingMode),
    video: false
  };
}

export function buildAudioTrackConstraints(
  deviceId: string,
  processingMode: MicrophoneProcessingMode
): MediaTrackConstraints {
  const enhanced = processingMode === "enhanced";

  return {
    deviceId: deviceId ? { exact: deviceId } : undefined,
    echoCancellation: enhanced,
    noiseSuppression: enhanced,
    autoGainControl: enhanced
  } as MediaTrackConstraints;
}

export function buildCameraConstraints({
  cameraDeviceId,
  frameRate,
  microphoneDeviceId,
  processingMode,
  resolution
}: {
  cameraDeviceId: string;
  frameRate: number;
  microphoneDeviceId: string;
  processingMode: MicrophoneProcessingMode;
  resolution: CameraResolution;
}): MediaStreamConstraints {
  const [width, height] = parseCameraResolution(resolution);

  return {
    audio: buildAudioTrackConstraints(microphoneDeviceId, processingMode),
    video: {
      deviceId: cameraDeviceId ? { exact: cameraDeviceId } : undefined,
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: frameRate, max: frameRate }
    } as MediaTrackConstraints
  };
}

export function clampReviewPlaybackGain(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_REVIEW_PLAYBACK_GAIN;
  }

  return Math.min(MAX_REVIEW_PLAYBACK_GAIN, Math.max(MIN_REVIEW_PLAYBACK_GAIN, value));
}

export function parseCameraResolution(resolution: CameraResolution): [number, number] {
  const [width, height] = resolution.split("x").map(Number);
  return [width, height];
}
