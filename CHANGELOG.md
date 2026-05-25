# Changelog

All notable changes to VoiceCoach Offline will be documented here.

This project follows pre-`1.0.0` semantic versioning:

- `0.1.x`: audio-coaching prototype fixes
- `0.2.x`: offline transcription
- `0.3.x`: grammar and clarity suggestions
- `1.0.0`: stable public release

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
