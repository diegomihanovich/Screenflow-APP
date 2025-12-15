import { useState, useRef, useCallback, useEffect } from 'react';
import { RecorderSettings } from '../types';

export const useScreenRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  
  // Keep track of all active streams to stop them later
  const streamsRef = useRef<MediaStream[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);

  const pickMimeType = () => {
    // Prefer VP8 for reliability across machines, then VP9, then let the browser decide.
    const candidates = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8',
      'video/webm;codecs=vp9',
      'video/webm'
    ];

    for (const type of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(type)) return type;
      } catch {
        // ignore
      }
    }

    return null;
  };

  const startRecording = async (settings: RecorderSettings) => {
    setError(null);
    setRecordedChunks([]);

    const preset = (() => {
      switch (settings.qualityPreset) {
        case 'HIGH':
          return { frameRate: 30, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 128_000 };
        case 'LOW':
          return { frameRate: 15, videoBitsPerSecond: 1_500_000, audioBitsPerSecond: 96_000 };
        case 'MEDIUM':
        default:
          return { frameRate: 30, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000 };
      }
    })();
    
    try {
      // 1. Capture Screen (Video + optional System Audio)
      let screenStream: MediaStream;
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            // @ts-ignore - 'displaySurface' is standard but sometimes typescript complains
            displaySurface: 'monitor', 
            frameRate: preset.frameRate
          },
          audio: true // Ask for system audio
        });
      } catch (err) {
        if ((err as DOMException).name === 'NotAllowedError') {
          setError("Permiso de pantalla denegado.");
          return false;
        }
        throw err;
      }

      streamsRef.current.push(screenStream);

      const screenVideoTracks = screenStream.getVideoTracks();
      if (screenVideoTracks.length === 0) {
        setError("No se detecto video de pantalla. Vuelve a intentar.");
        cleanup();
        return false;
      }

      // Listen for the user clicking "Stop sharing" via the browser UI
      screenVideoTracks[0].onended = () => {
        stopRecording();
      };

      // 2. Capture microphone (optional)
      let micStream: MediaStream | null = null;
      if (settings.includeMic) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: settings.selectedMicId ? { deviceId: { exact: settings.selectedMicId } } : true,
            video: false
          });
          streamsRef.current.push(micStream);

        } catch (err) {
          console.warn("Microphone access failed or denied:", err);
          // Continue without mic if it fails, but warn user?
          micStream = null;
        }
      }

      // 3. Build the stream we will record.
      // Only create an AudioContext when we truly need to mix system + mic audio.
      // This avoids edge cases where a "silent" destination track can break recording on some machines.
      const systemAudioTracks = screenStream.getAudioTracks();
      const micAudioTracks = micStream?.getAudioTracks() ?? [];
      const needsMixing = systemAudioTracks.length > 0 && micAudioTracks.length > 0;

      let combinedStream: MediaStream;
      if (needsMixing) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContext();
        audioContextRef.current = ctx;
        const dest = ctx.createMediaStreamDestination();

        const sysSource = ctx.createMediaStreamSource(screenStream);
        const sysGain = ctx.createGain();
        sysGain.gain.value = 1.0;
        sysSource.connect(sysGain).connect(dest);

        const micSource = ctx.createMediaStreamSource(micStream as MediaStream);
        const micGain = ctx.createGain();
        micGain.gain.value = 1.0;
        micSource.connect(micGain).connect(dest);

        combinedStream = new MediaStream([...screenVideoTracks, ...dest.stream.getAudioTracks()]);
      } else if (systemAudioTracks.length > 0) {
        combinedStream = screenStream;
      } else if (micAudioTracks.length > 0) {
        combinedStream = new MediaStream([...screenVideoTracks, ...micAudioTracks]);
      } else {
        combinedStream = new MediaStream([...screenVideoTracks]);
      }

      // 4. Initialize MediaRecorder
      const mimeType = pickMimeType();
      const recorderOptions: MediaRecorderOptions = {
        videoBitsPerSecond: preset.videoBitsPerSecond
      };
      if (mimeType) recorderOptions.mimeType = mimeType;
      if (combinedStream.getAudioTracks().length > 0) {
        recorderOptions.audioBitsPerSecond = preset.audioBitsPerSecond;
      }

      const recorder = new MediaRecorder(combinedStream, recorderOptions);
      mediaRecorderRef.current = recorder;

      const chunks: Blob[] = [];
      let totalBytes = 0;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
          totalBytes += e.data.size;
        }
      };

      recorder.onerror = (e) => {
        console.error('MediaRecorder error:', e);
        setError('No se pudo grabar este video. Verifica permisos y vuelve a intentar.');
      };

      recorder.onstop = () => {
        const outType = recorder.mimeType || 'video/webm';
        const blob = new Blob(chunks, { type: outType });

        if (blob.size === 0 || totalBytes === 0) {
          console.warn('Recording finished with 0 bytes', {
            mimeType: recorder.mimeType,
            videoTracks: combinedStream.getVideoTracks().length,
            audioTracks: combinedStream.getAudioTracks().length
          });
          setRecordedChunks([]);
          setError('El video salio vacio. Proba grabar de nuevo y asegurate de compartir una pantalla/ventana.');
        } else {
          setRecordedChunks([blob]); // Store as single blob for simplicity in this logic
        }
        cleanup();
      };

      recorder.start(1000); // 1-second chunks
      setIsRecording(true);
      
      // Start Timer
      setRecordingTime(0);
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      return true;

    } catch (err) {
      console.error("Error starting recording:", err);
      setError("No se pudo iniciar la grabación. Verifica los permisos.");
      cleanup();
      return false;
    }
  };

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.requestData();
      } catch {
        // ignore
      }
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
    } else {
      // Fallback cleanup if recorder wasn't running but streams were open
      cleanup();
    }
  }, []);

  const cleanup = () => {
    // Stop all tracks in all streams
    streamsRef.current.forEach(stream => {
      stream.getTracks().forEach(track => track.stop());
    });
    streamsRef.current = [];

    // Close AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Clear Timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
  }, []);

  // Ensure cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, []);

  return {
    isRecording,
    isPaused,
    recordingTime,
    recordedChunks,
    error,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    setRecordedChunks
  };
};
