import { Recording } from '../types';
import { idbGet, idbSet } from './idb';

const DIR_HANDLE_KEY = 'libraryDirHandle';

export const isFsAccessSupported = (): boolean => {
  return typeof (window as any).showDirectoryPicker === 'function';
};

export const pickLibraryDirectory = async (): Promise<FileSystemDirectoryHandle> => {
  if (!isFsAccessSupported()) {
    throw new Error('File System Access API not supported in this browser.');
  }
  // User gesture required.
  // Note: Browsers do NOT allow preselecting an absolute OS path (e.g. C:\...).
  // But we can provide an `id` so the picker tends to reopen in the last chosen folder.
  return await (window as any).showDirectoryPicker({
    mode: 'readwrite',
    id: 'screenflow-library',
    startIn: 'documents'
  });
};

export const storeLibraryDirectoryHandle = async (handle: FileSystemDirectoryHandle): Promise<void> => {
  await idbSet(DIR_HANDLE_KEY, handle);
};

export const getStoredLibraryDirectoryHandle = async (): Promise<FileSystemDirectoryHandle | undefined> => {
  return await idbGet<FileSystemDirectoryHandle>(DIR_HANDLE_KEY);
};

export const ensureDirectoryPermission = async (
  dirHandle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite'
): Promise<boolean> => {
  // Some browsers support queryPermission/requestPermission on handles.
  const h: any = dirHandle as any;
  if (typeof h.queryPermission !== 'function' || typeof h.requestPermission !== 'function') {
    // If unsupported, best effort: assume permission is ok after picker.
    return true;
  }

  const opts = { mode };
  const q = await h.queryPermission(opts);
  if (q === 'granted') return true;
  const r = await h.requestPermission(opts);
  return r === 'granted';
};

export const listWebmRecordingsFromDirectory = async (
  dirHandle: FileSystemDirectoryHandle
): Promise<Recording[]> => {
  const recs: Recording[] = [];

  // Iterate entries. Types are async iterators in modern browsers.
  for await (const [name, handle] of (dirHandle as any).entries() as AsyncIterable<[string, any]>) {
    if (handle.kind !== 'file') continue;
    if (!name.toLowerCase().endsWith('.webm')) continue;

    const fileHandle = handle as FileSystemFileHandle;
    const file = await fileHandle.getFile();

    recs.push({
      id: `file:${name}`,
      title: name.replace(/\.webm$/i, ''),
      description: '',
      duration: 0,
      createdAt: file.lastModified || Date.now(),
      source: 'file',
      fileName: name,
      fileHandle
    });
  }

  // Newest first
  recs.sort((a, b) => b.createdAt - a.createdAt);
  return recs;
};

export const saveBlobToDirectory = async (
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  blob: Blob
): Promise<void> => {
  const safeName = fileName.toLowerCase().endsWith('.webm') ? fileName : `${fileName}.webm`;
  const fileHandle = await dirHandle.getFileHandle(safeName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
};

