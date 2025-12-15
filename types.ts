export type ViewState = 'DASHBOARD' | 'SETUP' | 'RECORDING' | 'PREVIEW';

export interface Recording {
  id: string;
  title: string;
  description: string;
  /**
   * For in-memory recordings (created in this session) we keep the Blob.
   * For filesystem-backed recordings, Blob may be undefined and you should use `fileHandle`.
   */
  blob?: Blob;
  thumbnailUrl?: string;
  duration: number; // seconds
  createdAt: number; // timestamp

  /** Where this recording comes from. */
  source?: 'memory' | 'file';

  /** Filesystem-backed fields (File System Access API). */
  fileName?: string;
  fileHandle?: FileSystemFileHandle;
}

export interface RecorderSettings {
  includeCamera: boolean;
  includeMic: boolean;
  selectedCameraId: string | null;
  selectedMicId: string | null;

  /** Controls bitrate / framerate targets for the recording. */
  qualityPreset: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface MediaDeviceOption {
  id: string;
  label: string;
}
