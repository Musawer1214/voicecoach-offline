import { BrowserWindow, app, ipcMain } from "electron";
import path from "node:path";
import {
  deleteSession,
  ensureDataDirs,
  exportSessionReport,
  getDataDir,
  listSessions,
  loadCalibration,
  loadSettings,
  revealSessionFolder,
  saveCalibration,
  saveReport,
  saveSession,
  saveSettings,
  saveTranscript,
  updateSession
} from "./storage.js";
import {
  AppSettings,
  CalibrationProfile,
  SaveReportPayload,
  SaveSessionPayload,
  SaveTranscriptPayload,
  SessionIdPayload,
  UpdateSessionPayload
} from "../shared/types.js";

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
  ipcMain.handle("sessions:delete", (_event, payload: SessionIdPayload) => deleteSession(payload));
  ipcMain.handle("sessions:export-report", (_event, payload: SessionIdPayload) => exportSessionReport(payload));
  ipcMain.handle("sessions:reveal-folder", (_event, payload: SessionIdPayload) => revealSessionFolder(payload));
}
