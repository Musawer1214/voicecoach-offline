import { CalibrationProfile, SessionEvent, VoiceCoachSession, VolumeSample } from "../../shared/types";
import { isSpeakingFrame } from "./level";

const LOW_VOLUME_MIN_MS = 1500;
const SILENCE_MIN_MS = 3000;

export function analyzeSessionSamples(
  samples: VolumeSample[],
  calibration: CalibrationProfile | null
): SessionEvent[] {
  const events: SessionEvent[] = [];
  if (samples.length === 0) {
    return events;
  }

  let lowStart: number | null = null;
  let lowSamples: VolumeSample[] = [];
  let silenceStart: number | null = null;

  for (const sample of samples) {
    const low =
      Boolean(calibration) && sample.speaking && sample.db < (calibration as CalibrationProfile).lowThresholdDb;

    if (low) {
      lowStart ??= sample.tMs;
      lowSamples.push(sample);
    } else if (lowStart !== null) {
      maybePushLowEvent(events, lowStart, sample.tMs, lowSamples);
      lowStart = null;
      lowSamples = [];
    }

    if (!sample.speaking) {
      silenceStart ??= sample.tMs;
    } else if (silenceStart !== null) {
      maybePushSilenceEvent(events, silenceStart, sample.tMs);
      silenceStart = null;
    }
  }

  const finalTime = samples[samples.length - 1].tMs;
  if (lowStart !== null) {
    maybePushLowEvent(events, lowStart, finalTime, lowSamples);
  }
  if (silenceStart !== null) {
    maybePushSilenceEvent(events, silenceStart, finalTime);
  }

  return events;
}

export function buildSessionSummary(
  samples: VolumeSample[],
  events: SessionEvent[],
  calibration: CalibrationProfile | null
): VoiceCoachSession["summary"] {
  const speakingSamples = samples.filter((sample) => sample.speaking);
  const targetSamples =
    calibration === null
      ? []
      : speakingSamples.filter(
          (sample) => sample.db >= calibration.targetMinDb && sample.db <= calibration.targetMaxDb
        );
  const lowVolumeEvents = events.filter((event) => event.type === "low_volume");

  return {
    targetVolumePercent:
      speakingSamples.length === 0 ? 0 : Math.round((targetSamples.length / speakingSamples.length) * 100),
    lowVolumeEventCount: lowVolumeEvents.length,
    longestLowVolumeMs: lowVolumeEvents.reduce(
      (longest, event) => Math.max(longest, event.endMs - event.startMs),
      0
    ),
    silenceEventCount: events.filter((event) => event.type === "silence").length
  };
}

export function reanalyzeSessionWithCalibration(
  session: VoiceCoachSession,
  calibration: CalibrationProfile
): VoiceCoachSession {
  const samples = session.samples.map((sample) => ({
    ...sample,
    speaking: isSpeakingFrame(sample.db, calibration.noiseFloorDb)
  }));
  const events = analyzeSessionSamples(samples, calibration);

  return {
    ...session,
    calibrationId: calibration.id,
    samples,
    events,
    summary: buildSessionSummary(samples, events, calibration)
  };
}

function maybePushLowEvent(
  events: SessionEvent[],
  startMs: number,
  endMs: number,
  samples: VolumeSample[]
): void {
  if (endMs - startMs < LOW_VOLUME_MIN_MS || samples.length === 0) {
    return;
  }

  events.push({
    id: crypto.randomUUID(),
    type: "low_volume",
    startMs,
    endMs,
    minDb: roundDb(Math.min(...samples.map((sample) => sample.db))),
    averageDb: roundDb(samples.reduce((total, sample) => total + sample.db, 0) / samples.length)
  });
}

function maybePushSilenceEvent(events: SessionEvent[], startMs: number, endMs: number): void {
  if (endMs - startMs < SILENCE_MIN_MS) {
    return;
  }

  events.push({
    id: crypto.randomUUID(),
    type: "silence",
    startMs,
    endMs
  });
}

function roundDb(value: number): number {
  return Math.round(value * 10) / 10;
}
