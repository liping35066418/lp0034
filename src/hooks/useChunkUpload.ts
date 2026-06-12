import { useState, useCallback, useRef } from 'react';
import { uploadAPI, materialsAPI } from '@/lib/api';
import useEditorStore from '@/stores/useEditorStore';
import { CHUNK_SIZE } from '@/types/shared';

interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'merging' | 'completed' | 'error';
  sessionId?: string;
  materialId?: string;
  error?: string;
}

interface UseChunkUpload {
  uploads: UploadItem[];
  isUploading: boolean;
  uploadFiles: (files: FileList | File[]) => void;
  cancelUpload: (id: string) => void;
  clearCompleted: () => void;
}

export function useChunkUpload(): UseChunkUpload {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const queueRef = useRef<string[]>([]);
  const activeCountRef = useRef(0);
  const uploadsRef = useRef<Map<string, UploadItem>>(new Map());
  const MAX_CONCURRENT = 2;
  const addMaterial = useEditorStore((state) => state.addMaterial);

  const uploadFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newUploads: UploadItem[] = fileArray.map((file) => ({
      id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      progress: 0,
      status: 'pending',
    }));

    setUploads((prev) => [...prev, ...newUploads]);

    for (const upload of newUploads) {
      uploadsRef.current.set(upload.id, upload);
      queueRef.current.push(upload.id);
    }

    processQueue();
  }, []);

  const processQueue = useCallback(async () => {
    if (activeCountRef.current >= MAX_CONCURRENT) return;
    if (queueRef.current.length === 0) {
      setIsUploading(false);
      return;
    }

    setIsUploading(true);

    while (activeCountRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      const uploadId = queueRef.current.shift();
      if (!uploadId) break;

      activeCountRef.current++;
      uploadSingleFile(uploadId).finally(() => {
        activeCountRef.current--;
        processQueue();
      });
    }
  }, []);

  const uploadSingleFile = async (uploadId: string) => {
    setUploads((prev) =>
      prev.map((u) => (u.id === uploadId ? { ...u, status: 'uploading' } : u))
    );

    const upload = uploadsRef.current.get(uploadId);
    if (!upload) return;

    try {
      const { file } = upload;
      const totalSize = file.size;

      const initResult = await uploadAPI.init(file.name, totalSize);
      const { sessionId, totalChunks } = initResult;

      uploadsRef.current.set(uploadId, { ...upload, sessionId });
      setUploads((prev) =>
        prev.map((u) => (u.id === uploadId ? { ...u, sessionId } : u))
      );

      for (let i = 0; i < totalChunks; i++) {
        const currentUpload = uploadsRef.current.get(uploadId);
        if (!currentUpload || currentUpload.status === 'error') {
          break;
        }

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, totalSize);
        const chunk = file.slice(start, end);

        await uploadAPI.uploadChunk(sessionId, i, chunk);

        const progress = Math.round(((i + 1) / totalChunks) * 90);
        setUploads((prev) =>
          prev.map((u) => (u.id === uploadId ? { ...u, progress } : u))
        );
      }

      setUploads((prev) =>
        prev.map((u) =>
          u.id === uploadId ? { ...u, status: 'merging', progress: 95 } : u
        )
      );

      const mergeResult = await uploadAPI.merge(sessionId);

      if (mergeResult.success && mergeResult.materialId) {
        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId
              ? {
                  ...u,
                  status: 'completed',
                  progress: 100,
                  materialId: mergeResult.materialId,
                }
              : u
          )
        );

        try {
          const material = await materialsAPI.get(mergeResult.materialId);
          addMaterial(material);
        } catch (err) {
          console.warn('Failed to fetch new material:', err);
        }
      } else {
        throw new Error(mergeResult.message || 'Merge failed');
      }
    } catch (error: any) {
      const cur = uploadsRef.current.get(uploadId);
      if (cur) uploadsRef.current.set(uploadId, { ...cur, status: 'error', error: error.message });
      setUploads((prev) =>
        prev.map((u) =>
          u.id === uploadId
            ? { ...u, status: 'error', error: error.message }
            : u
        )
      );
    }
  };

  const cancelUpload = useCallback((id: string) => {
    const upload = uploadsRef.current.get(id);
    if (upload?.sessionId) {
      uploadAPI.cancel(upload.sessionId).catch(() => {});
    }
    if (upload) {
      uploadsRef.current.set(id, { ...upload, status: 'error' });
    }

    const queueIndex = queueRef.current.indexOf(id);
    if (queueIndex > -1) {
      queueRef.current.splice(queueIndex, 1);
    }

    uploadsRef.current.delete(id);
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    for (const [id, u] of uploadsRef.current) {
      if (u.status === 'completed') uploadsRef.current.delete(id);
    }
    setUploads((prev) => prev.filter((u) => u.status !== 'completed'));
  }, []);

  return {
    uploads,
    isUploading,
    uploadFiles,
    cancelUpload,
    clearCompleted,
  };
}

export default useChunkUpload;
