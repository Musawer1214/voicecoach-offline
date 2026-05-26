import { app, shell } from "electron";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  AppSettings,
  AudioReport,
  CalibrationProfile,
  CoachReport,
  SavedSession,
  SaveCoachReportPayload,
  SaveReportPayload,
  SaveSessionPayload,
  SaveTranscriptPayload,
  SessionIdPayload,
  TextSuggestionDocument,
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
const REPORT_FILE = "report.json";
const TRANSCRIPT_FILE = "transcript.json";
const SUGGESTIONS_FILE = "suggestions.json";
const COACH_REPORT_FILE = "coach-report.json";

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
