# Development Notes

This document records project decisions so future contributors can understand why the app is built this way.

## Current Version

`0.5.0` is still pre-`1.0`, but now includes the offline audio-coaching loop, report artifacts, manual transcripts, local text suggestions, transcript-aware Markdown exports, enhanced microphone capture, boosted review playback, Coach Mode goals, readiness scorecards, progress summaries, progress export, and Windows speech-assisted transcript entry.

## Why Electron

Electron was chosen for the first prototype because:

- it gives fast access to Web Audio and `MediaRecorder`
- React UI iteration is quick
- Windows packaging is supported through `electron-builder`
- future webcam and screen capture are easier than starting with a lower-level native stack

The main tradeoff is app size. That is acceptable while the app remains an Electron prototype.

## Why JSON Instead of SQLite

JSON is enough for pre-`1.0` because:

- the session schema is small
- each recording naturally belongs in its own folder
- it is easy for future contributors to inspect and debug

SQLite can be introduced later when session search, filtering, analytics, or long-term history need it.

## Why No Transcription Yet

The first risk was whether live volume coaching is useful and reliable. `0.2.0` added audio reports, `0.3.0` added manual transcript suggestions, `0.3.2` improved laptop microphone capture and review playback, `0.4.0` added Coach Mode, and `0.5.0` added progress tracking on top of those local artifacts. Automatic app-owned transcription remains deferred until the app is stable enough for native Windows or bundled model work.

## Electron Launch Note

Some shell environments may set:

```text
ELECTRON_RUN_AS_NODE=1
```

That makes Electron behave like Node and can break app startup, including packaged-app smoke tests launched from the same shell. The `npm run dev` script clears it before launching Electron. For manual packaged smoke tests from PowerShell, clear it for that process before starting the EXE.

## Documentation Rule

When changing behavior, update at least one of:

- `README.md`
- `CHANGELOG.md`
- `docs/ARCHITECTURE.md`
- `docs/GRAMMAR_FEEDBACK_ROADMAP.md`
- `docs/VERSIONING.md`

## Manual Test Checklist

Before marking a version ready:

- launch with `npm run dev`
- refresh microphone permissions
- run calibration
- start a practice session
- speak softly for more than 1.5 seconds
- confirm warning appears
- stay silent for more than 3 seconds
- confirm silence is not treated as low-volume speech
- stop recording
- confirm review screen can play the recording
- confirm Coach Mode scorecard appears in review
- confirm Update Coach refreshes older sessions
- confirm Progress screen shows trend and goal summary
- confirm Export Progress writes `progress-report.md`
- confirm Windows speech helper focuses the transcript editor
- confirm exported Markdown includes Coach Mode
- confirm session files are saved locally
- run `npm test`
- run `npm run build`
- run `npm run package:dir`
- run `npm run dist:portable`
