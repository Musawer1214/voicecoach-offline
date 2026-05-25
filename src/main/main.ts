import { BrowserWindow, app, ipcMain } from "electron";
import path from "node:path";
import {
  ensureDataDirs,
  getDataDir,
  listSessions,
  loadCalibration,
  saveCalibration,
  saveSession
} from "./storage.js";
import { CalibrationProfile, SaveSessionPayload } from "../shared/types.js";

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

  ipcMain.handle("calibration:load", () => loadCalibration());
  ipcMain.handle("calibration:save", (_event, profile: CalibrationProfile) => saveCalibration(profile));
  ipcMain.handle("sessions:list", () => listSessions());
  ipcMain.handle("sessions:save", (_event, payload: SaveSessionPayload) => saveSession(payload));
}
