import { describe, expect, it } from "vitest";
import { CoachReport, SavedSession, VoiceCoachSession } from "./types";
import { buildProgressMarkdown, buildProgressSummary } from "./progress";

describe("progress summary", () => {
  it("aggregates readiness, goals, transcript coverage, and weakest skill", () => {
    const summary = buildProgressSummary(
      [
        makeSavedSession("one", "projection", 80, { projection: 82, clarity: 70, pacing: 76, consistency: 88 }, true),
        makeSavedSession("two", "projection", 60, { projection: 58, clarity: 66, pacing: 72, consistency: 62 }, false),
        makeSavedSession("three", "clarity", 90, { projection: 88, clarity: 80, pacing: 84, consistency: 85 }, true)
      ],
      "2026-05-26T00:00:00.000Z"
    );

    expect(summary.sessionCount).toBe(3);
    expect(summary.coachReportCount).toBe(3);
    expect(summary.averageReadinessScore).toBe(77);
    expect(summary.bestReadinessScore).toBe(90);
    expect(summary.transcriptCoveragePercent).toBe(67);
    expect(summary.weakestSkill).toBe("clarity");
    expect(summary.goals[0].goalId).toBe("projection");
  });

  it("exports a readable markdown progress report", () => {
    const summary = buildProgressSummary(
      [makeSavedSession("one", "projection", 80, { projection: 82, clarity: 70, pacing: 76, consistency: 88 }, true)],
      "2026-05-26T00:00:00.000Z"
    );
    const markdown = buildProgressMarkdown(summary);

    expect(markdown).toContain("# VoiceCoach Progress Report");
    expect(markdown).toContain("Average readiness: 80/100");
    expect(markdown).toContain("## Goals");
  });
});

function makeSavedSession(
  id: string,
  goalId: "projection" | "clarity",
  readinessScore: number,
  scores: CoachReport["scores"],
  withTranscript: boolean
): SavedSession {
  const session: VoiceCoachSession = {
    schemaVersion: 1,
    id,
    createdAt: `2026-05-26T00:0${id.length}:00.000Z`,
    durationMs: 60_000,
    deviceId: "mic",
    calibrationId: "cal",
    metadata: {
      title: `Session ${id}`,
      prompt: "",
      notes: "",
      tags: [],
      goalId,
      goalLabel: goalId === "projection" ? "Voice Projection" : "Clear Speaking",
      updatedAt: "2026-05-26T00:00:00.000Z"
    },
    recordingFile: "recording.webm",
    samples: [],
    events: [],
    summary: {
      targetVolumePercent: readinessScore,
      lowVolumeEventCount: 0,
      longestLowVolumeMs: 0,
      silenceEventCount: 0
    }
  };

  return {
    session,
    report: null,
    transcript: withTranscript
      ? {
          schemaVersion: 1,
          sessionId: id,
          source: "manual",
          text: "This is a transcript.",
          updatedAt: "2026-05-26T00:00:00.000Z"
        }
      : null,
    textSuggestions: null,
    coachReport: {
      schemaVersion: 1,
      analyzerVersion: "coach-report-v1",
      sessionId: id,
      createdAt: "2026-05-26T00:00:00.000Z",
      goalId,
      goalLabel: goalId === "projection" ? "Voice Projection" : "Clear Speaking",
      readinessScore,
      scores,
      summary: "Summary",
      strengths: [],
      priorities: [],
      nextDrill: {
        title: "Drill",
        detail: "Detail",
        steps: ["Step"]
      }
    },
    folderPath: "",
    sessionPath: "",
    recordingPath: "",
    recordingUrl: ""
  };
}
