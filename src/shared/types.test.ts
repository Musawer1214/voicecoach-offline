import { describe, expect, it } from "vitest";
import { VoiceCoachSession, isVoiceCoachSession } from "./types";

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
});
