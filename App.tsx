import React, { useState } from 'react';
import { ViewState, Recording, RecorderSettings } from './types';
import { Dashboard } from './components/Dashboard';
import { RecorderSetup } from './components/RecorderSetup';
import { RecordingOverlay } from './components/RecordingOverlay';
import { VideoPreview } from './components/VideoPreview';
import { useScreenRecorder } from './hooks/useScreenRecorder';
import {
  ensureDirectoryPermission,
  getStoredLibraryDirectoryHandle,
  listWebmRecordingsFromDirectory,
  pickLibraryDirectory,
  saveBlobToDirectory,
  storeLibraryDirectoryHandle
} from './utils/fsLibrary';
import { createVideoThumbnail } from './utils/media';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('DASHBOARD');
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);

  const [libraryDirHandle, setLibraryDirHandle] = useState<FileSystemDirectoryHandle | null>(null);

  const [recorderSettings, setRecorderSettings] = useState<RecorderSettings>({
    includeCamera: false,
    includeMic: true,
    selectedCameraId: null,
    selectedMicId: null,
    qualityPreset: 'MEDIUM',
  });

  const {
    isRecording,
    isPaused,
    recordingTime,
    recordedChunks,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    setRecordedChunks
  } = useScreenRecorder();

  const refreshLibraryFromDirectory = async (dirHandle: FileSystemDirectoryHandle) => {
    const ok = await ensureDirectoryPermission(dirHandle, 'read');
    if (!ok) return;
    const recs = await listWebmRecordingsFromDirectory(dirHandle);
    setRecordings(recs);
    void hydrateRecordingsWithThumbnails(recs);
  };

  const hydrateRecordingsWithThumbnails = async (recs: Recording[]) => {
    const withThumbs = await Promise.all(
      recs.map(async (rec) => {
        if (rec.thumbnailUrl) return rec;

        const blob = rec.blob
          ? rec.blob
          : rec.fileHandle
            ? await rec.fileHandle.getFile()
            : null;

        if (!blob) return rec;
        const thumbnailUrl = await createVideoThumbnail(blob);
        return thumbnailUrl ? { ...rec, thumbnailUrl } : rec;
      })
    );

    setRecordings((current) => {
      const currentById = new Map(current.map((rec) => [rec.id, rec]));
      const merged = withThumbs.map((rec) => currentById.get(rec.id) ?? rec);
      const mergedIds = new Set(merged.map((rec) => rec.id));
      const extras = current.filter((rec) => !mergedIds.has(rec.id));
      return [...merged, ...extras];
    });
  };

  // Load previously-selected library folder (if user granted access earlier)
  React.useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        const stored = await getStoredLibraryDirectoryHandle();
        if (!stored) return;

        const ok = await ensureDirectoryPermission(stored, 'read');
        if (!ok) return;

        if (cancelled) return;
        setLibraryDirHandle(stored);
        await refreshLibraryFromDirectory(stored);
      } catch {
        // Ignore: user may have cleared permissions or handle is no longer valid.
      }
    };
    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const sanitizeFileName = (name: string) => {
    // Windows-incompatible characters: <>:"/\\|?* and control chars.
    return name
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
      .replace(/\s+/g, ' ')
      .slice(0, 120);
  };

  const handleChooseLibraryFolder = async () => {
    const dir = await pickLibraryDirectory();
    const ok = await ensureDirectoryPermission(dir, 'readwrite');
    if (!ok) return;
    setLibraryDirHandle(dir);
    await storeLibraryDirectoryHandle(dir);
    await refreshLibraryFromDirectory(dir);
  };

  // Navigation Handlers
  const handleStartSetup = () => {
    setSelectedRecording(null);
    setView('SETUP');
  };
  
  const handleCancelSetup = () => setView('DASHBOARD');

  const handleStartRecording = async (settings: RecorderSettings) => {
    setRecorderSettings(settings);
    const success = await startRecording(settings);
    if (success) {
      setView('RECORDING');
    }
  };

  const handleStopRecording = () => {
    stopRecording();
    // Allow small delay for MediaRecorder `onstop` to fire and populate chunks
    setTimeout(() => {
        setSelectedRecording(null); // Ensure we are in "New Recording" mode
        setView('PREVIEW');
    }, 500);
  };

  const handleSaveRecording = (newRec: Recording) => {
    const run = async () => {
      // If user connected a folder, persist the recording as a .webm file there.
      if (libraryDirHandle && newRec.blob) {
        const ok = await ensureDirectoryPermission(libraryDirHandle, 'readwrite');
        if (ok) {
          const base = sanitizeFileName(newRec.title || 'Grabacion');
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          const fileName = `${base} - ${stamp}.webm`;
          await saveBlobToDirectory(libraryDirHandle, fileName, newRec.blob);
          await refreshLibraryFromDirectory(libraryDirHandle);
          setView('DASHBOARD');
          setRecordedChunks([]); // Clear memory
          return;
        }
      }

      // Fallback: keep in-memory only.
      const thumbnailUrl = newRec.blob ? await createVideoThumbnail(newRec.blob) : null;
      const recordingWithThumb = thumbnailUrl ? { ...newRec, thumbnailUrl } : newRec;
      setRecordings(prev => [recordingWithThumb, ...prev]);
      setView('DASHBOARD');
      setRecordedChunks([]);
    };

    void run();
  };

  const handleSelectRecording = (rec: Recording) => {
    setSelectedRecording(rec);
    setView('PREVIEW');
  };

  const handleDeleteRecording = (id: string) => {
    if (confirm('¿Estás seguro de que quieres eliminar esta grabación?')) {
      const run = async () => {
        const rec = recordings.find(r => r.id === id);
        if (rec?.source === 'file' && libraryDirHandle && rec.fileName) {
          const ok = await ensureDirectoryPermission(libraryDirHandle, 'readwrite');
          if (ok) {
            try {
              await libraryDirHandle.removeEntry(rec.fileName);
            } catch (e) {
              console.error('Failed to delete file from folder', e);
            }
            await refreshLibraryFromDirectory(libraryDirHandle);
            if (view === 'PREVIEW' && selectedRecording?.id === id) {
              setView('DASHBOARD');
            }
            return;
          }
        }

        // Fallback: remove from in-memory list.
        setRecordings(prev => prev.filter(r => r.id !== id));
        if (view === 'PREVIEW' && selectedRecording?.id === id) {
          setView('DASHBOARD');
        }
      };

      void run();
    }
  };

  const handleBackToDashboard = () => {
      // If we were recording, confirm discard
      if (view === 'PREVIEW' && !selectedRecording && recordedChunks.length > 0) {
          if (confirm('¿Descartar grabación? Se perderá el video.')) {
            setView('DASHBOARD');
            setRecordedChunks([]);
          }
      } else {
        setView('DASHBOARD');
      }
  };

  // Render Views
  return (
    <div className="h-full w-full font-sans text-gray-900 bg-white">
      {view === 'DASHBOARD' && (
        <Dashboard 
          recordings={recordings}
          onNewRecording={handleStartSetup}
          onSelectRecording={handleSelectRecording}
          onDeleteRecording={handleDeleteRecording}
          libraryFolderName={libraryDirHandle?.name ?? null}
          onChooseLibraryFolder={handleChooseLibraryFolder}
        />
      )}

      {view === 'SETUP' && (
        <>
            {/* Show dashboard in background */}
            <Dashboard 
                recordings={recordings}
                onNewRecording={() => {}}
                onSelectRecording={() => {}}
                onDeleteRecording={() => {}}
                libraryFolderName={libraryDirHandle?.name ?? null}
                onChooseLibraryFolder={() => {}}
            />
            <RecorderSetup 
                onStart={handleStartRecording} 
                onCancel={handleCancelSetup} 
            />
        </>
      )}

      {view === 'RECORDING' && (
        <div className="h-full w-full bg-transparent flex items-center justify-center">
           <div className="text-center p-10">
              <h2 className="text-2xl font-bold mb-4 animate-pulse">Grabando...</h2>
              <p className="text-gray-500">Esta pestaña está activa. Minimízala si quieres grabar otras apps.</p>
           </div>
           
           <RecordingOverlay 
              time={recordingTime}
              isPaused={isPaused}
              onPause={pauseRecording}
              onResume={resumeRecording}
              onStop={handleStopRecording}
              cameraEnabled={recorderSettings.includeCamera}
              cameraId={recorderSettings.selectedCameraId}
           />
        </div>
      )}

      {view === 'PREVIEW' && (
        <VideoPreview 
            // If viewing existing, pass undefined chunks. If new, pass chunks.
            blob={selectedRecording ? undefined : recordedChunks[0]}
            duration={selectedRecording ? selectedRecording.duration : recordingTime}
            recording={selectedRecording || undefined}
            onSave={handleSaveRecording}
            onDiscard={handleBackToDashboard}
            onDelete={handleDeleteRecording}
        />
      )}
    </div>
  );
};

export default App;
