# VoiceCoach Offline

![VoiceCoach Offline Coach Mode preview](assets/brand/voicecoach-readme-hero.svg)

VoiceCoach Offline is an offline-first Windows desktop app for practicing stronger, clearer speaking. It calibrates your microphone, records audio-only practice sessions, gives live low-volume feedback, and saves local review reports.

Current version: `0.4.0`

`0.4.0` is the major Coach Mode release before the planned `1.0.0` stabilization release.

## Highlights

- Fully offline by default: no cloud service, account, or internet connection required.
- Calibrated live volume meter with low-volume warnings.
- Audio-only local recording with `recording.webm` session files.
- Coach Mode goals for projection, clarity, pacing, interview answers, and confident delivery.
- Local scorecards for projection, clarity, pacing, consistency, and readiness.
- Manual transcript analysis for filler words, repeated phrases, long sentences, and weak openings.
- Exportable Markdown review reports.
- Windows unpacked and portable build scripts.

## What's New in 0.4.0

- New Coach screen with guided practice goals and recent progress.
- New `coach-report.json` per session with score breakdowns, strengths, priorities, and next-drill steps.
- Practice sessions now save the active goal with session metadata.
- Review now shows a Coach Mode scorecard and can refresh coach analysis for older sessions.
- Markdown exports now include Coach Mode summaries.
- Added project branding assets and brand documentation for GitHub presentation.

## Status

This project is still pre-`1.0.0`. The app is useful for offline audio practice now, but `1.0.0` is reserved for release hardening:

- installer and portable release verification
- accessibility pass
- data migration safety
- documentation cleanup
- final icon/build metadata
- optional offline transcription research after the core app is stable

## Requirements

- Windows 11
- Node.js
- npm

## Development

Install dependencies:

```powershell
npm install
```

Run the app in development:

```powershell
npm run dev
```

Run automated tests:

```powershell
npm test
```

Build production files:

```powershell
npm run build
```

Create an unpacked Windows app:

```powershell
npm run package:dir
```

Create an unsigned portable EXE:

```powershell
npm run dist:portable
```

## Build Output

Portable builds are written to:

```text
release/VoiceCoach Offline 0.4.0.exe
```

Unpacked builds are written to:

```text
release/win-unpacked/VoiceCoach Offline.exe
```

Build outputs are ignored by Git.

## Local Data

The app stores user data locally through Electron's `app.getPath("userData")` path:

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
```

Session, calibration, report, coach, transcript, and suggestion files use `schemaVersion: 1`.

## Privacy

VoiceCoach Offline is designed for local practice. Audio recordings, transcripts, scorecards, suggestions, and session metadata stay on the user's PC. The app does not require internet access for its current features.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Brand Notes](docs/BRAND.md)
- [Development Notes](docs/DEVELOPMENT.md)
- [Grammar Feedback Roadmap](docs/GRAMMAR_FEEDBACK_ROADMAP.md)
- [Versioning](docs/VERSIONING.md)
- [GitHub Setup](docs/GITHUB_SETUP.md)
- [Changelog](CHANGELOG.md)

## Roadmap

- `0.4.x`: Coach Mode fixes and UX refinements.
- `1.0.0`: stable offline speaking coach release.
- Post-`1.0.0`: evaluate optional local transcription if model size, speed, accuracy, and packaging are acceptable.

## License

No license has been chosen yet. Until a license is added, the repository is public source but not automatically open source for reuse.
