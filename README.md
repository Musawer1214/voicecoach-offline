# VoiceCoach Offline

VoiceCoach Offline is an offline-first Windows desktop app for practicing stronger and clearer speaking volume.

Current version: `0.2.0`

This release is an audio-coaching prototype. It proves the core loop:

- calibrate microphone volume
- record an audio-only practice session
- show live low-volume feedback
- save local session JSON and `recording.webm`
- review saved timeline markers

No internet, cloud service, transcription, camera recording, screen recording, or SQLite database is used in `0.1.x`.

## What's New in 0.2.0

- versioned `report.json` audio coaching reports
- per-session calibration snapshots for more honest review data
- session title, prompt, and notes
- selected microphone saved in local settings
- report export to local Markdown
- session folder reveal and delete actions
- richer review suggestions for volume, silence, consistency, and clipping

## Project Status

`0.2.0` is below the final product target. The goal is to iterate through `0.x` versions until the app is reliable enough for `1.0.0`.

Planned future work:

- `0.2.x`: offline transcription with `whisper.cpp`
- `0.3.x`: grammar and clarity suggestions after recording
- `0.4.x`: richer review reports and progress tracking
- `1.0.0`: complete offline speaking coach with stable installer/portable release

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

## Output

Portable builds are written to:

```text
release/VoiceCoach Offline 0.2.0.exe
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
  sessions/
    <session-date>/
      recording.webm
      session.json
      report.json
      report.md
```

Session and calibration files use `schemaVersion: 1`.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Development Notes](docs/DEVELOPMENT.md)
- [Grammar Feedback Roadmap](docs/GRAMMAR_FEEDBACK_ROADMAP.md)
- [Versioning](docs/VERSIONING.md)
- [GitHub Setup](docs/GITHUB_SETUP.md)
- [Changelog](CHANGELOG.md)

## Privacy

`0.1.x` is fully offline. Audio recordings and session metadata stay on the user's PC.

## License

No license has been chosen yet. Before publishing the repository publicly, choose a license such as MIT, Apache-2.0, GPL, or keep it unlicensed with all rights reserved.
