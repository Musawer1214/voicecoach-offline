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

Key files:

- `src/renderer/App.tsx`
- `src/renderer/audio/level.ts`
- `src/renderer/audio/calibration.ts`
- `src/renderer/audio/events.ts`
- `src/renderer/audio/report.ts`
- `src/renderer/coach/coach.ts`
- `src/renderer/text/suggestions.ts`

## Local Data Contract

Data is stored locally under Electron's user data path:

```text
VoiceCoachData/
  calibration.json
  sessions/
    <session-date>/
      recording.webm
      session.json
      report.json
      coach-report.json
      transcript.json
      suggestions.json
      report.md
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

## Security Defaults

- `contextIsolation: true`
- `nodeIntegration: false`
- renderer file writes go through IPC
- no internet or cloud services in current `0.x` releases

## Future Architecture Notes

Grammar feedback should not be added directly to the live audio layer. Manual transcript feedback is a separate review artifact and exported Markdown reports include that feedback. Automatic offline transcription can be added later as another provider:

```text
recording.webm
  -> report.json
  -> coach-report.json
  -> optional transcript.json
  -> suggestions.json
  -> review screen
```
