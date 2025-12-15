import React, { useState, useEffect, useRef, useCallback } from 'react';
import { formatDuration } from '../utils/format';
import { Pause, Play, Square, PictureInPicture2, Video, VideoOff, FlipHorizontal } from 'lucide-react';

interface RecordingOverlayProps {
  time: number;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  cameraId: string | null;
  cameraEnabled: boolean;
}

type PipMode = 'none' | 'video' | 'document';
type PipSize = 'sm' | 'md' | 'lg';

const PIP_SIZE_PRESETS: Record<
  PipSize,
  { width: number; height: number; label: string; title: string }
> = {
  sm: { width: 200, height: 200, label: 'S', title: 'Pequeño' },
  md: { width: 260, height: 260, label: 'M', title: 'Medio' },
  lg: { width: 320, height: 320, label: 'L', title: 'Grande' }
};

const isPipSize = (value: string | null): value is PipSize =>
  value === 'sm' || value === 'md' || value === 'lg';

export const RecordingOverlay: React.FC<RecordingOverlayProps> = ({
  time,
  isPaused,
  onPause,
  onResume,
  onStop,
  cameraId,
  cameraEnabled
}) => {
  const [pipMode, setPipMode] = useState<PipMode>('none');
  const [pipSize, setPipSize] = useState<PipSize>('sm');
  const isPipActive = pipMode !== 'none';
  const [isCameraOn, setIsCameraOn] = useState<boolean>(cameraEnabled);
  const isCameraActive = cameraEnabled && isCameraOn;
  const videoRef = useRef<HTMLVideoElement>(null);

  const bubbleRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ offsetX: number; offsetY: number; pointerId: number } | null>(null);
  const autoPipAttemptedRef = useRef(false);
  const documentPipWindowRef = useRef<Window | null>(null);
  const documentPipVideoRef = useRef<HTMLVideoElement | null>(null);
  const documentPipPollRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  const [bubblePos, setBubblePos] = useState<{ x: number; y: number } | null>(null);
  const [isCameraMirrored, setIsCameraMirrored] = useState(true);

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const canUseDocumentPip =
    typeof window !== 'undefined' && !!(window as any).documentPictureInPicture?.requestWindow;

  useEffect(() => {
    if (!cameraEnabled) setIsCameraOn(false);
  }, [cameraEnabled]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('screenflow.cameraPipSize');
      if (isPipSize(raw)) setPipSize(raw);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('screenflow.cameraPipSize', pipSize);
    } catch {
      // ignore
    }
  }, [pipSize]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('screenflow.cameraMirror');
      if (raw === 'false' || raw === '0') setIsCameraMirrored(false);
      if (raw === 'true' || raw === '1') setIsCameraMirrored(true);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('screenflow.cameraMirror', String(isCameraMirrored));
    } catch {
      // ignore
    }
  }, [isCameraMirrored]);

  const getBubbleSize = () => {
    const rect = bubbleRef.current?.getBoundingClientRect();
    if (!rect) return { w: 160, h: 160 };
    return { w: rect.width, h: rect.height };
  };

  const initBubblePos = useCallback(() => {
    const margin = 24;
    const { w, h } = getBubbleSize();

    // Try to restore last position
    try {
      const raw = localStorage.getItem('screenflow.cameraBubblePos');
      if (raw) {
        const parsed = JSON.parse(raw) as { x: number; y: number };
        const x = clamp(parsed.x, margin, window.innerWidth - w - margin);
        const y = clamp(parsed.y, margin, window.innerHeight - h - margin);
        setBubblePos({ x, y });
        return;
      }
    } catch {
      // ignore
    }

    // Default: top-right
    setBubblePos({
      x: Math.max(margin, window.innerWidth - w - margin),
      y: margin
    });
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    const startCam = async () => {
      if (isCameraActive && videoRef.current) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: cameraId ? { deviceId: { exact: cameraId }, width: 300, height: 300 } : true,
            audio: false 
          });
          if (cancelled) {
            stream.getTracks().forEach(t => t.stop());
            return;
          }
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            // Ensure it plays so PiP can be requested.
            try {
              await videoRef.current.play();
            } catch {
              // Autoplay may be blocked; user can still enable PiP manually.
            }
          }
        } catch(e) { console.error(e); }
      }
    };
    startCam();
    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [isCameraActive, cameraId]);

  useEffect(() => {
    if (!isCameraActive) return;
    if (bubblePos) return;
    // Defer init until after first render so we can measure size.
    const t = window.setTimeout(() => initBubblePos(), 0);
    return () => window.clearTimeout(t);
  }, [isCameraActive, bubblePos, initBubblePos]);

  useEffect(() => {
    const onResize = () => {
      if (!bubblePos) return;
      const margin = 24;
      const { w, h } = getBubbleSize();
      setBubblePos({
        x: clamp(bubblePos.x, margin, window.innerWidth - w - margin),
        y: clamp(bubblePos.y, margin, window.innerHeight - h - margin)
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [bubblePos]);

  useEffect(() => {
    setBubblePos(prev => {
      if (!prev) return prev;
      const margin = 24;
      const { w, h } = getBubbleSize();
      const x = clamp(prev.x, margin, window.innerWidth - w - margin);
      const y = clamp(prev.y, margin, window.innerHeight - h - margin);
      if (x === prev.x && y === prev.y) return prev;
      try {
        localStorage.setItem('screenflow.cameraBubblePos', JSON.stringify({ x, y }));
      } catch {
        // ignore
      }
      return { x, y };
    });
  }, [pipSize]);

  const exitPip = useCallback(async () => {
    if (documentPipPollRef.current !== null) {
      window.clearInterval(documentPipPollRef.current);
      documentPipPollRef.current = null;
    }
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      }
    } catch {
      // ignore
    }

    try {
      documentPipWindowRef.current?.close();
    } catch {
      // ignore
    }
    documentPipWindowRef.current = null;
    documentPipVideoRef.current = null;
    if (isMountedRef.current) setPipMode('none');
  }, []);

  useEffect(() => {
    if (isCameraActive) return;
    void exitPip();
  }, [isCameraActive, exitPip]);

  const enterVideoPip = useCallback(async () => {
    if (!videoRef.current) return;
    await videoRef.current.requestPictureInPicture();
    setPipMode('video');
  }, []);

  const enterDocumentPip = useCallback(async (size: PipSize) => {
    if (!canUseDocumentPip) return false;
    if (!videoRef.current) return false;

    const stream = videoRef.current.srcObject;
    if (!stream) return false;

    const documentPictureInPicture = (window as any).documentPictureInPicture as
      | { requestWindow: (opts: { width: number; height: number }) => Promise<Window> }
      | undefined;
    if (!documentPictureInPicture) return false;

    const preset = PIP_SIZE_PRESETS[size];
    const pipWindow = await documentPictureInPicture.requestWindow({
      width: preset.width,
      height: preset.height
    });
    documentPipWindowRef.current = pipWindow;

    pipWindow.document.title = '';
    pipWindow.document.body.style.margin = '0';
    pipWindow.document.body.style.background = '#000';
    pipWindow.document.body.style.overflow = 'hidden';

    const pipVideo = pipWindow.document.createElement('video');
    pipVideo.autoplay = true;
    pipVideo.muted = true;
    pipVideo.playsInline = true;
    (pipVideo as any).srcObject = stream;
    pipVideo.style.width = '100%';
    pipVideo.style.height = '100%';
    pipVideo.style.objectFit = 'cover';
    pipVideo.style.transform = isCameraMirrored ? 'scaleX(-1)' : 'none';
    pipWindow.document.body.appendChild(pipVideo);
    documentPipVideoRef.current = pipVideo;

    try {
      await pipVideo.play();
    } catch {
      // ignore
    }

    const onClose = () => {
      if (documentPipWindowRef.current !== pipWindow) return;
      documentPipWindowRef.current = null;
      documentPipVideoRef.current = null;
      if (documentPipPollRef.current !== null) {
        window.clearInterval(documentPipPollRef.current);
        documentPipPollRef.current = null;
      }
      if (isMountedRef.current) setPipMode('none');
    };

    pipWindow.addEventListener('pagehide', onClose);
    pipWindow.addEventListener('unload', onClose);

    if (documentPipPollRef.current !== null) {
      window.clearInterval(documentPipPollRef.current);
    }
    documentPipPollRef.current = window.setInterval(() => {
      if (!pipWindow.closed) return;
      onClose();
    }, 250);

    setPipMode('document');
    return true;
  }, [canUseDocumentPip, isCameraMirrored]);

  useEffect(() => {
    const docPipVideo = documentPipVideoRef.current;
    if (!docPipVideo) return;
    try {
      docPipVideo.style.transform = isCameraMirrored ? 'scaleX(-1)' : 'none';
    } catch {
      // ignore
    }
  }, [isCameraMirrored]);

  const togglePip = useCallback(async () => {
    if (!isCameraActive) return;
    if (pipMode !== 'none') {
      await exitPip();
      return;
    }

    try {
      if (canUseDocumentPip) {
        const ok = await enterDocumentPip(pipSize);
        if (ok) return;
      }
      await enterVideoPip();
    } catch {
      try {
        await enterVideoPip();
      } catch (e) {
        console.error(e);
      }
    }
  }, [isCameraActive, pipMode, exitPip, enterVideoPip, canUseDocumentPip, enterDocumentPip, pipSize]);

  const cyclePipSize = useCallback(async () => {
    const nextSize: PipSize = pipSize === 'sm' ? 'md' : pipSize === 'md' ? 'lg' : 'sm';
    setPipSize(nextSize);

    if (pipMode === 'none') return;

    await exitPip();
    try {
      if (canUseDocumentPip) {
        const ok = await enterDocumentPip(nextSize);
        if (ok) return;
      }
      await enterVideoPip();
    } catch {
      // ignore
    }
  }, [pipSize, pipMode, exitPip, enterDocumentPip, enterVideoPip, canUseDocumentPip]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLeave = () => {
      if (pipMode === 'video') setPipMode('none');
    };
    video.addEventListener('leavepictureinpicture', onLeave);
    return () => video.removeEventListener('leavepictureinpicture', onLeave);
  }, [pipMode]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      try {
        if (document.pictureInPictureElement) {
          void document.exitPictureInPicture();
        }
      } catch {
        // ignore
      }

      try {
        documentPipWindowRef.current?.close();
      } catch {
        // ignore
      }
      documentPipWindowRef.current = null;

      if (documentPipPollRef.current !== null) {
        window.clearInterval(documentPipPollRef.current);
        documentPipPollRef.current = null;
      }
    };
  }, []);

  // Best-effort: try to enable PiP automatically when recording starts so the camera stays visible
  // even when switching tabs/apps. Browsers may require a user gesture; failure is fine.
  useEffect(() => {
    let attempts = 0;
    let timeoutId: number | null = null;
    const run = async () => {
      if (!isCameraActive) return;
      if (isPipActive) return;
      if (autoPipAttemptedRef.current) return;
      if (!videoRef.current) return;

      if (!videoRef.current.srcObject) {
        attempts += 1;
        if (attempts > 20) {
          autoPipAttemptedRef.current = true;
          return;
        }
        timeoutId = window.setTimeout(run, 250);
        return;
      }

      autoPipAttemptedRef.current = true;
      try {
        await enterVideoPip();
      } catch {
        // ignore
      }
    };
    void run();
    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [isCameraActive, isPipActive, enterVideoPip]);

  const onBubblePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!bubblePos) return;
    if (isPipActive) return;
    if (e.button !== 0) return;

    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    dragRef.current = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      pointerId: e.pointerId
    };
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const onBubblePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const { offsetX, offsetY } = dragRef.current;
    const margin = 24;
    const { w, h } = getBubbleSize();
    const x = clamp(e.clientX - offsetX, margin, window.innerWidth - w - margin);
    const y = clamp(e.clientY - offsetY, margin, window.innerHeight - h - margin);
    setBubblePos({ x, y });
    try {
      localStorage.setItem('screenflow.cameraBubblePos', JSON.stringify({ x, y }));
    } catch {
      // ignore
    }
  };

  const onBubblePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const target = e.currentTarget;
    try {
      target.releasePointerCapture(dragRef.current.pointerId);
    } catch {
      // ignore
    }
    dragRef.current = null;
  };

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] flex flex-col justify-between">
        {/* Camera Bubble */}
        {isCameraActive && (
          <div
            ref={bubbleRef}
            className="pointer-events-auto flex flex-col items-center gap-2 group transition-all duration-300"
            style={
              bubblePos
                ? {
                    position: 'fixed',
                    left: bubblePos.x,
                    top: bubblePos.y,
                    zIndex: 120
                  }
                : { position: 'fixed', right: 32, top: 32, zIndex: 120 }
            }
          >
            <div
              onPointerDown={onBubblePointerDown}
              onPointerMove={onBubblePointerMove}
              onPointerUp={onBubblePointerUp}
              style={{
                width: PIP_SIZE_PRESETS[pipSize].width,
                height: PIP_SIZE_PRESETS[pipSize].height
              }}
              className={`
                relative rounded-full overflow-hidden border-[4px] border-white/20 shadow-2xl transition-all duration-200 bg-slate-900
                ${isPipActive ? 'opacity-0 pointer-events-none' : 'hover:scale-[1.03]'}
              `}
            >
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-cover transform ${isCameraMirrored ? '-scale-x-100' : ''}`}
              />

              {/* Hover Controls for Camera */}
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-all duration-200">
                <button
                  onClick={togglePip}
                  className="text-white bg-white/20 p-2.5 rounded-full hover:bg-white/40 backdrop-blur-md transition-transform hover:scale-110"
                >
                  <PictureInPicture2 size={20} />
                </button>
                <button
                  onClick={cyclePipSize}
                  className="text-white bg-white/20 w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/40 backdrop-blur-md transition-transform hover:scale-110"
                >
                  <span className="text-[11px] font-semibold">{PIP_SIZE_PRESETS[pipSize].label}</span>
                </button>
                <button
                  onClick={() => setIsCameraMirrored(prev => !prev)}
                  className="text-white bg-white/20 p-2.5 rounded-full hover:bg-white/40 backdrop-blur-md transition-transform hover:scale-110"
                  title={isCameraMirrored ? 'Espejo: ON' : 'Espejo: OFF'}
                >
                  <FlipHorizontal size={20} />
                </button>
                <button
                  onClick={() => {
                    void exitPip();
                    setIsCameraOn(false);
                  }}
                  className="text-white bg-white/20 p-2.5 rounded-full hover:bg-white/40 backdrop-blur-md transition-transform hover:scale-110"
                >
                  <VideoOff size={20} />
                </button>
              </div>

            </div>
          </div>
        )}

        {/* Floating "Dynamic Island" Controls */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 pointer-events-auto">
             <div className="bg-[#0F172A] text-white rounded-full shadow-2xl shadow-slate-900/50 p-2 pr-6 pl-6 flex items-center gap-6 border border-white/10 backdrop-blur-xl animate-in slide-in-from-bottom-20 fade-in duration-500 scale-100 hover:scale-[1.02] transition-transform">
                
                {/* Recording Status / Timer */}
                <div className="flex items-center gap-3 border-r border-white/10 pr-6 py-2">
                    <div className="relative">
                        <div className={`w-3 h-3 bg-red-500 rounded-full ${!isPaused ? 'animate-pulse' : ''}`} />
                        {!isPaused && <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-75"></div>}
                    </div>
                    <span className="font-mono text-lg font-medium tracking-wider text-slate-100">{formatDuration(time)}</span>
                </div>

                {/* Main Actions */}
                <div className="flex items-center gap-3">
                    {isPaused ? (
                        <button onClick={onResume} className="p-2.5 hover:bg-white/10 rounded-full transition-all active:scale-95 group">
                            <Play size={22} className="fill-current text-slate-200 group-hover:text-white" />
                        </button>
                    ) : (
                        <button onClick={onPause} className="p-2.5 hover:bg-white/10 rounded-full transition-all active:scale-95 group">
                            <Pause size={22} className="fill-current text-slate-200 group-hover:text-white" />
                        </button>
                    )}

                    {cameraEnabled && (
                      <button
                        onClick={async () => {
                          if (isCameraActive) {
                            await exitPip();
                            setIsCameraOn(false);
                            return;
                          }
                          setIsCameraOn(true);
                        }}
                        className={`p-2.5 hover:bg-white/10 rounded-full transition-all active:scale-95 ${
                          isCameraActive ? 'text-tech-300' : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {isCameraActive ? <VideoOff size={22} /> : <Video size={22} />}
                      </button>
                    )}

                    {/* PiP toggle so camera can stay visible when switching apps */}
                    {isCameraActive && (
                      <button
                        onClick={togglePip}
                        className={`p-2.5 hover:bg-white/10 rounded-full transition-all active:scale-95 ${isPipActive ? 'text-tech-300' : 'text-slate-300 hover:text-white'}`}
                      >
                        <PictureInPicture2 size={22} />
                      </button>
                    )}

                    {isCameraActive && (
                      <button
                        onClick={cyclePipSize}
                        className={`w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-full transition-all active:scale-95 ${
                          isPipActive ? 'text-tech-300' : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        <span className="text-xs font-semibold">{PIP_SIZE_PRESETS[pipSize].label}</span>
                      </button>
                    )}

                    {isCameraActive && (
                      <button
                        onClick={() => setIsCameraMirrored(prev => !prev)}
                        className={`p-2.5 hover:bg-white/10 rounded-full transition-all active:scale-95 ${
                          isCameraMirrored ? 'text-tech-300' : 'text-slate-300 hover:text-white'
                        }`}
                        title={isCameraMirrored ? 'Espejo: ON' : 'Espejo: OFF'}
                      >
                        <FlipHorizontal size={22} />
                      </button>
                    )}

                    <button 
                        onClick={onStop} 
                        className="ml-2 bg-red-500 hover:bg-red-600 text-white p-2.5 px-5 rounded-full transition-all hover:shadow-lg hover:shadow-red-500/20 active:scale-95 flex items-center gap-2 font-medium text-sm"
                    >
                        <Square size={14} fill="currentColor" />
                        <span>Terminar</span>
                    </button>
                </div>
             </div>
        </div>
    </div>
  );
};
