import { describe, expect, it } from "vitest";
import {
  CoachReport,
  TranscriptDocument,
  VoiceCoachSession,
  isCoachReport,
  isTranscriptDocument,
  isVoiceCoachSession
} from "./types";

describe("VoiceCoach session schema", () => {
  it("validates required schemaVersion 1 fields", () => {
    const session: VoiceCoachSession = {
      schemaVersion: 1,
      id: "session-1",
      createdAt: "2026-05-25T00:00:00.000Z",
      durationMs: 1000,
      deviceId: "device-1",
      calibrationId: null,
      recordingFile: "recording.webm",
      samples: [],
      events: [],
      summary: {
        targetVolumePercent: 0,
        lowVolumeEventCount: 0,
        longestLowVolumeMs: 0,
        silenceEventCount: 0
      }
    };

    expect(isVoiceCoachSession(session)).toBe(true);
    expect(isVoiceCoachSession({ ...session, schemaVersion: 2 })).toBe(false);
  });

  it("accepts video sessions and built-in transcription documents", () => {
    const session: VoiceCoachSession = {
      schemaVersion: 1,
      id: "session-video-1",
      createdAt: "2026-05-26T00:00:00.000Z",
      durationMs: 3000,
      deviceId: "device-1",
      calibrationId: null,
      recordingFile: "recording.webm",
      recordingKind: "video",
      cameraDeviceId: "camera-1",
      cameraSettings: {
        resolution: "1280x720",
        frameRate: 30,
        mirrored: true
      },
      samples: [],
      events: [],
      summary: {
        targetVolumePercent: 0,
        lowVolumeEventCount: 0,
        longestLowVolumeMs: 0,
        silenceEventCount: 0
      }
    };

    expect(isVoiceCoachSession(session)).toBe(true);

    const transcript: TranscriptDocument = {
      schemaVersion: 1,
      sessionId: "session-video-1",
      source: "windows_builtin",
      text: "This was captured by the built-in recognizer.",
      updatedAt: "2026-05-26T00:00:01.000Z"
    };

    expect(isTranscriptDocument(transcript)).toBe(true);
  });

  it("validates coach report schemaVersion 1 fields", () => {
    const report: CoachReport = {
      schemaVersion: 1,
      analyzerVersion: "coach-report-v1",
      sessionId: "session-1",
      createdAt: "2026-05-26T00:00:00.000Z",
      goalId: "projection",
      goalLabel: "Voice Projection",
      readinessScore: 81,
      scores: {
        projection: 82,
        clarity: 78,
        pacing: 80,
        consistency: 83
      },
      summary: "Ready for the next practice pass.",
      strengths: [],
      priorities: [],
      nextDrill: {
        title: "Projection baseline drill",
        detail: "Repeat the same prompt.",
        steps: ["Keep the meter in the target zone."]
      }
    };

    expect(isCoachReport(report)).toBe(true);
    expect(isCoachReport({ ...report, goalId: "unknown" })).toBe(false);
  });
});
