import {
  Activity,
  AlertTriangle,
  BarChart3,
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
  CoachReport,
  LevelState,
  MicrophoneProcessingMode,
  PracticeGoalId,
  SavedSession,
  SessionMetadata,
  TranscriptDocument,
  VoiceCoachSession,
  VolumeSample
} from "../shared/types";
import { ProgressSummary, buildProgressSummary } from "../shared/progress";
import { createCalibrationProfile } from "./audio/calibration";
import {
  DEFAULT_MICROPHONE_PROCESSING_MODE,
  DEFAULT_REVIEW_PLAYBACK_GAIN,
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

const CALIBRATION_TOTAL_MS = 23_000;
const WARNING_LOW_MS = 1_500;
const WARNING_COOLDOWN_MS = 5_000;
const SAMPLE_INTERVAL_MS = 100;
const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5];

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
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
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
  const [level, setLevel] = useState(initialLevel);
  const [audioMode, setAudioMode] = useState<AudioMode>("idle");
  const [isRecording, setIsRecording] = useState(false);
  const [calibrationProgressMs, setCalibrationProgressMs] = useState(0);
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
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
  const microphoneElapsedMsRef = useRef(0);
  const recordingStartedAtMsRef = useRef<number | null>(null);
  const recordingWallStartedAtRef = useRef<number | null>(null);

  calibrationRef.current = calibration;
  isRecordingRef.current = isRecording;
  warningRef.current = warning;

  useEffect(() => {
    void initializeApp();
    return () => stopMicrophone();
  }, []);

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
      setCalibration(savedCalibration);
      setSessions(savedSessions);
      await refreshDevices(false, savedSettings?.selectedDeviceId ?? "");
    } catch (appError) {
      setError(formatError(appError));
    }
  }

  async function refreshDevices(requestPermission: boolean, preferredDeviceId = selectedDeviceId) {
    try {
      if (requestPermission) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        stream.getTracks().forEach((track) => track.stop());
      }

      const availableDevices = await navigator.mediaDevices.enumerateDevices();
      const microphones = availableDevices.filter((device) => device.kind === "audioinput");
      setDevices(microphones);
      setSelectedDeviceId((current) => preferredDeviceId || current || microphones[0]?.deviceId || "");
    } catch (deviceError) {
      setError(formatError(deviceError));
    }
  }

  async function selectDevice(deviceId: string) {
    setSelectedDeviceId(deviceId);
    const nextSettings = buildAppSettings(deviceId, microphoneProcessingMode, reviewPlaybackGain);
    setSettings(nextSettings);
    try {
      await window.voiceCoach.saveSettings(nextSettings);
    } catch (settingsError) {
      setError(formatError(settingsError));
    }
  }

  async function selectMicrophoneProcessingMode(mode: MicrophoneProcessingMode) {
    setMicrophoneProcessingMode(mode);
    const nextSettings = buildAppSettings(selectedDeviceId, mode, reviewPlaybackGain);
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
    const nextSettings = buildAppSettings(selectedDeviceId, microphoneProcessingMode, gain);
    setSettings(nextSettings);
    try {
      await window.voiceCoach.saveSettings(nextSettings);
    } catch (settingsError) {
      setError(formatError(settingsError));
    }
  }

  function buildAppSettings(
    deviceId: string,
    processingMode: MicrophoneProcessingMode,
    playbackGain: number
  ): AppSettings {
    const device = devices.find((item) => item.deviceId === deviceId);
    return {
      schemaVersion: 1,
      selectedDeviceId: deviceId,
      selectedDeviceLabel: device?.label || "Default microphone",
      microphoneProcessingMode: processingMode,
      reviewPlaybackGain: clampReviewPlaybackGain(playbackGain),
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
    recordingStartedAtMsRef.current = microphoneElapsedMsRef.current;
    recordingWallStartedAtRef.current = performance.now();
    activeRecordingCalibrationRef.current = calibrationRef.current;

    const recorder = new MediaRecorder(streamRef.current, preferredRecorderOptions());
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
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: "audio/webm" }));
      recorder.stop();
    });

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
      samples,
      events,
      summary: buildSessionSummary(samples, events, calibrationForSession)
    };
    const report = buildAudioReport(session, calibrationForSession);
    const coachReport = buildCoachReport(session, report, null, practiceGoalId);
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
      const savedSessions = await window.voiceCoach.listSessions();
      setSessions(savedSessions);
      setReviewSession(saved);
      setScreen("review");
      setPracticeTitle("");
      setPracticePrompt("");
      setPracticeNotes("");
      stopMicrophone();
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

  async function startMicrophone(mode: AudioMode, onSample: (db: number, rms: number, elapsedMs: number) => void) {
    stopMicrophone();
    await refreshDevices(false);

    const constraints = buildMicrophoneConstraints(selectedDeviceId, microphoneProcessingMode);
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    streamRef.current = stream;
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
            <span>v{meta?.version ?? "0.5.0"}</span>
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
            calibration={calibration}
            level={level}
            isRecording={isRecording}
            title={practiceTitle}
            prompt={practicePrompt}
            notes={practiceNotes}
            onChangeTitle={setPracticeTitle}
            onChangePrompt={setPracticePrompt}
            onChangeNotes={setPracticeNotes}
            onGoalChange={setPracticeGoalId}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            onStartCalibration={startCalibration}
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
            meta={meta}
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={selectDevice}
            onRefreshDevices={() => refreshDevices(true)}
            calibration={calibration}
            settings={settings}
            microphoneProcessingMode={microphoneProcessingMode}
            onSelectMicrophoneProcessingMode={selectMicrophoneProcessingMode}
            reviewPlaybackGain={reviewPlaybackGain}
            onReviewPlaybackGainChange={updateReviewPlaybackGain}
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
  calibration,
  sessions,
  onStartPractice,
  onStartCalibration,
  onOpenSession
}: {
  calibration: CalibrationProfile | null;
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
          <p>Offline audio coaching with calibration, live feedback, and local review.</p>
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
        <Metric
          label="Coach Average"
          value={formatAverageScore(sessions.map((session) => session.coachReport?.readinessScore))}
        />
        <Metric label="Recent Sessions" value={String(sessions.length)} />
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
  calibration,
  goalId,
  isRecording,
  level,
  notes,
  onChangeNotes,
  onChangePrompt,
  onChangeTitle,
  onGoalChange,
  onStartCalibration,
  onStartRecording,
  onStopRecording,
  prompt,
  title
}: {
  calibration: CalibrationProfile | null;
  goalId: PracticeGoalId;
  isRecording: boolean;
  level: typeof initialLevel;
  notes: string;
  onChangeNotes: (value: string) => void;
  onChangePrompt: (value: string) => void;
  onChangeTitle: (value: string) => void;
  onGoalChange: (goalId: PracticeGoalId) => void;
  onStartCalibration: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  prompt: string;
  title: string;
}) {
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
        <VolumeMeter level={level} calibration={calibration} large />
        <div className={`state-pill ${level.state}`}>{formatState(level.state)}</div>
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

type ReviewAudioPlayerHandle = {
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
  const audioPlayerRef = useRef<ReviewAudioPlayerHandle | null>(null);
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
    audioPlayerRef.current?.seekAndPlay(ms);
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
            <ReviewAudioPlayer
              ref={audioPlayerRef}
              src={session.recordingUrl}
              playbackGain={playbackGain}
              onPlaybackGainChange={onPlaybackGainChange}
            />
            <Timeline session={session.session} onSeek={seekAudio} />
            <div className="dashboard-grid">
              <Metric label="Duration" value={formatMs(session.session.durationMs)} />
              <Metric label="Target Time" value={`${session.session.summary.targetVolumePercent}%`} />
              <Metric label="Low Events" value={String(session.session.summary.lowVolumeEventCount)} />
              <Metric label="Silence Events" value={String(session.session.summary.silenceEventCount)} />
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
                <h2>Manual Transcript</h2>
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
                <span className="source-pill">
                  Source: {draftTranscriptSource === "windows_dictation" ? "Windows speech input" : "Manual"}
                </span>
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

const ReviewAudioPlayer = forwardRef<
  ReviewAudioPlayerHandle,
  {
    onPlaybackGainChange: (gain: number) => void;
    playbackGain: number;
    src: string;
  }
>(function ReviewAudioPlayer({ onPlaybackGainChange, playbackGain, src }, ref) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
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
      const audio = audioRef.current;
      if (!audio) {
        return;
      }

      audio.currentTime = Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, ms / 1000));
      void playAudio();
    }
  }));

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.playbackRate = playbackRate;
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
  }, [src]);

  useEffect(() => {
    return () => {
      sourceRef.current?.disconnect();
      gainRef.current?.disconnect();
      void audioContextRef.current?.close();
    };
  }, []);

  async function ensureAudioGraph() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext;
      const audioContext = new AudioContextClass();
      const source = audioContext.createMediaElementSource(audio);
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

  async function playAudio() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    try {
      setPlaybackError("");
      await ensureAudioGraph();
      await audio.play();
    } catch (error) {
      setPlaybackError(formatError(error));
    }
  }

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.paused) {
      void playAudio();
    } else {
      audio.pause();
    }
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.currentTime = value;
    setCurrentTime(value);
  }

  return (
    <div className="review-player">
      <audio
        ref={audioRef}
        preload="metadata"
        src={src}
        onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      />
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
  calibration,
  devices,
  meta,
  onRefreshDevices,
  onSelectDevice,
  onSelectMicrophoneProcessingMode,
  onReviewPlaybackGainChange,
  selectedDeviceId,
  microphoneProcessingMode,
  reviewPlaybackGain,
  settings
}: {
  calibration: CalibrationProfile | null;
  devices: MediaDeviceInfo[];
  meta: AppMeta | null;
  onRefreshDevices: () => void;
  onSelectDevice: (id: string) => void;
  onSelectMicrophoneProcessingMode: (mode: MicrophoneProcessingMode) => void;
  onReviewPlaybackGainChange: (gain: number) => void;
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
          <Metric label="Mic Processing" value={microphoneProcessingMode === "enhanced" ? "Enhanced" : "Natural"} />
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

function preferredRecorderOptions(): MediaRecorderOptions | undefined {
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

function formatNullableScore(value: number | null): string {
  return value === null ? "--" : `${value}/100`;
}

function formatSkillLabel(value: keyof CoachReport["scores"] | null): string {
  return value ? value[0].toUpperCase() + value.slice(1) : "--";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
