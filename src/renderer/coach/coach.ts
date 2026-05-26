import {
  AudioReport,
  CoachReport,
  CoachingSuggestion,
  PracticeGoal,
  PracticeGoalId,
  TextSuggestionDocument,
  VoiceCoachSession,
  isPracticeGoalId
} from "../../shared/types";

const ANALYZER_VERSION = "coach-report-v1";

export const PRACTICE_GOALS: readonly PracticeGoal[] = [
  {
    id: "projection",
    label: "Voice Projection",
    detail: "Stay audible, steady, and inside the calibrated target zone."
  },
  {
    id: "clarity",
    label: "Clear Speaking",
    detail: "Reduce filler words, shorten sentences, and make each point easier to follow."
  },
  {
    id: "pacing",
    label: "Pacing Control",
    detail: "Use cleaner pauses without drifting into long silence or rushed delivery."
  },
  {
    id: "interview",
    label: "Interview Answer",
    detail: "Practice a focused answer with enough volume, structure, and confidence."
  },
  {
    id: "confidence",
    label: "Confident Delivery",
    detail: "Balance projection, steadiness, and clear phrasing across the whole take."
  }
];

export function resolvePracticeGoal(value: unknown): PracticeGoal {
  const id = isPracticeGoalId(value) ? value : "projection";
  return PRACTICE_GOALS.find((goal) => goal.id === id) ?? PRACTICE_GOALS[0];
}

export function buildCoachReport(
  session: VoiceCoachSession,
  audioReport: AudioReport | null,
  textSuggestions: TextSuggestionDocument | null,
  goalId: PracticeGoalId = resolvePracticeGoal(session.metadata?.goalId).id
): CoachReport {
  const goal = resolvePracticeGoal(goalId);
  const scores = buildScores(audioReport, textSuggestions);
  const readinessScore = calculateReadinessScore(scores, goal.id);
  const strengths = buildStrengths(scores, audioReport, textSuggestions);
  const priorities = buildPriorities(scores, audioReport, textSuggestions, session);

  return {
    schemaVersion: 1,
    analyzerVersion: ANALYZER_VERSION,
    sessionId: session.id,
    createdAt: new Date().toISOString(),
    goalId: goal.id,
    goalLabel: goal.label,
    readinessScore,
    scores,
    summary: buildSummary(readinessScore, goal.label, priorities),
    strengths,
    priorities,
    nextDrill: buildNextDrill(goal.id, priorities)
  };
}

function buildScores(
  audioReport: AudioReport | null,
  textSuggestions: TextSuggestionDocument | null
): CoachReport["scores"] {
  const audioMetrics = audioReport?.metrics;
  const textMetrics = textSuggestions?.metrics;
  const hasTranscript = Boolean(textMetrics && textMetrics.wordCount > 0);

  const projection = audioMetrics
    ? clampScore(
        audioMetrics.targetVolumePercent * 0.52 +
          (100 - audioMetrics.lowVolumePercent) * 0.18 +
          audioMetrics.volumeConsistencyScore * 0.2 +
          10 -
          audioMetrics.clippingEventCount * 5
      )
    : 50;

  const clarity = textMetrics && hasTranscript
    ? clampScore(
        100 -
          textMetrics.fillerCount * 4 -
          textMetrics.longSentenceCount * 8 -
          textMetrics.repeatedPhraseCount * 7
      )
    : 55;

  const pacing = audioMetrics
    ? clampScore(
        scoreSpeakingRatio(audioMetrics.speakingRatioPercent) -
          audioMetrics.longPauseCount * 6 -
          (textMetrics?.longSentenceCount ?? 0) * 3
      )
    : 55;

  const consistency = audioMetrics
    ? clampScore(audioMetrics.volumeConsistencyScore - audioMetrics.clippingEventCount * 4)
    : 55;

  return { projection, clarity, pacing, consistency };
}

function calculateReadinessScore(scores: CoachReport["scores"], goalId: PracticeGoalId): number {
  const weights: Record<PracticeGoalId, CoachReport["scores"]> = {
    projection: { projection: 0.45, clarity: 0.15, pacing: 0.15, consistency: 0.25 },
    clarity: { projection: 0.2, clarity: 0.45, pacing: 0.2, consistency: 0.15 },
    pacing: { projection: 0.15, clarity: 0.2, pacing: 0.45, consistency: 0.2 },
    interview: { projection: 0.3, clarity: 0.3, pacing: 0.2, consistency: 0.2 },
    confidence: { projection: 0.3, clarity: 0.2, pacing: 0.15, consistency: 0.35 }
  };
  const goalWeights = weights[goalId];

  return clampScore(
    scores.projection * goalWeights.projection +
      scores.clarity * goalWeights.clarity +
      scores.pacing * goalWeights.pacing +
      scores.consistency * goalWeights.consistency
  );
}

function buildStrengths(
  scores: CoachReport["scores"],
  audioReport: AudioReport | null,
  textSuggestions: TextSuggestionDocument | null
): CoachingSuggestion[] {
  const strengths: CoachingSuggestion[] = [];

  if (scores.projection >= 75) {
    strengths.push({
      id: "coach-strength-projection",
      category: "volume",
      severity: "success",
      title: "Projection is working",
      detail: "Your calibrated volume stayed strong enough for this goal."
    });
  }

  if (scores.consistency >= 75) {
    strengths.push({
      id: "coach-strength-consistency",
      category: "consistency",
      severity: "success",
      title: "Delivery is steady",
      detail: "Volume changes were controlled enough that words should stay easier to follow."
    });
  }

  if (scores.clarity >= 75 && textSuggestions?.metrics.wordCount) {
    strengths.push({
      id: "coach-strength-clarity",
      category: "clarity",
      severity: "success",
      title: "Transcript reads clearly",
      detail: "The local text checker found few filler, repetition, or long-sentence issues."
    });
  }

  if (audioReport?.metrics.longPauseCount === 0 && audioReport.metrics.speakingRatioPercent >= 35) {
    strengths.push({
      id: "coach-strength-pacing",
      category: "pacing",
      severity: "success",
      title: "Pauses are under control",
      detail: "No long pauses were detected in this session."
    });
  }

  return strengths.slice(0, 3);
}

