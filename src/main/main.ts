import { BrowserWindow, app, ipcMain } from "electron";
import path from "node:path";
import {
  deleteSession,
  ensureDataDirs,
  createDataBackup,
  exportProgressReport,
  exportSessionReport,
  getDataDir,
  getSessionTranscriptionAudioPath,
  getTrustSnapshot,
  listSessions,
  loadCalibration,
  loadSettings,
  revealSessionFolder,
  revealDataFolder,
  saveCalibration,
  saveCoachReport,
  saveReport,
  saveSession,
  saveSettings,
  saveTranscript,
  updateSession
} from "./storage.js";
import {
  AppSettings,
  CalibrationProfile,
  SaveCoachReportPayload,
  SaveReportPayload,
  SaveSessionPayload,
  SaveTranscriptPayload,
  SessionIdPayload,
  UpdateSessionPayload
} from "../shared/types.js";
import { startTranscription, stopTranscription, transcribeWaveFile } from "./transcription.js";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "VoiceCoach Offline",
    backgroundColor: "#f7f8fb",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "../preload/preload.js")
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await ensureDataDirs();
  registerIpcHandlers();
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  stopTranscription();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function registerIpcHandlers(): void {
  ipcMain.handle("app:get-meta", () => ({
    appName: app.getName(),
    version: app.getVersion(),
    dataDir: getDataDir()
  }));

  ipcMain.handle("settings:load", () => loadSettings());
  ipcMain.handle("settings:save", (_event, settings: AppSettings) => saveSettings(settings));
  ipcMain.handle("calibration:load", () => loadCalibration());
  ipcMain.handle("calibration:save", (_event, profile: CalibrationProfile) => saveCalibration(profile));
  ipcMain.handle("sessions:list", () => listSessions());
  ipcMain.handle("sessions:save", (_event, payload: SaveSessionPayload) => saveSession(payload));
  ipcMain.handle("sessions:update", (_event, payload: UpdateSessionPayload) => updateSession(payload));
  ipcMain.handle("sessions:save-report", (_event, payload: SaveReportPayload) => saveReport(payload));
  ipcMain.handle("sessions:save-transcript", (_event, payload: SaveTranscriptPayload) => saveTranscript(payload));
  ipcMain.handle("sessions:save-coach-report", (_event, payload: SaveCoachReportPayload) =>
    saveCoachReport(payload)
  );
  ipcMain.handle("sessions:delete", (_event, payload: SessionIdPayload) => deleteSession(payload));
  ipcMain.handle("sessions:export-report", (_event, payload: SessionIdPayload) => exportSessionReport(payload));
  ipcMain.handle("sessions:export-progress", () => exportProgressReport());
  ipcMain.handle("sessions:reveal-folder", (_event, payload: SessionIdPayload) => revealSessionFolder(payload));
  ipcMain.handle("data:reveal-folder", () => revealDataFolder());
  ipcMain.handle("data:trust-snapshot", () => getTrustSnapshot());
  ipcMain.handle("data:create-backup", () => createDataBackup());
  ipcMain.handle("transcription:start", (_event, options) => startTranscription(mainWindow, options));
  ipcMain.handle("transcription:stop", () => {
    stopTranscription();
  });
  ipcMain.handle("transcription:transcribe-session", async (_event, payload: SessionIdPayload) => {
    const audioPath = await getSessionTranscriptionAudioPath(payload);
    return transcribeWaveFile(audioPath, { provider: "windows_system_speech", culture: "en-US" });
  });
}
