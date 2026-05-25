import {
  Activity,
  AlertTriangle,
  BarChart3,
  FolderOpen,
  Mic,
  Play,
  Radio,
  RotateCcw,
  Settings,
  Square,
  Timer,
  Volume2,
  Wand2
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppMeta,
  CalibrationProfile,
  LevelState,
  SavedSession,
  VoiceCoachSession,
  VolumeSample
} from "../shared/types";
import { createCalibrationProfile } from "./audio/calibration";
import { analyzeSessionSamples, buildSessionSummary, reanalyzeSessionWithCalibration } from "./audio/events";
import {
  calculateRms,
  getLevelState,
  isSpeakingFrame,
  isSpeakingWithoutCalibration,
  rmsToDb,
  smoothDb
} from "./audio/level";

type Screen = "home" | "calibration" | "practice" | "review" | "settings";
type AudioMode = "idle" | "calibration" | "practice";

const CALIBRATION_TOTAL_MS = 23_000;
const WARNING_LOW_MS = 1_500;
const WARNING_COOLDOWN_MS = 5_000;
const SAMPLE_INTERVAL_MS = 100;

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
  const [calibration, setCalibration] = useState<CalibrationProfile | null>(null);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [reviewSession, setReviewSession] = useState<SavedSession | null>(null);
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

  const recentSessions = useMemo(() => sessions.slice(0, 5), [sessions]);

  async function initializeApp() {
    try {
      const [appMeta, savedCalibration, savedSessions] = await Promise.all([
        window.voiceCoach.getAppMeta(),
        window.voiceCoach.loadCalibration(),
        window.voiceCoach.listSessions()
      ]);
      setMeta(appMeta);
      setCalibration(savedCalibration);
      setSessions(savedSessions);
      await refreshDevices(false);
    } catch (appError) {
      setError(formatError(appError));
    }
  }

  async function refreshDevices(requestPermission: boolean) {
    try {
      if (requestPermission) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        stream.getTracks().forEach((track) => track.stop());
      }

      const availableDevices = await navigator.mediaDevices.enumerateDevices();
      const microphones = availableDevices.filter((device) => device.kind === "audioinput");
      setDevices(microphones);
      setSelectedDeviceId((current) => current || microphones[0]?.deviceId || "");
    } catch (deviceError) {
      setError(formatError(deviceError));
    }
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
    const session: VoiceCoachSession = {
      schemaVersion: 1,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      durationMs,
      deviceId: selectedDeviceId,
      calibrationId: calibrationForSession?.id ?? null,
      recordingFile: "recording.webm",
      samples,
      events,
      summary: buildSessionSummary(samples, events, calibrationForSession)
    };
    activeRecordingCalibrationRef.current = null;
    recordingStartedAtMsRef.current = null;
    recordingWallStartedAtRef.current = null;

    try {
      const saved = await window.voiceCoach.saveSession({
        session,
        recordingData: await recordingBlob.arrayBuffer()
      });
      const savedSessions = await window.voiceCoach.listSessions();
      setSessions(savedSessions);
      setReviewSession(saved);
      setScreen("review");
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

    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      } as MediaTrackConstraints,
      video: false
    };

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
      const saved = await window.voiceCoach.updateSession({ session: updated });
      const savedSessions = await window.voiceCoach.listSessions();
      setReviewSession(saved);
      setSessions(savedSessions);
      setWarning("Session reanalyzed with current calibration");
    } catch (reanalyzeError) {
      setError(formatError(reanalyzeError));
    }
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
            <span>v{meta?.version ?? "0.1.0"}</span>
          </div>
        </div>

        <nav className="nav-list">
          <NavButton icon={<Activity />} active={screen === "home"} onClick={() => setScreen("home")}>
            Home
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
            sessions={recentSessions}
            onStartPractice={preparePractice}
            onStartCalibration={startCalibration}
            onOpenSession={openSession}
          />
        )}

        {screen === "calibration" && (
          <CalibrationScreen
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={setSelectedDeviceId}
            onRefreshDevices={() => refreshDevices(true)}
            onStartCalibration={startCalibration}
            progressPercent={calibrationPercent}
            profile={calibration}
            level={level}
            active={audioMode === "calibration"}
          />
        )}

        {screen === "practice" && (
          <PracticeScreen
            calibration={calibration}
            level={level}
            isRecording={isRecording}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            onStartCalibration={startCalibration}
          />
        )}

        {screen === "review" && (
          <ReviewScreen
            calibration={calibration}
            session={reviewSession}
            sessions={sessions}
            onOpenSession={openSession}
            onReanalyzeSession={reanalyzeReviewSession}
          />
        )}

        {screen === "settings" && (
          <SettingsScreen
            meta={meta}
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={setSelectedDeviceId}
            onRefreshDevices={() => refreshDevices(true)}
            calibration={calibration}
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
        <Metric label="Low Warning" value={calibration ? `${calibration.lowThresholdDb} dB` : "--"} />
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

function CalibrationScreen({
  active,
  devices,
  level,
  onRefreshDevices,
  onSelectDevice,
  onStartCalibration,
  progressPercent,
  profile,
  selectedDeviceId
}: {
  active: boolean;
  devices: MediaDeviceInfo[];
  level: typeof initialLevel;
  onRefreshDevices: () => void;
  onSelectDevice: (id: string) => void;
  onStartCalibration: () => void;
  progressPercent: number;
  profile: CalibrationProfile | null;
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
  isRecording,
  level,
  onStartCalibration,
  onStartRecording,
  onStopRecording
}: {
  calibration: CalibrationProfile | null;
  isRecording: boolean;
  level: typeof initialLevel;
  onStartCalibration: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
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

function ReviewScreen({
  calibration,
  onOpenSession,
  onReanalyzeSession,
  session,
  sessions
}: {
  calibration: CalibrationProfile | null;
  onOpenSession: (session: SavedSession) => void;
  onReanalyzeSession: () => void;
  session: SavedSession | null;
  sessions: SavedSession[];
}) {
  const hasCalibrationGap = Boolean(session && session.session.calibrationId === null);
  const hasCalibrationMismatch = Boolean(
    session?.session.calibrationId && calibration && session.session.calibrationId !== calibration.id
  );

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
            <div className="audio-row">
              <Play size={18} />
              <audio controls src={session.recordingUrl} />
            </div>
            <Timeline session={session.session} />
            <div className="dashboard-grid">
              <Metric label="Duration" value={formatMs(session.session.durationMs)} />
              <Metric label="Target Time" value={`${session.session.summary.targetVolumePercent}%`} />
              <Metric label="Low Events" value={String(session.session.summary.lowVolumeEventCount)} />
              <Metric label="Silence Events" value={String(session.session.summary.silenceEventCount)} />
            </div>
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

function SettingsScreen({
  calibration,
  devices,
  meta,
  onRefreshDevices,
  onSelectDevice,
  selectedDeviceId
}: {
  calibration: CalibrationProfile | null;
  devices: MediaDeviceInfo[];
  meta: AppMeta | null;
  onRefreshDevices: () => void;
  onSelectDevice: (id: string) => void;
  selectedDeviceId: string;
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
        <div className="settings-grid">
          <Metric label="Version" value={meta?.version ?? "0.1.0"} />
          <Metric label="Data Folder" value={meta?.dataDir ?? "--"} />
          <Metric label="Warning Rule" value="Low for 1.5s, 5s cooldown" />
          <Metric label="Calibration" value={calibration ? calibration.createdAt.slice(0, 10) : "Not saved"} />
        </div>
      </section>
    </section>
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

function Timeline({ session }: { session: VoiceCoachSession }) {
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
          <div
            key={event.id}
            className={`event-marker ${event.type}`}
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
          <span>{new Date(saved.session.createdAt).toLocaleString()}</span>
          <strong>{formatMs(saved.session.durationMs)}</strong>
          <em>{saved.session.summary.lowVolumeEventCount} low</em>
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

function formatState(state: LevelState): string {
  return state === "silent" ? "Silent" : state === "quiet" ? "Quiet" : state === "good" ? "Good" : "Strong";
}

function formatMs(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
