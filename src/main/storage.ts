import { app } from "electron";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  CalibrationProfile,
  SavedSession,
  SaveSessionPayload,
  VoiceCoachSession,
  isVoiceCoachSession
} from "../shared/types.js";

const DATA_DIR_NAME = "VoiceCoachData";
const CALIBRATION_FILE = "calibration.json";
const SESSIONS_DIR = "sessions";

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
    const sessionPath = path.join(folderPath, "session.json");
    const recordingPath = path.join(folderPath, "recording.webm");

    try {
      const raw = await readFile(sessionPath, "utf8");
      const session = JSON.parse(raw) as VoiceCoachSession;
      if (isVoiceCoachSession(session)) {
        sessions.push(toSavedSession(session, folderPath, sessionPath, recordingPath));
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
  const sessionPath = path.join(folderPath, "session.json");
  const recordingPath = path.join(folderPath, "recording.webm");

  await mkdir(folderPath, { recursive: true });
  await writeFile(recordingPath, Buffer.from(new Uint8Array(payload.recordingData)));
  await writeJson(sessionPath, payload.session);

  return toSavedSession(payload.session, folderPath, sessionPath, recordingPath);
}

function toSavedSession(
  session: VoiceCoachSession,
  folderPath: string,
  sessionPath: string,
  recordingPath: string
): SavedSession {
  return {
    session,
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
