import { app, shell } from "electron";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  AppSettings,
  AudioReport,
  CalibrationProfile,
  CoachReport,
  DataBackupResult,
  SavedSession,
  SaveCoachReportPayload,
  SaveReportPayload,
  SaveSessionPayload,
  SaveTranscriptPayload,
  SessionIdPayload,
  TextSuggestionDocument,
  TrustCheck,
  TrustSnapshot,
  TranscriptDocument,
  UpdateSessionPayload,
  VoiceCoachSession,
  isAudioReport,
  isCoachReport,
  isTextSuggestionDocument,
  isTranscriptDocument,
  isVoiceCoachSession
} from "../shared/types.js";
import { buildMarkdownReport } from "../shared/markdownReport.js";
import { buildProgressMarkdown, buildProgressSummary } from "../shared/progress.js";

const DATA_DIR_NAME = "VoiceCoachData";
const CALIBRATION_FILE = "calibration.json";
const SETTINGS_FILE = "settings.json";
const SESSIONS_DIR = "sessions";
const SESSION_FILE = "session.json";
const RECORDING_FILE = "recording.webm";
const TRANSCRIPTION_AUDIO_FILE = "transcription.wav";
const REPORT_FILE = "report.json";
const TRANSCRIPT_FILE = "transcript.json";
const SUGGESTIONS_FILE = "suggestions.json";
const COACH_REPORT_FILE = "coach-report.json";
const BACKUPS_DIR = "backups";
const BACKUP_MANIFEST_FILE = "backup-manifest.json";

export function getDataDir(): string {
  return path.join(app.getPath("userData"), DATA_DIR_NAME);
}

export async function ensureDataDirs(): Promise<void> {
  await mkdir(path.join(getDataDir(), SESSIONS_DIR), { recursive: true });
}

