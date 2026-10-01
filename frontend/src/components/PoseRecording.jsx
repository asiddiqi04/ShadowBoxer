import { useEffect, useRef, useState } from 'react';
import { createLabelTemplate, createPoseRecording, MAX_RECORDING_MS } from '../lib/poseRecording';

const mimeTypes = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1'];
const jsonBlob = (value) => new Blob([JSON.stringify(value)], { type: 'application/json' });

function PoseRecording({ webcamRef, captureRef, modelReady, onRecordingChange }) {
  const recorderRef = useRef(null);
  const timerRef = useRef(null);
  const urlsRef = useRef([]);
  const [phase, setPhase] = useState('idle');
  const [progress, setProgress] = useState({ seconds: 0, samples: 0 });
  const [exports, setExports] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => () => {
    clearInterval(timerRef.current);
    captureRef.current?.stop(performance.now());
    captureRef.current = null;
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      recorder.ondataavailable = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    // The stream belongs to Webcam; stopping a recording must not stop it.
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, [captureRef]);

  const stop = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    clearInterval(timerRef.current);
    captureRef.current?.stop(performance.now());
    captureRef.current = null;
    setPhase('stopping');
    recorder.stop();
    onRecordingChange(false);
  };

  const start = () => {
    setError('');
    const video = webcamRef.current?.video;
    if (!modelReady || !video || video.readyState < 2 || !video.srcObject?.active) {
      setError('Wait for the camera and pose model to be ready.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setError('This browser cannot record video. Try a recent Chrome, Firefox, or Safari.');
      return;
    }
    let session;
    try {
      const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) {
        setError('This browser does not support H.264 MP4 recording. Please use an updated Chrome or Safari.');
        return;
      }
      const recorder = new MediaRecorder(video.srcObject, { mimeType });
      const chunks = [];
      const id = `boxing-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      const originMs = performance.now();
      session = createPoseRecording({
        id, originMs, startedAt: new Date().toISOString(), videoTime: video.currentTime,
        width: video.videoWidth, height: video.videoHeight,
        cameraFps: video.srcObject.getVideoTracks()[0]?.getSettings().frameRate ?? null,
        mimeType: recorder.mimeType,
      });
      recorder.ondataavailable = ({ data }) => { if (data.size) chunks.push(data); };
      recorder.onerror = () => setError('Video recording failed. Stop and download any available data, then try again.');
      recorder.onstop = () => {
        clearInterval(timerRef.current);
        const data = session.stop(performance.now());
        if (captureRef.current === session) captureRef.current = null;
        onRecordingChange(false);
        const actualType = recorder.mimeType || mimeType;
        data.video.mimeType = actualType;
        const videoBlob = new Blob(chunks, { type: actualType });
        const files = [
          { label: 'Download MP4', name: `${id}.mp4`, blob: videoBlob },
          { label: 'Download landmarks', name: `${id}.landmarks.json`, blob: jsonBlob(data) },
          { label: 'Download label template', name: `${id}.labels.json`, blob: jsonBlob(createLabelTemplate(id)) },
        ];
        urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        const downloads = files.map(({ blob, ...file }) => ({ ...file, url: URL.createObjectURL(blob) }));
        urlsRef.current = downloads.map((file) => file.url);
        setExports({ downloads, samples: data.summary.trackedSamples, fps: data.summary.inferenceFps });
        if (!videoBlob.size || !data.summary.trackedSamples) setError('The recording has no video or tracked poses. Check the camera and try again after downloading it.');
        setPhase('ready');
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      captureRef.current = session;
      setPhase('recording');
      setProgress({ seconds: 0, samples: 0 });
      onRecordingChange(true);
      timerRef.current = setInterval(() => {
        const elapsed = performance.now() - originMs;
        setProgress({ seconds: Math.floor(elapsed / 1000), samples: session.frameCount });
        if (elapsed >= MAX_RECORDING_MS) stop();
      }, 250);
    } catch (failure) {
      session?.stop(performance.now());
      captureRef.current = null;
      setError(failure.message || 'Unable to start recording.');
    }
  };

  return (
    <div className="border-b border-white/10 bg-slate-950/30 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-cyan-100">Record punches for tuning</h3>
          <p className="mt-1 text-xs text-slate-300">Record up to 3 minutes of MP4 video and pose data. No round needed. No audio.</p>
        </div>
        {phase === 'recording' ? (
          <button type="button" className="action-btn action-btn-warning" onClick={stop}>Stop recording</button>
        ) : (
          <button type="button" className="action-btn action-btn-secondary disabled:opacity-50" onClick={start} disabled={!modelReady || phase === 'stopping'}>
            {phase === 'stopping' ? 'Preparing downloads…' : 'Record punches'}
          </button>
        )}
      </div>
      {phase === 'recording' && <p role="status" className="mt-2 text-sm text-rose-200">Recording · {progress.seconds}s · {progress.samples} pose samples</p>}
      {error && <p role="alert" className="mt-2 text-sm text-rose-200">{error}</p>}
      {exports && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-3">
            {exports.downloads.map((file) => <a className="text-sm text-cyan-200 underline" key={file.name} href={file.url} download={file.name}>{file.label}</a>)}
          </div>
          <p className="mt-2 text-xs text-slate-300">{exports.samples} tracked samples · {exports.fps.toFixed(1)} measured pose FPS. Save all three files before recording again or leaving this page. Label punches by video frame number at 30 FPS, starting with frame 0.</p>
          <p className="mt-1 text-xs text-slate-400">The exported video is unmirrored. Files stay in this browser until you download them.</p>
        </div>
      )}
    </div>
  );
}

export default PoseRecording;
