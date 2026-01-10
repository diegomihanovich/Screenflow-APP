export const createVideoThumbnail = async (blob: Blob, seekTime = 0.1): Promise<string | null> => {
  if (!blob.type.startsWith('video/')) {
    return null;
  }

  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;

  let objectUrl: string | null = null;

  try {
    objectUrl = URL.createObjectURL(blob);
    video.src = objectUrl;

    await new Promise<void>((resolve, reject) => {
      const onLoadedMetadata = () => resolve();
      const onError = () => reject(new Error('No se pudo cargar el video.'));
      video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
      video.addEventListener('error', onError, { once: true });
    });

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const safeSeekTime = duration > 0 ? Math.min(seekTime, Math.max(0, duration - 0.1)) : 0;
    video.currentTime = safeSeekTime;

    await new Promise<void>((resolve, reject) => {
      const onSeeked = () => resolve();
      const onError = () => reject(new Error('No se pudo avanzar el video.'));
      video.addEventListener('seeked', onSeeked, { once: true });
      video.addEventListener('error', onError, { once: true });
    });

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
};
