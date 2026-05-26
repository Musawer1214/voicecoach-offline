import { BrowserWindow } from "electron";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { TranscriptionEvent, TranscriptionStartOptions, TranscriptionStartResult } from "../shared/types.js";

const PROVIDER = "windows_system_speech" as const;

let transcriptionProcess: ChildProcessWithoutNullStreams | null = null;
let stdoutBuffer = "";

export function startTranscription(
  mainWindow: BrowserWindow | null,
  options: TranscriptionStartOptions = {}
): TranscriptionStartResult {
  if (transcriptionProcess) {
    return { ok: true, provider: PROVIDER };
  }

  const culture = sanitizeCulture(options.culture ?? "en-US");
  const script = buildRecognizerScript(culture);
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      windowsHide: true
    }
  );

  transcriptionProcess = child;
  stdoutBuffer = "";

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      sendEvent(mainWindow, parseRecognizerEvent(line));
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    const message = chunk.trim();
    if (message) {
      sendEvent(mainWindow, {
        type: "error",
        provider: PROVIDER,
        message,
        at: new Date().toISOString()
      });
    }
  });

  child.on("error", (error) => {
    sendEvent(mainWindow, {
      type: "error",
      provider: PROVIDER,
      message: error.message,
      at: new Date().toISOString()
    });
    transcriptionProcess = null;
  });

  child.on("exit", () => {
    transcriptionProcess = null;
    sendEvent(mainWindow, {
      type: "stopped",
      provider: PROVIDER,
      message: "Transcription stopped.",
      at: new Date().toISOString()
    });
  });

  return { ok: true, provider: PROVIDER };
}

export function stopTranscription(): void {
  if (!transcriptionProcess) {
    return;
  }

  transcriptionProcess.kill();
  transcriptionProcess = null;
}

function sendEvent(mainWindow: BrowserWindow | null, event: TranscriptionEvent): void {
  mainWindow?.webContents.send("transcription:event", event);
}

function parseRecognizerEvent(line: string): TranscriptionEvent {
  try {
    const parsed = JSON.parse(line) as TranscriptionEvent;
    if (parsed && typeof parsed.type === "string") {
      return parsed;
    }
  } catch {
    // Fall through to an error event below.
  }

  return {
    type: "error",
    provider: PROVIDER,
    message: line,
    at: new Date().toISOString()
  };
}

function sanitizeCulture(culture: string): string {
  return /^[a-z]{2}-[A-Z]{2}$/.test(culture) ? culture : "en-US";
}

function buildRecognizerScript(culture: string): string {
  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
function Send-Event([string]$type, [string]$text, [double]$confidence, [string]$message) {
  $payload = @{
    type = $type
    provider = '${PROVIDER}'
    at = (Get-Date).ToUniversalTime().ToString('o')
  }
  if ($text) { $payload.text = $text }
  if ($confidence -ge 0) { $payload.confidence = $confidence }
  if ($message) { $payload.message = $message }
  $payload | ConvertTo-Json -Compress
}
try {
  $culture = [System.Globalization.CultureInfo]::GetCultureInfo('${culture}')
  $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine($culture)
} catch {
  $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
}
$grammar = New-Object System.Speech.Recognition.DictationGrammar
$recognizer.LoadGrammar($grammar)
$recognizer.SetInputToDefaultAudioDevice()
$recognizer.add_SpeechHypothesized({
  param($sender, $eventArgs)
  if ($eventArgs.Result -and $eventArgs.Result.Text) {
    Send-Event 'partial' $eventArgs.Result.Text ([double]$eventArgs.Result.Confidence) ''
  }
})
$recognizer.add_SpeechRecognized({
  param($sender, $eventArgs)
  if ($eventArgs.Result -and $eventArgs.Result.Text) {
    Send-Event 'final' $eventArgs.Result.Text ([double]$eventArgs.Result.Confidence) ''
  }
})
$recognizer.add_RecognizeCompleted({
  param($sender, $eventArgs)
  if ($eventArgs.Error) {
    Send-Event 'error' '' -1 $eventArgs.Error.Message
  }
})
Send-Event 'ready' '' -1 'Windows built-in speech recognizer is listening.'
$recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
try {
  while ($true) {
    Start-Sleep -Milliseconds 250
  }
} finally {
  $recognizer.RecognizeAsyncCancel()
  $recognizer.Dispose()
}
`;
}
