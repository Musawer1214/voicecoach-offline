import {
  Activity,
  AlertTriangle,
  BarChart3,
  Camera,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Keyboard,
  Mic,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Save,
  Settings,
  Sparkles,
  Square,
  Target,
  Trash2,
  TrendingUp,
  Timer,
  Trophy,
  Volume2,
  Wand2
} from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  AppMeta,
  AppSettings,
  AudioReport,
  CalibrationProfile,
  CameraResolution,
  CoachReport,
  LevelState,
  MicrophoneProcessingMode,
  PracticeGoalId,
  SavedSession,
  SessionMetadata,
  TranscriptDocument,
  TranscriptionEvent,
  VoiceCoachSession,
  VolumeSample
} from "../shared/types";
import { ProgressSummary, buildProgressSummary } from "../shared/progress";
import { createCalibrationProfile } from "./audio/calibration";
import {
  DEFAULT_MICROPHONE_PROCESSING_MODE,
  DEFAULT_REVIEW_PLAYBACK_GAIN,
  buildCameraConstraints,
  buildMicrophoneConstraints,
  clampReviewPlaybackGain
} from "./audio/constraints";
import { analyzeSessionSamples, buildSessionSummary, reanalyzeSessionWithCalibration } from "./audio/events";
import {
  calculateRms,
  getLevelState,
  isSpeakingFrame,
  isSpeakingWithoutCalibration,
  rmsToDb,
  smoothDb
} from "./audio/level";
import { buildAudioReport } from "./audio/report";
import { PRACTICE_GOALS, buildCoachReport, resolvePracticeGoal } from "./coach/coach";
import { buildTextSuggestions } from "./text/suggestions";

type Screen = "home" | "coach" | "progress" | "calibration" | "practice" | "review" | "settings";
type AudioMode = "idle" | "calibration" | "practice";
type RecordingMode = "audio" | "video";
type AutoTranscriptionState = "idle" | "starting" | "listening" | "unavailable" | "error";

const CALIBRATION_TOTAL_MS = 23_000;
const WARNING_LOW_MS = 1_500;
const WARNING_COOLDOWN_MS = 5_000;
const SAMPLE_INTERVAL_MS = 100;
const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5];
const CAMERA_RESOLUTIONS: CameraResolution[] = ["640x360", "1280x720", "1920x1080"];
const CAMERA_FRAME_RATES = [15, 24, 30];

const initialLevel = {
  db: -100,
  rms: 0,
  speaking: false,
  state: "silent" as LevelState
};

