import { PracticeGoalId, SavedSession } from "../../shared/types";
import { resolvePracticeGoal } from "../coach/coach";

export type GuidedPracticeTrack = {
  id: PracticeGoalId;
  label: string;
  shortLabel: string;
  headline: string;
  focus: string;
  warmup: string;
  baselinePrompt: string;
  retryPrompt: string;
  successMetric: string;
};

export type GuidedSessionPlan = {
  track: GuidedPracticeTrack;
  attempt: "baseline" | "retry";
  title: string;
  prompt: string;
  notes: string;
  previousSessionId: string | null;
};

export type GuidedComparison = {
  trackLabel: string;
  previousScore: number | null;
  currentScore: number | null;
  delta: number | null;
  previousSessionId: string | null;
  message: string;
};

export const GUIDED_TRACKS: readonly GuidedPracticeTrack[] = [
  {
    id: "projection",
    label: "Voice Projection",
    shortLabel: "Projection",
    headline: "Stay audible without forcing volume.",
    focus: "Hold the meter inside the target zone while speaking naturally.",
    warmup: "Read one sentence at target volume, breathe, then repeat it once.",
    baselinePrompt: "Explain what VoiceCoach Offline does in one minute.",
    retryPrompt: "Repeat the same explanation and keep your volume above the low threshold.",
    successMetric: "More target-zone time and fewer low-volume events."
  },
  {
    id: "clarity",
    label: "Clear Speaking",
    shortLabel: "Clarity",
    headline: "Make each point easier to understand.",
    focus: "Use shorter sentences and reduce filler words.",
    warmup: "Say the main point in one sentence before recording.",
    baselinePrompt: "Describe a recent project or idea in three clear points.",
    retryPrompt: "Repeat the same three points with shorter sentences and fewer filler words.",
    successMetric: "Higher clarity score and fewer transcript suggestions."
  },
  {
    id: "pacing",
    label: "Pacing Control",
    shortLabel: "Pacing",
    headline: "Use clean pauses without long silence.",
    focus: "Pause briefly between ideas, not inside each sentence.",
    warmup: "Say one sentence, pause for one second, then say the next sentence.",
    baselinePrompt: "Teach a simple concept for one minute with deliberate pauses.",
    retryPrompt: "Teach the same concept again with shorter pauses and steady rhythm.",
    successMetric: "Better pacing score and fewer long silence events."
  },
  {
    id: "interview",
    label: "Interview Answer",
    shortLabel: "Interview",
    headline: "Answer with structure and enough confidence.",
    focus: "Use situation, action, result, then stop.",
    warmup: "Practice the first sentence twice before recording.",
    baselinePrompt: "Tell me about a challenge you solved and what changed afterward.",
    retryPrompt: "Retake the same answer with a clearer situation, action, and result.",
    successMetric: "Balanced projection, clarity, and pacing."
  },
  {
    id: "confidence",
    label: "Confident Delivery",
    shortLabel: "Confidence",
    headline: "Sound steady from the first sentence.",
    focus: "Start strong, keep volume steady, and avoid drifting quieter.",
    warmup: "Sit or stand upright and say the opening sentence at target volume.",
    baselinePrompt: "Give a short confident introduction of yourself or your work.",
    retryPrompt: "Repeat the introduction with a stronger first sentence and steadier ending.",
    successMetric: "Higher consistency and projection scores."
  }
];

export function resolveGuidedTrack(value: unknown): GuidedPracticeTrack {
  const goal = resolvePracticeGoal(value);
  return GUIDED_TRACKS.find((track) => track.id === goal.id) ?? GUIDED_TRACKS[0];
}

