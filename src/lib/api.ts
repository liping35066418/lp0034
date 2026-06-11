import type {
  Material,
  TimelineClip,
  RenderTask,
  OutputSettings,
  SmartCutOptions,
  AIAnalysisResult,
} from '@/types/shared';

const API_BASE = '/api';

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error((error as any).error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const materialsAPI = {
  list: (type?: string) =>
    request<Material[]>(`/materials${type ? `?type=${type}` : ''}`),

  get: (id: string) =>
    request<Material>(`/materials/${id}`),

  getMetadata: (id: string) =>
    request<any>(`/materials/${id}/metadata`),

  analyze: (id: string) =>
    request<{ materialId: string; analysis: AIAnalysisResult }>(
      `/materials/${id}/analyze`,
      { method: 'POST' }
    ),

  delete: (id: string) =>
    request<{ success: boolean }>(`/materials/${id}`, { method: 'DELETE' }),

  bulkAnalyze: (ids: string[]) =>
    request<{ results: Record<string, AIAnalysisResult> }>(
      '/materials/bulk-analyze',
      {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }
    ),
};

export const uploadAPI = {
  init: (filename: string, totalSize: number) =>
    request<{ sessionId: string; totalChunks: number; chunkSize: number }>(
      '/upload/init',
      {
        method: 'POST',
        body: JSON.stringify({ filename, totalSize }),
      }
    ),

  uploadChunk: async (
    sessionId: string,
    chunkIndex: number,
    chunk: Blob
  ): Promise<{ success: boolean; uploadedChunks: number; totalChunks: number }> => {
    const response = await fetch(`${API_BASE}/upload/chunk`, {
      method: 'POST',
      headers: {
        'x-session-id': sessionId,
        'x-chunk-index': chunkIndex.toString(),
      },
      body: chunk,
    });

    if (!response.ok) {
      throw new Error('Chunk upload failed');
    }

    return response.json();
  },

  merge: (sessionId: string) =>
    request<{ success: boolean; materialId?: string; message?: string }>(
      '/upload/merge',
      {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      }
    ),

  getStatus: (sessionId: string) =>
    request<{ uploadedChunks: number; totalChunks: number; status: string }>(
      `/upload/status/${sessionId}`
    ),

  cancel: (sessionId: string) =>
    request<{ success: boolean }>(`/upload/${sessionId}`, {
      method: 'DELETE',
    }),
};

export const aiAPI = {
  smartCut: (materialIds: string[], options?: SmartCutOptions) =>
    request<{
      success: boolean;
      timeline: TimelineClip[];
      totalDuration: number;
      clipCount: number;
    }>('/ai/smart-cut', {
      method: 'POST',
      body: JSON.stringify({ materialIds, options }),
    }),

  musicBeat: (audioId: string) =>
    request<{ audioId: string; beats: number[]; beatCount: number }>(
      '/ai/music-beat',
      {
        method: 'POST',
        body: JSON.stringify({ audioId }),
      }
    ),

  alignBeats: (clips: TimelineClip[], beats: number[]) =>
    request<{ success: boolean; clips: TimelineClip[] }>('/ai/align-beats', {
      method: 'POST',
      body: JSON.stringify({ clips, beats }),
    }),

  batchColorGrade: (style: string) =>
    request<{ success: boolean; style: string; filters: any[] }>(
      '/ai/batch-color-grade',
      {
        method: 'POST',
        body: JSON.stringify({ style }),
      }
    ),

  trimEnds: (materialId: string, trimStart?: number, trimEnd?: number) =>
    request<{
      materialId: string;
      trimmedStart: number;
      trimmedEnd: number;
      newDuration: number;
    }>('/ai/trim-ends', {
      method: 'POST',
      body: JSON.stringify({ materialId, trimStart, trimEnd }),
    }),
};

export const renderAPI = {
  list: (limit?: number) =>
    request<RenderTask[]>(`/render/tasks${limit ? `?limit=${limit}` : ''}`),

  get: (id: string) =>
    request<RenderTask>(`/render/tasks/${id}`),

  submit: (name: string, timeline: TimelineClip[], outputSettings?: Partial<OutputSettings>) =>
    request<{ taskId: string; status: string; estimatedTime: number; position: number }>(
      '/render/submit',
      {
        method: 'POST',
        body: JSON.stringify({ name, timeline, outputSettings }),
      }
    ),

  pause: (id: string) =>
    request<{ success: boolean; message: string }>(`/render/tasks/${id}/pause`, {
      method: 'POST',
    }),

  resume: (id: string) =>
    request<{ success: boolean; message: string }>(`/render/tasks/${id}/resume`, {
      method: 'POST',
    }),

  retry: (id: string) =>
    request<{ success: boolean; message: string }>(`/render/tasks/${id}/retry`, {
      method: 'POST',
    }),

  cancel: (id: string) =>
    request<{ success: boolean; message: string }>(`/render/tasks/${id}/cancel`, {
      method: 'POST',
    }),

  delete: (id: string) =>
    request<{ success: boolean }>(`/render/tasks/${id}`, {
      method: 'DELETE',
    }),

  getDownloadUrl: (id: string) => `${API_BASE}/render/tasks/${id}/download`,

  stats: () =>
    request<{
      activeTaskId: string | null;
      pendingCount: number;
      completedToday: number;
      totalTasks: number;
    }>('/render/stats'),
};

export default {
  materials: materialsAPI,
  upload: uploadAPI,
  ai: aiAPI,
  render: renderAPI,
};