export async function loadCalibration(): Promise<CalibrationProfile | null> {
  await ensureDataDirs();
  const filePath = path.join(getDataDir(), CALIBRATION_FILE);

  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as CalibrationProfile;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function saveCalibration(profile: CalibrationProfile): Promise<CalibrationProfile> {
  await ensureDataDirs();
  const filePath = path.join(getDataDir(), CALIBRATION_FILE);
  await writeJson(filePath, profile);
  return profile;
}

export async function loadSettings(): Promise<AppSettings | null> {
  await ensureDataDirs();
  const filePath = path.join(getDataDir(), SETTINGS_FILE);

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as AppSettings;
    return parsed.schemaVersion === 1 ? parsed : null;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  await ensureDataDirs();
  await writeJson(path.join(getDataDir(), SETTINGS_FILE), settings);
  return settings;
}

export async function listSessions(): Promise<SavedSession[]> {
  await ensureDataDirs();
  const sessionsRoot = path.join(getDataDir(), SESSIONS_DIR);
  const entries = await readdir(sessionsRoot, { withFileTypes: true });
  const sessions: SavedSession[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const folderPath = path.join(sessionsRoot, entry.name);
    const sessionPath = path.join(folderPath, SESSION_FILE);
    const recordingPath = path.join(folderPath, RECORDING_FILE);

    try {
      const raw = await readFile(sessionPath, "utf8");
      const session = JSON.parse(raw) as VoiceCoachSession;
      if (isVoiceCoachSession(session)) {
        const [report, transcript, textSuggestions, coachReport] = await Promise.all([
          readOptionalJson<AudioReport>(path.join(folderPath, REPORT_FILE), isAudioReport),
          readOptionalJson<TranscriptDocument>(path.join(folderPath, TRANSCRIPT_FILE), isTranscriptDocument),
          readOptionalJson<TextSuggestionDocument>(
            path.join(folderPath, SUGGESTIONS_FILE),
            isTextSuggestionDocument
          ),
          readOptionalJson<CoachReport>(path.join(folderPath, COACH_REPORT_FILE), isCoachReport)
        ]);
        sessions.push(
          toSavedSession(session, report, transcript, textSuggestions, coachReport, folderPath, sessionPath, recordingPath)
        );
      }
    } catch {
      // Ignore incomplete or manually edited session folders in this prototype.
    }
  }

  return sessions.sort((a, b) => b.session.createdAt.localeCompare(a.session.createdAt));
}

export async function saveSession(payload: SaveSessionPayload): Promise<SavedSession> {
  await ensureDataDirs();
  const safeFolderName = sanitizeFolderName(payload.session.createdAt);
  const folderPath = path.join(getDataDir(), SESSIONS_DIR, safeFolderName);
  const sessionPath = path.join(folderPath, SESSION_FILE);
  const recordingPath = path.join(folderPath, RECORDING_FILE);

  await mkdir(folderPath, { recursive: true });
  await writeFile(recordingPath, Buffer.from(new Uint8Array(payload.recordingData)));
  if (payload.transcriptionAudioData) {
    await writeFile(
      path.join(folderPath, TRANSCRIPTION_AUDIO_FILE),
      Buffer.from(new Uint8Array(payload.transcriptionAudioData))
    );
  }
  await writeJson(sessionPath, payload.session);
  if (payload.report) {
    await writeJson(path.join(folderPath, REPORT_FILE), payload.report);
  }
  if (payload.coachReport) {
    await writeJson(path.join(folderPath, COACH_REPORT_FILE), payload.coachReport);
  }

  return toSavedSession(
    payload.session,
    payload.report ?? null,
    null,
    null,
    payload.coachReport ?? null,
    folderPath,
    sessionPath,
    recordingPath
  );
}

export async function getSessionTranscriptionAudioPath(payload: SessionIdPayload): Promise<string> {
  const found = await findSessionFolder(payload.sessionId);
  return path.join(found.folderPath, TRANSCRIPTION_AUDIO_FILE);
}

export async function updateSession(payload: UpdateSessionPayload): Promise<SavedSession> {
  await ensureDataDirs();
  if (!isVoiceCoachSession(payload.session)) {
    throw new Error("Invalid session payload.");
  }

  const sessionsRoot = path.join(getDataDir(), SESSIONS_DIR);
  const entries = await readdir(sessionsRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const folderPath = path.join(sessionsRoot, entry.name);
    const sessionPath = path.join(folderPath, SESSION_FILE);
    const recordingPath = path.join(folderPath, RECORDING_FILE);

    try {
      const raw = await readFile(sessionPath, "utf8");
      const existing = JSON.parse(raw) as VoiceCoachSession;
      if (isVoiceCoachSession(existing) && existing.id === payload.session.id) {
        await writeJson(sessionPath, payload.session);
        const extras = await readSessionExtras(folderPath);
        return toSavedSession(
          payload.session,
          extras.report,
          extras.transcript,
          extras.textSuggestions,
          extras.coachReport,
          folderPath,
          sessionPath,
          recordingPath
        );
      }
    } catch {
      // Ignore incomplete or manually edited session folders in this prototype.
    }
  }

  throw new Error("Session was not found.");
}

export async function saveReport(payload: SaveReportPayload): Promise<SavedSession> {
  const found = await findSessionFolder(payload.sessionId);
  await writeJson(path.join(found.folderPath, REPORT_FILE), payload.report);
  const extras = await readSessionExtras(found.folderPath);
  return toSavedSession(
    found.session,
    extras.report,
    extras.transcript,
    extras.textSuggestions,
    extras.coachReport,
    found.folderPath,
    found.sessionPath,
    found.recordingPath
  );
}

export async function saveTranscript(payload: SaveTranscriptPayload): Promise<SavedSession> {
  const found = await findSessionFolder(payload.sessionId);
  await writeJson(path.join(found.folderPath, TRANSCRIPT_FILE), payload.transcript);
  await writeJson(path.join(found.folderPath, SUGGESTIONS_FILE), payload.textSuggestions);
  const extras = await readSessionExtras(found.folderPath);
  return toSavedSession(
    found.session,
    extras.report,
    extras.transcript,
    extras.textSuggestions,
    extras.coachReport,
    found.folderPath,
    found.sessionPath,
    found.recordingPath
  );
}

export async function saveCoachReport(payload: SaveCoachReportPayload): Promise<SavedSession> {
  const found = await findSessionFolder(payload.sessionId);
  await writeJson(path.join(found.folderPath, COACH_REPORT_FILE), payload.coachReport);
  const extras = await readSessionExtras(found.folderPath);
  return toSavedSession(
    found.session,
    extras.report,
    extras.transcript,
    extras.textSuggestions,
    extras.coachReport,
    found.folderPath,
    found.sessionPath,
    found.recordingPath
  );
}

export async function deleteSession(payload: SessionIdPayload): Promise<void> {
  const found = await findSessionFolder(payload.sessionId);
  await rm(found.folderPath, { recursive: true, force: true });
}

export async function exportSessionReport(payload: SessionIdPayload): Promise<string> {
  const found = await findSessionFolder(payload.sessionId);
  const extras = await readSessionExtras(found.folderPath);
  const exportPath = path.join(found.folderPath, "report.md");
  await writeFile(
    exportPath,
    buildMarkdownReport(found.session, extras.report, extras.transcript, extras.textSuggestions, extras.coachReport),
    "utf8"
  );
  return exportPath;
}

export async function exportProgressReport(): Promise<string> {
  const sessions = await listSessions();
  const summary = buildProgressSummary(sessions);
  const exportPath = path.join(getDataDir(), "progress-report.md");
  await writeFile(exportPath, buildProgressMarkdown(summary), "utf8");
  return exportPath;
}

export async function revealSessionFolder(payload: SessionIdPayload): Promise<string> {
  const found = await findSessionFolder(payload.sessionId);
  return shell.openPath(found.folderPath);
}

export async function revealDataFolder(): Promise<string> {
  await ensureDataDirs();
  return shell.openPath(getDataDir());
}

export async function getTrustSnapshot(): Promise<TrustSnapshot> {
  await ensureDataDirs();
  const sessionHealth = await inspectSessionFolders();
  const calibration = await loadCalibration();
  const writeCheck = await checkDataDirWritable();
  const checks: TrustCheck[] = [
    {
      id: "data-folder",
      label: "Local data folder",
      status: writeCheck.ok ? "pass" : "fail",
      detail: writeCheck.ok ? "VoiceCoach can write local files." : writeCheck.message,
      action: writeCheck.ok ? undefined : "Check Windows permissions or OneDrive sync locks."
    },
    {
      id: "calibration",
      label: "Calibration",
      status: calibration ? "pass" : "warning",
      detail: calibration ? "A microphone calibration profile is saved." : "No calibration profile is saved yet.",
      action: calibration ? undefined : "Run calibration before judging volume scores."
    },
    {
      id: "sessions",
      label: "Session files",
      status: sessionHealth.incompleteSessionCount === 0 ? "pass" : "warning",
      detail:
        sessionHealth.incompleteSessionCount === 0
          ? `${sessionHealth.validSessionCount} readable sessions found.`
          : `${sessionHealth.incompleteSessionCount} session folders need attention.`,
      action: sessionHealth.incompleteSessionCount === 0 ? undefined : "Open the data folder and inspect incomplete sessions."
    },
    {
      id: "recordings",
      label: "Recordings",
      status: sessionHealth.missingRecordingCount === 0 ? "pass" : "fail",
      detail:
        sessionHealth.missingRecordingCount === 0
          ? "Every readable session has a recording file."
          : `${sessionHealth.missingRecordingCount} sessions are missing recording.webm.`,
      action: sessionHealth.missingRecordingCount === 0 ? undefined : "Create a backup before deleting or editing sessions."
    },
    {
      id: "transcription",
      label: "Built-in transcription",
      status: process.platform === "win32" ? "pass" : "warning",
      detail:
        process.platform === "win32"
          ? "Windows speech recognition can be attempted locally."
          : "Built-in Windows transcription is only available on Windows.",
      action: process.platform === "win32" ? undefined : "Automatic transcription currently requires Windows."
    }
  ];

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    dataDir: getDataDir(),
    sessionCount: sessionHealth.sessionCount,
    validSessionCount: sessionHealth.validSessionCount,
    incompleteSessionCount: sessionHealth.incompleteSessionCount,
    missingRecordingCount: sessionHealth.missingRecordingCount,
    totalRecordingBytes: sessionHealth.totalRecordingBytes,
    latestSessionAt: sessionHealth.latestSessionAt,
    checks
  };
}

