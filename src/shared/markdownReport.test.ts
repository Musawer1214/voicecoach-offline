import { describe, expect, it } from "vitest";
import { AudioReport, TextSuggestionDocument, TranscriptDocument, VoiceCoachSession } from "./types";
import { buildMarkdownReport } from "./markdownReport";

describe("markdown report export", () => {
  it("includes audio, transcript, and text suggestions", () => {
    const markdown = buildMarkdownReport(makeSession(), makeReport(), makeTranscript(), makeTextSuggestions());

    expect(markdown).toContain("# Practice session");
    expect(markdown).toContain("## Audio Report");
    expect(markdown).toContain("## Manual Transcript");
    expect(markdown).toContain("This is my transcript.");
    expect(markdown).toContain("## Transcript Suggestions");
    expect(markdown).toContain("Reduce filler words");
  });
});

function makeSession(): VoiceCoachSession {
  return {
    schemaVersion: 1,
    id: "session-1",
    createdAt: "2026-05-25T00:00:00.000Z",
    durationMs: 65000,
    deviceId: "device-1",
    calibrationId: "calibration-1",
    metadata: {
      title: "Practice session",
      prompt: "Explain the app.",
      notes: "Focus on endings.",
      tags: [],
      updatedAt: "2026-05-25T00:00:00.000Z"
    },
    recordingFile: "recording.webm",
    samples: [],
    events: [],
    summary: {
      targetVolumePercent: 80,
      lowVolumeEventCount: 1,
      longestLowVolumeMs: 2000,
      silenceEventCount: 0
    }
  };
}

function makeReport(): AudioReport {
  return {
    schemaVersion: 1,
    analyzerVersion: "audio-report-v1",
    sessionId: "session-1",
    createdAt: "2026-05-25T00:00:00.000Z",
    calibrationSnapshot: null,
    metrics: {
      durationMs: 65000,
      speakingTimeMs: 50000,
      silenceTimeMs: 15000,
      speakingRatioPercent: 77,
      averageDb: -42,
      peakDb: -18,
      minDb: -70,
      targetVolumePercent: 80,
      lowVolumePercent: 8,
      lowVolumeMs: 4000,
      longestLowVolumeMs: 2000,
      longPauseCount: 1,
      longestPauseMs: 2500,
      clippingEventCount: 0,
      volumeConsistencyScore: 84,
      overallScore: 82
    },
    suggestions: [
      {
        id: "audio-good",
        category: "volume",
        severity: "success",
        title: "Volume stayed mostly on target",
        detail: "Most speaking samples were inside the target zone."
      }
    ]
  };
}

function makeTranscript(): TranscriptDocument {
  return {
    schemaVersion: 1,
    sessionId: "session-1",
    source: "manual",
    text: "This is my transcript.",
    updatedAt: "2026-05-25T00:00:00.000Z"
  };
}

function makeTextSuggestions(): TextSuggestionDocument {
  return {
    schemaVersion: 1,
    analyzerVersion: "text-suggestions-v1",
    sessionId: "session-1",
    updatedAt: "2026-05-25T00:00:00.000Z",
    metrics: {
      wordCount: 4,
      sentenceCount: 1,
      fillerCount: 1,
      repeatedPhraseCount: 0,
      longSentenceCount: 0
    },
    suggestions: [
      {
        id: "text-fillers",
        category: "transcript",
        severity: "info",
        title: "Reduce filler words",
        detail: "Found 1 filler word."
      }
    ]
  };
}
