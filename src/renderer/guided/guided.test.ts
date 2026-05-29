import { describe, expect, it } from "vitest";
import {
  buildGuidedComparison,
  buildGuidedSessionPlan,
  buildRetryGuidedSessionPlan,
  chooseRecommendedTrack
} from "./guided";
import { SavedSession } from "../../shared/types";

describe("guided practice", () => {
  it("starts with a baseline when no matching guided session exists", () => {
    const plan = buildGuidedSessionPlan("projection", []);

    expect(plan.attempt).toBe("baseline");
    expect(plan.title).toContain("baseline");
    expect(plan.previousSessionId).toBeNull();
  });

  it("uses retry mode when a matching guided session exists", () => {
    const previous = makeSavedSession("one", "projection", 58);
    const plan = buildGuidedSessionPlan("projection", [previous]);

    expect(plan.attempt).toBe("retry");
    expect(plan.previousSessionId).toBe("one");
    expect(plan.prompt).toContain("Repeat");
  });

  it("recommends a guided track from the weakest latest score", () => {
    const latest = makeSavedSession("latest", "projection", 60, {
      projection: 80,
      clarity: 82,
      pacing: 48,
      consistency: 77
    });

    expect(chooseRecommendedTrack([latest], "projection").id).toBe("pacing");
  });

  it("builds retry plans from the session prompt", () => {
    const saved = makeSavedSession("saved", "clarity", 70);
    saved.session.metadata!.prompt = "Explain my project clearly.";

    const plan = buildRetryGuidedSessionPlan(saved, [saved]);

    expect(plan.attempt).toBe("retry");
    expect(plan.prompt).toBe("Explain my project clearly.");
    expect(plan.previousSessionId).toBe("saved");
  });

  it("compares current guided score with the previous matching track", () => {
    const previous = makeSavedSession("old", "confidence", 61, undefined, "2026-05-20T10:00:00.000Z");
    const current = makeSavedSession("new", "confidence", 68, undefined, "2026-05-21T10:00:00.000Z");

    const comparison = buildGuidedComparison(current, [current, previous]);

    expect(comparison?.delta).toBe(7);
    expect(comparison?.message).toContain("Improved");
  });
});

function makeSavedSession(
  id: string,
  trackId: "projection" | "clarity" | "pacing" | "interview" | "confidence",
  readinessScore: number,
  scores = {
    projection: readinessScore,
    clarity: readinessScore,
    pacing: readinessScore,
    consistency: readinessScore
  },
  createdAt = "2026-05-20T10:00:00.000Z"
): SavedSession {
  return {
    session: {
      schemaVersion: 1,
      id,
      createdAt,
      durationMs: 60_000,
      deviceId: "mic",
      calibrationId: "cal",
      metadata: {
        title: "Guided",
        prompt: "Prompt",
        notes: "",
        tags: [],
        goalId: trackId,
        goalLabel: trackId,
        guidedTrackId: trackId,
        guidedTrackLabel: trackId,
        guidedAttempt: "baseline",
        updatedAt: createdAt
      },
      recordingFile: "recording.webm",
      samples: [],
      events: [],
      summary: {
        targetVolumePercent: 80,
        lowVolumeEventCount: 0,
        longestLowVolumeMs: 0,
        silenceEventCount: 0
      }
    },
    report: null,
    transcript: null,
    textSuggestions: null,
    coachReport: {
      schemaVersion: 1,
      analyzerVersion: "coach-report-v1",
      sessionId: id,
      createdAt,
      goalId: trackId,
      goalLabel: trackId,
      readinessScore,
      scores,
      summary: "",
      strengths: [],
      priorities: [],
      nextDrill: {
        title: "",
        detail: "",
        steps: []
      }
    },
    folderPath: "",
    sessionPath: "",
    recordingPath: "",
    recordingUrl: ""
  };
}
