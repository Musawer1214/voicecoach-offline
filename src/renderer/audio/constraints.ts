import { MicrophoneProcessingMode } from "../../shared/types";

export const DEFAULT_MICROPHONE_PROCESSING_MODE: MicrophoneProcessingMode = "enhanced";
export const DEFAULT_REVIEW_PLAYBACK_GAIN = 2;
export const MIN_REVIEW_PLAYBACK_GAIN = 1;
export const MAX_REVIEW_PLAYBACK_GAIN = 4;

export function buildMicrophoneConstraints(
  deviceId: string,
  processingMode: MicrophoneProcessingMode
): MediaStreamConstraints {
  const enhanced = processingMode === "enhanced";

  return {
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: enhanced,
      noiseSuppression: enhanced,
      autoGainControl: enhanced
    } as MediaTrackConstraints,
    video: false
  };
}

export function clampReviewPlaybackGain(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_REVIEW_PLAYBACK_GAIN;
  }

  return Math.min(MAX_REVIEW_PLAYBACK_GAIN, Math.max(MIN_REVIEW_PLAYBACK_GAIN, value));
}