export function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [meta, setMeta] = useState<AppMeta | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [calibration, setCalibration] = useState<CalibrationProfile | null>(null);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [reviewSession, setReviewSession] = useState<SavedSession | null>(null);
  const [practiceTitle, setPracticeTitle] = useState("");
  const [practicePrompt, setPracticePrompt] = useState("");
  const [practiceNotes, setPracticeNotes] = useState("");
  const [practiceGoalId, setPracticeGoalId] = useState<PracticeGoalId>("projection");
  const [microphoneProcessingMode, setMicrophoneProcessingMode] = useState<MicrophoneProcessingMode>(
    DEFAULT_MICROPHONE_PROCESSING_MODE
  );
  const [reviewPlaybackGain, setReviewPlaybackGain] = useState(DEFAULT_REVIEW_PLAYBACK_GAIN);
  const [recordingMode, setRecordingMode] = useState<RecordingMode>("video");
  const [cameraResolution, setCameraResolution] = useState<CameraResolution>("1280x720");
  const [cameraFrameRate, setCameraFrameRate] = useState(30);
  const [cameraMirror, setCameraMirror] = useState(true);
  const [autoTranscriptionEnabled, setAutoTranscriptionEnabled] = useState(true);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [partialTranscript, setPartialTranscript] = useState("");
  const [autoTranscriptionState, setAutoTranscriptionState] = useState<AutoTranscriptionState>("idle");
  const [level, setLevel] = useState(initialLevel);
  const [audioMode, setAudioMode] = useState<AudioMode>("idle");
  const [isRecording, setIsRecording] = useState(false);
  const [calibrationProgressMs, setCalibrationProgressMs] = useState(0);
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const intervalRef = useRef<number | null>(null);
  const smoothedDbRef = useRef<number | null>(null);
  const calibrationSamplesRef = useRef<VolumeSample[]>([]);
  const practiceSamplesRef = useRef<VolumeSample[]>([]);
  const calibrationFinalizingRef = useRef(false);
  const lowStartedAtRef = useRef<number | null>(null);
  const lastWarningAtRef = useRef(-Infinity);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const calibrationRef = useRef<CalibrationProfile | null>(null);
  const isRecordingRef = useRef(false);
  const warningRef = useRef("");
  const activeRecordingCalibrationRef = useRef<CalibrationProfile | null>(null);
  const activeRecordingModeRef = useRef<RecordingMode>("audio");
  const autoTranscriptFinalsRef = useRef<string[]>([]);
  const autoTranscriptPartialRef = useRef("");
  const microphoneElapsedMsRef = useRef(0);
  const recordingStartedAtMsRef = useRef<number | null>(null);
  const recordingWallStartedAtRef = useRef<number | null>(null);

  calibrationRef.current = calibration;
  isRecordingRef.current = isRecording;
  warningRef.current = warning;

  useEffect(() => {
    void initializeApp();
    const unsubscribe = window.voiceCoach.onTranscriptionEvent(handleTranscriptionEvent);
    return () => {
      unsubscribe();
      void window.voiceCoach.stopTranscription();
      stopMicrophone();
    };
  }, []);

  useEffect(() => {
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = recordingMode === "video" ? streamRef.current : null;
    }
  }, [recordingMode, audioMode, selectedCameraId]);

  async function initializeApp() {
    try {
      const [appMeta, savedSettings, savedCalibration, savedSessions] = await Promise.all([
        window.voiceCoach.getAppMeta(),
        window.voiceCoach.loadSettings(),
        window.voiceCoach.loadCalibration(),
        window.voiceCoach.listSessions()
      ]);
      setMeta(appMeta);
      setSettings(savedSettings);
      setMicrophoneProcessingMode(savedSettings?.microphoneProcessingMode ?? DEFAULT_MICROPHONE_PROCESSING_MODE);
      setReviewPlaybackGain(clampReviewPlaybackGain(savedSettings?.reviewPlaybackGain ?? DEFAULT_REVIEW_PLAYBACK_GAIN));
      setSelectedDeviceId(savedSettings?.selectedDeviceId ?? "");
      setSelectedCameraId(savedSettings?.selectedCameraId ?? "");
      setRecordingMode(savedSettings?.cameraEnabled === false ? "audio" : "video");
      setCameraResolution(savedSettings?.cameraResolution ?? "1280x720");
      setCameraFrameRate(savedSettings?.cameraFrameRate ?? 30);
      setCameraMirror(savedSettings?.cameraMirror ?? true);
      setAutoTranscriptionEnabled(savedSettings?.autoTranscriptionEnabled ?? true);
      setCalibration(savedCalibration);
      setSessions(savedSessions);
      await refreshDevices(false, savedSettings?.selectedDeviceId ?? "", savedSettings?.selectedCameraId ?? "");
    } catch (appError) {
      setError(formatError(appError));
    }
  }

  async function refreshDevices(
    requestPermission: boolean,
    preferredDeviceId = selectedDeviceId,
    preferredCameraId = selectedCameraId
  ) {
    try {
      if (requestPermission) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach((track) => track.stop());
      }

      const availableDevices = await navigator.mediaDevices.enumerateDevices();
      const microphones = availableDevices.filter((device) => device.kind === "audioinput");
      const videoInputs = availableDevices.filter((device) => device.kind === "videoinput");
      setDevices(microphones);
      setCameras(videoInputs);
      setSelectedDeviceId((current) => preferredDeviceId || current || microphones[0]?.deviceId || "");
      setSelectedCameraId((current) => preferredCameraId || current || videoInputs[0]?.deviceId || "");
    } catch (deviceError) {
      setError(formatError(deviceError));
    }
  }

  async function selectDevice(deviceId: string) {
    setSelectedDeviceId(deviceId);
    const nextSettings = buildAppSettings({
      deviceId,
      cameraId: selectedCameraId,
      processingMode: microphoneProcessingMode,
      playbackGain: reviewPlaybackGain,
      nextRecordingMode: recordingMode,
      nextCameraResolution: cameraResolution,
      nextCameraFrameRate: cameraFrameRate,
      nextCameraMirror: cameraMirror,
      nextAutoTranscriptionEnabled: autoTranscriptionEnabled
    });
    setSettings(nextSettings);
    try {
      await window.voiceCoach.saveSettings(nextSettings);
    } catch (settingsError) {
      setError(formatError(settingsError));
    }
  }

  async function selectMicrophoneProcessingMode(mode: MicrophoneProcessingMode) {
    setMicrophoneProcessingMode(mode);
    const nextSettings = buildAppSettings({
      deviceId: selectedDeviceId,
      cameraId: selectedCameraId,
      processingMode: mode,
      playbackGain: reviewPlaybackGain,
      nextRecordingMode: recordingMode,
      nextCameraResolution: cameraResolution,
      nextCameraFrameRate: cameraFrameRate,
      nextCameraMirror: cameraMirror,
      nextAutoTranscriptionEnabled: autoTranscriptionEnabled
    });
    setSettings(nextSettings);
    try {
      await window.voiceCoach.saveSettings(nextSettings);
      setWarning(mode === "enhanced" ? "Enhanced microphone processing enabled" : "Natural microphone processing enabled");
    } catch (settingsError) {
      setError(formatError(settingsError));
    }
  }

  async function updateReviewPlaybackGain(value: number) {
    const gain = clampReviewPlaybackGain(value);
    setReviewPlaybackGain(gain);
    const nextSettings = buildAppSettings({
      deviceId: selectedDeviceId,
      cameraId: selectedCameraId,
      processingMode: microphoneProcessingMode,
      playbackGain: gain,
      nextRecordingMode: recordingMode,
      nextCameraResolution: cameraResolution,
      nextCameraFrameRate: cameraFrameRate,
      nextCameraMirror: cameraMirror,
      nextAutoTranscriptionEnabled: autoTranscriptionEnabled
    });
    setSettings(nextSettings);
    try {
      await window.voiceCoach.saveSettings(nextSettings);
    } catch (settingsError) {
      setError(formatError(settingsError));
    }
  }

  async function selectCamera(cameraId: string) {
    setSelectedCameraId(cameraId);
    await saveCaptureSettings({ cameraId });
  }

  async function updateRecordingMode(mode: RecordingMode) {
    setRecordingMode(mode);
    await saveCaptureSettings({ nextRecordingMode: mode });
  }

  async function updateCameraResolution(resolution: CameraResolution) {
    setCameraResolution(resolution);
    await saveCaptureSettings({ nextCameraResolution: resolution });
  }

  async function updateCameraFrameRate(frameRate: number) {
    setCameraFrameRate(frameRate);
    await saveCaptureSettings({ nextCameraFrameRate: frameRate });
  }

  async function updateCameraMirror(mirrored: boolean) {
    setCameraMirror(mirrored);
    await saveCaptureSettings({ nextCameraMirror: mirrored });
  }

  async function updateAutoTranscriptionEnabled(enabled: boolean) {
    setAutoTranscriptionEnabled(enabled);
    await saveCaptureSettings({ nextAutoTranscriptionEnabled: enabled });
  }

  async function saveCaptureSettings(overrides: {
    cameraId?: string;
    nextRecordingMode?: RecordingMode;
    nextCameraResolution?: CameraResolution;
    nextCameraFrameRate?: number;
    nextCameraMirror?: boolean;
    nextAutoTranscriptionEnabled?: boolean;
  }) {
    const nextSettings = buildAppSettings({
      deviceId: selectedDeviceId,
      cameraId: overrides.cameraId ?? selectedCameraId,
      processingMode: microphoneProcessingMode,
      playbackGain: reviewPlaybackGain,
      nextRecordingMode: overrides.nextRecordingMode ?? recordingMode,
      nextCameraResolution: overrides.nextCameraResolution ?? cameraResolution,
      nextCameraFrameRate: overrides.nextCameraFrameRate ?? cameraFrameRate,
      nextCameraMirror: overrides.nextCameraMirror ?? cameraMirror,
      nextAutoTranscriptionEnabled: overrides.nextAutoTranscriptionEnabled ?? autoTranscriptionEnabled
    });
    setSettings(nextSettings);
    try {
      await window.voiceCoach.saveSettings(nextSettings);
    } catch (settingsError) {
      setError(formatError(settingsError));
    }
  }

  function buildAppSettings({
    cameraId,
    deviceId,
    nextAutoTranscriptionEnabled,
    nextCameraFrameRate,
    nextCameraMirror,
    nextCameraResolution,
    nextRecordingMode,
    playbackGain,
    processingMode
  }: {
    cameraId: string;
    deviceId: string;
    nextAutoTranscriptionEnabled: boolean;
    nextCameraFrameRate: number;
    nextCameraMirror: boolean;
    nextCameraResolution: CameraResolution;
    nextRecordingMode: RecordingMode;
    playbackGain: number;
    processingMode: MicrophoneProcessingMode;
  }): AppSettings {
    const device = devices.find((item) => item.deviceId === deviceId);
    const camera = cameras.find((item) => item.deviceId === cameraId);
    return {
      schemaVersion: 1,
      selectedDeviceId: deviceId,
      selectedDeviceLabel: device?.label || "Default microphone",
      selectedCameraId: cameraId,
      selectedCameraLabel: camera?.label || "Default camera",
      microphoneProcessingMode: processingMode,
      reviewPlaybackGain: clampReviewPlaybackGain(playbackGain),
      cameraEnabled: nextRecordingMode === "video",
      cameraResolution: nextCameraResolution,
      cameraFrameRate: nextCameraFrameRate,
      cameraMirror: nextCameraMirror,
      autoTranscriptionEnabled: nextAutoTranscriptionEnabled,
      updatedAt: new Date().toISOString()
    };
  }

  async function startCalibration() {
    setError("");
    setWarning("");
    setScreen("calibration");
    setCalibrationProgressMs(0);
    calibrationSamplesRef.current = [];
    calibrationFinalizingRef.current = false;

    await startMicrophone("calibration", (db, rms, elapsedMs) => {
      const speaking = db > -65;
      calibrationSamplesRef.current.push({ tMs: elapsedMs, db, rms, speaking });
      setCalibrationProgressMs(elapsedMs);
      setLevel({ db, rms, speaking, state: getLevelState(db, speaking, null) });

      if (elapsedMs >= CALIBRATION_TOTAL_MS && !calibrationFinalizingRef.current) {
        calibrationFinalizingRef.current = true;
        void finishCalibration();
      }
    });
  }

  async function finishCalibration() {
    try {
      const device = devices.find((item) => item.deviceId === selectedDeviceId);
      const profile = createCalibrationProfile({
        deviceId: selectedDeviceId,
        deviceLabel: device?.label || "Default microphone",
        samples: calibrationSamplesRef.current
      });

      await window.voiceCoach.saveCalibration(profile);
      setCalibration(profile);
      calibrationRef.current = profile;
      setWarning("Calibration saved");
      stopMicrophone();
    } catch (calibrationError) {
      setError(formatError(calibrationError));
    }
  }

  async function preparePractice() {
    setScreen("practice");
    setWarning("");
    setError("");
    practiceSamplesRef.current = [];
    await startMicrophone("practice", handlePracticeSample);
  }

  async function startRecording() {
    if (!streamRef.current) {
      await preparePractice();
    }

    if (!streamRef.current) {
      setError("Microphone stream is not available.");
      return;
    }

    chunksRef.current = [];
    practiceSamplesRef.current = [];
    lowStartedAtRef.current = null;
    lastWarningAtRef.current = -Infinity;
    autoTranscriptFinalsRef.current = [];
    autoTranscriptPartialRef.current = "";
    setLiveTranscript("");
    setPartialTranscript("");
    setAutoTranscriptionState(autoTranscriptionEnabled ? "starting" : "idle");
    recordingStartedAtMsRef.current = microphoneElapsedMsRef.current;
    recordingWallStartedAtRef.current = performance.now();
    activeRecordingCalibrationRef.current = calibrationRef.current;
    activeRecordingModeRef.current = recordingMode;

    if (autoTranscriptionEnabled) {
      try {
        await window.voiceCoach.startTranscription({ provider: "windows_system_speech", culture: "en-US" });
      } catch (transcriptionError) {
        setAutoTranscriptionState("error");
        setWarning(`Built-in transcription could not start: ${formatError(transcriptionError)}`);
      }
    }

    const recorder = new MediaRecorder(
      streamRef.current,
      preferredRecorderOptions(recordingMode === "video" && streamRef.current.getVideoTracks().length > 0)
    );
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.start();
    isRecordingRef.current = true;
    setIsRecording(true);
    setWarning(
      activeRecordingCalibrationRef.current
        ? ""
        : "Recording without calibration - review metrics will be incomplete."
    );
  }

  async function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }

    const recordingBlob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () =>
        resolve(
          new Blob(chunksRef.current, {
            type: activeRecordingModeRef.current === "video" ? "video/webm" : "audio/webm"
          })
        );
      recorder.stop();
    });

    if (autoTranscriptionEnabled) {
      await window.voiceCoach.stopTranscription();
    }

    setIsRecording(false);
    isRecordingRef.current = false;
    const samples = [...practiceSamplesRef.current];
    const calibrationForSession = activeRecordingCalibrationRef.current;
    const durationMs = Math.max(
      samples.at(-1)?.tMs ?? 0,
      recordingWallStartedAtRef.current ? Math.round(performance.now() - recordingWallStartedAtRef.current) : 0
    );
    const events = analyzeSessionSamples(samples, calibrationForSession);
    const metadata = buildSessionMetadata(practiceTitle, practicePrompt, practiceNotes, [], practiceGoalId);
    const session: VoiceCoachSession = {
      schemaVersion: 1,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      durationMs,
      deviceId: selectedDeviceId,
      calibrationId: calibrationForSession?.id ?? null,
      calibrationSnapshot: calibrationForSession,
      metadata,
      recordingFile: "recording.webm",
      recordingKind: activeRecordingModeRef.current,
      cameraDeviceId: activeRecordingModeRef.current === "video" ? selectedCameraId : undefined,
      cameraDeviceLabel:
        activeRecordingModeRef.current === "video"
          ? cameras.find((item) => item.deviceId === selectedCameraId)?.label || "Default camera"
          : undefined,
      cameraSettings:
        activeRecordingModeRef.current === "video"
          ? {
              resolution: cameraResolution,
              frameRate: cameraFrameRate,
              mirrored: cameraMirror
            }
          : undefined,
      samples,
      events,
      summary: buildSessionSummary(samples, events, calibrationForSession)
    };
    const report = buildAudioReport(session, calibrationForSession);
    const finalTranscript = buildFinalAutoTranscript();
    const transcript = finalTranscript
      ? {
          schemaVersion: 1 as const,
          sessionId: session.id,
          source: "windows_builtin" as const,
          text: finalTranscript,
          updatedAt: new Date().toISOString()
        }
      : null;
    const textSuggestions = transcript ? buildTextSuggestions(session.id, transcript.text) : null;
    const coachReport = buildCoachReport(session, report, textSuggestions, practiceGoalId);
    activeRecordingCalibrationRef.current = null;
    recordingStartedAtMsRef.current = null;
    recordingWallStartedAtRef.current = null;

    try {
      const saved = await window.voiceCoach.saveSession({
        session,
        report,
        coachReport,
        recordingData: await recordingBlob.arrayBuffer()
      });
      let savedWithTranscript = saved;
      if (transcript && textSuggestions) {
        savedWithTranscript = await window.voiceCoach.saveTranscript({
          sessionId: session.id,
          transcript,
          textSuggestions
        });
        savedWithTranscript = await window.voiceCoach.saveCoachReport({
          sessionId: session.id,
          coachReport
        });
      }
      const savedSessions = await window.voiceCoach.listSessions();
      setSessions(savedSessions);
      setReviewSession(savedWithTranscript);
      setScreen("review");
      setPracticeTitle("");
      setPracticePrompt("");
      setPracticeNotes("");
      stopMicrophone();
      setAutoTranscriptionState("idle");
    } catch (saveError) {
      setError(formatError(saveError));
    }
  }

  function handlePracticeSample(db: number, rms: number, elapsedMs: number) {
    microphoneElapsedMsRef.current = elapsedMs;
    const currentCalibration = calibrationRef.current;
    const speaking = currentCalibration
      ? isSpeakingFrame(db, currentCalibration.noiseFloorDb)
      : isSpeakingWithoutCalibration(db);
    const state = getLevelState(db, speaking, currentCalibration);
    setLevel({ db, rms, speaking, state });

    if (!isRecordingRef.current) {
      return;
    }

    const recordingStartMs = recordingStartedAtMsRef.current ?? elapsedMs;
    const recordingElapsedMs = Math.max(0, elapsedMs - recordingStartMs);
    const sample = { tMs: recordingElapsedMs, db, rms, speaking };
    practiceSamplesRef.current.push(sample);

    const recordingCalibration = activeRecordingCalibrationRef.current;
    if (!recordingCalibration) {
      return;
    }

    const isLow = speaking && db < recordingCalibration.lowThresholdDb;
    if (isLow) {
      lowStartedAtRef.current ??= recordingElapsedMs;
      const lowDuration = recordingElapsedMs - lowStartedAtRef.current;
      const cooldownElapsed = recordingElapsedMs - lastWarningAtRef.current;
      if (lowDuration >= WARNING_LOW_MS && cooldownElapsed >= WARNING_COOLDOWN_MS) {
        setWarning("Voice is low - speak a little louder");
        lastWarningAtRef.current = recordingElapsedMs;
      }
    } else {
      lowStartedAtRef.current = null;
      if (warningRef.current.startsWith("Voice is low")) {
        setWarning("");
      }
    }
  }

  function handleTranscriptionEvent(event: TranscriptionEvent) {
    if (event.type === "ready") {
      setAutoTranscriptionState("listening");
      return;
    }

    if (event.type === "partial") {
      autoTranscriptPartialRef.current = event.text;
      setPartialTranscript(event.text);
      return;
    }

    if (event.type === "final") {
      const cleaned = event.text.trim();
      if (cleaned) {
        autoTranscriptFinalsRef.current = [...autoTranscriptFinalsRef.current, cleaned];
        const nextText = autoTranscriptFinalsRef.current.join(" ");
        setLiveTranscript(nextText);
      }
      autoTranscriptPartialRef.current = "";
      setPartialTranscript("");
      return;
    }

    if (event.type === "error") {
      setAutoTranscriptionState("error");
      setWarning(`Built-in transcription error: ${event.message}`);
      return;
    }

    if (event.type === "stopped" && autoTranscriptionState !== "error") {
      setAutoTranscriptionState("idle");
    }
  }

  function buildFinalAutoTranscript(): string {
    return [...autoTranscriptFinalsRef.current, autoTranscriptPartialRef.current]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function startMicrophone(mode: AudioMode, onSample: (db: number, rms: number, elapsedMs: number) => void) {
    stopMicrophone();
    await refreshDevices(false);

    const constraints =
      mode === "practice" && recordingMode === "video"
        ? buildCameraConstraints({
            cameraDeviceId: selectedCameraId,
            frameRate: cameraFrameRate,
            microphoneDeviceId: selectedDeviceId,
            processingMode: microphoneProcessingMode,
            resolution: cameraResolution
          })
        : buildMicrophoneConstraints(selectedDeviceId, microphoneProcessingMode);
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const audioContext = new AudioContext();
    const audioStream = new MediaStream(stream.getAudioTracks());
    const source = audioContext.createMediaStreamSource(audioStream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    streamRef.current = stream;
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = mode === "practice" && recordingMode === "video" ? stream : null;
    }
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    setAudioMode(mode);
    smoothedDbRef.current = null;

    const values = new Float32Array(analyser.fftSize);
    const startedAt = performance.now();
    intervalRef.current = window.setInterval(() => {
      analyser.getFloatTimeDomainData(values);
      const rms = calculateRms(values);
      const rawDb = rmsToDb(rms);
      const db = Math.round(smoothDb(smoothedDbRef.current, rawDb) * 10) / 10;
      smoothedDbRef.current = db;
      onSample(db, rms, Math.round(performance.now() - startedAt));
    }, SAMPLE_INTERVAL_MS);
  }

  function stopMicrophone() {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    recorderRef.current = null;
    activeRecordingCalibrationRef.current = null;
    recordingStartedAtMsRef.current = null;
    recordingWallStartedAtRef.current = null;
    microphoneElapsedMsRef.current = 0;
    isRecordingRef.current = false;
    setAudioMode("idle");
    setIsRecording(false);
    setLevel(initialLevel);
  }

  function openSession(session: SavedSession) {
    setReviewSession(session);
    setScreen("review");
  }

  async function reanalyzeReviewSession() {
    if (!reviewSession) {
      return;
    }

    if (!calibration) {
      setError("Save a microphone calibration before reanalyzing this session.");
      return;
    }

    try {
      setError("");
      const updated = reanalyzeSessionWithCalibration(reviewSession.session, calibration);
      const updatedWithSnapshot = { ...updated, calibrationSnapshot: calibration };
      await window.voiceCoach.updateSession({ session: updatedWithSnapshot });
      const saved = await window.voiceCoach.saveReport({
        sessionId: updatedWithSnapshot.id,
        report: buildAudioReport(updatedWithSnapshot, calibration)
      });
      const savedWithCoach = await refreshCoachReport(saved);
      const savedSessions = await window.voiceCoach.listSessions();
      setReviewSession(savedWithCoach);
      setSessions(savedSessions);
      setWarning("Session reanalyzed with current calibration");
    } catch (reanalyzeError) {
      setError(formatError(reanalyzeError));
    }
  }

  async function updateReviewMetadata(metadata: SessionMetadata) {
    if (!reviewSession) {
      return;
    }

    try {
      setError("");
      const updatedSession = { ...reviewSession.session, metadata };
      const saved = await window.voiceCoach.updateSession({ session: updatedSession });
      const savedWithCoach = await refreshCoachReport(saved);
      const savedSessions = await window.voiceCoach.listSessions();
      setReviewSession(savedWithCoach);
      setSessions(savedSessions);
      setWarning("Session details saved");
    } catch (metadataError) {
      setError(formatError(metadataError));
    }
  }

  async function exportReviewReport() {
    if (!reviewSession) {
      return;
    }

    try {
      setError("");
      const exportPath = await window.voiceCoach.exportSessionReport({ sessionId: reviewSession.session.id });
      setWarning(`Report exported: ${exportPath}`);
    } catch (exportError) {
      setError(formatError(exportError));
    }
  }

  async function exportProgressReport() {
    try {
      setError("");
      const exportPath = await window.voiceCoach.exportProgressReport();
      setWarning(`Progress report exported: ${exportPath}`);
    } catch (exportError) {
      setError(formatError(exportError));
    }
  }

  async function revealReviewFolder() {
    if (!reviewSession) {
      return;
    }

    try {
      setError("");
      await window.voiceCoach.revealSessionFolder({ sessionId: reviewSession.session.id });
    } catch (revealError) {
      setError(formatError(revealError));
    }
  }

  async function deleteReviewSession() {
    if (!reviewSession) {
      return;
    }

    const confirmed = window.confirm("Delete this local session folder? This removes the recording and JSON files.");
    if (!confirmed) {
      return;
    }

    try {
      setError("");
      await window.voiceCoach.deleteSession({ sessionId: reviewSession.session.id });
      const savedSessions = await window.voiceCoach.listSessions();
      setSessions(savedSessions);
      setReviewSession(savedSessions[0] ?? null);
      setWarning("Session deleted");
    } catch (deleteError) {
      setError(formatError(deleteError));
    }
  }

  async function saveReviewTranscript(text: string, source: TranscriptDocument["source"]) {
    if (!reviewSession) {
      return;
    }

    try {
      setError("");
      const transcript: TranscriptDocument = {
        schemaVersion: 1,
        sessionId: reviewSession.session.id,
        source,
        text,
        updatedAt: new Date().toISOString()
      };
      const textSuggestions = buildTextSuggestions(reviewSession.session.id, text);
      const saved = await window.voiceCoach.saveTranscript({
        sessionId: reviewSession.session.id,
        transcript,
        textSuggestions
      });
      const savedWithCoach = await refreshCoachReport(saved);
      const savedSessions = await window.voiceCoach.listSessions();
      setReviewSession(savedWithCoach);
      setSessions(savedSessions);
      setWarning("Transcript analyzed locally");
    } catch (transcriptError) {
      setError(formatError(transcriptError));
    }
  }

  async function refreshReviewCoachReport() {
    if (!reviewSession) {
      return;
    }

    try {
      setError("");
      const saved = await refreshCoachReport(reviewSession);
      const savedSessions = await window.voiceCoach.listSessions();
      setReviewSession(saved);
      setSessions(savedSessions);
      setWarning("Coach scorecard updated");
    } catch (coachError) {
      setError(formatError(coachError));
    }
  }

  async function refreshCoachReport(saved: SavedSession): Promise<SavedSession> {
    const goal = resolvePracticeGoal(saved.session.metadata?.goalId);
    const coachReport = buildCoachReport(saved.session, saved.report, saved.textSuggestions, goal.id);
    return window.voiceCoach.saveCoachReport({
      sessionId: saved.session.id,
      coachReport
    });
  }

  const calibrationPercent = Math.min(100, Math.round((calibrationProgressMs / CALIBRATION_TOTAL_MS) * 100));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Volume2 size={22} />
          </div>
          <div>
            <strong>VoiceCoach Offline</strong>
            <span>v{meta?.version ?? "0.6.0"}</span>
          </div>
        </div>

        <nav className="nav-list">
          <NavButton icon={<Activity />} active={screen === "home"} onClick={() => setScreen("home")}>
            Home
          </NavButton>
          <NavButton icon={<Target />} active={screen === "coach"} onClick={() => setScreen("coach")}>
            Coach
          </NavButton>
          <NavButton icon={<TrendingUp />} active={screen === "progress"} onClick={() => setScreen("progress")}>
            Progress
          </NavButton>
          <NavButton icon={<Wand2 />} active={screen === "calibration"} onClick={() => setScreen("calibration")}>
            Calibration
          </NavButton>
          <NavButton icon={<Radio />} active={screen === "practice"} onClick={preparePractice}>
            Practice
          </NavButton>
          <NavButton icon={<BarChart3 />} active={screen === "review"} onClick={() => setScreen("review")}>
            Review
          </NavButton>
          <NavButton icon={<Settings />} active={screen === "settings"} onClick={() => setScreen("settings")}>
            Settings
          </NavButton>
        </nav>

        <div className="sidebar-footer">
          <span>{audioMode === "idle" ? "Microphone idle" : `Microphone active: ${audioMode}`}</span>
        </div>
      </aside>

      <main className="content">
        {error && <div className="notice danger">{error}</div>}
        {warning && <div className="notice">{warning}</div>}

        {screen === "home" && (
          <HomeScreen
            calibration={calibration}
            sessions={sessions}
            onStartPractice={preparePractice}
            onStartCalibration={startCalibration}
            onOpenSession={openSession}
            recordingMode={recordingMode}
            autoTranscriptionEnabled={autoTranscriptionEnabled}
          />
        )}

        {screen === "coach" && (
          <CoachScreen
            goalId={practiceGoalId}
            onGoalChange={setPracticeGoalId}
            onOpenSession={openSession}
            onStartPractice={preparePractice}
            sessions={sessions}
          />
        )}

        {screen === "progress" && (
          <ProgressScreen
            onExportProgress={exportProgressReport}
            onOpenSession={openSession}
            onStartPractice={preparePractice}
            sessions={sessions}
          />
        )}

        {screen === "calibration" && (
          <CalibrationScreen
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={selectDevice}
            onRefreshDevices={() => refreshDevices(true)}
            onStartCalibration={startCalibration}
            progressPercent={calibrationPercent}
            profile={calibration}
            level={level}
            active={audioMode === "calibration"}
            microphoneProcessingMode={microphoneProcessingMode}
            onSelectMicrophoneProcessingMode={selectMicrophoneProcessingMode}
          />
        )}

        {screen === "practice" && (
          <PracticeScreen
            autoTranscriptionEnabled={autoTranscriptionEnabled}
            autoTranscriptionState={autoTranscriptionState}
            cameraFrameRate={cameraFrameRate}
            cameraMirror={cameraMirror}
            cameraResolution={cameraResolution}
            cameras={cameras}
            calibration={calibration}
            level={level}
            isRecording={isRecording}
            liveTranscript={liveTranscript}
            partialTranscript={partialTranscript}
            title={practiceTitle}
            prompt={practicePrompt}
            notes={practiceNotes}
            onAutoTranscriptionEnabledChange={updateAutoTranscriptionEnabled}
            onCameraFrameRateChange={updateCameraFrameRate}
            onCameraMirrorChange={updateCameraMirror}
            onCameraResolutionChange={updateCameraResolution}
            onChangeTitle={setPracticeTitle}
            onChangePrompt={setPracticePrompt}
            onChangeNotes={setPracticeNotes}
            onGoalChange={setPracticeGoalId}
            onRefreshDevices={() => refreshDevices(true)}
            onRecordingModeChange={updateRecordingMode}
            onSelectCamera={selectCamera}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            onStartCalibration={startCalibration}
            previewVideoRef={previewVideoRef}
            recordingMode={recordingMode}
            selectedCameraId={selectedCameraId}
            goalId={practiceGoalId}
          />
        )}

        {screen === "review" && (
          <ReviewScreen
            calibration={calibration}
            session={reviewSession}
            sessions={sessions}
            onOpenSession={openSession}
            onReanalyzeSession={reanalyzeReviewSession}
            onUpdateMetadata={updateReviewMetadata}
            onExportReport={exportReviewReport}
            onRevealFolder={revealReviewFolder}
            onDeleteSession={deleteReviewSession}
            onSaveTranscript={saveReviewTranscript}
            onRefreshCoachReport={refreshReviewCoachReport}
            playbackGain={reviewPlaybackGain}
            onPlaybackGainChange={updateReviewPlaybackGain}
          />
        )}

        {screen === "settings" && (
          <SettingsScreen
            autoTranscriptionEnabled={autoTranscriptionEnabled}
            cameraFrameRate={cameraFrameRate}
            cameraMirror={cameraMirror}
            cameraResolution={cameraResolution}
            cameras={cameras}
            meta={meta}
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            selectedCameraId={selectedCameraId}
            onSelectDevice={selectDevice}
            onSelectCamera={selectCamera}
            onRefreshDevices={() => refreshDevices(true)}
            calibration={calibration}
            settings={settings}
            microphoneProcessingMode={microphoneProcessingMode}
            onSelectMicrophoneProcessingMode={selectMicrophoneProcessingMode}
            reviewPlaybackGain={reviewPlaybackGain}
            onReviewPlaybackGainChange={updateReviewPlaybackGain}
            onAutoTranscriptionEnabledChange={updateAutoTranscriptionEnabled}
            onCameraFrameRateChange={updateCameraFrameRate}
            onCameraMirrorChange={updateCameraMirror}
            onCameraResolutionChange={updateCameraResolution}
          />
        )}
      </main>
    </div>
  );
}

