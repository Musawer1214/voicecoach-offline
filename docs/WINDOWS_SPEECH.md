# Windows Speech Notes

VoiceCoach Offline `0.5.0` supports Windows speech as an assisted transcript-entry workflow.

## What the App Does

In the Review screen, the **Use Windows Speech** button focuses the transcript editor and marks the transcript source as `windows_dictation`. You can then use Windows voice typing or Windows Voice Access to put text into the box, and VoiceCoach will analyze the resulting transcript locally after you save it.

This keeps VoiceCoach simple and offline-first:

- no bundled speech model
- no hidden cloud call from the app
- no native Windows speech runtime dependency
- no change to the audio recording pipeline

## Windows Voice Typing vs Voice Access

Microsoft documents Windows voice typing, opened with `Win+H`, as using online speech recognition powered by Azure Speech services:

https://support.microsoft.com/en-us/windows/use-voice-typing-to-talk-instead-of-type-on-your-pc-fec94565-c4bd-329d-e59a-af033fa5689f

Microsoft also documents Windows Voice Access as a Windows 11 feature that can author text without an internet connection after downloading required language files:

https://support.microsoft.com/en-us/accessibility/windows/voice-access/set-up-voice-access

Because these are Windows-owned features, VoiceCoach does not claim to control their recognition engine or privacy behavior. The app only accepts text that Windows enters into the transcript field.

## Future Research

A later version can investigate deeper integration with Windows speech APIs such as `Windows.Media.SpeechRecognition`. That should be treated as a spike because Electron integration, permissions, language packs, and parity with Windows voice typing or Voice Access all need verification.
