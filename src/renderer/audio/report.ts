import {
  AudioReport,
  CalibrationProfile,
  CoachingSuggestion,
  VoiceCoachSession,
  VolumeSample
} from "../../shared/types";

const ANALYZER_VERSION = "audio-report-v1";
const LONG_PAUSE_MS = 2000;
const CLIPPING_DB = -3;

export function buildAudioReport(
  session: VoiceCoachSession,
  calibrationSnapshot: CalibrationProfile | null
): AudioReport {
  const samples = session.samples;
  const sampleMs = inferSampleMs(samples);
  const speakingSamples = samples.filter((sample) => sample.speaking);
  const silentSamples = samples.filter((sample) => !sample.speaking);
  const lowSamples =
    calibrationSnapshot === null
      ? []
      : speakingSamples.filter((sample) => sample.db < calibrationSnapshot.lowThresholdDb);
  const clippingSamples = samples.filter((sample) => sample.db >= CLIPPING_DB || sample.rms >= 0.95);
  const lowVolumeEvents = session.events.filter((event) => event.type === "low_volume");
  const silenceEvents = session.events.filter((event) => event.type === "silence");
  const longPauses = silenceEvents.filter((event) => event.endMs - event.startMs >= LONG_PAUSE_MS);
  const averageSpeechDb = averageDb(speakingSamples);
  const peakDb = samples.length > 0 ? roundDb(Math.max(...samples.map((sample) => sample.db))) : null;
  const minDb = samples.length > 0 ? roundDb(Math.min(...samples.map((sample) => sample.db))) : null;
  const speakingTimeMs = Math.min(session.durationMs, speakingSamples.length * sampleMs);
  const silenceTimeMs = Math.min(session.durationMs, silentSamples.length * sampleMs);
  const lowVolumeMs = Math.min(session.durationMs, lowSamples.length * sampleMs);
  const targetVolumePercent = session.summary.targetVolumePercent;
  const lowVolumePercent = speakingTimeMs === 0 ? 0 : roundPercent((lowVolumeMs / speakingTimeMs) * 100);
  const speakingRatioPercent =
    session.durationMs === 0 ? 0 : roundPercent((speakingTimeMs / session.durationMs) * 100);
  const volumeConsistencyScore = calculateConsistencyScore(speakingSamples);
  const clippingEventCount = groupNearbySamples(clippingSamples, sampleMs).length;
  const longestPauseMs = longPauses.reduce((longest, event) => Math.max(longest, event.endMs - event.startMs), 0);
  const overallScore = calculateOverallScore({
    targetVolumePercent,
    lowVolumePercent,
    speakingRatioPercent,
    volumeConsistencyScore,
    clippingEventCount,
    longPauseCount: longPauses.length
  });
  const metrics = {
    durationMs: session.durationMs,
    speakingTimeMs,
    silenceTimeMs,
    speakingRatioPercent,
    averageDb: averageSpeechDb,
    peakDb,
    minDb,
    targetVolumePercent,
    lowVolumePercent,
    lowVolumeMs,
    longestLowVolumeMs: session.summary.longestLowVolumeMs,
    longPauseCount: longPauses.length,
    longestPauseMs,
    clippingEventCount,
    volumeConsistencyScore,
    overallScore
  };

  return {
    schemaVersion: 1,
    analyzerVersion: ANALYZER_VERSION,
    sessionId: session.id,
    createdAt: new Date().toISOString(),
    calibrationSnapshot,
    metrics,
    suggestions: buildAudioSuggestions(session, metrics, calibrationSnapshot, lowVolumeEvents, longPauses)
  };
}