function buildPriorities(
  scores: CoachReport["scores"],
  audioReport: AudioReport | null,
  textSuggestions: TextSuggestionDocument | null,
  session: VoiceCoachSession
): CoachingSuggestion[] {
  const priorities: CoachingSuggestion[] = [];

  if (!audioReport) {
    priorities.push({
      id: "coach-priority-audio-report",
      category: "coach",
      severity: "warning",
      title: "Generate an audio report",
      detail: "Coach Mode needs an audio report before it can score projection and pacing reliably."
    });
  }

  if (!session.calibrationId) {
    priorities.push({
      id: "coach-priority-calibration",
      category: "calibration",
      severity: "warning",
      title: "Record with calibration",
      detail: "Calibration gives the app a personal target zone for low-volume warnings."
    });
  }

  if (scores.projection < 70) {
    priorities.push({
      id: "coach-priority-projection",
      category: "volume",
      severity: "warning",
      title: "Raise your baseline volume",
      detail: "Aim to keep more of the session inside the target zone before adding harder goals.",
      startMs: firstEventStart(session, "low_volume")
    });
  }

  if (scores.consistency < 70) {
    priorities.push({
      id: "coach-priority-consistency",
      category: "consistency",
      severity: "info",
      title: "Smooth out volume swings",
      detail: "Try speaking one sentence at a time while holding the meter near the center of the target band."
    });
  }

  if (!textSuggestions || textSuggestions.metrics.wordCount === 0) {
    priorities.push({
      id: "coach-priority-transcript",
      category: "transcript",
      severity: "info",
      title: "Add a transcript for clarity coaching",
      detail: "Manual transcript text unlocks grammar, filler-word, and sentence-length suggestions."
    });
  } else if (scores.clarity < 70) {
    priorities.push({
      id: "coach-priority-clarity",
      category: "clarity",
      severity: "warning",
      title: "Clean up phrasing",
      detail: "Reduce fillers and break long sentences so the spoken answer is easier to understand."
    });
  }

  if (scores.pacing < 70) {
    priorities.push({
      id: "coach-priority-pacing",
      category: "pacing",
      severity: "info",
      title: "Improve pause control",
      detail: "Use short intentional pauses instead of long silent gaps or rushed sections.",
      startMs: firstEventStart(session, "silence")
    });
  }

  return priorities.slice(0, 4);
}

function buildSummary(score: number, goalLabel: string, priorities: CoachingSuggestion[]): string {
  if (score >= 80) {
    return `${goalLabel} is close to release-ready for this practice level. Repeat once and try to beat the same score.`;
  }

  if (score >= 65) {
    return `${goalLabel} is usable, but one focused drill should make the next take cleaner.`;
  }

  const topPriority = priorities[0]?.title.toLowerCase() ?? "the biggest coaching priority";
  return `${goalLabel} needs another pass. Start with ${topPriority} before extending the session length.`;
}

function buildNextDrill(goalId: PracticeGoalId, priorities: CoachingSuggestion[]): CoachReport["nextDrill"] {
  const priorityTitle = priorities[0]?.title ?? "the main coaching priority";

  if (goalId === "clarity") {
    return {
      title: "30-second clarity retake",
      detail: `Retake the same idea while focusing on ${priorityTitle.toLowerCase()}.`,
      steps: [
        "Write one sentence for the main point.",
        "Record a 30-second answer with no filler reset words.",
        "Paste the transcript and compare the clarity score."
      ]
    };
  }

  if (goalId === "pacing") {
    return {
      title: "Pause ladder drill",
      detail: `Practice controlled pauses while watching for ${priorityTitle.toLowerCase()}.`,
      steps: [
        "Speak one sentence.",
        "Pause for one second.",
        "Repeat for five sentences without crossing into long silence."
      ]
    };
  }

  if (goalId === "interview") {
    return {
      title: "STAR answer retake",
      detail: `Use a tighter answer structure while improving ${priorityTitle.toLowerCase()}.`,
      steps: [
        "State the situation in one sentence.",
        "Explain the task and action clearly.",
        "End with the result and stop recording."
      ]
    };
  }

  if (goalId === "confidence") {
    return {
      title: "Confident opener drill",
      detail: `Start stronger and keep attention on ${priorityTitle.toLowerCase()}.`,
      steps: [
        "Stand or sit upright before recording.",
        "Say the first sentence twice at target volume.",
        "Record the full answer and keep the meter steady."
      ]
    };
  }

  return {
    title: "Projection baseline drill",
    detail: `Repeat the same prompt while focusing on ${priorityTitle.toLowerCase()}.`,
    steps: [
      "Speak one sentence at the center of the target zone.",
      "Pause briefly and breathe.",
      "Continue for one minute without letting the meter drop below target."
    ]
  };
}

function scoreSpeakingRatio(value: number): number {
  if (value < 25) {
    return 45;
  }

  if (value > 92) {
    return 72;
  }

  if (value >= 45 && value <= 82) {
    return 100;
  }

  return 82;
}

function firstEventStart(session: VoiceCoachSession, type: "low_volume" | "silence"): number | undefined {
  return session.events.find((event) => event.type === type)?.startMs;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}
