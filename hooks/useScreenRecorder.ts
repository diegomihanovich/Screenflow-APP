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

      // Listen for the user clicking "Stop sharing" via the browser UI
      screenStream.getVideoTracks()[0].onended = () => {
        stopRecording();
      };

      // 2. Prepare Audio Mixing (System + Mic)
      // We need a new MediaStream that will contain the video track and the mixed audio track
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();

      // a) Add System Audio (if user shared it)
      if (screenStream.getAudioTracks().length > 0) {
        const sysSource = ctx.createMediaStreamSource(screenStream);
        const sysGain = ctx.createGain();
        sysGain.gain.value = 1.0;
        sysSource.connect(sysGain).connect(dest);
      }

      // b) Add Microphone Audio (if enabled)
      if (settings.includeMic) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: settings.selectedMicId ? { deviceId: { exact: settings.selectedMicId } } : true,
            video: false
          });
          streamsRef.current.push(micStream);

          const micSource = ctx.createMediaStreamSource(micStream);
          const micGain = ctx.createGain();
          micGain.gain.value = 1.0; // Adjustable volume
          micSource.connect(micGain).connect(dest);
        } catch (err) {
          console.warn("Microphone access failed or denied:", err);
          // Continue without mic if it fails, but warn user?
        }
      }

      // 3. Combine Video + Mixed Audio
      const mixedAudioTracks = dest.stream.getAudioTracks();
      const combinedStream = new MediaStream([
        ...screenStream.getVideoTracks(),
        ...mixedAudioTracks
      ]);

      // 4. Initialize MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9') 
        ? 'video/webm; codecs=vp9' 
        : 'video/webm';

      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: preset.videoBitsPerSecond,
        audioBitsPerSecond: preset.audioBitsPerSecond
      });
      mediaRecorderRef.current = recorder;

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        setRecordedChunks([blob]); // Store as single blob for simplicity in this logic
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
