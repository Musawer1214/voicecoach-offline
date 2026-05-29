import { BrowserWindow } from "electron";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { access } from "node:fs/promises";
import {
  TranscriptionEvent,
  TranscriptionFileResult,
  TranscriptionStartOptions,
  TranscriptionStartResult
} from "../shared/types.js";

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

export async function transcribeWaveFile(
  filePath: string,
  options: TranscriptionStartOptions = {}
): Promise<TranscriptionFileResult> {
  const culture = sanitizeCulture(options.culture ?? "en-US");

  try {
    await access(filePath);
  } catch {
    return {
      ok: false,
      provider: PROVIDER,
      text: "",
      message: "No transcription WAV file was saved for this session."
    };
  }

  return new Promise((resolve) => {
    const script = buildFileRecognizerScript(culture, filePath);
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        windowsHide: true
      }
    );
    let output = "";
    let errorOutput = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill();
      resolve({
        ok: false,
        provider: PROVIDER,
        text: "",
        message: "Offline transcription timed out."
      });
    }, 120_000);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      errorOutput += chunk;
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({
        ok: false,
        provider: PROVIDER,
        text: "",
        message: error.message
      });
    });

    child.on("exit", () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(parseFileTranscriptionOutput(output, errorOutput));
    });
  });
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

function parseFileTranscriptionOutput(output: string, errorOutput: string): TranscriptionFileResult {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const finalLine = lines.at(-1);
  if (finalLine) {
    try {
      const parsed = JSON.parse(finalLine) as Partial<TranscriptionFileResult>;
      return {
        ok: Boolean(parsed.ok),
        provider: PROVIDER,
        text: typeof parsed.text === "string" ? parsed.text : "",
        message: typeof parsed.message === "string" ? parsed.message : undefined
      };
    } catch {
      // Fall through to the generic error result below.
    }
  }

  return {
    ok: false,
    provider: PROVIDER,
    text: "",
    message: errorOutput.trim() || output.trim() || "Windows speech recognition did not return transcript text."
  };
}

function powerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
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
  [Console]::Out.WriteLine(($payload | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
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

function buildFileRecognizerScript(culture: string, filePath: string): string {
  const psFilePath = powerShellString(filePath);

  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
function Send-Result([bool]$ok, [string]$text, [string]$message) {
  $payload = @{
    ok = $ok
    provider = '${PROVIDER}'
    text = $text
  }
  if ($message) { $payload.message = $message }
  [Console]::Out.WriteLine(($payload | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}
$recognizer = $null
try {
  try {
    $culture = [System.Globalization.CultureInfo]::GetCultureInfo('${culture}')
    $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine($culture)
  } catch {
    $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
  }
  $grammar = New-Object System.Speech.Recognition.DictationGrammar
  $recognizer.SetInputToWaveFile(${psFilePath})
  $recognizer.LoadGrammar($grammar)
  $parts = New-Object System.Collections.Generic.List[string]
  while ($true) {
    try {
      $result = $recognizer.Recognize([TimeSpan]::FromSeconds(10))
    } catch {
      if ($_.Exception.Message -like '*No audio input is supplied*') {
        break
      }
      throw
    }
    if ($null -eq $result) {
      break
    }
    if ($result.Text) {
      [void]$parts.Add($result.Text)
    }
  }
  $text = ($parts -join ' ').Trim()
  if ($text) {
    Send-Result $true $text 'Transcribed from the saved recording audio.'
  } else {
    Send-Result $false '' 'The local Windows recognizer heard the saved audio but did not produce words.'
  }
} catch {
  Send-Result $false '' $_.Exception.Message
} finally {
  if ($recognizer) {
    $recognizer.Dispose()
  }
}
`;
}
