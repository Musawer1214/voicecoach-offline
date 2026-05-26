import { AudioReport, CoachReport, TextSuggestionDocument, TranscriptDocument, VoiceCoachSession } from "./types";

export function buildMarkdownReport(
  session: VoiceCoachSession,
  report: AudioReport | null,
  transcript: TranscriptDocument | null,
  textSuggestions: TextSuggestionDocument | null,
  coachReport: CoachReport | null = null
): string {
  const title = session.metadata?.title || "VoiceCoach Session";
  const lines = [
    `# ${title}`,
    "",
    `Created: ${session.createdAt}`,
    `Duration: ${formatMs(session.durationMs)}`,
    `Calibration: ${session.calibrationId ?? "none"}`,
    ""
  ];

  if (session.metadata?.prompt) {
    lines.push("## Practice Prompt", "", session.metadata.prompt, "");
  }

  if (session.metadata?.notes) {
    lines.push("## Notes", "", session.metadata.notes, "");
  }

  if (coachReport) {
    lines.push(
      "## Coach Mode",
      "",
      `Goal: ${coachReport.goalLabel}`,
      `Readiness score: ${coachReport.readinessScore}/100`,
      `Projection: ${coachReport.scores.projection}/100`,
      `Clarity: ${coachReport.scores.clarity}/100`,
      `Pacing: ${coachReport.scores.pacing}/100`,
      `Consistency: ${coachReport.scores.consistency}/100`,
      "",
      coachReport.summary,
      ""
    );

    if (coachReport.strengths.length > 0) {
      lines.push("### Strengths", "");
      for (const suggestion of coachReport.strengths) {
        lines.push(`- **${suggestion.title}**: ${suggestion.detail}`);
      }
      lines.push("");
    }

    if (coachReport.priorities.length > 0) {
      lines.push("### Priorities", "");
      for (const suggestion of coachReport.priorities) {
        lines.push(`- **${suggestion.title}**: ${suggestion.detail}`);
      }
      lines.push("");
    }

    lines.push(
      "### Next Drill",
      "",
      `**${coachReport.nextDrill.title}**: ${coachReport.nextDrill.detail}`,
      ""
    );
    for (const step of coachReport.nextDrill.steps) {
      lines.push(`- ${step}`);
    }
    lines.push("");
  }

  if (report) {
    lines.push(
      "## Audio Report",
      "",
      `Overall score: ${report.metrics.overallScore}/100`,
      `Target volume: ${report.metrics.targetVolumePercent}%`,
      `Low volume: ${report.metrics.lowVolumePercent}%`,
      `Speaking ratio: ${report.metrics.speakingRatioPercent}%`,
      `Volume consistency: ${report.metrics.volumeConsistencyScore}/100`,
      `Long pauses: ${report.metrics.longPauseCount}`,
      `Clipping events: ${report.metrics.clippingEventCount}`,
      ""
    );

    if (report.suggestions.length > 0) {
      lines.push("## Audio Suggestions", "");
      for (const suggestion of report.suggestions) {
        lines.push(`- **${suggestion.title}**: ${suggestion.detail}`);
      }
      lines.push("");
    }
  }

  if (transcript?.text.trim()) {
    lines.push("## Manual Transcript", "", transcript.text.trim(), "");
  }

  if (textSuggestions) {
    lines.push(
      "## Transcript Metrics",
      "",
      `Words: ${textSuggestions.metrics.wordCount}`,
      `Sentences: ${textSuggestions.metrics.sentenceCount}`,
      `Fillers: ${textSuggestions.metrics.fillerCount}`,
      `Repeated phrases: ${textSuggestions.metrics.repeatedPhraseCount}`,
      `Long sentences: ${textSuggestions.metrics.longSentenceCount}`,
      ""
    );

    if (textSuggestions.suggestions.length > 0) {
      lines.push("## Transcript Suggestions", "");
      for (const suggestion of textSuggestions.suggestions) {
        lines.push(`- **${suggestion.title}**: ${suggestion.detail}`);
      }
      lines.push("");
    }
  }

  return `${lines.join("\n")}\n`;
}

function formatMs(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
