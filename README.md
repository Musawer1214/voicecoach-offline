# VoiceCoach Offline

![VoiceCoach Offline Coach Mode preview](assets/brand/voicecoach-readme-hero.svg)

VoiceCoach Offline is an offline-first Windows desktop app for practicing stronger, clearer speaking. It calibrates your microphone, records audio-only practice sessions, gives live low-volume feedback, and saves local review reports.

Current version: `0.5.0`

`0.5.0` is the Progress Coach release before the planned `1.0.0` stabilization release.

## Highlights

- Fully offline by default: no cloud service, account, or internet connection required.
- Calibrated live volume meter with low-volume warnings.
- Audio-only local recording with `recording.webm` session files.
- Coach Mode goals for projection, clarity, pacing, interview answers, and confident delivery.
- Local scorecards for projection, clarity, pacing, consistency, and readiness.
- Progress dashboard with readiness trends, goal summaries, and next-practice focus.
- Manual transcript analysis for filler words, repeated phrases, long sentences, and weak openings.
- Windows speech input helper for using Win+H voice typing or Voice Access inside the transcript box.
- Exportable Markdown review reports.
- Exportable Markdown progress reports.
- Windows unpacked and portable build scripts.

## What's New in 0.5.0

- New Progress screen with session history, readiness trend bars, goal summaries, and weakest-skill focus.
- New progress Markdown export saved as `progress-report.md`.
- Added shared progress aggregation and tests.
- Added Windows speech input helper in the review transcript panel.
- Transcript source can now be saved as `manual` or `windows_dictation`.

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
release/VoiceCoach Offline 0.5.0.exe
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
  progress-report.md
```

Session, calibration, report, coach, transcript, and suggestion files use `schemaVersion: 1`.

## Privacy

VoiceCoach Offline is designed for local practice. Audio recordings, transcripts, scorecards, suggestions, and session metadata stay on the user's PC. The app does not require internet access for its current features.

Windows speech input is optional. VoiceCoach does not bundle or secretly call a speech-to-text service. The review screen simply focuses the transcript box so Windows voice typing or Windows Voice Access can enter text there if you choose to use those Windows features.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Brand Notes](docs/BRAND.md)
- [Development Notes](docs/DEVELOPMENT.md)
- [Grammar Feedback Roadmap](docs/GRAMMAR_FEEDBACK_ROADMAP.md)
- [Windows Speech Notes](docs/WINDOWS_SPEECH.md)
- [Versioning](docs/VERSIONING.md)
- [GitHub Setup](docs/GITHUB_SETUP.md)
- [Changelog](CHANGELOG.md)

## Roadmap

- `0.5.x`: Progress Coach fixes, export polish, and Windows speech-input experiments.
- `1.0.0`: stable offline speaking coach release.
- Post-`1.0.0`: evaluate optional local transcription if model size, speed, accuracy, and packaging are acceptable.

## License

No license has been chosen yet. Until a license is added, the repository is public source but not automatically open source for reuse.
