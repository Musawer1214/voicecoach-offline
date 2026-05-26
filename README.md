# VoiceCoach Offline

VoiceCoach Offline is an offline-first Windows desktop app for practicing stronger and clearer speaking volume.

Current version: `0.3.2`

This release is an audio-coaching prototype. It proves the core loop:

- calibrate microphone volume
- record an audio-only practice session
- show live low-volume feedback
- save local session JSON and `recording.webm`
- review saved timeline markers

No internet, cloud service, automatic transcription, camera recording, screen recording, or SQLite database is used in `0.3.2`.

## What's New in 0.3.2

- enhanced microphone mode now allows browser/Windows echo cancellation, noise suppression, and auto gain
- natural microphone mode remains available for raw mic measurement
- review playback now has a clearer custom play bar
- review playback boost can raise quiet recordings up to `4x`
- review playback speed controls support `0.75x`, `1x`, `1.25x`, and `1.5x`

## Project Status

`0.3.2` is below the final product target. The goal is to iterate through `0.x` versions until the app is reliable enough for `1.0.0`.

Planned future work:

- `0.4.x`: optional offline transcription engine
- `0.5.x`: stronger grammar suggestions and timeline-linked transcript segments
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
release/VoiceCoach Offline 0.3.2.exe
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
      transcript.json
      suggestions.json
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

`0.3.2` is fully offline. Audio recordings, transcripts, suggestions, and session metadata stay on the user's PC.

## License

No license has been chosen yet. Before publishing the repository publicly, choose a license such as MIT, Apache-2.0, GPL, or keep it unlicensed with all rights reserved.
