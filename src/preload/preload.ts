import { contextBridge, ipcRenderer } from "electron";
import {
  AppMeta,
  AppSettings,
  CalibrationProfile,
  SaveCoachReportPayload,
  SaveReportPayload,
  SavedSession,
  SaveSessionPayload,
  SaveTranscriptPayload,
  SessionIdPayload,
  TranscriptionEvent,
  TranscriptionStartOptions,
  TranscriptionStartResult,
  UpdateSessionPayload,
  VoiceCoachApi
} from "../shared/types.js";

const api: VoiceCoachApi = {
  getAppMeta: () => ipcRenderer.invoke("app:get-meta") as Promise<AppMeta>,
  loadSettings: () => ipcRenderer.invoke("settings:load") as Promise<AppSettings | null>,
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings) as Promise<AppSettings>,
  loadCalibration: () => ipcRenderer.invoke("calibration:load") as Promise<CalibrationProfile | null>,
  saveCalibration: (profile) => ipcRenderer.invoke("calibration:save", profile) as Promise<CalibrationProfile>,
  listSessions: () => ipcRenderer.invoke("sessions:list") as Promise<SavedSession[]>,
  saveSession: (payload: SaveSessionPayload) =>
    ipcRenderer.invoke("sessions:save", payload) as Promise<SavedSession>,
  updateSession: (payload: UpdateSessionPayload) =>
    ipcRenderer.invoke("sessions:update", payload) as Promise<SavedSession>,
  saveReport: (payload: SaveReportPayload) =>
    ipcRenderer.invoke("sessions:save-report", payload) as Promise<SavedSession>,
  saveTranscript: (payload: SaveTranscriptPayload) =>
    ipcRenderer.invoke("sessions:save-transcript", payload) as Promise<SavedSession>,
  saveCoachReport: (payload: SaveCoachReportPayload) =>
    ipcRenderer.invoke("sessions:save-coach-report", payload) as Promise<SavedSession>,
  deleteSession: (payload: SessionIdPayload) => ipcRenderer.invoke("sessions:delete", payload) as Promise<void>,
  exportSessionReport: (payload: SessionIdPayload) =>
    ipcRenderer.invoke("sessions:export-report", payload) as Promise<string>,
  exportProgressReport: () => ipcRenderer.invoke("sessions:export-progress") as Promise<string>,
  revealSessionFolder: (payload: SessionIdPayload) =>
    ipcRenderer.invoke("sessions:reveal-folder", payload) as Promise<string>,
  startTranscription: (options?: TranscriptionStartOptions) =>
    ipcRenderer.invoke("transcription:start", options) as Promise<TranscriptionStartResult>,
  stopTranscription: () => ipcRenderer.invoke("transcription:stop") as Promise<void>,
  onTranscriptionEvent: (callback: (event: TranscriptionEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TranscriptionEvent) => callback(payload);
    ipcRenderer.on("transcription:event", listener);
    return () => ipcRenderer.removeListener("transcription:event", listener);
  }
};

contextBridge.exposeInMainWorld("voiceCoach", api);