function buildAudioSuggestions(
  session: VoiceCoachSession,
  metrics: AudioReport["metrics"],
  calibrationSnapshot: CalibrationProfile | null,
  lowVolumeEvents: VoiceCoachSession["events"],
  longPauses: VoiceCoachSession["events"]
): CoachingSuggestion[] {
  const suggestions: CoachingSuggestion[] = [];

  if (!calibrationSnapshot) {
    suggestions.push({
      id: "audio-calibration-missing",
      category: "calibration",
      severity: "warning",
      title: "Record after calibration",
      detail: "This session has no calibration snapshot, so target-volume feedback is less reliable."
    });
  }

  if (metrics.targetVolumePercent >= 75 && metrics.lowVolumePercent <= 10) {
    suggestions.push({
      id: "audio-volume-good",
      category: "volume",
      severity: "success",
      title: "Volume stayed mostly on target",
      detail: "Most speaking samples were inside the calibrated target zone."
    });
  } else if (metrics.lowVolumePercent >= 20) {
    const firstLow = lowVolumeEvents[0];
    suggestions.push({
      id: "audio-low-volume",
      category: "volume",
      severity: "warning",
      title: "Low-volume stretches need attention",
      detail: `${metrics.lowVolumePercent}% of speaking time was below the low-volume threshold.`,
      startMs: firstLow?.startMs,
      endMs: firstLow?.endMs
    });
  }

  if (metrics.volumeConsistencyScore < 65) {
    suggestions.push({
      id: "audio-consistency",
      category: "consistency",
      severity: "info",
      title: "Practice steadier projection",
      detail: "Your speaking volume varied enough that some words may sound less clear."
    });
  }

  if (metrics.longPauseCount > 0) {
    const firstPause = longPauses[0];
    suggestions.push({
      id: "audio-long-pauses",
      category: "silence",
      severity: "info",
      title: "Review long pauses",
      detail: `${metrics.longPauseCount} pause${metrics.longPauseCount === 1 ? "" : "s"} lasted at least 2 seconds.`,
      startMs: firstPause?.startMs,
      endMs: firstPause?.endMs
    });
  }

  if (metrics.clippingEventCount > 0) {
    suggestions.push({
      id: "audio-clipping",
      category: "clipping",
      severity: "warning",
      title: "Possible clipping detected",
      detail: "The microphone signal reached the top of the scale. Move slightly farther away or lower input gain."
    });
  }

  if (suggestions.length === 0 && session.samples.length > 0) {
    suggestions.push({
      id: "audio-next-practice",
      category: "consistency",
      severity: "info",
      title: "Repeat with the same prompt",
      detail: "Use the same speaking topic again and try to improve target-volume time by 5%."
    });
  }

  return suggestions;
}

function inferSampleMs(samples: VolumeSample[]): number {
  if (samples.length < 2) {
    return 100;
  }

  const deltas = samples
    .slice(1)
    .map((sample, index) => sample.tMs - samples[index].tMs)
    .filter((delta) => delta > 0)
    .sort((a, b) => a - b);

  return deltas.length === 0 ? 100 : deltas[Math.floor(deltas.length / 2)];
}

function averageDb(samples: VolumeSample[]): number | null {
  if (samples.length === 0) {
    return null;
  }

  return roundDb(samples.reduce((total, sample) => total + sample.db, 0) / samples.length);
}

function calculateConsistencyScore(samples: VolumeSample[]): number {
  if (samples.length < 2) {
    return 0;
  }

  const avg = samples.reduce((total, sample) => total + sample.db, 0) / samples.length;
  const variance = samples.reduce((total, sample) => total + (sample.db - avg) ** 2, 0) / samples.length;
  const standardDeviation = Math.sqrt(variance);
  return clampScore(100 - standardDeviation * 12);
}

function calculateOverallScore(input: {
  targetVolumePercent: number;
  lowVolumePercent: number;
  speakingRatioPercent: number;
  volumeConsistencyScore: number;
  clippingEventCount: number;
  longPauseCount: number;
}): number {
  const targetScore = input.targetVolumePercent;
  const lowPenalty = input.lowVolumePercent * 0.8;
  const pausePenalty = Math.min(20, input.longPauseCount * 4);
  const clippingPenalty = Math.min(20, input.clippingEventCount * 5);
  const speakingBalance =
    input.speakingRatioPercent < 20 ? 40 : input.speakingRatioPercent > 95 ? 70 : 100;

  return clampScore(
    targetScore * 0.45 +
      input.volumeConsistencyScore * 0.25 +
      speakingBalance * 0.2 +
      10 -
      lowPenalty -
      pausePenalty -
      clippingPenalty
  );
}

function groupNearbySamples(samples: VolumeSample[], sampleMs: number): VolumeSample[][] {
  const groups: VolumeSample[][] = [];

  for (const sample of samples) {
    const previousGroup = groups.at(-1);
    const previousSample = previousGroup?.at(-1);
    if (previousGroup && previousSample && sample.tMs - previousSample.tMs <= sampleMs * 2) {
      previousGroup.push(sample);
    } else {
      groups.push([sample]);
    }
  }

  return groups;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function roundPercent(value: number): number {
  return Math.round(value);
}

function roundDb(value: number): number {
  return Math.round(value * 10) / 10;
}
