import { CoachReport, PracticeGoalId, SavedSession } from "./types";

export type ProgressSkill = keyof CoachReport["scores"];

export type ProgressSessionRecord = {
  id: string;
  title: string;
  createdAt: string;
  durationMs: number;
  goalId: PracticeGoalId | "unknown";
  goalLabel: string;
  readinessScore: number | null;
  scores: CoachReport["scores"] | null;
  transcriptReady: boolean;
};

export type GoalProgressSummary = {
  goalId: PracticeGoalId | "unknown";
  goalLabel: string;
  sessionCount: number;
  averageReadinessScore: number | null;
  bestReadinessScore: number | null;
  latestReadinessScore: number | null;
  weakestSkill: ProgressSkill | null;
};

export type ProgressSummary = {
  generatedAt: string;
  sessionCount: number;
  coachReportCount: number;
  totalPracticeMs: number;
  averageReadinessScore: number | null;
  bestReadinessScore: number | null;
  latestReadinessScore: number | null;
  transcriptCoveragePercent: number;
  weakestSkill: ProgressSkill | null;
  records: ProgressSessionRecord[];
  goals: GoalProgressSummary[];
};

const SKILLS: ProgressSkill[] = ["projection", "clarity", "pacing", "consistency"];

export function buildProgressSummary(sessions: SavedSession[], generatedAt = new Date().toISOString()): ProgressSummary {
  const records = sessions.map(toProgressRecord).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const scoredRecords = records.filter((record) => record.readinessScore !== null);
  const totalPracticeMs = records.reduce((total, record) => total + record.durationMs, 0);
  const transcriptCoveragePercent =
    records.length === 0
      ? 0
      : Math.round((records.filter((record) => record.transcriptReady).length / records.length) * 100);

  return {
    generatedAt,
    sessionCount: records.length,
    coachReportCount: scoredRecords.length,
    totalPracticeMs,
    averageReadinessScore: average(scoredRecords.map((record) => record.readinessScore)),
    bestReadinessScore: max(scoredRecords.map((record) => record.readinessScore)),
    latestReadinessScore: scoredRecords[0]?.readinessScore ?? null,
    transcriptCoveragePercent,
    weakestSkill: weakestSkill(scoredRecords.map((record) => record.scores).filter(isScores)),
    records,
    goals: buildGoalSummaries(records)
  };
}

export function buildProgressMarkdown(summary: ProgressSummary): string {
  const lines = [
    "# VoiceCoach Progress Report",
    "",
    `Generated: ${summary.generatedAt}`,
    `Sessions: ${summary.sessionCount}`,
    `Coach reports: ${summary.coachReportCount}`,
    `Total practice time: ${formatMs(summary.totalPracticeMs)}`,
    `Average readiness: ${formatScore(summary.averageReadinessScore)}`,
    `Best readiness: ${formatScore(summary.bestReadinessScore)}`,
    `Latest readiness: ${formatScore(summary.latestReadinessScore)}`,
    `Transcript coverage: ${summary.transcriptCoveragePercent}%`,
    `Weakest skill: ${formatSkill(summary.weakestSkill)}`,
    ""
  ];

  if (summary.goals.length > 0) {
    lines.push("## Goals", "");
    for (const goal of summary.goals) {
      lines.push(
        `- **${goal.goalLabel}**: ${goal.sessionCount} session${goal.sessionCount === 1 ? "" : "s"}, average ${formatScore(
          goal.averageReadinessScore
        )}, latest ${formatScore(goal.latestReadinessScore)}, weakest ${formatSkill(goal.weakestSkill)}`
      );
    }
    lines.push("");
  }

  if (summary.records.length > 0) {
    lines.push("## Recent Sessions", "");
    for (const record of summary.records.slice(0, 12)) {
      lines.push(
        `- **${record.title}** (${record.createdAt}): ${record.goalLabel}, readiness ${formatScore(
          record.readinessScore
        )}, duration ${formatMs(record.durationMs)}`
      );
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function toProgressRecord(saved: SavedSession): ProgressSessionRecord {
  const coachReport = saved.coachReport;
  const goalId = saved.session.metadata?.goalId ?? coachReport?.goalId ?? "unknown";
  const goalLabel = saved.session.metadata?.goalLabel ?? coachReport?.goalLabel ?? "Unassigned";

  return {
    id: saved.session.id,
    title: saved.session.metadata?.title || new Date(saved.session.createdAt).toLocaleString(),
    createdAt: saved.session.createdAt,
    durationMs: saved.session.durationMs,
    goalId,
    goalLabel,
    readinessScore: coachReport?.readinessScore ?? null,
    scores: coachReport?.scores ?? null,
    transcriptReady: Boolean(saved.transcript?.text.trim())
  };
}

function buildGoalSummaries(records: ProgressSessionRecord[]): GoalProgressSummary[] {
  const byGoal = new Map<string, ProgressSessionRecord[]>();
  for (const record of records) {
    byGoal.set(record.goalId, [...(byGoal.get(record.goalId) ?? []), record]);
  }

  return [...byGoal.values()]
    .map((goalRecords) => {
      const scored = goalRecords.filter((record) => record.readinessScore !== null);
      const scoreSets = scored.map((record) => record.scores).filter(isScores);
      return {
        goalId: goalRecords[0].goalId,
        goalLabel: goalRecords[0].goalLabel,
        sessionCount: goalRecords.length,
        averageReadinessScore: average(scored.map((record) => record.readinessScore)),
        bestReadinessScore: max(scored.map((record) => record.readinessScore)),
        latestReadinessScore: scored[0]?.readinessScore ?? null,
        weakestSkill: weakestSkill(scoreSets)
      };
    })
    .sort((a, b) => b.sessionCount - a.sessionCount || a.goalLabel.localeCompare(b.goalLabel));
}

function weakestSkill(scoreSets: CoachReport["scores"][]): ProgressSkill | null {
  if (scoreSets.length === 0) {
    return null;
  }

  return SKILLS.map((skill) => ({
    skill,
    value: average(scoreSets.map((scores) => scores[skill])) ?? 0
  })).sort((a, b) => a.value - b.value)[0].skill;
}

function isScores(value: CoachReport["scores"] | null): value is CoachReport["scores"] {
  return value !== null;
}

function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => typeof value === "number");
  if (valid.length === 0) {
    return null;
  }

  return Math.round(valid.reduce((total, value) => total + value, 0) / valid.length);
}

function max(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => typeof value === "number");
  return valid.length === 0 ? null : Math.max(...valid);
}

function formatScore(value: number | null): string {
  return value === null ? "--" : `${value}/100`;
}

function formatSkill(value: ProgressSkill | null): string {
  return value ? value[0].toUpperCase() + value.slice(1) : "--";
}

function formatMs(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
