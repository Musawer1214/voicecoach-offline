# Development Notes

This document records project decisions so future contributors can understand why the app is built this way.

## Current Version

`0.1.1` is intentionally narrow. It validates the offline audio-coaching loop before adding transcription or grammar analysis.

## Why Electron

Electron was chosen for the first prototype because:

- it gives fast access to Web Audio and `MediaRecorder`
- React UI iteration is quick
- Windows packaging is supported through `electron-builder`
- future webcam and screen capture are easier than starting with a lower-level native stack

The main tradeoff is app size. That is acceptable for the `0.1.x` prototype.

## Why JSON Instead of SQLite

JSON is enough for pre-`1.0` because:

- the session schema is small
- each recording naturally belongs in its own folder
- it is easy for future contributors to inspect and debug

SQLite can be introduced later when session search, filtering, analytics, or long-term history need it.

## Why No Transcription Yet

The first risk is whether live volume coaching is useful and reliable. Transcription, grammar correction, and clarity scoring depend on a saved recording and timeline, so they start after `0.1.x`.

## Electron Launch Note

Some shell environments may set:

```text
ELECTRON_RUN_AS_NODE=1
```

That makes Electron behave like Node and can break app startup. The `npm run dev` script clears it before launching Electron.

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
- confirm session files are saved locally
- run `npm test`
- run `npm run build`
- run `npm run package:dir`
- run `npm run dist:portable`