export async function createDataBackup(): Promise<DataBackupResult> {
  await ensureDataDirs();
  const createdAt = new Date().toISOString();
  const backupPath = path.join(getDataDir(), BACKUPS_DIR, `VoiceCoachBackup-${sanitizeFolderName(createdAt)}`);
  await mkdir(backupPath, { recursive: true });

  await copyOptionalFile(path.join(getDataDir(), CALIBRATION_FILE), path.join(backupPath, CALIBRATION_FILE));
  await copyOptionalFile(path.join(getDataDir(), SETTINGS_FILE), path.join(backupPath, SETTINGS_FILE));
  await copyDirectory(path.join(getDataDir(), SESSIONS_DIR), path.join(backupPath, SESSIONS_DIR));

  const sessionCount = (await listSessions()).length;
  const manifestPath = path.join(backupPath, BACKUP_MANIFEST_FILE);
  const manifest: DataBackupResult = {
    schemaVersion: 1,
    createdAt,
    backupPath,
    sessionCount,
    sizeBytes: 0
  };
  await writeJson(manifestPath, manifest);
  manifest.sizeBytes = await getDirectorySize(backupPath);
  await writeJson(manifestPath, manifest);
  return manifest;
}

function toSavedSession(
  session: VoiceCoachSession,
  report: AudioReport | null,
  transcript: TranscriptDocument | null,
  textSuggestions: TextSuggestionDocument | null,
  coachReport: CoachReport | null,
  folderPath: string,
  sessionPath: string,
  recordingPath: string
): SavedSession {
  return {
    session,
    report,
    transcript,
    textSuggestions,
    coachReport,
    folderPath,
    sessionPath,
    recordingPath,
    recordingUrl: pathToFileURL(recordingPath).toString()
  };
}

