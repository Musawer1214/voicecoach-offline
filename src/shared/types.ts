export type LevelState = "silent" | "quiet" | "good" | "strong";

export type CalibrationProfile = {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  deviceId: string;
  deviceLabel: string;
  sampleDurationMs: number;
  noiseFloorDb: number;
  speechAverageDb: number;
  targetMinDb: number;
  targetMaxDb: number;
  lowThresholdDb: number;
};

export type VolumeSample = {
  tMs: number;
  db: number;
  rms: number;
  speaking: boolean;
};

export type SessionEvent = {
  id: string;
  type: "low_volume" | "silence";
  startMs: number;
  endMs: number;
  minDb?: number;
  averageDb?: number;
};

export type VoiceCoachSession = {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  durationMs: number;
  deviceId: string;
  calibrationId: string | null;
  recordingFile: "recording.webm";
  samples: VolumeSample[];
  events: SessionEvent[];
  summary: {
    targetVolumePercent: number;
    lowVolumeEventCount: number;
    longestLowVolumeMs: number;
    silenceEventCount: number;
  };
};

export type AppMeta = {
  appName: string;
  version: string;
  dataDir: string;
};

export type SavedSession = {
  session: VoiceCoachSession;
  folderPath: string;
  sessionPath: string;
  recordingPath: string;
  recordingUrl: string;
};

export type SaveSessionPayload = {
  session: VoiceCoachSession;
  recordingData: ArrayBuffer;
};

export type VoiceCoachApi = {
  getAppMeta(): Promise<AppMeta>;
  loadCalibration(): Promise<CalibrationProfile | null>;
  saveCalibration(profile: CalibrationProfile): Promise<CalibrationProfile>;
  listSessions(): Promise<SavedSession[]>;
  saveSession(payload: SaveSessionPayload): Promise<SavedSession>;
};

export const SESSION_SCHEMA_VERSION = 1;
export const CALIBRATION_SCHEMA_VERSION = 1;

export function isVoiceCoachSession(value: unknown): value is VoiceCoachSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as VoiceCoachSession;
  return (
    candidate.schemaVersion === SESSION_SCHEMA_VERSION &&
    typeof candidate.id === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.durationMs === "number" &&
    candidate.recordingFile === "recording.webm" &&
    Array.isArray(candidate.samples) &&
    Array.isArray(candidate.events) &&
    typeof candidate.summary?.targetVolumePercent === "number" &&
    typeof candidate.summary?.lowVolumeEventCount === "number" &&
    typeof candidate.summary?.longestLowVolumeMs === "number" &&
    typeof candidate.summary?.silenceEventCount === "number"
  );
}
