import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildTextSuggestions } from "./suggestions";

describe("text suggestions", () => {
  beforeAll(() => {
    vi.setSystemTime(new Date("2026-05-25T00:02:00.000Z"));
  });

  it("detects filler words, repetition, and long sentences", () => {
    const text =
      "So um I want to explain my project and you know I will explain my project and I will explain my project because it is basically a tool that helps me practice speaking with better volume and clarity while reviewing my recording afterward.";

    const result = buildTextSuggestions("session-1", text);

    expect(result.schemaVersion).toBe(1);
    expect(result.metrics.fillerCount).toBeGreaterThanOrEqual(3);
    expect(result.metrics.repeatedPhraseCount).toBeGreaterThan(0);
    expect(result.metrics.longSentenceCount).toBe(1);
    expect(result.suggestions.map((suggestion) => suggestion.id)).toContain("text-fillers");
    expect(result.suggestions.map((suggestion) => suggestion.id)).toContain("text-long-sentences");
  });

  it("returns a positive suggestion for concise text", () => {
    const result = buildTextSuggestions("session-1", "VoiceCoach helps me practice a clear speaking volume.");

    expect(result.metrics.wordCount).toBe(8);
    expect(result.suggestions[0].severity).toBe("success");
  });

  it("returns an actionable message for empty transcript text", () => {
    const result = buildTextSuggestions("session-1", "");

    expect(result.metrics.wordCount).toBe(0);
    expect(result.suggestions[0].id).toBe("text-empty");
  });
});