function NavButton({
  active,
  children,
  icon,
  onClick
}: {
  active: boolean;
  children: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

function HomeScreen({
  autoTranscriptionEnabled,
  calibration,
  sessions,
  recordingMode,
  onStartPractice,
  onStartCalibration,
  onOpenSession
}: {
  autoTranscriptionEnabled: boolean;
  calibration: CalibrationProfile | null;
  recordingMode: RecordingMode;
  sessions: SavedSession[];
  onStartPractice: () => void;
  onStartCalibration: () => void;
  onOpenSession: (session: SavedSession) => void;
}) {
  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <h1>Practice speaking at a stronger, steadier volume</h1>
          <p>Offline audio, camera practice, built-in transcription, and local review.</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={onStartCalibration}>
            <Wand2 size={18} /> Calibrate
          </button>
          <button className="primary-button" onClick={onStartPractice}>
            <Mic size={18} /> Start Practice
          </button>
        </div>
      </header>

      <div className="dashboard-grid">
        <Metric label="Calibration" value={calibration ? "Ready" : "Needed"} />
        <Metric label="Target Minimum" value={calibration ? `${calibration.targetMinDb} dB` : "--"} />
        <Metric label="Recording" value={recordingMode === "video" ? "Camera + mic" : "Audio only"} />
        <Metric label="Transcription" value={autoTranscriptionEnabled ? "Built in" : "Off"} />
      </div>

      <div className="dashboard-grid">
        <Metric
          label="Coach Average"
          value={formatAverageScore(sessions.map((session) => session.coachReport?.readinessScore))}
        />
        <Metric label="Recent Sessions" value={String(sessions.length)} />
        <Metric
          label="Video Sessions"
          value={String(sessions.filter((session) => session.session.recordingKind === "video").length)}
        />
        <Metric
          label="Auto Transcripts"
          value={String(sessions.filter((session) => session.transcript?.source === "windows_builtin").length)}
        />
      </div>

      <section className="panel">
        <div className="panel-title">
          <FolderOpen size={18} />
          <h2>Recent Sessions</h2>
        </div>
        <SessionList sessions={sessions} onOpenSession={onOpenSession} />
      </section>
    </section>
  );
}

function CoachScreen({
  goalId,
  onGoalChange,
  onOpenSession,
  onStartPractice,
  sessions
}: {
  goalId: PracticeGoalId;
  onGoalChange: (goalId: PracticeGoalId) => void;
  onOpenSession: (session: SavedSession) => void;
  onStartPractice: () => void;
  sessions: SavedSession[];
}) {
  const coachSessions = useMemo(
    () => sessions.filter((session) => session.coachReport).slice(0, 8),
    [sessions]
  );
  const latest = coachSessions[0]?.coachReport ?? null;
  const bestScore = Math.max(0, ...coachSessions.map((session) => session.coachReport?.readinessScore ?? 0));
  const averageScore = formatAverageScore(coachSessions.map((session) => session.coachReport?.readinessScore));
  const selectedGoal = resolvePracticeGoal(goalId);

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <h1>Coach Mode</h1>
          <p>Choose a practice goal, record a take, and review a local scorecard with the next drill.</p>
        </div>
        <div className="header-actions">
          <button className="primary-button" onClick={onStartPractice}>
            <Mic size={18} /> Start Guided Practice
          </button>
        </div>
      </header>

      <GoalSelector activeGoalId={goalId} onChange={onGoalChange} />

      <div className="dashboard-grid">
        <Metric label="Active Goal" value={selectedGoal.label} />
        <Metric label="Average Score" value={averageScore} />
        <Metric label="Best Score" value={bestScore ? `${bestScore}/100` : "--"} />
        <Metric label="Coach Reports" value={String(coachSessions.length)} />
      </div>

      <section className="coach-overview">
        <div className="coach-summary-panel">
          <div className="panel-title">
            <Sparkles size={18} />
            <h2>Latest Coach Summary</h2>
          </div>
          {latest ? (
            <>
              <div className="readiness-score">
                <strong>{latest.readinessScore}</strong>
                <span>/100</span>
              </div>
              <p>{latest.summary}</p>
              <ScoreBars report={latest} />
            </>
          ) : (
            <div className="empty-state">
              Record a practice session to generate the first local coach report.
            </div>
          )}
        </div>

        <div className="coach-summary-panel">
          <div className="panel-title">
            <TrendingUp size={18} />
            <h2>Recent Progress</h2>
          </div>
          {coachSessions.length > 0 ? (
            <div className="trend-list">
              {coachSessions.map((saved) => (
                <button key={saved.session.id} className="trend-row" onClick={() => onOpenSession(saved)}>
                  <span>{saved.session.metadata?.title || new Date(saved.session.createdAt).toLocaleString()}</span>
                  <ProgressBar value={saved.coachReport?.readinessScore ?? 0} />
                  <strong>{saved.coachReport?.readinessScore ?? "--"}</strong>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-state">No progress trend yet.</div>
          )}
        </div>
      </section>

      {latest && (
        <section className="panel">
          <div className="panel-title">
            <Trophy size={18} />
            <h2>Next Drill</h2>
          </div>
          <div className="next-drill">
            <strong>{latest.nextDrill.title}</strong>
            <p>{latest.nextDrill.detail}</p>
            <ol>
              {latest.nextDrill.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </section>
      )}
    </section>
  );
}

function ProgressScreen({
  onExportProgress,
  onOpenSession,
  onStartPractice,
  sessions
}: {
  onExportProgress: () => void;
  onOpenSession: (session: SavedSession) => void;
  onStartPractice: () => void;
  sessions: SavedSession[];
}) {
  const summary = useMemo(() => buildProgressSummary(sessions), [sessions]);
  const latestRecord = summary.records.find((record) => record.readinessScore !== null);
  const matchingLatestSession = latestRecord
    ? sessions.find((session) => session.session.id === latestRecord.id)
    : null;

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <h1>Progress Coach</h1>
          <p>Track improvement across saved sessions and use the weakest area to choose the next practice pass.</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={onExportProgress} disabled={summary.sessionCount === 0}>
            <Download size={18} /> Export Progress
          </button>
          <button className="primary-button" onClick={onStartPractice}>
            <Mic size={18} /> Practice Again
          </button>
        </div>
      </header>

      <div className="dashboard-grid">
        <Metric label="Sessions" value={String(summary.sessionCount)} />
        <Metric label="Average Readiness" value={formatNullableScore(summary.averageReadinessScore)} />
        <Metric label="Best Readiness" value={formatNullableScore(summary.bestReadinessScore)} />
        <Metric label="Transcript Coverage" value={`${summary.transcriptCoveragePercent}%`} />
      </div>

      <section className="coach-overview">
        <div className="coach-summary-panel">
          <div className="panel-title">
            <TrendingUp size={18} />
            <h2>Readiness Trend</h2>
          </div>
          {summary.records.some((record) => record.readinessScore !== null) ? (
            <ProgressTrend summary={summary} onOpenSession={onOpenSession} sessions={sessions} />
          ) : (
            <div className="empty-state">No Coach Mode scores yet.</div>
          )}
        </div>

        <div className="coach-summary-panel">
          <div className="panel-title">
            <Target size={18} />
            <h2>Next Practice Focus</h2>
          </div>
          {matchingLatestSession?.coachReport ? (
            <div className="next-drill">
              <span className="focus-label">Weakest current trend: {formatSkillLabel(summary.weakestSkill)}</span>
              <strong>{matchingLatestSession.coachReport.nextDrill.title}</strong>
              <p>{matchingLatestSession.coachReport.nextDrill.detail}</p>
              <ol>
                {matchingLatestSession.coachReport.nextDrill.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="empty-state">Record a coached session to unlock a next-practice drill.</div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <Trophy size={18} />
          <h2>Goal Progress</h2>
        </div>
        <div className="goal-progress-grid">
          {summary.goals.length > 0 ? (
            summary.goals.map((goal) => (
              <div className="goal-progress-card" key={goal.goalId}>
                <strong>{goal.goalLabel}</strong>
                <span>{goal.sessionCount} session{goal.sessionCount === 1 ? "" : "s"}</span>
                <ProgressBar value={goal.averageReadinessScore ?? 0} />
                <em>Avg {formatNullableScore(goal.averageReadinessScore)} · Weakest {formatSkillLabel(goal.weakestSkill)}</em>
              </div>
            ))
          ) : (
            <div className="empty-state">No goal history yet.</div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <FolderOpen size={18} />
          <h2>History</h2>
        </div>
        <SessionList sessions={sessions} onOpenSession={onOpenSession} />
      </section>
    </section>
  );
}

function ProgressTrend({
  onOpenSession,
  sessions,
  summary
}: {
  onOpenSession: (session: SavedSession) => void;
  sessions: SavedSession[];
  summary: ProgressSummary;
}) {
  const records = [...summary.records]
    .filter((record) => record.readinessScore !== null)
    .reverse()
    .slice(-12);

  return (
    <div className="progress-trend">
      {records.map((record) => {
        const saved = sessions.find((session) => session.session.id === record.id);
        return (
          <button
            key={record.id}
            className="progress-trend-bar"
            onClick={() => saved && onOpenSession(saved)}
            style={{ height: `${Math.max(12, record.readinessScore ?? 0)}%` }}
            title={`${record.title}: ${record.readinessScore}/100`}
          >
            <span>{record.readinessScore}</span>
          </button>
        );
      })}
    </div>
  );
}

function GoalSelector({
  activeGoalId,
  disabled = false,
  onChange
}: {
  activeGoalId: PracticeGoalId;
  disabled?: boolean;
  onChange: (goalId: PracticeGoalId) => void;
}) {
  return (
    <section className="goal-selector" aria-label="Practice goals">
      {PRACTICE_GOALS.map((goal) => (
        <button
          key={goal.id}
          className={`goal-card ${activeGoalId === goal.id ? "active" : ""}`}
          disabled={disabled}
          onClick={() => onChange(goal.id)}
        >
          <span>{goal.label}</span>
          <small>{goal.detail}</small>
        </button>
      ))}
    </section>
  );
}

function ScoreBars({ report }: { report: CoachReport }) {
  const rows = [
    ["Projection", report.scores.projection],
    ["Clarity", report.scores.clarity],
    ["Pacing", report.scores.pacing],
    ["Consistency", report.scores.consistency]
  ] as const;

  return (
    <div className="score-bars">
      {rows.map(([label, value]) => (
        <div className="score-row" key={label}>
          <span>{label}</span>
          <ProgressBar value={value} />
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div className="progress-bar" aria-label={`${width} percent`}>
      <div style={{ width: `${width}%` }} />
    </div>
  );
}

function CalibrationScreen({
  active,
  devices,
  level,
  onRefreshDevices,
  onSelectDevice,
  onSelectMicrophoneProcessingMode,
  onStartCalibration,
  progressPercent,
  profile,
  microphoneProcessingMode,
  selectedDeviceId
}: {
  active: boolean;
  devices: MediaDeviceInfo[];
  level: typeof initialLevel;
  onRefreshDevices: () => void;
  onSelectDevice: (id: string) => void;
  onSelectMicrophoneProcessingMode: (mode: MicrophoneProcessingMode) => void;
  onStartCalibration: () => void;
  progressPercent: number;
  profile: CalibrationProfile | null;
  microphoneProcessingMode: MicrophoneProcessingMode;
  selectedDeviceId: string;
}) {
  return (
    <section className="screen">
      <header className="screen-header compact">
        <div>
          <h1>Microphone Calibration</h1>
          <p>Stay quiet for the first few seconds, then speak normally until the timer completes.</p>
        </div>
      </header>

      <section className="panel">
        <DevicePicker
          devices={devices}
          selectedDeviceId={selectedDeviceId}
          onSelectDevice={onSelectDevice}
          onRefreshDevices={onRefreshDevices}
        />
        <AudioProcessingControl
          mode={microphoneProcessingMode}
          onChange={onSelectMicrophoneProcessingMode}
        />
        <VolumeMeter level={level} calibration={profile} />
        <div className="progress-track" aria-label="Calibration progress">
          <div style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="row-actions">
          <button className="primary-button" onClick={onStartCalibration} disabled={active}>
            <Timer size={18} /> {active ? `Calibrating ${progressPercent}%` : "Start 23s Calibration"}
          </button>
        </div>
      </section>

      {profile && (
        <section className="panel stats-panel">
          <Metric label="Noise Floor" value={`${profile.noiseFloorDb} dB`} />
          <Metric label="Speech Average" value={`${profile.speechAverageDb} dB`} />
          <Metric label="Target Range" value={`${profile.targetMinDb} to ${profile.targetMaxDb} dB`} />
          <Metric label="Low Threshold" value={`${profile.lowThresholdDb} dB`} />
        </section>
      )}
    </section>
  );
}

function PracticeScreen({
  autoTranscriptionEnabled,
  autoTranscriptionState,
  cameraFrameRate,
  cameraMirror,
  cameraResolution,
  cameras,
  calibration,
  goalId,
  isRecording,
  level,
  liveTranscript,
  notes,
  onAutoTranscriptionEnabledChange,
  onCameraFrameRateChange,
  onCameraMirrorChange,
  onCameraResolutionChange,
  onChangeNotes,
  onChangePrompt,
  onChangeTitle,
  onGoalChange,
  onRefreshDevices,
  onRecordingModeChange,
  onSelectCamera,
  onStartCalibration,
  onStartRecording,
  onStopRecording,
  partialTranscript,
  previewVideoRef,
  prompt,
  recordingMode,
  selectedCameraId,
  title
}: {
  autoTranscriptionEnabled: boolean;
  autoTranscriptionState: AutoTranscriptionState;
  cameraFrameRate: number;
  cameraMirror: boolean;
  cameraResolution: CameraResolution;
  cameras: MediaDeviceInfo[];
  calibration: CalibrationProfile | null;
  goalId: PracticeGoalId;
  isRecording: boolean;
  level: typeof initialLevel;
  liveTranscript: string;
  notes: string;
  onAutoTranscriptionEnabledChange: (enabled: boolean) => void;
  onCameraFrameRateChange: (frameRate: number) => void;
  onCameraMirrorChange: (mirrored: boolean) => void;
  onCameraResolutionChange: (resolution: CameraResolution) => void;
  onChangeNotes: (value: string) => void;
  onChangePrompt: (value: string) => void;
  onChangeTitle: (value: string) => void;
  onGoalChange: (goalId: PracticeGoalId) => void;
  onRefreshDevices: () => void;
  onRecordingModeChange: (mode: RecordingMode) => void;
  onSelectCamera: (id: string) => void;
  onStartCalibration: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  partialTranscript: string;
  previewVideoRef: React.RefObject<HTMLVideoElement | null>;
  prompt: string;
  recordingMode: RecordingMode;
  selectedCameraId: string;
  title: string;
}) {
  const transcriptPreview =
    [liveTranscript, partialTranscript].filter(Boolean).join(" ").trim() ||
    (autoTranscriptionEnabled
      ? "Built-in transcription will appear here while you speak."
      : "Turn on built-in transcription to capture text during practice.");

  return (
    <section className="screen">
      <header className="screen-header compact">
        <div>
          <h1>Practice Session</h1>
          <p>{calibration ? "Use the meter to stay in your target range." : "Calibrate first for better warnings."}</p>
        </div>
        {!calibration && (
          <button className="secondary-button" onClick={onStartCalibration}>
            <Wand2 size={18} /> Calibrate
          </button>
        )}
      </header>

      <GoalSelector activeGoalId={goalId} disabled={isRecording} onChange={onGoalChange} />

      <section className="panel capture-settings-panel">
        <div className="panel-title">
          <Camera size={18} />
          <h2>Camera and Transcription</h2>
        </div>
        <div className="capture-grid">
          <div className="processing-control">
            <div>
              <strong>Recording mode</strong>
              <span>Record audio only, or save camera and microphone together in the local session file.</span>
            </div>
            <div className="segmented-control">
              <button
                className={recordingMode === "video" ? "active" : ""}
                disabled={isRecording}
                onClick={() => onRecordingModeChange("video")}
              >
                Camera
              </button>
              <button
                className={recordingMode === "audio" ? "active" : ""}
                disabled={isRecording}
                onClick={() => onRecordingModeChange("audio")}
              >
                Audio
              </button>
            </div>
          </div>
          <div className="processing-control">
            <div>
              <strong>Built-in transcription</strong>
              <span>Uses the Windows local speech recognizer when available and saves final text after recording.</span>
            </div>
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={autoTranscriptionEnabled}
                disabled={isRecording}
                onChange={(event) => onAutoTranscriptionEnabledChange(event.target.checked)}
              />
              <span>{autoTranscriptionEnabled ? "On" : "Off"}</span>
            </label>
          </div>
        </div>

        {recordingMode === "video" && (
          <>
            <CameraPicker
              cameras={cameras}
              disabled={isRecording}
              onRefreshDevices={onRefreshDevices}
              onSelectCamera={onSelectCamera}
              selectedCameraId={selectedCameraId}
            />
            <div className="camera-options">
              <label>
                Resolution
                <select
                  value={cameraResolution}
                  disabled={isRecording}
                  onChange={(event) => onCameraResolutionChange(event.target.value as CameraResolution)}
                >
                  {CAMERA_RESOLUTIONS.map((resolution) => (
                    <option key={resolution} value={resolution}>
                      {resolution}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Frame rate
                <select
                  value={cameraFrameRate}
                  disabled={isRecording}
                  onChange={(event) => onCameraFrameRateChange(Number(event.target.value))}
                >
                  {CAMERA_FRAME_RATES.map((rate) => (
                    <option key={rate} value={rate}>
                      {rate} fps
                    </option>
                  ))}
                </select>
              </label>
              <label className="toggle-control inline">
                <input
                  type="checkbox"
                  checked={cameraMirror}
                  disabled={isRecording}
                  onChange={(event) => onCameraMirrorChange(event.target.checked)}
                />
                <span>Mirror preview</span>
              </label>
            </div>
          </>
        )}
      </section>

      <section className="panel session-setup-panel">
        <label>
          Session title
          <input
            value={title}
            onChange={(event) => onChangeTitle(event.target.value)}
            placeholder="Practice session"
            disabled={isRecording}
          />
        </label>
        <label>
          Practice prompt
          <textarea
            value={prompt}
            onChange={(event) => onChangePrompt(event.target.value)}
            placeholder="Example: Explain my project in one minute."
            disabled={isRecording}
          />
        </label>
        <label>
          Notes
          <textarea
            value={notes}
            onChange={(event) => onChangeNotes(event.target.value)}
            placeholder="What should I focus on during this take?"
            disabled={isRecording}
          />
        </label>
      </section>

      <section className="practice-surface">
        {recordingMode === "video" && (
          <div className="camera-preview-shell">
            <video
              ref={previewVideoRef}
              autoPlay
              muted
              playsInline
              className={cameraMirror ? "mirrored" : ""}
            />
            <span>{isRecording ? "Recording camera session" : "Camera preview starts when practice starts"}</span>
          </div>
        )}
        <VolumeMeter level={level} calibration={calibration} large />
        <div className={`state-pill ${level.state}`}>{formatState(level.state)}</div>
        <div className={`live-transcript ${autoTranscriptionState}`}>
          <div>
            <strong>Live transcript</strong>
            <span>{formatTranscriptionState(autoTranscriptionState, autoTranscriptionEnabled)}</span>
          </div>
          <p>{transcriptPreview}</p>
        </div>
        <div className="record-actions">
          {!isRecording ? (
            <button className="primary-button large-button" onClick={onStartRecording}>
              <Mic size={20} /> Start Recording
            </button>
          ) : (
            <button className="stop-button large-button" onClick={onStopRecording}>
              <Square size={20} /> Stop and Save
            </button>
          )}
        </div>
      </section>
    </section>
  );
}

type ReviewMediaPlayerHandle = {
  seekAndPlay: (ms: number) => void;
};

function ReviewScreen({
  calibration,
  onDeleteSession,
  onExportReport,
  onOpenSession,
  onPlaybackGainChange,
  onReanalyzeSession,
  onRefreshCoachReport,
  onRevealFolder,
  onSaveTranscript,
  onUpdateMetadata,
  playbackGain,
  session,
  sessions
}: {
  calibration: CalibrationProfile | null;
  onDeleteSession: () => void;
  onExportReport: () => void;
  onOpenSession: (session: SavedSession) => void;
  onPlaybackGainChange: (gain: number) => void;
  onReanalyzeSession: () => void;
  onRefreshCoachReport: () => void;
  onRevealFolder: () => void;
  onSaveTranscript: (text: string, source: TranscriptDocument["source"]) => void;
  onUpdateMetadata: (metadata: SessionMetadata) => void;
  playbackGain: number;
  session: SavedSession | null;
  sessions: SavedSession[];
}) {
  const mediaPlayerRef = useRef<ReviewMediaPlayerHandle | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftPrompt, setDraftPrompt] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftTranscript, setDraftTranscript] = useState("");
  const [draftTranscriptSource, setDraftTranscriptSource] =
    useState<TranscriptDocument["source"]>("manual");
  const transcriptRef = useRef<HTMLTextAreaElement | null>(null);
  const hasCalibrationGap = Boolean(session && session.session.calibrationId === null);
  const hasCalibrationMismatch = Boolean(
    session?.session.calibrationId && calibration && session.session.calibrationId !== calibration.id
  );
  const hasMissingReport = Boolean(session && !session.report);

  useEffect(() => {
    setDraftTitle(session?.session.metadata?.title ?? "");
    setDraftPrompt(session?.session.metadata?.prompt ?? "");
    setDraftNotes(session?.session.metadata?.notes ?? "");
    setDraftTranscript(session?.transcript?.text ?? "");
    setDraftTranscriptSource(session?.transcript?.source ?? "manual");
  }, [session?.session.id]);

  function saveMetadata() {
    onUpdateMetadata(
      buildSessionMetadata(
        draftTitle,
        draftPrompt,
        draftNotes,
        session?.session.metadata?.tags ?? [],
        session?.session.metadata?.goalId
      )
    );
  }

  function seekAudio(ms: number) {
    mediaPlayerRef.current?.seekAndPlay(ms);
  }

  function saveTranscript() {
    onSaveTranscript(draftTranscript, draftTranscriptSource);
  }

  function startWindowsDictation() {
    setDraftTranscriptSource("windows_dictation");
    transcriptRef.current?.focus();
  }

  return (
    <section className="screen">
      <header className="screen-header compact">
        <div>
          <h1>Session Review</h1>
          <p>Replay the recording and inspect low-volume or silence markers.</p>
        </div>
      </header>

      {session ? (
        <>
          <section className="panel">
            <div className="review-actions">
              <button
                className="secondary-button compact-button"
                onClick={onExportReport}
                disabled={!session.report && !session.coachReport}
              >
                <Download size={16} /> Export Report
              </button>
              <button className="secondary-button compact-button" onClick={onRefreshCoachReport}>
                <Sparkles size={16} /> Update Coach
              </button>
              <button className="secondary-button compact-button" onClick={onRevealFolder}>
                <ExternalLink size={16} /> Folder
              </button>
              <button className="danger-button compact-button" onClick={onDeleteSession}>
                <Trash2 size={16} /> Delete
              </button>
            </div>
            {hasCalibrationGap && (
              <div className="inline-warning">
                <AlertTriangle size={18} />
                <span>This session was recorded without calibration, so its review metrics may be incomplete.</span>
                <button className="secondary-button compact-button" onClick={onReanalyzeSession} disabled={!calibration}>
                  <RotateCcw size={16} /> Reanalyze
                </button>
              </div>
            )}
            {hasCalibrationMismatch && (
              <div className="inline-warning subtle">
                <AlertTriangle size={18} />
                <span>This session used a different calibration profile than the current one.</span>
                <button className="secondary-button compact-button" onClick={onReanalyzeSession}>
                  <RotateCcw size={16} /> Reanalyze
                </button>
              </div>
            )}
            {hasMissingReport && !hasCalibrationGap && (
              <div className="inline-warning subtle">
                <FileText size={18} />
                <span>This session has no saved audio report yet.</span>
                <button className="secondary-button compact-button" onClick={onReanalyzeSession} disabled={!calibration}>
                  <RotateCcw size={16} /> Generate Report
                </button>
              </div>
            )}
            <ReviewMediaPlayer
              ref={mediaPlayerRef}
              kind={session.session.recordingKind ?? "audio"}
              mirrored={session.session.cameraSettings?.mirrored ?? false}
              src={session.recordingUrl}
              playbackGain={playbackGain}
              onPlaybackGainChange={onPlaybackGainChange}
            />
            <Timeline session={session.session} onSeek={seekAudio} />
            <div className="dashboard-grid">
              <Metric label="Duration" value={formatMs(session.session.durationMs)} />
              <Metric
                label="Recording"
                value={(session.session.recordingKind ?? "audio") === "video" ? "Camera + mic" : "Audio only"}
              />
              <Metric label="Target Time" value={`${session.session.summary.targetVolumePercent}%`} />
              <Metric label="Low Events" value={String(session.session.summary.lowVolumeEventCount)} />
              <Metric label="Transcript" value={formatTranscriptSource(session.transcript?.source)} />
            </div>
            {session.coachReport && <CoachReportPanel report={session.coachReport} onSeek={seekAudio} />}
            {session.report && <AudioReportPanel report={session.report} onSeek={seekAudio} />}
            <section className="metadata-editor">
              <div className="panel-title">
                <FileText size={18} />
                <h2>Session Details</h2>
              </div>
              <label>
                Title
                <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
              </label>
              <label>
                Practice prompt
                <textarea value={draftPrompt} onChange={(event) => setDraftPrompt(event.target.value)} />
              </label>
              <label>
                Notes
                <textarea value={draftNotes} onChange={(event) => setDraftNotes(event.target.value)} />
              </label>
              <div className="row-actions">
                <button className="secondary-button compact-button" onClick={saveMetadata}>
                  <Save size={16} /> Save Details
                </button>
              </div>
            </section>
            <section className="transcript-panel">
              <div className="panel-title">
                <FileText size={18} />
                <h2>Transcript</h2>
              </div>
              <div className="dictation-helper">
                <div>
                  <strong>Windows speech input</strong>
                  <span>
                    Focus the transcript box, then use Win+H voice typing or Windows Voice Access. Save after text appears.
                  </span>
                </div>
                <button className="secondary-button compact-button" onClick={startWindowsDictation}>
                  <Keyboard size={16} /> Use Windows Speech
                </button>
              </div>
              <textarea
                ref={transcriptRef}
                value={draftTranscript}
                onChange={(event) => setDraftTranscript(event.target.value)}
                placeholder="Paste or type the transcript here. VoiceCoach will run local grammar and clarity checks."
              />
              <div className="row-actions">
                <span className="source-pill">Source: {formatTranscriptSource(draftTranscriptSource)}</span>
                <button className="secondary-button compact-button" onClick={saveTranscript}>
                  <Save size={16} /> Save and Analyze
                </button>
              </div>
              {session.textSuggestions && <TextSuggestionsPanel document={session.textSuggestions} />}
            </section>
            <div className="path-box">{session.folderPath}</div>
          </section>
        </>
      ) : (
        <section className="panel empty-state">No session selected yet.</section>
      )}

      <section className="panel">
        <div className="panel-title">
          <FolderOpen size={18} />
          <h2>Saved Sessions</h2>
        </div>
        <SessionList sessions={sessions} onOpenSession={onOpenSession} />
      </section>
    </section>
  );
}

const ReviewMediaPlayer = forwardRef<
  ReviewMediaPlayerHandle,
  {
    kind: RecordingMode;
    mirrored: boolean;
    onPlaybackGainChange: (gain: number) => void;
    playbackGain: number;
    src: string;
  }
>(function ReviewMediaPlayer({ kind, mirrored, onPlaybackGainChange, playbackGain, src }, ref) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playbackError, setPlaybackError] = useState("");

  useImperativeHandle(ref, () => ({
    seekAndPlay: (ms: number) => {
      const media = mediaRef.current;
      if (!media) {
        return;
      }

      media.currentTime = Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, ms / 1000));
      void playMedia();
    }
  }));

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) {
      return;
    }

    media.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    if (gainRef.current) {
      gainRef.current.gain.value = playbackGain;
    }
  }, [playbackGain]);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setPlaybackError("");
    sourceRef.current?.disconnect();
    gainRef.current?.disconnect();
    void audioContextRef.current?.close();
    sourceRef.current = null;
    gainRef.current = null;
    audioContextRef.current = null;
  }, [kind, src]);

  useEffect(() => {
    return () => {
      sourceRef.current?.disconnect();
      gainRef.current?.disconnect();
      void audioContextRef.current?.close();
    };
  }, []);

  async function ensureAudioGraph() {
    const media = mediaRef.current;
    if (!media) {
      return;
    }

    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext;
      const audioContext = new AudioContextClass();
      const source = audioContext.createMediaElementSource(media);
      const gain = audioContext.createGain();
      source.connect(gain);
      gain.connect(audioContext.destination);
      audioContextRef.current = audioContext;
      sourceRef.current = source;
      gainRef.current = gain;
    }

    gainRef.current!.gain.value = playbackGain;
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
  }

  async function playMedia() {
    const media = mediaRef.current;
    if (!media) {
      return;
    }

    try {
      setPlaybackError("");
      await ensureAudioGraph();
      await media.play();
    } catch (error) {
      setPlaybackError(formatError(error));
    }
  }

  function togglePlayback() {
    const media = mediaRef.current;
    if (!media) {
      return;
    }

    if (media.paused) {
      void playMedia();
    } else {
      media.pause();
    }
  }

  function seek(value: number) {
    const media = mediaRef.current;
    if (!media) {
      return;
    }

    media.currentTime = value;
    setCurrentTime(value);
  }

  function bindMediaRef(element: HTMLAudioElement | HTMLVideoElement | null) {
    mediaRef.current = element;
  }

  return (
    <div className={`review-player ${kind === "video" ? "video-player" : ""}`}>
      {kind === "video" ? (
        <video
          ref={bindMediaRef}
          preload="metadata"
          src={src}
          className={mirrored ? "mirrored" : ""}
          onDurationChange={(event) =>
            setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)
          }
          onEnded={() => setIsPlaying(false)}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        />
      ) : (
        <audio
          ref={bindMediaRef}
          preload="metadata"
          src={src}
          onDurationChange={(event) =>
            setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)
          }
          onEnded={() => setIsPlaying(false)}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        />
      )}
      <div className="player-main-row">
        <button className="player-play-button" onClick={togglePlayback} title={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <span className="player-time">{formatMs(currentTime * 1000)}</span>
        <input
          className="player-seek"
          type="range"
          min={0}
          max={Math.max(duration, currentTime, 0.01)}
          step={0.01}
          value={Math.min(currentTime, Math.max(duration, currentTime, 0.01))}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label="Playback position"
        />
        <span className="player-time">{formatMs(duration * 1000)}</span>
      </div>
      <div className="player-controls-row">
        <label className="gain-control">
          <span>Boost {playbackGain.toFixed(2)}x</span>
          <input
            type="range"
            min={1}
            max={4}
            step={0.25}
            value={playbackGain}
            onChange={(event) => onPlaybackGainChange(Number(event.target.value))}
          />
        </label>
        <div className="rate-control" aria-label="Playback speed">
          {PLAYBACK_RATES.map((rate) => (
            <button
              key={rate}
              className={`rate-button ${playbackRate === rate ? "active" : ""}`}
              onClick={() => setPlaybackRate(rate)}
            >
              {rate}x
            </button>
          ))}
        </div>
      </div>
      {playbackError && <div className="player-error">{playbackError}</div>}
    </div>
  );
});

function SettingsScreen({
  autoTranscriptionEnabled,
  calibration,
  cameraFrameRate,
  cameraMirror,
  cameraResolution,
  cameras,
  devices,
  meta,
  onAutoTranscriptionEnabledChange,
  onCameraFrameRateChange,
  onCameraMirrorChange,
  onCameraResolutionChange,
  onRefreshDevices,
  onSelectCamera,
  onSelectDevice,
  onSelectMicrophoneProcessingMode,
  onReviewPlaybackGainChange,
  selectedCameraId,
  selectedDeviceId,
  microphoneProcessingMode,
  reviewPlaybackGain,
  settings
}: {
  autoTranscriptionEnabled: boolean;
  calibration: CalibrationProfile | null;
  cameraFrameRate: number;
  cameraMirror: boolean;
  cameraResolution: CameraResolution;
  cameras: MediaDeviceInfo[];
  devices: MediaDeviceInfo[];
  meta: AppMeta | null;
  onAutoTranscriptionEnabledChange: (enabled: boolean) => void;
  onCameraFrameRateChange: (frameRate: number) => void;
  onCameraMirrorChange: (mirrored: boolean) => void;
  onCameraResolutionChange: (resolution: CameraResolution) => void;
  onRefreshDevices: () => void;
  onSelectCamera: (id: string) => void;
  onSelectDevice: (id: string) => void;
  onSelectMicrophoneProcessingMode: (mode: MicrophoneProcessingMode) => void;
  onReviewPlaybackGainChange: (gain: number) => void;
  selectedCameraId: string;
  selectedDeviceId: string;
  microphoneProcessingMode: MicrophoneProcessingMode;
  reviewPlaybackGain: number;
  settings: AppSettings | null;
}) {
  return (
    <section className="screen">
      <header className="screen-header compact">
        <div>
          <h1>Settings</h1>
          <p>Local storage and microphone configuration for this prototype.</p>
        </div>
      </header>

      <section className="panel">
        <DevicePicker
          devices={devices}
          selectedDeviceId={selectedDeviceId}
          onSelectDevice={onSelectDevice}
          onRefreshDevices={onRefreshDevices}
        />
        <AudioProcessingControl mode={microphoneProcessingMode} onChange={onSelectMicrophoneProcessingMode} />
        <CameraPicker
          cameras={cameras}
          selectedCameraId={selectedCameraId}
          onSelectCamera={onSelectCamera}
          onRefreshDevices={onRefreshDevices}
        />
        <div className="camera-options">
          <label>
            Camera resolution
            <select
              value={cameraResolution}
              onChange={(event) => onCameraResolutionChange(event.target.value as CameraResolution)}
            >
              {CAMERA_RESOLUTIONS.map((resolution) => (
                <option key={resolution} value={resolution}>
                  {resolution}
                </option>
              ))}
            </select>
          </label>
          <label>
            Camera frame rate
            <select value={cameraFrameRate} onChange={(event) => onCameraFrameRateChange(Number(event.target.value))}>
              {CAMERA_FRAME_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate} fps
                </option>
              ))}
            </select>
          </label>
          <label className="toggle-control inline">
            <input
              type="checkbox"
              checked={cameraMirror}
              onChange={(event) => onCameraMirrorChange(event.target.checked)}
            />
            <span>Mirror camera preview</span>
          </label>
          <label className="toggle-control inline">
            <input
              type="checkbox"
              checked={autoTranscriptionEnabled}
              onChange={(event) => onAutoTranscriptionEnabledChange(event.target.checked)}
            />
            <span>Start built-in transcription with recording</span>
          </label>
        </div>
        <label className="settings-slider">
          <span>Default review playback boost</span>
          <input
            type="range"
            min={1}
            max={4}
            step={0.25}
            value={reviewPlaybackGain}
            onChange={(event) => onReviewPlaybackGainChange(Number(event.target.value))}
          />
          <strong>{reviewPlaybackGain.toFixed(2)}x</strong>
        </label>
        <div className="settings-grid">
          <Metric label="Version" value={meta?.version ?? "0.3.2"} />
          <Metric label="Data Folder" value={meta?.dataDir ?? "--"} />
          <Metric label="Warning Rule" value="Low for 1.5s, 5s cooldown" />
          <Metric label="Selected Mic" value={settings?.selectedDeviceLabel ?? "Not saved"} />
          <Metric label="Selected Camera" value={settings?.selectedCameraLabel ?? "Not saved"} />
          <Metric label="Mic Processing" value={microphoneProcessingMode === "enhanced" ? "Enhanced" : "Natural"} />
          <Metric label="Auto Transcription" value={autoTranscriptionEnabled ? "On" : "Off"} />
          <Metric label="Calibration" value={calibration ? calibration.createdAt.slice(0, 10) : "Not saved"} />
        </div>
      </section>
    </section>
  );
}

