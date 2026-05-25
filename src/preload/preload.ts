import { contextBridge, ipcRenderer } from "electron";
import {
  AppMeta,
  CalibrationProfile,
  SavedSession,
  SaveSessionPayload,
  UpdateSessionPayload,
  VoiceCoachApi
} from "../shared/types.js";

const api: VoiceCoachApi = {
  getAppMeta: () => ipcRenderer.invoke("app:get-meta") as Promise<AppMeta>,
  loadCalibration: () => ipcRenderer.invoke("calibration:load") as Promise<CalibrationProfile | null>,
  saveCalibration: (profile) => ipcRenderer.invoke("calibration:save", profile) as Promise<CalibrationProfile>,
  listSessions: () => ipcRenderer.invoke("sessions:list") as Promise<SavedSession[]>,
  saveSession: (payload: SaveSessionPayload) =>
    ipcRenderer.invoke("sessions:save", payload) as Promise<SavedSession>,
  updateSession: (payload: UpdateSessionPayload) =>
    ipcRenderer.invoke("sessions:update", payload) as Promise<SavedSession>
};

contextBridge.exposeInMainWorld("voiceCoach", api);
