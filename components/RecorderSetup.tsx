import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/Button';
import { RecorderSettings, MediaDeviceOption } from '../types';
import { Monitor, Mic, Camera, X, AlertCircle, ChevronDown, Info, Dot, Check } from 'lucide-react';

interface RecorderSetupProps {
  onStart: (settings: RecorderSettings) => void;
  onCancel: () => void;
}

export const RecorderSetup: React.FC<RecorderSetupProps> = ({ onStart, onCancel }) => {
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [qualityPreset, setQualityPreset] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  
  const [cameras, setCameras] = useState<MediaDeviceOption[]>([]);
  const [mics, setMics] = useState<MediaDeviceOption[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [selectedMic, setSelectedMic] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);

  const QUALITY_PRESETS: Record<
    'HIGH' | 'MEDIUM' | 'LOW',
    {
      title: string;
      fps: number;
      videoMbps: number;
      audioKbps: number;
      approx: string;
    }
  > = {
    HIGH: {
      title: 'Alta',
      fps: 30,
      videoMbps: 8,
      audioKbps: 128,
      approx: '1080p+ (aprox.)'
    },
    MEDIUM: {
      title: 'Media',
      fps: 30,
      videoMbps: 4,
      audioKbps: 128,
      approx: '720p (aprox.)'
    },
    LOW: {
      title: 'Baja',
      fps: 15,
      videoMbps: 1.5,
      audioKbps: 96,
      approx: '480p (aprox.)'
    }
  };

  useEffect(() => {
    const getDevices = async () => {
      const stopTracks = (stream: MediaStream) => {
        stream.getTracks().forEach(t => t.stop());
      };

      try {
        setPermissionError(null);

        const initialDevices = await navigator.mediaDevices.enumerateDevices();
        const hasVideoInput = initialDevices.some(d => d.kind === 'videoinput');
        const hasAudioInput = initialDevices.some(d => d.kind === 'audioinput');

        if (hasVideoInput) {
          try {
            const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            stopTracks(s);
          } catch {
            // ignore
          }
        }

        if (hasAudioInput) {
          try {
            const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            stopTracks(s);
          } catch {
            // ignore
          }
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        
        const videoDevices = devices.filter(d => d.kind === 'videoinput').map(d => ({ id: d.deviceId, label: d.label || `Cámara ${d.deviceId.slice(0, 4)}` }));
        const audioDevices = devices.filter(d => d.kind === 'audioinput').map(d => ({ id: d.deviceId, label: d.label || `Micrófono ${d.deviceId.slice(0, 4)}` }));

        setCameras(videoDevices);
        setMics(audioDevices);
        if (videoDevices.length > 0) setSelectedCamera(prev => prev || videoDevices[0].id);
        if (audioDevices.length > 0) setSelectedMic(prev => prev || audioDevices[0].id);

        if (audioDevices.length === 0) {
          setMicEnabled(false);
          setSelectedMic('');
        }
        if (videoDevices.length === 0) {
          setCameraEnabled(false);
          setSelectedCamera('');
        }
      } catch (err) {
        setPermissionError("Se requiere acceso a cámara y micrófono para configurar.");
      }
    };
    getDevices();
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    const startCamera = async () => {
      if (cameraEnabled && selectedCamera) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: selectedCamera }, audio: false });
          if (videoRef.current) videoRef.current.srcObject = stream;
        } catch (e) { console.error(e); }
      } else {
        if (videoRef.current) videoRef.current.srcObject = null;
      }
    };
    startCamera();
    return () => { if (stream) stream.getTracks().forEach(t => t.stop()); };
  }, [cameraEnabled, selectedCamera]);

  const handleStart = () => {
    const hasMics = mics.length > 0;
    const hasCameras = cameras.length > 0;
    onStart({
      includeCamera: cameraEnabled && hasCameras,
      includeMic: micEnabled && hasMics,
      selectedCameraId: cameraEnabled && hasCameras ? selectedCamera : null,
      selectedMicId: micEnabled && hasMics ? selectedMic : null,
      qualityPreset
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div className="min-h-full flex items-start md:items-center justify-center">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row border border-slate-200 my-4 md:my-8 max-h-[calc(100vh-2rem)]">
         
        {/* Left Side: Settings */}
        <div className="p-6 md:p-8 flex-1 flex flex-col relative bg-white min-h-0 overflow-y-auto">
          <button onClick={onCancel} className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
              <X size={20} />
          </button>
          
          <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">Configuración</h2>
            <p className="text-slate-500 mb-6 text-sm">Elige tus fuentes antes de comenzar.</p>
            
            {permissionError && (
                <div className="mb-6 bg-red-50 text-red-600 p-4 rounded-xl flex items-center gap-3 text-sm border border-red-100">
                    <AlertCircle size={18} /> {permissionError}
                </div>
            )}

            <div className="space-y-6">
              {/* Screen Mode */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-4 transition-all hover:border-tech-200 hover:bg-tech-50/50 group cursor-default">
                  <div className="bg-white p-3 rounded-xl shadow-sm text-tech-600 border border-slate-100 group-hover:scale-110 transition-transform duration-300">
                     <Monitor size={22} />
                  </div>
                  <div>
                     <h3 className="font-semibold text-slate-900">Pantalla Completa</h3>
                     <p className="text-xs text-slate-500 mt-0.5">Se elige al compartir pantalla</p>
                  </div>
                  <div className="ml-auto text-tech-600"><Check size={18} /></div>
              </div>

              {/* Controls Group */}
              <div className="space-y-3">
                {/* Mic Row */}
                <div className="p-3 rounded-2xl border border-slate-100 bg-slate-50">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-3 min-w-0 sm:w-40">
                      <div className={`p-2 rounded-xl ${micEnabled ? 'bg-tech-100 text-tech-700' : 'bg-white text-slate-400 border border-slate-200'}`}>
                        <Mic size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-900">Micrófono</p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {micEnabled ? 'On' : 'Off'}
                        </p>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className={`relative rounded-xl border ${micEnabled ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-100'} px-3 py-2`}>
                        <select
                          className={`appearance-none w-full text-sm bg-transparent pr-7 outline-none ${micEnabled ? 'text-slate-700 cursor-pointer' : 'text-slate-400 cursor-not-allowed'}`}
                          disabled={!micEnabled || mics.length === 0}
                          value={selectedMic}
                          onChange={(e) => setSelectedMic(e.target.value)}
                        >
                          {mics.length === 0 ? (
                            <option value="">Sin micrófonos</option>
                          ) : (
                            mics.map(m => <option key={m.id} value={m.id}>{m.label}</option>)
                          )}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>

                    <button
                      onClick={() => setMicEnabled(!micEnabled)}
                      disabled={mics.length === 0}
                      className={`w-12 h-7 rounded-full transition-all duration-300 relative focus:outline-none ring-1 ring-black/5 self-start sm:self-auto ${
                        mics.length === 0 ? 'bg-slate-200 opacity-60 cursor-not-allowed' : micEnabled ? 'bg-tech-600' : 'bg-slate-200'
                      }`}
                      aria-label="Toggle mic"
                    >
                      <span className={`absolute top-1 bg-white w-5 h-5 rounded-full shadow-sm transition-all duration-300 ${micEnabled ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>

                  <p className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
                    <Dot size={14} className="text-slate-400" /> Audio del sistema: se habilita al compartir pantalla (si el navegador lo permite)
                  </p>
                </div>

                {/* Camera Row */}
                <div className="p-3 rounded-2xl border border-slate-100 bg-slate-50">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-3 min-w-0 sm:w-40">
                      <div className={`p-2 rounded-xl ${cameraEnabled ? 'bg-tech-100 text-tech-700' : 'bg-white text-slate-400 border border-slate-200'}`}>
                        <Camera size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-900">Cámara</p>
                        <p className="text-[11px] text-slate-500 truncate">{cameraEnabled ? 'On (overlay)' : 'Off'}</p>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className={`relative rounded-xl border ${cameraEnabled ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-100'} px-3 py-2`}>
                        <select
                          className={`appearance-none w-full text-sm bg-transparent pr-7 outline-none ${cameraEnabled ? 'text-slate-700 cursor-pointer' : 'text-slate-400 cursor-not-allowed'}`}
                          disabled={!cameraEnabled || cameras.length === 0}
                          value={selectedCamera}
                          onChange={(e) => setSelectedCamera(e.target.value)}
                        >
                          {cameras.length === 0 ? (
                            <option value="">Sin cámaras</option>
                          ) : (
                            cameras.map(c => <option key={c.id} value={c.id}>{c.label}</option>)
                          )}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>

                    <button
                      onClick={() => setCameraEnabled(!cameraEnabled)}
                      disabled={cameras.length === 0}
                      className={`w-12 h-7 rounded-full transition-all duration-300 relative focus:outline-none ring-1 ring-black/5 self-start sm:self-auto ${
                        cameras.length === 0 ? 'bg-slate-200 opacity-60 cursor-not-allowed' : cameraEnabled ? 'bg-tech-600' : 'bg-slate-200'
                      }`}
                      aria-label="Toggle camera"
                    >
                      <span className={`absolute top-1 bg-white w-5 h-5 rounded-full shadow-sm transition-all duration-300 ${cameraEnabled ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                </div>

                {/* Quality Row */}
                <div className="p-3 rounded-2xl border border-slate-100 bg-slate-50">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-3 min-w-0 sm:w-40">
                      <div className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500">
                        <Monitor size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-900">Calidad</p>
                        <p className="text-[11px] text-slate-500 truncate">{QUALITY_PRESETS[qualityPreset].approx}</p>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="relative rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <select
                          className="appearance-none w-full text-sm bg-transparent pr-7 outline-none text-slate-700 cursor-pointer"
                          value={qualityPreset}
                          onChange={(e) => setQualityPreset(e.target.value as any)}
                        >
                          {(Object.keys(QUALITY_PRESETS) as Array<'HIGH' | 'MEDIUM' | 'LOW'>).map((key) => {
                            const p = QUALITY_PRESETS[key];
                            const label = `${p.title} — ${p.approx} · ${p.fps}fps · ~${p.videoMbps}Mbps`;
                            return (
                              <option key={key} value={key}>
                                {label}
                              </option>
                            );
                          })}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                        title="Ajusta FPS y bitrate (peso del archivo). La resolución final depende de la pantalla/ventana compartida."
                        aria-label="Info calidad"
                      >
                        <Info size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky footer actions so they don't get cut off on small screens */}
          <div className="mt-6">
            <Button onClick={handleStart} size="lg" className="w-full text-base py-4 rounded-xl shadow-tech-500/30">
              Iniciar grabación
            </Button>
            <p className="mt-3 text-[11px] text-slate-500">
              Selección actual: <span className="font-semibold">{QUALITY_PRESETS[qualityPreset].title}</span> · {QUALITY_PRESETS[qualityPreset].fps}fps · ~{QUALITY_PRESETS[qualityPreset].videoMbps}Mbps
            </p>
          </div>
        </div>

        {/* Right Side: Preview */}
        <div className="bg-slate-50 flex-1 min-h-[300px] hidden lg:flex items-center justify-center relative p-8 border-l border-slate-100">
             {/* Decorative Elements */}
             <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] opacity-50"></div>
             
             <div className="relative z-10 w-full max-w-[320px] aspect-square">
                {/* Camera Frame */}
                 <div className={`
                     w-full h-full rounded-full overflow-hidden border-[6px] shadow-2xl transition-all duration-500
                     ${cameraEnabled ? 'border-white shadow-tech-200' : 'border-slate-200 bg-slate-100'}
                 `}>
                    {cameraEnabled ? (
                        <video 
                            ref={videoRef}
                            autoPlay 
                            muted 
                            playsInline 
                            className="w-full h-full object-cover transform -scale-x-100"
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                            <Camera size={48} className="mb-2 opacity-50" />
                            <p className="text-sm font-medium">Cámara desactivada</p>
                        </div>
                    )}
                </div>
                
                {/* Status Badge */}
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2">
                   <div className="bg-white/90 backdrop-blur border border-slate-200 shadow-sm px-4 py-1.5 rounded-full flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${cameraEnabled ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></div>
                      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Preview</span>
                   </div>
                </div>
             </div>
        </div>

        </div>
      </div>
    </div>
  );
};