function AudioProcessingControl({
  mode,
  onChange
}: {
  mode: MicrophoneProcessingMode;
  onChange: (mode: MicrophoneProcessingMode) => void;
}) {
  return (
    <div className="processing-control">
      <div>
        <strong>Microphone processing</strong>
        <span>
          Enhanced allows echo cancellation, noise suppression, and auto gain. Natural records raw mic input for
          stricter measurement.
        </span>
      </div>
      <div className="segmented-control">
        <button className={mode === "enhanced" ? "active" : ""} onClick={() => onChange("enhanced")}>
          Enhanced
        </button>
        <button className={mode === "natural" ? "active" : ""} onClick={() => onChange("natural")}>
          Natural
        </button>
      </div>
    </div>
  );
}

function DevicePicker({
  devices,
  onRefreshDevices,
  onSelectDevice,
  selectedDeviceId
}: {
  devices: MediaDeviceInfo[];
  onRefreshDevices: () => void;
  onSelectDevice: (id: string) => void;
  selectedDeviceId: string;
}) {
  return (
    <div className="device-picker">
      <label htmlFor="mic-select">Microphone</label>
      <select id="mic-select" value={selectedDeviceId} onChange={(event) => onSelectDevice(event.target.value)}>
        {devices.length === 0 && <option value="">No microphone labels yet</option>}
        {devices.map((device, index) => (
          <option key={device.deviceId || index} value={device.deviceId}>
            {device.label || `Microphone ${index + 1}`}
          </option>
        ))}
      </select>
      <button className="icon-button" title="Refresh microphones and request permission" onClick={onRefreshDevices}>
        <RotateCcw size={18} />
      </button>
    </div>
  );
}

