# Grammar Feedback Roadmap

This document describes how grammar suggestions should work after recording in future versions.

The user request:

> After recording ends, detect grammar errors in the spoken transcript and suggest how to improve the speech.

## Product Goal

After a practice session, the app should show grammar and communication suggestions linked to the transcript and timeline.

Example suggestions:

- "This sentence is too long. Split it into two shorter sentences."
- "You repeated 'so' four times in this section."
- "Consider replacing 'I have spoken this' with 'I said this out loud.'"
- "This section may be unclear because the voice dropped and the transcript is incomplete."

The app should coach, not judge. Use wording like:

- "Suggested improvement"
- "Possibly unclear"
- "Try saying it this way"

Avoid wording like:

- "Wrong"
- "Bad grammar"
- "Failed"

## Required Prerequisite: Offline Transcription

Grammar feedback needs text. The app must first create a transcript from the saved recording.

Recommended path for `0.2.x`:

- use `whisper.cpp`
- run it locally as a bundled command-line engine
- save transcript JSON beside `session.json`
- include timestamps where possible

`whisper.cpp` is the preferred offline speech-to-text path because it is native C/C++ and can run without cloud services.

## Recommended Grammar Engine

For offline grammar checking, use local LanguageTool as the first serious option.

Reason:

- LanguageTool is open source
- it supports grammar, style, and spell checking
- it can run through an embedded local HTTP server
- the app can call `localhost` without sending text to the internet

Official documentation:

- LanguageTool embedded HTTP server: https://dev.languagetool.org/http-server.html
- LanguageTool Java API note recommending the HTTP server: https://dev.languagetool.org/java-api.html
- LanguageTool repository: https://github.com/languagetool-org/languagetool

Tradeoff:

- LanguageTool requires Java or a bundled runtime strategy
- packaging size will increase
- it may be too heavy for the earliest grammar prototype

## Alternative: Lightweight Rule-Based Coach

Before bundling LanguageTool, `0.3.0` can start with a lightweight local grammar and speaking-style analyzer.

Rules:

- detect repeated filler words
- detect very long sentences
- detect repeated phrases
- detect sentence fragments from transcript punctuation
- detect weak openings such as "so basically" or repeated "for example"
- detect transcript gaps near low-volume timeline events

This approach is less powerful than LanguageTool but easier to ship offline.

## Suggested Version Plan

### `0.2.0`: Offline Transcript

Add:

- local transcription engine
- transcript file saved to session folder
- transcript viewer in review screen
- timestamps linked to playback

New file shape:

```text
sessions/<date>/
  recording.webm
  session.json
  transcript.json
```

### `0.3.0`: First Grammar Suggestions

Add:

- post-session grammar suggestions
- filler word counts
- long sentence detection
- repeated phrase detection
- timeline links from suggestions to transcript segments

### `0.4.0`: Local LanguageTool Integration

Add:

- optional local LanguageTool process
- grammar and spelling suggestions
- replacement text suggestions
- setting to enable/disable grammar engine

### `0.5.0`: Speaking Coach Report

Add:

- combined report using volume, transcript, grammar, pauses, filler words, and pace
- suggested rewritten answer
- practice-again mode for weak sections

## Future Data Contract

`transcript.json` should use a versioned schema:

```ts
type Transcript = {
  schemaVersion: 1;
  sessionId: string;
  engine: "whisper.cpp";
  language: string;
  segments: Array<{
    id: string;
    startMs: number;
    endMs: number;
    text: string;
    confidence?: number;
  }>;
};
```

`suggestions.json` should also be versioned:

```ts
type GrammarSuggestionReport = {
  schemaVersion: 1;
  sessionId: string;
  generatedAt: string;
  engine: "local-rules" | "languagetool";
  suggestions: Array<{
    id: string;
    type: "grammar" | "style" | "filler" | "clarity" | "structure";
    severity: "info" | "suggestion" | "important";
    startMs?: number;
    endMs?: number;
    originalText: string;
    message: string;
    replacement?: string;
  }>;
};
```

## UX Placement

Grammar suggestions belong on the review screen after recording.

Recommended layout:

- transcript on the left
- suggestions on the right
- audio/video timeline at the top
- click a suggestion to jump to its transcript segment

## Privacy Rule

Grammar feedback must remain offline by default.

If an online grammar or AI provider is ever added, it must be:

- opt-in
- clearly labeled
- disabled by default
- documented in the privacy section
