import { describe, expect, it } from "vitest";
import { CoachReport, VoiceCoachSession, isCoachReport, isVoiceCoachSession } from "./types";

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