function sanitizeFolderName(value: string): string {
  return value.replace(/[:.]/g, "-").replace(/[^\w-]/g, "_");
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readOptionalJson<T>(filePath: string, validator: (value: unknown) => value is T): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return validator(parsed) ? parsed : null;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function readSessionExtras(folderPath: string): Promise<{
  report: AudioReport | null;
  transcript: TranscriptDocument | null;
  textSuggestions: TextSuggestionDocument | null;
  coachReport: CoachReport | null;
}> {
  const [report, transcript, textSuggestions, coachReport] = await Promise.all([
    readOptionalJson<AudioReport>(path.join(folderPath, REPORT_FILE), isAudioReport),
    readOptionalJson<TranscriptDocument>(path.join(folderPath, TRANSCRIPT_FILE), isTranscriptDocument),
    readOptionalJson<TextSuggestionDocument>(path.join(folderPath, SUGGESTIONS_FILE), isTextSuggestionDocument),
    readOptionalJson<CoachReport>(path.join(folderPath, COACH_REPORT_FILE), isCoachReport)
  ]);

  return { report, transcript, textSuggestions, coachReport };
}

async function inspectSessionFolders(): Promise<{
  sessionCount: number;
  validSessionCount: number;
  incompleteSessionCount: number;
  missingRecordingCount: number;
  totalRecordingBytes: number;
  latestSessionAt: string | null;
}> {
  const sessionsRoot = path.join(getDataDir(), SESSIONS_DIR);
  const entries = await readdir(sessionsRoot, { withFileTypes: true });
  let sessionCount = 0;
  let validSessionCount = 0;
  let incompleteSessionCount = 0;
  let missingRecordingCount = 0;
  let totalRecordingBytes = 0;
  let latestSessionAt: string | null = null;

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    sessionCount += 1;
    const folderPath = path.join(sessionsRoot, entry.name);
    const sessionPath = path.join(folderPath, SESSION_FILE);
    const recordingPath = path.join(folderPath, RECORDING_FILE);

    try {
      const raw = await readFile(sessionPath, "utf8");
      const session = JSON.parse(raw) as VoiceCoachSession;
      if (!isVoiceCoachSession(session)) {
        incompleteSessionCount += 1;
        continue;
      }

      validSessionCount += 1;
      if (latestSessionAt === null || session.createdAt > latestSessionAt) {
        latestSessionAt = session.createdAt;
      }

      try {
        const recordingStat = await stat(recordingPath);
        if (!recordingStat.isFile() || recordingStat.size <= 0) {
          missingRecordingCount += 1;
        } else {
          totalRecordingBytes += recordingStat.size;
        }
      } catch {
        missingRecordingCount += 1;
      }
    } catch {
      incompleteSessionCount += 1;
    }
  }

  return {
    sessionCount,
    validSessionCount,
    incompleteSessionCount,
    missingRecordingCount,
    totalRecordingBytes,
    latestSessionAt
  };
}

async function checkDataDirWritable(): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const testPath = path.join(getDataDir(), ".voicecoach-write-test");
  try {
    await writeFile(testPath, "ok", "utf8");
    await rm(testPath, { force: true });
    return { ok: true, message: "Writable" };
  } catch (error) {
    return { ok: false, message: formatStorageError(error) };
  }
}

async function copyOptionalFile(source: string, destination: string): Promise<void> {
  try {
    await copyFile(source, destination);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

async function copyDirectory(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      await copyFile(sourcePath, destinationPath);
    }
  }
}

async function getDirectorySize(directoryPath: string): Promise<number> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  let total = 0;

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      total += await getDirectorySize(entryPath);
    } else if (entry.isFile()) {
      total += (await stat(entryPath)).size;
    }
  }

  return total;
}

function formatStorageError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

async function findSessionFolder(sessionId: string): Promise<{
  session: VoiceCoachSession;
  folderPath: string;
  sessionPath: string;
  recordingPath: string;
}> {
  await ensureDataDirs();
  const sessionsRoot = path.join(getDataDir(), SESSIONS_DIR);
  const entries = await readdir(sessionsRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const folderPath = path.join(sessionsRoot, entry.name);
    const sessionPath = path.join(folderPath, SESSION_FILE);
    const recordingPath = path.join(folderPath, RECORDING_FILE);

    try {
      const raw = await readFile(sessionPath, "utf8");
      const session = JSON.parse(raw) as VoiceCoachSession;
      if (isVoiceCoachSession(session) && session.id === sessionId) {
        return { session, folderPath, sessionPath, recordingPath };
      }
    } catch {
      // Ignore incomplete or manually edited session folders in this prototype.
    }
  }

  throw new Error("Session was not found.");
}