function CameraPicker({
  cameras,
  disabled,
  onRefreshDevices,
  onSelectCamera,
  selectedCameraId
}: {
  cameras: MediaDeviceInfo[];
  disabled?: boolean;
  onRefreshDevices: () => void;
  onSelectCamera: (id: string) => void;
  selectedCameraId: string;
}) {
  return (
    <div className="device-picker">
      <label htmlFor="camera-select">Camera</label>
      <select
        id="camera-select"
        value={selectedCameraId}
        disabled={disabled}
        onChange={(event) => onSelectCamera(event.target.value)}
      >
        {cameras.length === 0 && <option value="">No camera labels yet</option>}
        {cameras.map((camera, index) => (
          <option key={camera.deviceId || index} value={camera.deviceId}>
            {camera.label || `Camera ${index + 1}`}
          </option>
        ))}
      </select>
      <button
        className="icon-button"
        title="Refresh cameras and request permission"
        onClick={onRefreshDevices}
        disabled={disabled}
      >
        <RotateCcw size={18} />
      </button>
    </div>
  );
}

function VolumeMeter({
  calibration,
  large,
  level
}: {
  calibration: CalibrationProfile | null;
  large?: boolean;
  level: typeof initialLevel;
}) {
  const normalized = Math.max(0, Math.min(100, ((level.db + 80) / 60) * 100));
  const targetLeft = calibration ? Math.max(0, Math.min(100, ((calibration.targetMinDb + 80) / 60) * 100)) : 42;
  const targetRight = calibration ? Math.max(0, Math.min(100, ((calibration.targetMaxDb + 80) / 60) * 100)) : 72;

  return (
    <div className={`meter ${large ? "large" : ""}`}>
      <div className="meter-top">
        <span>Live level</span>
        <strong>{level.db.toFixed(1)} dB</strong>
      </div>
      <div className="meter-track">
        <div className="target-zone" style={{ left: `${targetLeft}%`, width: `${targetRight - targetLeft}%` }} />
        <div className={`meter-fill ${level.state}`} style={{ width: `${normalized}%` }} />
      </div>
      <div className="meter-labels">
        <span>Quiet</span>
        <span>Target</span>
        <span>Strong</span>
      </div>
    </div>
  );
}

