import { app, shell } from "electron";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  AppSettings,
  AudioReport,
  CalibrationProfile,
  SavedSession,
  SaveReportPayload,
  SaveSessionPayload,
  SaveTranscriptPayload,
  SessionIdPayload,
  TextSuggestionDocument,
  TranscriptDocument,
  UpdateSessionPayload,
  VoiceCoachSession,
  isAudioReport,
  isTextSuggestionDocument,
  isTranscriptDocument,
  isVoiceCoachSession
} from "../shared/types.js";

const DATA_DIR_NAME = "VoiceCoachData";
const CALIBRATION_FILE = "calibration.json";
const SETTINGS_FILE = "settings.json";
const SESSIONS_DIR = "sessions";
const SESSION_FILE = "session.json";
const RECORDING_FILE = "recording.webm";
const REPORT_FILE = "report.json";
const TRANSCRIPT_FILE = "transcript.json";
const SUGGESTIONS_FILE = "suggestions.json";

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
        const [report, transcript, textSuggestions] = await Promise.all([
          readOptionalJson<AudioReport>(path.join(folderPath, REPORT_FILE), isAudioReport),
          readOptionalJson<TranscriptDocument>(path.join(folderPath, TRANSCRIPT_FILE), isTranscriptDocument),
          readOptionalJson<TextSuggestionDocument>(
            path.join(folderPath, SUGGESTIONS_FILE),
            isTextSuggestionDocument
          )
        ]);
        sessions.push(toSavedSession(session, report, transcript, textSuggestions, folderPath, sessionPath, recordingPath));
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

  return toSavedSession(payload.session, payload.report ?? null, null, null, folderPath, sessionPath, recordingPath);
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
  await writeFile(exportPath, buildMarkdownReport(found.session, extras.report), "utf8");
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
  folderPath: string,
  sessionPath: string,
  recordingPath: string
): SavedSession {
  return {
    session,
    report,
    transcript,
    textSuggestions,
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
}> {
  const [report, transcript, textSuggestions] = await Promise.all([
    readOptionalJson<AudioReport>(path.join(folderPath, REPORT_FILE), isAudioReport),
    readOptionalJson<TranscriptDocument>(path.join(folderPath, TRANSCRIPT_FILE), isTranscriptDocument),
    readOptionalJson<TextSuggestionDocument>(path.join(folderPath, SUGGESTIONS_FILE), isTextSuggestionDocument)
  ]);

  return { report, transcript, textSuggestions };
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

function buildMarkdownReport(session: VoiceCoachSession, report: AudioReport | null): string {
  const title = session.metadata?.title || "VoiceCoach Session";
  const lines = [
    `# ${title}`,
    "",
    `Created: ${session.createdAt}`,
    `Duration: ${formatMs(session.durationMs)}`,
    `Calibration: ${session.calibrationId ?? "none"}`,
    ""
  ];

  if (session.metadata?.prompt) {
    lines.push("## Practice Prompt", "", session.metadata.prompt, "");
  }

  if (session.metadata?.notes) {
    lines.push("## Notes", "", session.metadata.notes, "");
  }

  if (report) {
    lines.push(
      "## Audio Report",
      "",
      `Overall score: ${report.metrics.overallScore}/100`,
      `Target volume: ${report.metrics.targetVolumePercent}%`,
      `Low volume: ${report.metrics.lowVolumePercent}%`,
      `Speaking ratio: ${report.metrics.speakingRatioPercent}%`,
      `Volume consistency: ${report.metrics.volumeConsistencyScore}/100`,
      `Long pauses: ${report.metrics.longPauseCount}`,
      `Clipping events: ${report.metrics.clippingEventCount}`,
      ""
    );

    if (report.suggestions.length > 0) {
      lines.push("## Suggestions", "");
      for (const suggestion of report.suggestions) {
        lines.push(`- **${suggestion.title}**: ${suggestion.detail}`);
      }
      lines.push("");
    }
  }

  return `${lines.join("\n")}\n`;
}

function formatMs(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
