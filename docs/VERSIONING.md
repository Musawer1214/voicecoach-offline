# Versioning

VoiceCoach Offline uses semantic versioning, with `0.x` versions treated as active prototype releases.

## Version Meaning

```text
0.1.0  audio-coaching prototype
0.2.0  offline audio coaching reports
0.3.0  transcript and local suggestion prototype
0.4.0  richer review reports
1.0.0  stable offline speaking coach
```

Patch versions are for fixes:

```text
0.1.1  fix calibration bug
0.1.2  improve warning threshold
0.2.1  fix transcript save issue
```

## Git Tags

Use Git tags for releases:

```powershell
git tag v0.3.0
git push origin main --tags
```

## Changelog Rule

Every version update must update:

- `package.json`
- `CHANGELOG.md`

If data schemas change, also update:

- `docs/ARCHITECTURE.md`

## Public Release Rule

Before publishing a public GitHub release:

- run `npm test`
- run `npm run build`
- run `npm run package:dir`
- run `npm run dist:portable`
- manually test microphone calibration and recording
- attach the portable EXE only if the build is intended for users
