# Changelog

All notable changes to VoiceCoach Offline will be documented here.

This project follows pre-`1.0.0` semantic versioning:

- `0.1.x`: audio-coaching prototype fixes
- `0.2.x`: offline audio reports
- `0.3.x`: transcript and local suggestions
- `0.4.x`: optional offline transcription
- `1.0.0`: stable public release

## 0.3.1 - 2026-05-25

Fixed:

- exported Markdown reports now include manual transcript text
- exported Markdown reports now include transcript metrics and local suggestions
- empty transcript analysis now shows an actionable message instead of looking complete
- production builds now clean stale `dist` output before rebuilding

Tests:

- added coverage for Markdown report export with audio, transcript, and suggestion sections

## 0.3.0 - 2026-05-25

Added:

- manual transcript editor in the review screen
- versioned `transcript.json` storage
- versioned `suggestions.json` local text-analysis output
- offline filler-word, repeated-phrase, long-sentence, and weak-opening checks
- transcript metrics for word count, sentence count, filler count, and long sentence count

Not included:

- automatic offline transcription
- bundled Whisper model or binary

## 0.2.0 - 2026-05-25

Added:

- versioned `report.json` audio coaching reports for each new session
- per-session calibration snapshots
- session title, practice prompt, and notes
- selected microphone persistence through local `settings.json`
- review report cards with score, low-volume percentage, speaking ratio, and consistency
- actionable audio suggestions for volume, silence, consistency, calibration, and clipping
- report export to local Markdown
- session folder reveal and delete actions
- v0.1.1 working-feature audit documentation

Fixed:

- review can now generate a missing report by reanalyzing with the current calibration

## 0.1.1 - 2026-05-25

Fixed:

- review screen now warns when a session was recorded before calibration
- added session reanalysis with the current calibration profile
- practice samples now use recording-relative timestamps
- low-volume live warning now reads recording state from refs instead of stale React closures
- fallback no-calibration speech detection is stricter, reducing noise-only samples

Documentation:

- updated README for public GitHub publishing and `0.1.1`

## 0.1.0 - 2026-05-25

Initial offline audio-coaching prototype.

Added:

- Electron + React + TypeScript app scaffold
- microphone device selection
- calibration profile saved as local JSON
- live RMS/dB-style volume meter
- speech-aware low-volume warning
- audio-only recording with `MediaRecorder`
- local session folders with `session.json` and `recording.webm`
- basic review screen with playback and timeline markers
- Windows unpacked and portable build scripts
- automated tests for audio level, calibration, event analysis, and session schema

Not included:

- transcription
- grammar correction
- webcam recording
- screen recording
- online services
- SQLite
- signed installer
