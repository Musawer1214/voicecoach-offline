# Changelog

All notable changes to VoiceCoach Offline will be documented here.

This project follows pre-`1.0.0` semantic versioning:

- `0.1.x`: audio-coaching prototype fixes
- `0.2.x`: offline audio reports
- `0.3.x`: transcript and local suggestions
- `0.4.x`: Coach Mode and product polish
- `0.5.x`: Progress Coach and assisted transcript entry
- `0.6.x`: camera sessions and built-in transcription
- `0.7.x`: simplified UI and release-readiness polish
- `0.8.x`: first-real-user trust, backup, installer, and UI-density hardening
- `0.9.x`: guided practice loop, baseline/retry comparison, and recording preflight hardening
- `1.0.0`: stable public release

## 0.9.0 - 2026-05-29

Added:

- guided practice tracks for projection, clarity, pacing, interview answers, and confident delivery
- baseline/retry session planning that prefills title, prompt, notes, and coaching focus
- guided comparison panel in Review with previous score, current score, delta, and next retry message
- recording preflight checks for microphone, recorder, calibration, camera, transcription, storage, and local-data state
- guided metadata fields on session JSON for future migration and program tracking

Changed:

- Home now centers the next guided practice action instead of only listing app capabilities
- Coach Mode now presents guided tracks, prompt context, and success signals
- Practice shows the active guided plan and compact preflight status before recording
- Review includes a direct Retry action for guided sessions

Tests:

- added guided-practice unit coverage for baseline/retry planning, recommendation, and comparison
- automated test suite and production build pass for this release

## 0.8.0 - 2026-05-29

Added:

- local data trust snapshot for data-folder write access, calibration state, readable sessions, recording files, and Windows transcription availability
- Settings actions to refresh trust checks, open the local data folder, and create a local backup
- backup folders containing calibration, settings, sessions, and a backup manifest
- `npm run dist:installer` to build an unsigned Windows installer EXE

Changed:

- Coach Mode now uses compact goal pills instead of large text-heavy goal cards
- Coach summary metrics are lighter and no longer presented as four separate heavy cards
- latest coach summary, recent progress, and next drill panels use calmer visual weight
- shared metric styling is quieter across the app

Tests:

- existing automated test suite and production build pass for this release

## 0.7.0 - 2026-05-28

Added:

- reusable disclosure sections for advanced and optional controls
- quick-start home flow for Practice, Calibration, and Progress
- compact setup summary for calibration, recording mode, transcription, and local sessions

Changed:

- practice screen now prioritizes the live camera/meter/recording surface before secondary setup controls
- camera, transcription, prompts, and notes are tucked behind optional sections
- review screen keeps playback, timeline, summary metrics, and coach feedback visible while moving deeper report, transcript, file, and metadata tools into collapsible sections
- settings screen is grouped by microphone, camera/transcription, and playback/app info
- visual styling is calmer, with lighter borders, fewer heavy card shadows, and tighter goal cards

Tests:

- existing automated test suite and production build pass for this release

## 0.6.0 - 2026-05-26

Added:

- camera-plus-microphone practice sessions with live preview
- camera selector, resolution, frame-rate, and mirror-preview controls
- video review playback for camera sessions
- built-in Windows `System.Speech` transcription provider launched from the app
- live transcript preview during recording
- automatic final transcript save as `windows_builtin`
- camera metadata and `recordingKind` fields in session JSON

Changed:

- README now presents the project as the `0.6.0` Camera Sessions and Built-in Transcription release
- transcript report headings now use the broader `Transcript` label instead of `Manual Transcript`
- review summary now identifies audio-only vs camera sessions

Tests:

- added coverage for camera media constraints, video session schema, and built-in transcript source validation

## 0.5.0 - 2026-05-26

Added:

- Progress screen with readiness trends, goal summaries, transcript coverage, weakest-skill focus, and session history
- exportable local `progress-report.md`
- shared progress aggregation model and tests
- Windows speech input helper for the transcript editor
- transcript source tracking for manual vs Windows speech-assisted text entry

Changed:

- README now presents the project as the `0.5.0` Progress Coach release
- docs clarify the difference between app-owned transcription and optional Windows speech input

Tests:

- added coverage for progress summary aggregation and Markdown export

## 0.4.0 - 2026-05-26

Added:

- Coach Mode screen with guided goals for projection, clarity, pacing, interview answers, and confident delivery
- per-session `coach-report.json` with readiness score, score breakdown, strengths, priorities, and next drill
- goal metadata on new practice sessions
- Coach Mode scorecard in review
- update-coach action for older sessions
- Coach Mode content in exported Markdown reports
- README hero artwork, logo asset, and brand documentation

Changed:

- README now presents the project as the `0.4.0` Coach Mode release
- roadmap now reserves offline transcription for a later risk-managed release instead of blocking `0.4.0`

Tests:

- added coverage for Coach Mode report scoring and schema validation

## 0.3.2 - 2026-05-26

Added:

- enhanced microphone processing mode for laptop microphones that need auto gain or noise processing
- natural microphone mode for raw input measurement
- persistent settings for microphone processing and review playback boost
- custom review audio player with a clearer progress bar
- review playback boost from `1x` to `4x`
- review playback speed controls

Fixed:

- quiet recordings are easier to review without changing the original saved `recording.webm`

Tests:

- added coverage for microphone constraint generation and playback boost clamping

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
