import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';

type ProgressCallback = (progress01: number) => void;
type StatusCallback = (status: 'loading' | 'preparing' | 'converting' | 'finalizing') => void;

let ffmpegInstance: any | null = null;
let ffmpegLoadPromise: Promise<any> | null = null;
let activeProgressCallback: ProgressCallback | null = null;
let activeDurationSeconds: number | null = null;
let activeLastProgress01 = 0;
let activeLastUpdateMs = 0;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const timeToSeconds = (time: number): number => {
  if (!Number.isFinite(time) || time <= 0) return 0;
  // @ffmpeg/core reports progress `time` in microseconds.
  return time / 1_000_000;
};

const parseTimeFromLog = (message: string): number | null => {
  // Typical ffmpeg log: "time=00:00:12.34"
  const match = message.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (![hours, minutes, seconds].every((n) => Number.isFinite(n))) return null;
  return hours * 3600 + minutes * 60 + seconds;
};

const parseDurationFromLog = (message: string): number | null => {
  // Typical ffmpeg log: "Duration: 00:01:23.45,"
  const match = message.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (![hours, minutes, seconds].every((n) => Number.isFinite(n))) return null;
  const total = hours * 3600 + minutes * 60 + seconds;
  if (!Number.isFinite(total) || total <= 0) return null;
  return total;
};

const reportProgress = (progress01: number) => {
  if (!activeProgressCallback) return;
  const now = Date.now();
  const clamped = clamp01(progress01);
  const monotonic = Math.max(activeLastProgress01, clamped);
  // Throttle UI updates to avoid spamming React state.
  if (now - activeLastUpdateMs < 150 && monotonic < 0.995) return;
  activeLastProgress01 = monotonic;
  activeLastUpdateMs = now;
  activeProgressCallback(monotonic);
};

const readBlobAsUint8Array = (blob: Blob, signal?: AbortSignal): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    const abortError = () => new DOMException('Aborted', 'AbortError');
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const onAbort = () => {
      try {
        reader.abort();
      } catch {
        // ignore
      }
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    reader.onload = () => {
      signal?.removeEventListener('abort', onAbort);
      const result = reader.result;
      if (!(result instanceof ArrayBuffer)) {
        reject(new Error('Failed to read blob'));
        return;
      }
      resolve(new Uint8Array(result));
    };
    reader.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(reader.error ?? new Error('Failed to read blob'));
    };

    reader.readAsArrayBuffer(blob);
  });

const resetFfmpeg = () => {
  try {
    ffmpegInstance?.terminate?.();
  } catch {
    // ignore
  } finally {
    ffmpegInstance = null;
    ffmpegLoadPromise = null;
  }
};

const ensureFfmpegLoaded = async (onStatus?: StatusCallback): Promise<any> => {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  ffmpegLoadPromise = (async () => {
    onStatus?.('loading');
    const [{ FFmpeg }] = await Promise.all([import('@ffmpeg/ffmpeg')]);

    const ffmpeg = new FFmpeg();

    ffmpeg.on('progress', ({ progress, time }: { progress: number; time: number }) => {
      if (!activeProgressCallback) return;

      // Prefer library-provided progress.
      if (typeof progress === 'number' && Number.isFinite(progress) && progress > 0) {
        reportProgress(progress);
        return;
      }

      // Fallback: compute from time.
      if (activeDurationSeconds && typeof time === 'number' && Number.isFinite(time) && time > 0) {
        const seconds = timeToSeconds(time);
        if (seconds > 0) reportProgress(seconds / activeDurationSeconds);
      }
    });

    ffmpeg.on('log', ({ message }: { message: string }) => {
      if (!message) return;

      // If caller didn't provide duration, infer it from ffmpeg header logs.
      if (!activeDurationSeconds && message.includes('Duration:')) {
        const duration = parseDurationFromLog(message);
        if (duration) activeDurationSeconds = duration;
      }

      if (!activeProgressCallback) return;
      if (!activeDurationSeconds) return;
      if (!message.includes('time=')) return;

      const seconds = parseTimeFromLog(message);
      if (seconds === null) return;
      reportProgress(seconds / activeDurationSeconds);
    });

    await ffmpeg.load({ coreURL, wasmURL });
    ffmpegInstance = ffmpeg;
    return ffmpegInstance;
  })();

  return ffmpegLoadPromise;
};

const safeDelete = async (ffmpeg: any, fileName: string) => {
  try {
    if (typeof ffmpeg.deleteFile === 'function') {
      await ffmpeg.deleteFile(fileName);
    }
  } catch {
    // ignore
  }
};

export const transcodeToMp4 = async (
  input: Blob,
  opts?: {
    durationSeconds?: number;
    onProgress?: ProgressCallback;
    onStatus?: StatusCallback;
    signal?: AbortSignal;
    resetAfter?: boolean;
  }
): Promise<Blob> => {
  const resetAfter = opts?.resetAfter ?? true;
  const ffmpeg = await ensureFfmpegLoaded(opts?.onStatus);

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const inputName = `input-${runId}.webm`;
  const outputName = `output-${runId}.mp4`;

  let aborted = false;
  const onAbort = () => {
    aborted = true;
    resetFfmpeg();
  };
  opts?.signal?.addEventListener('abort', onAbort, { once: true });

  activeDurationSeconds = typeof opts?.durationSeconds === 'number' && opts.durationSeconds > 0 ? opts.durationSeconds : null;
  activeProgressCallback = opts?.onProgress ?? null;
  activeLastProgress01 = 0;
  activeLastUpdateMs = 0;

  try {
    opts?.onStatus?.('preparing');
    const inputData = await readBlobAsUint8Array(input, opts?.signal);
    if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    await ffmpeg.writeFile(inputName, inputData);

    opts?.onStatus?.('converting');
    try {
      await ffmpeg.exec([
        '-i',
        inputName,
        '-map',
        '0:v:0',
        '-map',
        '0:a?',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '28',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        outputName
      ]);
    } catch {
      // Fallback: try without re-encoding audio (or without audio at all if needed).
      await ffmpeg.exec([
        '-i',
        inputName,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '28',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-an',
        outputName
      ]);
    }

    opts?.onStatus?.('finalizing');
    const data = await ffmpeg.readFile(outputName);
    reportProgress(1);
    return new Blob([data], { type: 'video/mp4' });
  } catch (e) {
    if (aborted || opts?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    throw e;
  } finally {
    opts?.signal?.removeEventListener('abort', onAbort);
    activeProgressCallback = null;
    activeDurationSeconds = null;
    await safeDelete(ffmpeg, inputName);
    await safeDelete(ffmpeg, outputName);
    if (resetAfter) resetFfmpeg();
  }
};
