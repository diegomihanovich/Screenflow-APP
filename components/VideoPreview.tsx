import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Calendar, Check, Clock, Download, PenLine, Trash2 } from 'lucide-react';
import { Recording } from '../types';
import { generateId } from '../utils/format';
import { transcodeToMp4 } from '../utils/mp4';
import { Button } from './ui/Button';

interface VideoPreviewProps {
  blob?: Blob;
  duration?: number;
  onSave?: (rec: Recording) => void;
  recording?: Recording;
  onDelete?: (id: string) => void;
  onDiscard: () => void;
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({
  blob,
  duration,
  onSave,
  onDiscard,
  recording,
  onDelete
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null);
  const [title, setTitle] = useState('Nueva GrabaciA3n');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [description, setDescription] = useState('');
  const [isExportingMp4, setIsExportingMp4] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [exportStatus, setExportStatus] = useState<'loading' | 'preparing' | 'converting' | 'finalizing' | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const [detectedDurationSeconds, setDetectedDurationSeconds] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    const run = async () => {
      let nextBlob: Blob | null = null;

      if (recording) {
        setTitle(recording.title);
        setDescription(recording.description);

        nextBlob = recording.blob
          ? recording.blob
          : recording.fileHandle
            ? await recording.fileHandle.getFile()
            : null;
      } else if (blob) {
        nextBlob = blob;
      }

      if (!nextBlob) return;

      objectUrl = URL.createObjectURL(nextBlob);
      if (cancelled) return;

      setDetectedDurationSeconds(null);
      setSourceBlob(nextBlob);
      setUrl(objectUrl);
    };

    void run();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blob, recording]);

  const handleSave = () => {
    if (!blob || !onSave) return;
    const newRecording: Recording = {
      id: generateId(),
      title: title || 'Sin tA-tulo',
      description,
      blob,
      duration: duration || 0,
      createdAt: Date.now(),
      source: 'memory'
    };
    onSave(newRecording);
  };

  const downloadBlob = (blobToDownload: Blob, extension: string) => {
    const safeTitle = (title || 'grabacion')
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
      .replace(/\s+/g, '_');
    const objectUrl = URL.createObjectURL(blobToDownload);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `${safeTitle}.${extension}`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  };

  const handleDownloadOriginal = () => {
    if (!sourceBlob) return;
    downloadBlob(sourceBlob, sourceBlob.type === 'video/mp4' ? 'mp4' : 'webm');
  };

  const handleDownloadMp4 = async () => {
    if (!sourceBlob) return;
    if (isExportingMp4) return;

    setIsExportingMp4(true);
    setExportProgress(null);
    setExportStatus('loading');
    const abortController = new AbortController();
    exportAbortRef.current = abortController;
    try {
      const mp4Blob =
        sourceBlob.type === 'video/mp4'
          ? sourceBlob
          : await transcodeToMp4(sourceBlob, {
              durationSeconds: typeof totalSeconds === 'number' ? totalSeconds : undefined,
              onProgress: (p) => setExportProgress(Math.min(100, Math.max(0, Math.floor(p * 100)))),
              onStatus: (s) => setExportStatus(s),
              signal: abortController.signal,
              resetAfter: true
            });

      downloadBlob(mp4Blob, 'mp4');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      console.error(e);
      alert('No se pudo convertir a MP4 en este navegador. Descargando original.');
      handleDownloadOriginal();
    } finally {
      exportAbortRef.current = null;
      setIsExportingMp4(false);
      setExportProgress(null);
      setExportStatus(null);
    }
  };

  const handleCancelExport = () => {
    exportAbortRef.current?.abort();
  };

  const handleDelete = () => {
    if (recording && onDelete && confirm('A¨EstA­s seguro de borrar este video?')) {
      onDelete(recording.id);
      onDiscard();
    }
  };

  if (!url) {
    return (
      <div className="flex h-full items-center justify-center bg-[#F8FAFC]">
        <div className="loader"></div>
      </div>
    );
  }

  const totalSeconds =
    typeof duration === 'number' && duration > 0
      ? duration
      : typeof recording?.duration === 'number' && recording.duration > 0
        ? recording.duration
        : detectedDurationSeconds;
  const durationText =
    typeof totalSeconds === 'number'
      ? `${Math.floor(totalSeconds / 60)}:${Math.floor(totalSeconds % 60)
          .toString()
          .padStart(2, '0')}`
      : '--:--';

  const exportButtonText = (() => {
    if (!isExportingMp4) return 'Exportar MP4';
    if (exportStatus === 'loading') return 'Cargando MP4...';
    if (exportStatus === 'preparing') return 'Preparando...';
    if (exportStatus === 'finalizing') return 'Finalizando...';
    if (exportProgress !== null) return `Convirtiendo... ${exportProgress}%`;
    return 'Convirtiendo...';
  })();

  return (
    <div className="h-full bg-[#F8FAFC] flex flex-col overflow-hidden">
      {/* Navbar */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex items-center justify-between z-20 sticky top-0">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={onDiscard}
            icon={<ArrowLeft size={18} />}
            className="text-slate-500 hover:text-slate-900"
          >
            {recording ? 'Volver' : 'Descartar'}
          </Button>
          <div className="h-6 w-px bg-slate-200 mx-2 hidden md:block"></div>
          <span className="text-sm font-medium text-slate-500 hidden md:block">Vista previa</span>
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={handleDownloadMp4}
            icon={<Download size={16} />}
            disabled={isExportingMp4}
            title="Exportar en MP4 (puede tardar)"
          >
            {exportButtonText}
          </Button>
          {isExportingMp4 && (
            <Button variant="ghost" onClick={handleCancelExport} title="Cancelar conversión">
              Cancelar
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={handleDownloadOriginal}
            disabled={isExportingMp4}
            title="Descargar original (WebM)"
          >
            Original
          </Button>

          {recording ? (
            <Button variant="danger" onClick={handleDelete} icon={<Trash2 size={16} />}>
              Eliminar
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleSave}
              className="bg-tech-600 hover:bg-tech-700 shadow-tech-500/30"
            >
              Guardar en Biblioteca
            </Button>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-6 md:p-10 flex flex-col lg:flex-row gap-10">
          {/* Left: Video Player */}
          <div className="flex-1 min-w-0">
            <div className="bg-slate-900 rounded-2xl shadow-2xl overflow-hidden aspect-video border border-slate-800 ring-1 ring-slate-900/10 relative group">
              <video
                ref={videoRef}
                src={url}
                controls
                className="w-full h-full outline-none"
                autoPlay={!!blob}
                onLoadedMetadata={() => {
                  const d = videoRef.current?.duration;
                  if (typeof d === 'number' && Number.isFinite(d) && d > 0) {
                    setDetectedDurationSeconds(d);
                  }
                }}
              />
            </div>

            {/* Meta info row */}
            <div className="mt-6 flex flex-wrap gap-4 text-sm text-slate-500">
              <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
                <Clock size={14} className="text-tech-500" />
                <span className="font-mono font-medium text-slate-700">{durationText}</span>
              </div>
              <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
                <Calendar size={14} className="text-tech-500" />
                <span>{new Date(recording ? recording.createdAt : Date.now()).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Right: Details / Edit */}
          <div className="w-full lg:w-[400px] flex flex-col gap-6">
            {/* Title Section */}
            <div className="group">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">TA-tulo</label>
              <div className="relative">
                {!recording || isEditingTitle ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      onBlur={() => setIsEditingTitle(false)}
                      onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
                      className="w-full text-2xl font-bold text-slate-900 bg-transparent border-b-2 border-tech-500 focus:outline-none px-0 py-1 placeholder-slate-300"
                      placeholder="Escribe un tA-tulo..."
                    />
                    <button
                      onClick={() => setIsEditingTitle(false)}
                      className="p-2 text-green-600 bg-green-50 rounded-lg hover:bg-green-100"
                    >
                      <Check size={18} />
                    </button>
                  </div>
                ) : (
                  <div
                    className="flex items-start justify-between cursor-pointer py-1 -ml-2 px-2 rounded-lg hover:bg-slate-100 transition-colors"
                    onClick={() => setIsEditingTitle(true)}
                  >
                    <h2 className="text-2xl font-bold text-slate-900 leading-tight break-words">{title}</h2>
                    <PenLine
                      size={16}
                      className="text-slate-400 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Description Section */}
            <div className="flex-1 flex flex-col">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Notas / DescripciA3n
              </label>
              {recording ? (
                <div className="prose prose-sm prose-slate bg-white p-4 rounded-xl border border-slate-200 min-h-[150px] shadow-sm">
                  <p className="text-slate-600 whitespace-pre-wrap leading-relaxed">
                    {description || 'Sin notas adicionales.'}
                  </p>
                </div>
              ) : (
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="AAñade contexto, puntos clave o notas para tu equipo..."
                  className="w-full flex-1 bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-700 focus:ring-2 focus:ring-tech-500 focus:border-transparent outline-none resize-none shadow-sm placeholder-slate-400 transition-all min-h-[200px]"
                />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