function Timeline({ onSeek, session }: { onSeek?: (ms: number) => void; session: VoiceCoachSession }) {
  const duration = Math.max(session.durationMs, 1);
  const stride = Math.max(1, Math.ceil(session.samples.length / 180));
  const bars = session.samples.filter((_sample, index) => index % stride === 0);

  return (
    <div className="timeline">
      <div className="timeline-bars">
        {bars.map((sample) => (
          <div
            key={sample.tMs}
            className={`timeline-bar ${sample.speaking ? "speaking" : "silent"}`}
            style={{ height: `${Math.max(8, Math.min(100, ((sample.db + 80) / 60) * 100))}%` }}
            title={`${formatMs(sample.tMs)} ${sample.db.toFixed(1)} dB`}
          />
        ))}
        {session.events.map((event) => (
          <button
            key={event.id}
            className={`event-marker ${event.type}`}
            onClick={() => onSeek?.(event.startMs)}
            style={{
              left: `${(event.startMs / duration) * 100}%`,
              width: `${Math.max(1, ((event.endMs - event.startMs) / duration) * 100)}%`
            }}
            title={`${event.type.replace("_", " ")} ${formatMs(event.startMs)}-${formatMs(event.endMs)}`}
          />
        ))}
      </div>
      <div className="timeline-legend">
        <span><i className="legend low" /> Low volume</span>
        <span><i className="legend silence" /> Silence</span>
      </div>
    </div>
  );
}

