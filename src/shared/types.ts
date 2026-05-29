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
export type CameraResolution = "640x360" | "1280x720" | "1920x1080";
export type RecordingKind = "audio" | "video";
export type TranscriptSource = "manual" | "windows_dictation" | "windows_builtin";

export type AppSettings = {
  schemaVersion: 1;
  selectedDeviceId: string;
  selectedDeviceLabel: string;
  selectedCameraId?: string;
  selectedCameraLabel?: string;
  microphoneProcessingMode?: MicrophoneProcessingMode;
  reviewPlaybackGain?: number;
  cameraEnabled?: boolean;
  cameraResolution?: CameraResolution;
  cameraFrameRate?: number;
  cameraMirror?: boolean;
  autoTranscriptionEnabled?: boolean;
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
  goalId?: PracticeGoalId;
  goalLabel?: string;
  updatedAt: string;
};

export type SuggestionSeverity = "success" | "info" | "warning";

export type CoachingSuggestion = {
  id: string;
  category:
    | "volume"
    | "silence"
    | "consistency"
    | "clipping"
    | "calibration"
    | "transcript"
    | "goal"
    | "clarity"
    | "pacing"
    | "coach";
  severity: SuggestionSeverity;
  title: string;
  detail: string;
  startMs?: number;
  endMs?: number;
};

export type PracticeGoalId = "projection" | "clarity" | "pacing" | "interview" | "confidence";

export type PracticeGoal = {
  id: PracticeGoalId;
  label: string;
  detail: string;
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
  source: TranscriptSource;
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

export type CoachReport = {
  schemaVersion: 1;
  analyzerVersion: "coach-report-v1";
  sessionId: string;
  createdAt: string;
  goalId: PracticeGoalId;
  goalLabel: string;
  readinessScore: number;
  scores: {
    projection: number;
    clarity: number;
    pacing: number;
    consistency: number;
  };
  summary: string;
  strengths: CoachingSuggestion[];
  priorities: CoachingSuggestion[];
  nextDrill: {
    title: string;
    detail: string;
    steps: string[];
  };
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
  recordingKind?: RecordingKind;
  cameraDeviceId?: string;
  cameraDeviceLabel?: string;
  cameraSettings?: {
    resolution: CameraResolution;
    frameRate: number;
    mirrored: boolean;
  };
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

export type TrustCheckStatus = "pass" | "warning" | "fail";

export type TrustCheck = {
  id: string;
  label: string;
  status: TrustCheckStatus;
  detail: string;
  action?: string;
};

export type TrustSnapshot = {
  schemaVersion: 1;
  generatedAt: string;
  appVersion: string;
  dataDir: string;
  sessionCount: number;
  validSessionCount: number;
  incompleteSessionCount: number;
  missingRecordingCount: number;
  totalRecordingBytes: number;
  latestSessionAt: string | null;
  checks: TrustCheck[];
};

export type DataBackupResult = {
  schemaVersion: 1;
  createdAt: string;
  backupPath: string;
  sessionCount: number;
  sizeBytes: number;
};

export type SavedSession = {
  session: VoiceCoachSession;
  report: AudioReport | null;
  transcript: TranscriptDocument | null;
  textSuggestions: TextSuggestionDocument | null;
  coachReport: CoachReport | null;
  folderPath: string;
  sessionPath: string;
  recordingPath: string;
  recordingUrl: string;
};

export type SaveSessionPayload = {
  session: VoiceCoachSession;
  report?: AudioReport;
  coachReport?: CoachReport;
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

export type SaveCoachReportPayload = {
  sessionId: string;
  coachReport: CoachReport;
};

export type SessionIdPayload = {
  sessionId: string;
};

export type TranscriptionProvider = "windows_system_speech";

export type TranscriptionStartOptions = {
  provider?: TranscriptionProvider;
  culture?: string;
};

export type TranscriptionEvent =
  | {
      type: "ready";
      provider: TranscriptionProvider;
      message: string;
      at: string;
    }
  | {
      type: "partial";
      provider: TranscriptionProvider;
      text: string;
      confidence?: number;
      at: string;
    }
  | {
      type: "final";
      provider: TranscriptionProvider;
      text: string;
      confidence?: number;
      at: string;
    }
  | {
      type: "error";
      provider: TranscriptionProvider;
      message: string;
      at: string;
    }
  | {
      type: "stopped";
      provider: TranscriptionProvider;
      message: string;
      at: string;
    };

export type TranscriptionStartResult = {
  ok: boolean;
  provider: TranscriptionProvider;
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
  saveCoachReport(payload: SaveCoachReportPayload): Promise<SavedSession>;
  deleteSession(payload: SessionIdPayload): Promise<void>;
  exportSessionReport(payload: SessionIdPayload): Promise<string>;
  exportProgressReport(): Promise<string>;
  revealSessionFolder(payload: SessionIdPayload): Promise<string>;
  revealDataFolder(): Promise<string>;
  getTrustSnapshot(): Promise<TrustSnapshot>;
  createDataBackup(): Promise<DataBackupResult>;
  startTranscription(options?: TranscriptionStartOptions): Promise<TranscriptionStartResult>;
  stopTranscription(): Promise<void>;
  onTranscriptionEvent(callback: (event: TranscriptionEvent) => void): () => void;
};

export const SESSION_SCHEMA_VERSION = 1;
export const CALIBRATION_SCHEMA_VERSION = 1;
export const SETTINGS_SCHEMA_VERSION = 1;
export const AUDIO_REPORT_SCHEMA_VERSION = 1;
export const TRANSCRIPT_SCHEMA_VERSION = 1;
export const TEXT_SUGGESTIONS_SCHEMA_VERSION = 1;
export const COACH_REPORT_SCHEMA_VERSION = 1;

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
    (candidate.recordingKind === undefined ||
      candidate.recordingKind === "audio" ||
      candidate.recordingKind === "video") &&
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
    (candidate.source === "manual" ||
      candidate.source === "windows_dictation" ||
      candidate.source === "windows_builtin") &&
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

export function isCoachReport(value: unknown): value is CoachReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as CoachReport;
  return (
    candidate.schemaVersion === COACH_REPORT_SCHEMA_VERSION &&
    candidate.analyzerVersion === "coach-report-v1" &&
    typeof candidate.sessionId === "string" &&
    typeof candidate.createdAt === "string" &&
    isPracticeGoalId(candidate.goalId) &&
    typeof candidate.goalLabel === "string" &&
    typeof candidate.readinessScore === "number" &&
    typeof candidate.scores?.projection === "number" &&
    typeof candidate.scores?.clarity === "number" &&
    typeof candidate.scores?.pacing === "number" &&
    typeof candidate.scores?.consistency === "number" &&
    typeof candidate.summary === "string" &&
    Array.isArray(candidate.strengths) &&
    Array.isArray(candidate.priorities) &&
    typeof candidate.nextDrill?.title === "string" &&
    typeof candidate.nextDrill?.detail === "string" &&
    Array.isArray(candidate.nextDrill?.steps)
  );
}

export function isPracticeGoalId(value: unknown): value is PracticeGoalId {
  return (
    value === "projection" ||
    value === "clarity" ||
    value === "pacing" ||
    value === "interview" ||
    value === "confidence"
  );
}
