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

Key files:

- `src/renderer/App.tsx`
- `src/renderer/audio/level.ts`
- `src/renderer/audio/calibration.ts`
- `src/renderer/audio/events.ts`

## Local Data Contract

Data is stored locally under Electron's user data path:

```text
VoiceCoachData/
  calibration.json
  sessions/
    <session-date>/
      recording.webm
      session.json
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

`session.json`:

```ts
type VoiceCoachSession = {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  durationMs: number;
  deviceId: string;
  calibrationId: string | null;
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

Calibration:

- first 3 seconds estimate the noise floor
- remaining calibration time estimates normal speaking volume
- thresholds are derived from speech average

Events:

- `low_volume`: speaking below threshold for at least 1500 ms
- `silence`: no detected speaking for at least 3000 ms

## Security Defaults

- `contextIsolation: true`
- `nodeIntegration: false`
- renderer file writes go through IPC
- no internet or cloud services in `0.1.0`

## Future Architecture Notes

Grammar feedback should not be added directly to the live audio layer. It should be added after offline transcription exists:

```text
recording.webm
  -> offline transcription
  -> transcript with timestamps
  -> grammar/style analysis
  -> suggestions linked to review timeline
```