function CoachReportPanel({ onSeek, report }: { onSeek: (ms: number) => void; report: CoachReport }) {
  return (
    <section className="coach-report-panel">
      <div className="panel-title">
        <Target size={18} />
        <h2>Coach Mode Scorecard</h2>
      </div>
      <div className="coach-report-head">
        <div>
          <span>{report.goalLabel}</span>
          <strong>{report.readinessScore}/100</strong>
        </div>
        <p>{report.summary}</p>
      </div>
      <ScoreBars report={report} />
      <div className="coach-columns">
        <SuggestionColumn title="Strengths" suggestions={report.strengths} onSeek={onSeek} />
        <SuggestionColumn title="Priorities" suggestions={report.priorities} onSeek={onSeek} />
      </div>
      <div className="next-drill compact">
        <strong>{report.nextDrill.title}</strong>
        <p>{report.nextDrill.detail}</p>
        <ol>
          {report.nextDrill.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function SuggestionColumn({
  onSeek,
  suggestions,
  title
}: {
  onSeek: (ms: number) => void;
  suggestions: CoachReport["priorities"];
  title: string;
}) {
  return (
    <div className="suggestion-column">
      <h3>{title}</h3>
      {suggestions.length > 0 ? (
        suggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            className={`suggestion-card ${suggestion.severity}`}
            onClick={() => suggestion.startMs !== undefined && onSeek(suggestion.startMs)}
          >
            <strong>{suggestion.title}</strong>
            <span>{suggestion.detail}</span>
            {suggestion.startMs !== undefined && <em>{formatMs(suggestion.startMs)}</em>}
          </button>
        ))
      ) : (
        <div className="empty-state small">No items yet.</div>
      )}
    </div>
  );
}

function AudioReportPanel({ onSeek, report }: { onSeek: (ms: number) => void; report: AudioReport }) {
  return (
    <section className="report-panel">
      <div className="panel-title">
        <FileText size={18} />
        <h2>Audio Coaching Report</h2>
      </div>
      <div className="dashboard-grid">
        <Metric label="Score" value={`${report.metrics.overallScore}/100`} />
        <Metric label="Low Volume" value={`${report.metrics.lowVolumePercent}%`} />
        <Metric label="Speaking Ratio" value={`${report.metrics.speakingRatioPercent}%`} />
        <Metric label="Consistency" value={`${report.metrics.volumeConsistencyScore}/100`} />
      </div>
      <div className="report-details">
        <span>Average: {formatOptionalDb(report.metrics.averageDb)}</span>
        <span>Peak: {formatOptionalDb(report.metrics.peakDb)}</span>
        <span>Long pauses: {report.metrics.longPauseCount}</span>
        <span>Clipping: {report.metrics.clippingEventCount}</span>
      </div>
      <div className="suggestion-list">
        {report.suggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            className={`suggestion-card ${suggestion.severity}`}
            onClick={() => suggestion.startMs !== undefined && onSeek(suggestion.startMs)}
          >
            <strong>{suggestion.title}</strong>
            <span>{suggestion.detail}</span>
            {suggestion.startMs !== undefined && <em>{formatMs(suggestion.startMs)}</em>}
          </button>
        ))}
      </div>
    </section>
  );
}