export function chooseRecommendedTrack(
  sessions: SavedSession[],
  fallbackGoalId: PracticeGoalId = "projection"
): GuidedPracticeTrack {
  const latestScored = sessions.find((session) => session.coachReport);
  if (!latestScored?.coachReport) {
    return resolveGuidedTrack(fallbackGoalId);
  }

  const scores = latestScored.coachReport.scores;
  const weakest = Object.entries(scores).sort(([, left], [, right]) => left - right)[0]?.[0];
  if (weakest === "clarity") {
    return resolveGuidedTrack("clarity");
  }
  if (weakest === "pacing") {
    return resolveGuidedTrack("pacing");
  }
  if (weakest === "consistency") {
    return resolveGuidedTrack("confidence");
  }
  return resolveGuidedTrack("projection");
}

export function buildGuidedSessionPlan(trackId: PracticeGoalId, sessions: SavedSession[]): GuidedSessionPlan {
  const track = resolveGuidedTrack(trackId);
  const previous = findPreviousGuidedSession(track.id, sessions);
  const attempt = previous ? "retry" : "baseline";
  const prompt = attempt === "retry" ? track.retryPrompt : track.baselinePrompt;

  return {
    track,
    attempt,
    title: `${track.shortLabel} ${attempt === "retry" ? "retry" : "baseline"}`,
    prompt,
    notes: `Warmup: ${track.warmup}\nFocus: ${track.focus}\nSuccess: ${track.successMetric}`,
    previousSessionId: previous?.session.id ?? null
  };
}

export function buildRetryGuidedSessionPlan(saved: SavedSession, sessions: SavedSession[]): GuidedSessionPlan {
  const track = resolveGuidedTrack(saved.session.metadata?.guidedTrackId ?? saved.session.metadata?.goalId);
  const plan = buildGuidedSessionPlan(track.id, sessions);
  return {
    ...plan,
    attempt: "retry",
    title: `${track.shortLabel} retry`,
    prompt: saved.session.metadata?.prompt || track.retryPrompt,
    previousSessionId: saved.session.id
  };
}

export function buildGuidedComparison(current: SavedSession, sessions: SavedSession[]): GuidedComparison | null {
  const trackId = current.session.metadata?.guidedTrackId;
  if (!trackId) {
    return null;
  }

  const track = resolveGuidedTrack(trackId);
  const previous = findPreviousGuidedSession(track.id, sessions, current.session.id, current.session.createdAt);
  const currentScore = current.coachReport?.readinessScore ?? null;
  const previousScore = previous?.coachReport?.readinessScore ?? null;
  const delta = currentScore !== null && previousScore !== null ? currentScore - previousScore : null;

  return {
    trackLabel: track.label,
    previousScore,
    currentScore,
    delta,
    previousSessionId: previous?.session.id ?? null,
    message: buildComparisonMessage(delta, currentScore, previousScore)
  };
}

function findPreviousGuidedSession(
  trackId: PracticeGoalId,
  sessions: SavedSession[],
  excludeSessionId?: string,
  beforeCreatedAt?: string
): SavedSession | null {
  return (
    sessions
      .filter((saved) => {
        if (saved.session.id === excludeSessionId) {
          return false;
        }
        if (saved.session.metadata?.guidedTrackId !== trackId) {
          return false;
        }
        if (beforeCreatedAt && saved.session.createdAt >= beforeCreatedAt) {
          return false;
        }
        return true;
      })
      .sort((left, right) => right.session.createdAt.localeCompare(left.session.createdAt))[0] ?? null
  );
}

function buildComparisonMessage(delta: number | null, currentScore: number | null, previousScore: number | null): string {
  if (currentScore === null) {
    return "Record with Coach Mode available to compare this guided attempt.";
  }
  if (previousScore === null) {
    return "This is the baseline. Retake the same prompt to compare improvement.";
  }
  if (delta === null) {
    return "Retake the same prompt to compare improvement.";
  }
  if (delta > 0) {
    return `Improved by ${delta} point${delta === 1 ? "" : "s"} from the last guided attempt.`;
  }
  if (delta < 0) {
    return `Dropped by ${Math.abs(delta)} point${Math.abs(delta) === 1 ? "" : "s"}. Repeat the same prompt once more.`;
  }
  return "Matched the previous score. Try one focused retake to break the tie.";
}
