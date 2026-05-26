# Windows Speech Notes

VoiceCoach Offline `0.6.0` supports built-in Windows transcription and still keeps Windows speech input as a fallback transcript-entry workflow.

## Built-in Provider

When **Built-in transcription** is enabled in Practice, VoiceCoach starts a local helper process that uses the Windows `System.Speech` recognizer. The helper streams JSON events back to the Electron main process:

```text
ready
partial transcript text
final transcript text
error
stopped
```

The renderer shows partial/final text during recording. When the session is saved, VoiceCoach writes the final text to `transcript.json` with source `windows_builtin`, then runs local grammar and clarity suggestions.

This is not the same as embedding the Windows `Win+H` popup. The popup is a Windows-owned UI. VoiceCoach uses its own app-owned provider bridge so the transcript can be saved with the session.

## Fallback Entry

In the Review screen, the **Use Windows Speech** button still focuses the transcript editor and marks the transcript source as `windows_dictation`. You can then use Windows voice typing or Windows Voice Access to put text into the box, and VoiceCoach will analyze the resulting transcript locally after you save it.

## Windows Voice Typing vs Voice Access vs System.Speech

Microsoft documents Windows voice typing, opened with `Win+H`, as using online speech recognition powered by Azure Speech services:

https://support.microsoft.com/en-us/windows/use-voice-typing-to-talk-instead-of-type-on-your-pc-fec94565-c4bd-329d-e59a-af033fa5689f

Microsoft also documents Windows Voice Access as a Windows 11 feature that can author text without an internet connection after downloading required language files:

https://support.microsoft.com/en-us/accessibility/windows/voice-access/set-up-voice-access

Because Windows voice typing and Voice Access are Windows-owned features, VoiceCoach does not claim to control their recognition engine or privacy behavior. The built-in provider is separate: it uses the local Windows speech recognition APIs exposed to desktop apps.

## Current Limits

- Recognition quality can differ from Win+H or Voice Access.
- Language availability depends on Windows speech recognition support on the PC.
- Long-session stability still needs more manual testing before `1.0.0`.
- A later provider can use Windows Runtime speech APIs or a bundled open-source model if `System.Speech` is not enough.
