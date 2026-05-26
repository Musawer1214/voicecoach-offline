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

export type MicrophoneProcessingMode = "enhanced" | "natural";

export type AppSettings = {
  schemaVersion: 1;
  selectedDeviceId: string;
  selectedDeviceLabel: string;
  microphoneProcessingMode?: MicrophoneProcessingMode;
  reviewPlaybackGain?: number;
  updatedAt: string;
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

export type SessionMetadata = {
  title: string;
  prompt: string;
  notes: string;
  tags: string[];
  updatedAt: string;
};

export type SuggestionSeverity = "success" | "info" | "warning";

export type CoachingSuggestion = {
  id: string;
  category: "volume" | "silence" | "consistency" | "clipping" | "calibration" | "transcript";
  severity: SuggestionSeverity;
  title: string;
  detail: string;
  startMs?: number;
  endMs?: number;
};

export type AudioReport = {
  schemaVersion: 1;
  analyzerVersion: "audio-report-v1";
  sessionId: string;
  createdAt: string;
  calibrationSnapshot: CalibrationProfile | null;
  metrics: {
    durationMs: number;
    speakingTimeMs: number;
    silenceTimeMs: number;
    speakingRatioPercent: number;
    averageDb: number | null;
    peakDb: number | null;
    minDb: number | null;
    targetVolumePercent: number;
    lowVolumePercent: number;
    lowVolumeMs: number;
    longestLowVolumeMs: number;
    longPauseCount: number;
    longestPauseMs: number;
    clippingEventCount: number;
    volumeConsistencyScore: number;
    overallScore: number;
  };
  suggestions: CoachingSuggestion[];
};

export type TranscriptDocument = {
  schemaVersion: 1;
  sessionId: string;
  source: "manual";
  text: string;
  updatedAt: string;
};

export type TextSuggestionDocument = {
  schemaVersion: 1;
  analyzerVersion: "text-suggestions-v1";
  sessionId: string;
  updatedAt: string;
  metrics: {
    wordCount: number;
    sentenceCount: number;
    fillerCount: number;
    repeatedPhraseCount: number;
    longSentenceCount: number;
  };
  suggestions: CoachingSuggestion[];
};

export type VoiceCoachSession = {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  durationMs: number;
  deviceId: string;
  calibrationId: string | null;
  calibrationSnapshot?: CalibrationProfile | null;
  metadata?: SessionMetadata;
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
  report: AudioReport | null;
  transcript: TranscriptDocument | null;
  textSuggestions: TextSuggestionDocument | null;
  folderPath: string;
  sessionPath: string;
  recordingPath: string;
  recordingUrl: string;
};

export type SaveSessionPayload = {
  session: VoiceCoachSession;
  report?: AudioReport;
  recordingData: ArrayBuffer;
};

export type UpdateSessionPayload = {
  session: VoiceCoachSession;
};

export type SaveReportPayload = {
  sessionId: string;
  report: AudioReport;
};

export type SaveTranscriptPayload = {
  sessionId: string;
  transcript: TranscriptDocument;
  textSuggestions: TextSuggestionDocument;
};

export type SessionIdPayload = {
  sessionId: string;
};

export type VoiceCoachApi = {
  getAppMeta(): Promise<AppMeta>;
  loadSettings(): Promise<AppSettings | null>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
  loadCalibration(): Promise<CalibrationProfile | null>;
  saveCalibration(profile: CalibrationProfile): Promise<CalibrationProfile>;
  listSessions(): Promise<SavedSession[]>;
  saveSession(payload: SaveSessionPayload): Promise<SavedSession>;
  updateSession(payload: UpdateSessionPayload): Promise<SavedSession>;
  saveReport(payload: SaveReportPayload): Promise<SavedSession>;
  saveTranscript(payload: SaveTranscriptPayload): Promise<SavedSession>;
  deleteSession(payload: SessionIdPayload): Promise<void>;
  exportSessionReport(payload: SessionIdPayload): Promise<string>;
  revealSessionFolder(payload: SessionIdPayload): Promise<string>;
};

export const SESSION_SCHEMA_VERSION = 1;
export const CALIBRATION_SCHEMA_VERSION = 1;
export const SETTINGS_SCHEMA_VERSION = 1;
export const AUDIO_REPORT_SCHEMA_VERSION = 1;
export const TRANSCRIPT_SCHEMA_VERSION = 1;
export const TEXT_SUGGESTIONS_SCHEMA_VERSION = 1;

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

export function isAudioReport(value: unknown): value is AudioReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as AudioReport;
  return (
    candidate.schemaVersion === AUDIO_REPORT_SCHEMA_VERSION &&
    candidate.analyzerVersion === "audio-report-v1" &&
    typeof candidate.sessionId === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.metrics?.durationMs === "number" &&
    Array.isArray(candidate.suggestions)
  );
}

export function isTranscriptDocument(value: unknown): value is TranscriptDocument {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as TranscriptDocument;
  return (
    candidate.schemaVersion === TRANSCRIPT_SCHEMA_VERSION &&
    typeof candidate.sessionId === "string" &&
    candidate.source === "manual" &&
    typeof candidate.text === "string" &&
    typeof candidate.updatedAt === "string"
  );
}

export function isTextSuggestionDocument(value: unknown): value is TextSuggestionDocument {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as TextSuggestionDocument;
  return (
    candidate.schemaVersion === TEXT_SUGGESTIONS_SCHEMA_VERSION &&
    candidate.analyzerVersion === "text-suggestions-v1" &&
    typeof candidate.sessionId === "string" &&
    typeof candidate.updatedAt === "string" &&
    typeof candidate.metrics?.wordCount === "number" &&
    Array.isArray(candidate.suggestions)
  );
}
