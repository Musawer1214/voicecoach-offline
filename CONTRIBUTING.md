# Contributing

VoiceCoach Offline is currently in early `0.x` development. Keep changes small, tested, and aligned with the offline-first goal.

## Development Rules

- Keep user audio and transcripts local by default.
- Do not add cloud services unless they are optional and clearly documented.
- Keep app data files versioned with `schemaVersion`.
- Add or update documentation when changing behavior, storage, build scripts, or roadmap.
- Add tests for audio analysis, session data, and report logic.

## Branch Names

Recommended branch names:

```text
feature/offline-transcription
feature/grammar-suggestions
fix/calibration-thresholds
docs/versioning-policy
```

## Commit Style

Use short, clear commits:

```text
feat: add calibration screen
fix: prevent silence from triggering low-volume warning
docs: document grammar feedback roadmap
test: cover session summary calculations
```

## Pull Request Checklist

- tests pass with `npm test`
- build passes with `npm run build`
- changed behavior is documented
- local data schema changes update `docs/ARCHITECTURE.md`
- no generated build outputs are committed
