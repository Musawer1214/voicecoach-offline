# Architecture

VoiceCoach Offline uses Electron, React, TypeScript, and Vite.

## Layers

### Electron Main Process

Responsibilities:

- app lifecycle
- window creation
- local data directory management
- saving calibration JSON
- saving session folders
- exposing safe IPC handlers

Key files:

- `src/main/main.ts`
- `src/main/storage.ts`

### Preload Bridge

Responsibilities:

- expose a small typed API to the renderer
- prevent direct filesystem access from React
- keep `contextIsolation` enabled

Key file:

- `src/preload/preload.ts`

### React Renderer

Responsibilities:

- microphone access
- live Web Audio analysis
- calibration flow
- practice flow
- recording controls
- review screen and timeline display
- Coach Mode scoring and progress display
- Progress Coach aggregation and progress export
- Guided Practice planning and retry comparison
- local data trust checks and backup actions
- progressive disclosure for advanced UI controls

Key files:

- `src/renderer/App.tsx`
- `src/renderer/audio/level.ts`
- `src/renderer/audio/calibration.ts`
- `src/renderer/audio/events.ts`
- `src/renderer/audio/report.ts`
- `src/renderer/coach/coach.ts`
- `src/renderer/guided/guided.ts`
- `src/renderer/text/suggestions.ts`
- `src/shared/progress.ts`

## UI Flow

`0.9.0` organizes the renderer around a guided beginner path:

```text
Home -> Guided Practice -> Review -> Retry or Progress
```

Advanced controls remain in the app, but are grouped behind disclosure sections:

- calibration keeps microphone selection and the live meter visible, with processing and numeric threshold details collapsed
- practice keeps the guided plan, camera/meter/recording surface, and preflight status visible, with capture options and prompts collapsed
- review keeps playback, timeline, summary metrics, guided comparison, and Coach Mode feedback visible, with reports, transcript tools, metadata, and file paths collapsed
- settings starts with local data trust, backup, and data-folder actions, then groups device, camera/transcription, and playback/app information into separate sections

## Local Data Contract

Data is stored locally under Electron's user data path:

```text
VoiceCoachData/
  calibration.json
  settings.json
  sessions/
    <session-date>/
      recording.webm
      session.json
      report.json
      coach-report.json
      transcript.json
      suggestions.json
      report.md
  progress-report.md
  backups/
    VoiceCoachBackup-<date>/
      backup-manifest.json
      calibration.json
      settings.json
      sessions/
```

`calibration.json`:

```ts
type CalibrationProfile = {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  deviceId: string;
  deviceLabel: string;
  sampleDurationMs: number;
  noiseFloorDb: number;
  speechAverageDb: number;
  targetMinDb: number;
  targetMaxDb: number;
  lowThresholdDb: number;
};
```

`coach-report.json`:

```ts
type CoachReport = {
  schemaVersion: 1;
  analyzerVersion: "coach-report-v1";
  sessionId: string;
  createdAt: string;
  goalId: PracticeGoalId;
  goalLabel: string;
  readinessScore: number;
  scores: {
    projection: number;
    clarity: number;
    pacing: number;
    consistency: number;
  };
  summary: string;
  strengths: CoachingSuggestion[];
  priorities: CoachingSuggestion[];
  nextDrill: {
    title: string;
    detail: string;
    steps: string[];
  };
};
```

`session.json`:

```ts
type VoiceCoachSession = {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  durationMs: number;
  deviceId: string;
  calibrationId: string | null;
  calibrationSnapshot?: CalibrationProfile | null;
  metadata?: SessionMetadata;
  recordingFile: "recording.webm";
  samples: VolumeSample[];
  events: SessionEvent[];
  summary: {
    targetVolumePercent: number;
    lowVolumeEventCount: number;
    longestLowVolumeMs: number;
    silenceEventCount: number;
  };
};
```

Guided practice metadata is stored inside `session.metadata`:

```ts
type SessionMetadata = {
  title: string;
  prompt: string;
  notes: string;
  tags: string[];
  goalId?: PracticeGoalId;
  goalLabel?: string;
  guidedTrackId?: PracticeGoalId;
  guidedTrackLabel?: string;
  guidedPromptId?: string;
  guidedAttempt?: "baseline" | "retry";
  guidedFocus?: string;
  updatedAt: string;
};
```

## Audio Pipeline

The renderer captures microphone input with `navigator.mediaDevices.getUserMedia`.

