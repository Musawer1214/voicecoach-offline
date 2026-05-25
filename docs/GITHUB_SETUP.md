# GitHub Setup

This project is ready to become a public GitHub repository.

## Initial Push

Create an empty GitHub repository, then run:

```powershell
git remote add origin https://github.com/Musawer1214/voicecoach-offline.git
git branch -M main
git push -u origin main
git push origin --tags
```

If GitHub CLI is authenticated, this can create the public repository directly:

```powershell
gh repo create Musawer1214/voicecoach-offline --public --source . --remote origin --push
git push origin --tags
```

## Recommended Repository Settings

- default branch: `main`
- enable issues
- enable discussions if you want roadmap feedback
- enable GitHub Actions
- add a license before public release
- protect `main` later when more contributors join

## What Should Not Be Committed

These are ignored by `.gitignore`:

- `node_modules/`
- `dist/`
- `release/`
- `VoiceCoachData/`
- log files

## Release Naming

Use release names like:

```text
VoiceCoach Offline v0.1.0
VoiceCoach Offline v0.1.1
VoiceCoach Offline v0.2.0
```

## Release Notes Template

```markdown
## VoiceCoach Offline vX.Y.Z

### Added

-

### Fixed

-

### Known Limitations

-

### Verification

- npm test
- npm run build
- npm run package:dir
- npm run dist:portable
```
