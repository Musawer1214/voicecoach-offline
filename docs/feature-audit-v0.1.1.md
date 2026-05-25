# VoiceCoach Offline v0.1.1 Feature Audit

Date: 2026-05-25

This audit records what was working at `v0.1.1` before the next feature releases.

## Working Features

- Microphone permission and device listing work through browser media APIs.
- Calibration saves `calibration.json` locally with `schemaVersion: 1`.
- Practice mode shows a live RMS/dB-style meter.
- Low-volume warning uses calibrated thresholds when a calibration profile exists.
- Audio-only recording saves `recording.webm` locally.
- Session metadata saves to `session.json` with local samples and event markers.
- Review screen can play saved audio and draw a volume timeline.
- Sessions recorded before calibration can be reanalyzed with the current calibration.
- Windows packaging scripts produce unpacked and portable builds.
- GitHub repository and release tags are available publicly.

## Gaps Found

- Saved sessions did not keep a calibration snapshot, so old reports could change meaning when calibration changed.
- Review had metrics but no durable `report.json` artifact.
- Session library lacked titles, prompts, notes, export, delete, and folder reveal actions.
- Settings did not persist selected microphone.
- Review suggestions were not yet actionable enough to feel like coaching.
- No transcript or grammar-suggestion data contract existed.

## Release Decision

`v0.2.0` should add offline audio coaching reports and session management.

`v0.3.0` should add manual transcript and local text-suggestion artifacts, while keeping automatic offline transcription for a later release.
