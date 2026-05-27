# Development Notes

This document records project decisions so future contributors can understand why the app is built this way.

## Current Version

`0.7.0` is still pre-`1.0`, but now includes the offline audio-coaching loop, report artifacts, manual transcripts, local text suggestions, transcript-aware Markdown exports, enhanced microphone capture, boosted review playback, Coach Mode goals, readiness scorecards, progress summaries, progress export, camera practice sessions, built-in Windows speech transcription when the local recognizer is available, and a simplified UI flow for new users.

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

## Why Built-in Transcription Is Provider-Based

The first risk was whether live volume coaching is useful and reliable. `0.2.0` added audio reports, `0.3.0` added manual transcript suggestions, `0.3.2` improved laptop microphone capture and review playback, `0.4.0` added Coach Mode, and `0.5.0` added progress tracking on top of those local artifacts.

`0.6.0` adds built-in transcription through a narrow provider bridge instead of automating the Windows `Win+H` overlay. The first provider uses Windows `System.Speech` through a local helper process. If this provider is not reliable enough on every Windows 11 machine, the same app contract can accept a native Windows Runtime helper or a bundled open-source model later.

`0.7.0` does not add new capture models. It simplifies the user flow with progressive disclosure so new users can see the next action first while advanced camera, microphone, transcript, file, and metadata controls remain available.

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
- verify camera preview appears in camera mode
- verify audio-only mode still records without camera
- verify built-in transcription starts or shows a clear warning if unavailable
- confirm final transcript is saved after recording when recognition text is produced
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
- confirm advanced capture, transcript, and file tools remain available inside disclosure sections
- confirm exported Markdown includes Coach Mode
- confirm session files are saved locally
- run `npm test`
- run `npm run build`
- run `npm run package:dir`
- run `npm run dist:portable`
