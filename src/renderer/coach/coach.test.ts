import { describe, expect, it } from "vitest";
import { AudioReport, TextSuggestionDocument, VoiceCoachSession } from "../../shared/types";
import { buildCoachReport } from "./coach";

const baseSession: VoiceCoachSession = {
  schemaVersion: 1,
  id: "session-1",
  createdAt: "2026-05-26T00:00:00.000Z",
  durationMs: 60_000,
  deviceId: "mic-1",
  calibrationId: "cal-1",
  metadata: {
    title: "Test",
    prompt: "",
    notes: "",
    tags: [],
    goalId: "projection",
    goalLabel: "Voice Projection",
    updatedAt: "2026-05-26T00:00:00.000Z"
  },
  recordingFile: "recording.webm",
  samples: [],
  events: [],
  summary: {
    targetVolumePercent: 82,
    lowVolumeEventCount: 0,
    longestLowVolumeMs: 0,
    silenceEventCount: 0
  }
};

const goodAudioReport: AudioReport = {
  schemaVersion: 1,
  analyzerVersion: "audio-report-v1",
  sessionId: "session-1",
  createdAt: "2026-05-26T00:00:00.000Z",
  calibrationSnapshot: null,
  metrics: {
    durationMs: 60_000,
    speakingTimeMs: 42_000,
    silenceTimeMs: 18_000,
    speakingRatioPercent: 70,
    averageDb: -42,
    peakDb: -30,
    minDb: -62,
    targetVolumePercent: 82,
    lowVolumePercent: 6,
    lowVolumeMs: 2000,
    longestLowVolumeMs: 800,
    longPauseCount: 0,
    longestPauseMs: 0,
    clippingEventCount: 0,
    volumeConsistencyScore: 84,
    overallScore: 82
  },
  suggestions: []
};

const cleanTextSuggestions: TextSuggestionDocument = {
  schemaVersion: 1,
  analyzerVersion: "text-suggestions-v1",
  sessionId: "session-1",
  updatedAt: "2026-05-26T00:00:00.000Z",
  metrics: {
    wordCount: 90,
    sentenceCount: 8,
    fillerCount: 0,
    repeatedPhraseCount: 0,
    longSentenceCount: 0
  },
  suggestions: []
};

describe("Coach Mode report", () => {
  it("builds a strong readiness report from good audio and clean transcript metrics", () => {
    const report = buildCoachReport(baseSession, goodAudioReport, cleanTextSuggestions, "projection");

    expect(report.schemaVersion).toBe(1);
    expect(report.analyzerVersion).toBe("coach-report-v1");
    expect(report.goalId).toBe("projection");
    expect(report.readinessScore).toBeGreaterThanOrEqual(80);
    expect(report.strengths.length).toBeGreaterThan(0);
  });

  it("adds a transcript priority when clarity data is missing", () => {
    const report = buildCoachReport(baseSession, goodAudioReport, null, "clarity");

    expect(report.scores.clarity).toBe(55);
    expect(report.priorities.some((priority) => priority.id === "coach-priority-transcript")).toBe(true);
  });

  it("weights projection more heavily for the projection goal", () => {
    const weakProjectionAudio: AudioReport = {
      ...goodAudioReport,
      metrics: {
        ...goodAudioReport.metrics,
        targetVolumePercent: 35,
        lowVolumePercent: 45,
        volumeConsistencyScore: 55,
        overallScore: 45
      }
    };

    const projectionReport = buildCoachReport(baseSession, weakProjectionAudio, cleanTextSuggestions, "projection");
    const clarityReport = buildCoachReport(baseSession, weakProjectionAudio, cleanTextSuggestions, "clarity");

    expect(projectionReport.readinessScore).toBeLessThan(clarityReport.readinessScore);
    expect(projectionReport.priorities.some((priority) => priority.id === "coach-priority-projection")).toBe(true);
  });
});