function TextSuggestionsPanel({ document }: { document: NonNullable<SavedSession["textSuggestions"]> }) {
  return (
    <section className="text-report">
      <div className="dashboard-grid">
        <Metric label="Words" value={String(document.metrics.wordCount)} />
        <Metric label="Sentences" value={String(document.metrics.sentenceCount)} />
        <Metric label="Fillers" value={String(document.metrics.fillerCount)} />
        <Metric label="Long Sentences" value={String(document.metrics.longSentenceCount)} />
      </div>
      <div className="suggestion-list">
        {document.suggestions.map((suggestion) => (
          <div key={suggestion.id} className={`suggestion-card ${suggestion.severity}`}>
            <strong>{suggestion.title}</strong>
            <span>{suggestion.detail}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SessionList({
  onOpenSession,
  sessions
}: {
  onOpenSession: (session: SavedSession) => void;
  sessions: SavedSession[];
}) {
  if (sessions.length === 0) {
    return <div className="empty-state">No saved sessions yet.</div>;
  }

  return (
    <div className="session-list">
      {sessions.map((saved) => (
        <button key={saved.session.id} className="session-row" onClick={() => onOpenSession(saved)}>
          <span>{saved.session.metadata?.title || new Date(saved.session.createdAt).toLocaleString()}</span>
          <strong>{formatRecordingKind(saved.session.recordingKind)}</strong>
          <strong>{formatMs(saved.session.durationMs)}</strong>
          <em>
            {saved.coachReport
              ? `${saved.coachReport.readinessScore}/100`
              : saved.report
                ? `${saved.report.metrics.overallScore}/100`
                : `${saved.session.summary.lowVolumeEventCount} low`}
          </em>
        </button>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function preferredRecorderOptions(includeVideo: boolean): MediaRecorderOptions | undefined {
  if (includeVideo && MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) {
    return { mimeType: "video/webm;codecs=vp9,opus" };
  }

  if (includeVideo && MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")) {
    return { mimeType: "video/webm;codecs=vp8,opus" };
  }

  if (includeVideo && MediaRecorder.isTypeSupported("video/webm")) {
    return { mimeType: "video/webm" };
  }

  return MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? { mimeType: "audio/webm;codecs=opus" }
    : undefined;
}

function buildSessionMetadata(
  title: string,
  prompt: string,
  notes: string,
  tags: string[] = [],
  goalId: PracticeGoalId = "projection"
): SessionMetadata {
  const goal = resolvePracticeGoal(goalId);
  return {
    title: title.trim() || "Practice session",
    prompt: prompt.trim(),
    notes: notes.trim(),
    tags,
    goalId: goal.id,
    goalLabel: goal.label,
    updatedAt: new Date().toISOString()
  };
}

function formatState(state: LevelState): string {
  return state === "silent" ? "Silent" : state === "quiet" ? "Quiet" : state === "good" ? "Good" : "Strong";
}

function formatTranscriptionState(state: AutoTranscriptionState, enabled: boolean): string {
  if (!enabled) {
    return "Disabled";
  }

  if (state === "starting") {
    return "Starting Windows recognizer";
  }

  if (state === "listening") {
    return "Listening";
  }

  if (state === "error") {
    return "Unavailable";
  }

  if (state === "unavailable") {
    return "Unavailable";
  }

  return "Ready";
}

function formatMs(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatOptionalDb(value: number | null): string {
  return value === null ? "--" : `${value} dB`;
}

function formatAverageScore(values: Array<number | null | undefined>): string {
  const scores = values.filter((value): value is number => typeof value === "number");
  if (scores.length === 0) {
    return "--";
  }

  return `${Math.round(scores.reduce((total, value) => total + value, 0) / scores.length)}/100`;
}

function formatRecordingKind(kind?: RecordingMode): string {
  return kind === "video" ? "Video" : "Audio";
}

function formatNullableScore(value: number | null): string {
  return value === null ? "--" : `${value}/100`;
}

function formatSkillLabel(value: keyof CoachReport["scores"] | null): string {
  return value ? value[0].toUpperCase() + value.slice(1) : "--";
}

function formatTranscriptSource(source?: TranscriptDocument["source"]): string {
  if (source === "windows_builtin") {
    return "Built-in speech";
  }

  if (source === "windows_dictation") {
    return "Windows speech input";
  }

  if (source === "manual") {
    return "Manual";
  }

  return "Missing";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
