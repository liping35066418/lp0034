import { create } from 'zustand';
import type {
  Material,
  TimelineClip,
  RenderTask,
  OutputSettings,
  FilterConfig,
  TransitionConfig,
} from '@/types/shared';
import { DEFAULT_OUTPUT_SETTINGS } from '@/types/shared';

interface EditorState {
  materials: Material[];
  timeline: TimelineClip[];
  selectedClipId: string | null;
  selectedMaterialId: string | null;
  outputSettings: OutputSettings;
  renderTasks: RenderTask[];
  currentTime: number;
  isPlaying: boolean;
  zoom: number;
  activeTab: 'materials' | 'ai' | 'render';

  setMaterials: (materials: Material[]) => void;
  addMaterial: (material: Material) => void;
  removeMaterial: (id: string) => void;
  updateMaterial: (id: string, updates: Partial<Material>) => void;

  setTimeline: (timeline: TimelineClip[]) => void;
  addClip: (clip: TimelineClip) => void;
  removeClip: (id: string) => void;
  updateClip: (id: string, updates: Partial<TimelineClip>) => void;
  moveClip: (id: string, newStartTime: number, newTrack?: number) => void;
  clearTimeline: () => void;

  setSelectedClipId: (id: string | null) => void;
  setSelectedMaterialId: (id: string | null) => void;
  setOutputSettings: (settings: Partial<OutputSettings>) => void;

  setRenderTasks: (tasks: RenderTask[]) => void;
  addRenderTask: (task: RenderTask) => void;
  updateRenderTask: (id: string, updates: Partial<RenderTask>) => void;
  removeRenderTask: (id: string) => void;

  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setZoom: (zoom: number) => void;
  setActiveTab: (tab: 'materials' | 'ai' | 'render') => void;

  addMaterialToTimeline: (material: Material) => void;
  applyFilterToSelected: (filter: FilterConfig) => void;
  applyTransitionToSelected: (transition: TransitionConfig) => void;

  getTotalDuration: () => number;
  getClipAtTime: (time: number) => TimelineClip | null;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  materials: [],
  timeline: [],
  selectedClipId: null,
  selectedMaterialId: null,
  outputSettings: { ...DEFAULT_OUTPUT_SETTINGS },
  renderTasks: [],
  currentTime: 0,
  isPlaying: false,
  zoom: 1,
  activeTab: 'materials',

  setMaterials: (materials) => set({ materials }),
  addMaterial: (material) =>
    set((state) => ({ materials: [material, ...state.materials] })),
  removeMaterial: (id) =>
    set((state) => ({
      materials: state.materials.filter((m) => m.id !== id),
    })),
  updateMaterial: (id, updates) =>
    set((state) => ({
      materials: state.materials.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    })),

  setTimeline: (timeline) => set({ timeline }),
  addClip: (clip) =>
    set((state) => ({ timeline: [...state.timeline, clip] })),
  removeClip: (id) =>
    set((state) => ({
      timeline: state.timeline.filter((c) => c.id !== id),
      selectedClipId: state.selectedClipId === id ? null : state.selectedClipId,
    })),
  updateClip: (id, updates) =>
    set((state) => ({
      timeline: state.timeline.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),
  moveClip: (id, newStartTime, newTrack) =>
    set((state) => {
      const clips = state.timeline.map((c) => {
        if (c.id !== id) return c;
        const duration = c.endTime - c.startTime;
        return {
          ...c,
          startTime: newStartTime,
          endTime: newStartTime + duration,
          track: newTrack ?? c.track,
        };
      });
      return { timeline: clips };
    }),
  clearTimeline: () => set({ timeline: [], selectedClipId: null }),

  setSelectedClipId: (id) => set({ selectedClipId: id }),
  setSelectedMaterialId: (id) => set({ selectedMaterialId: id }),
  setOutputSettings: (settings) =>
    set((state) => ({
      outputSettings: { ...state.outputSettings, ...settings },
    })),

  setRenderTasks: (tasks) => set({ renderTasks: tasks }),
  addRenderTask: (task) =>
    set((state) => ({ renderTasks: [task, ...state.renderTasks] })),
  updateRenderTask: (id, updates) =>
    set((state) => ({
      renderTasks: state.renderTasks.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    })),
  removeRenderTask: (id) =>
    set((state) => ({
      renderTasks: state.renderTasks.filter((t) => t.id !== id),
    })),

  setCurrentTime: (time) => set({ currentTime: time }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setZoom: (zoom) => set({ zoom: Math.max(0.25, Math.min(4, zoom)) }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  addMaterialToTimeline: (material) => {
    const state = get();
    const lastClip = state.timeline[state.timeline.length - 1];
    const startTime = lastClip ? lastClip.endTime : 0;
    const duration = material.duration || 5;

    const newClip: TimelineClip = {
      id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      materialId: material.id,
      track: 0,
      startTime,
      endTime: startTime + duration,
      sourceStartTime: 0,
      sourceEndTime: duration,
      filters: [],
      speed: 1,
    };

    set((state) => ({ timeline: [...state.timeline, newClip] }));
  },

  applyFilterToSelected: (filter) => {
    const state = get();
    if (!state.selectedClipId) return;

    set((state) => ({
      timeline: state.timeline.map((c) =>
        c.id === state.selectedClipId
          ? { ...c, filters: [...c.filters, filter] }
          : c
      ),
    }));
  },

  applyTransitionToSelected: (transition) => {
    const state = get();
    if (!state.selectedClipId) return;

    set((state) => ({
      timeline: state.timeline.map((c) =>
        c.id === state.selectedClipId ? { ...c, transition } : c
      ),
    }));
  },

  getTotalDuration: () => {
    const state = get();
    if (state.timeline.length === 0) return 0;
    return Math.max(...state.timeline.map((c) => c.endTime));
  },

  getClipAtTime: (time) => {
    const state = get();
    return (
      state.timeline.find((c) => time >= c.startTime && time < c.endTime) ||
      null
    );
  },
}));

export default useEditorStore;