Audio analysis:

- samples are read through Web Audio
- RMS is computed from time-domain samples
- RMS is converted to dB-like values
- values are smoothed before display
- samples are stored every 100 ms

Microphone processing:

- enhanced mode enables browser/device echo cancellation, noise suppression, and auto gain
- natural mode disables those processing flags for raw mic measurement
- enhanced mode is the default because laptop microphone arrays often record too quietly without automatic gain

Calibration:

- first 3 seconds estimate the noise floor
- remaining calibration time estimates normal speaking volume
- thresholds are derived from speech average

Events:

- `low_volume`: speaking below threshold for at least 1500 ms
- `silence`: no detected speaking for at least 3000 ms

## Coach Mode Pipeline

Coach Mode is a local rules-based layer above the existing audio and text reports:

```text
session.json + report.json + optional suggestions.json
  -> coach-report.json
  -> Coach screen, Review scorecard, Markdown export
```

The readiness score is weighted by the selected practice goal:

- Voice Projection emphasizes target volume and consistency
- Clear Speaking emphasizes transcript clarity and pacing
- Pacing Control emphasizes speaking ratio and pause control
- Interview Answer balances volume, clarity, pacing, and consistency
- Confident Delivery emphasizes projection and consistency

## Guided Practice Pipeline

`0.9.0` adds a local guided layer above Coach Mode:

```text
GUIDED_TRACKS
  -> baseline or retry plan
  -> session.metadata guided fields
  -> coach-report.json
  -> Review guided comparison
```

The first built-in tracks are:

- Voice Projection
- Clear Speaking
- Pacing Control
- Interview Answer
- Confident Delivery

The recommendation logic is deliberately explainable: it chooses a track from the weakest available Coach Mode score and falls back to the selected goal when no score exists.

## Recording Preflight Pipeline

Before recording, the renderer checks:

- microphone track is live
- calibration is available or clearly marked as missing
- `MediaRecorder` is available
- camera track is live when camera mode is selected
- Windows transcription is enabled or disabled intentionally
- browser storage estimate has enough room when available
- local data trust has no blocking failure

These checks are advisory except for a missing microphone or unavailable recorder, which block recording.

## Progress Coach Pipeline

Progress Coach aggregates existing local session artifacts without adding a database:

```text
sessions/*/session.json
sessions/*/coach-report.json
sessions/*/transcript.json
  -> Progress screen
  -> progress-report.md
```

The aggregation is deterministic and local. It reports session count, total practice time, average readiness, best readiness, transcript coverage, per-goal summaries, and weakest skill trends.

## Trust and Backup Pipeline

`0.8.0` adds a local data trust snapshot without introducing a database:

```text
VoiceCoachData/
  -> writable folder check
  -> calibration presence check
  -> session folder readability check
  -> recording file presence check
  -> Windows transcription availability check
  -> Settings trust panel
```

Backups are local folder copies created through the main process:

```text
calibration.json + settings.json + sessions/
  -> backups/VoiceCoachBackup-<date>/
  -> backup-manifest.json
```

This is a recovery aid, not a cloud sync feature.

## Camera and Transcription Pipeline

`0.6.0` extends the practice stream from audio-only to optional camera-plus-microphone capture:

```text
getUserMedia(audio + optional video)
  -> Web Audio analyzer for calibrated volume samples
  -> MediaRecorder for recording.webm
  -> session.json recordingKind + cameraSettings
  -> Review media player
```

Built-in transcription is intentionally isolated from the media recorder. The main process starts a local Windows `System.Speech` helper process, reads JSON events from stdout, and forwards them over IPC:

```text
PowerShell + System.Speech
  -> ready / partial / final / error events
  -> preload transcription bridge
  -> live transcript preview
  -> transcript.json + suggestions.json
```

The review screen still supports Windows speech input as a manual fallback. Transcript source values now distinguish `manual`, `windows_dictation`, and `windows_builtin`.

## Security Defaults

- `contextIsolation: true`
- `nodeIntegration: false`
- renderer file writes go through IPC
- no internet or cloud services for app-owned recording, reports, progress, or built-in transcription

## Future Architecture Notes

Grammar feedback should not be added directly to the live audio layer. Transcript feedback is a separate review artifact and exported Markdown reports include that feedback. Future providers can be added behind the same transcription event shape:

```text
recording.webm
  -> report.json
  -> coach-report.json
  -> transcript.json
  -> suggestions.json
  -> review screen
```
