import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, ZoomIn, ZoomOut, Trash2, GripVertical, Clock, Layers, Palette } from 'lucide-react';
import useEditorStore from '@/stores/useEditorStore';
import type { Material, TimelineClip, FilterType, FilterConfig } from '@/types/shared';
import { cn } from '@/lib/utils';

interface TimelineEditorProps {
  materials: Material[];
}

const FILTER_PRESETS: { type: FilterType; name: string; color: string }[] = [
  { type: 'cinematic', name: '电影感', color: 'from-indigo-500 to-purple-500' },
  { type: 'warm', name: '暖调', color: 'from-amber-400 to-orange-500' },
  { type: 'cool', name: '冷调', color: 'from-cyan-400 to-blue-500' },
  { type: 'vintage', name: '复古', color: 'from-yellow-600 to-amber-700' },
  { type: 'sepia', name: '棕褐', color: 'from-amber-700 to-yellow-900' },
  { type: 'grayscale', name: '黑白', color: 'from-gray-400 to-gray-600' },
];

export const TimelineEditor: React.FC<TimelineEditorProps> = ({ materials }) => {
  const timeline = useEditorStore((state) => state.timeline);
  const selectedClipId = useEditorStore((state) => state.selectedClipId);
  const selectedClipIds = useEditorStore((state) => state.selectedClipIds);
  const currentTime = useEditorStore((state) => state.currentTime);
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const zoom = useEditorStore((state) => state.zoom);

  const setSelectedClipId = useEditorStore((state) => state.setSelectedClipId);
  const toggleClipSelection = useEditorStore((state) => state.toggleClipSelection);
  const clearClipSelection = useEditorStore((state) => state.clearClipSelection);
  const selectAllClips = useEditorStore((state) => state.selectAllClips);
  const setCurrentTime = useEditorStore((state) => state.setCurrentTime);
  const setIsPlaying = useEditorStore((state) => state.setIsPlaying);
  const setZoom = useEditorStore((state) => state.setZoom);
  const moveClip = useEditorStore((state) => state.moveClip);
  const removeClip = useEditorStore((state) => state.removeClip);
  const batchRemoveClips = useEditorStore((state) => state.batchRemoveClips);
  const batchApplyFilter = useEditorStore((state) => state.batchApplyFilter);
  const getTotalDuration = useEditorStore((state) => state.getTotalDuration);
  const getClipCount = useEditorStore((state) => state.getClipCount);

  const timelineRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [draggingClip, setDraggingClip] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const playIntervalRef = useRef<number | null>(null);

  const [boxSelect, setBoxSelect] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    active: boolean;
  } | null>(null);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  const actualTotalDuration = getTotalDuration();
  const totalDuration = Math.max(actualTotalDuration, 30);
  const clipCount = getClipCount();
  const pixelsPerSecond = 100 * zoom;
  const timelineWidth = totalDuration * pixelsPerSecond;

  const getMaterial = (id: string) => materials.find((m) => m.id === id);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(1)}秒`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}分${secs.toString().padStart(2, '0')}秒`;
  };

  const timeMarkers = [];
  const markerInterval = zoom > 2 ? 1 : zoom > 1 ? 2 : 5;
  for (let t = 0; t <= totalDuration; t += markerInterval) {
    timeMarkers.push(t);
  }

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    if (e.target !== timelineRef.current && !(e.target as HTMLElement).classList.contains('timeline-ruler') && !(e.target as HTMLElement).classList.contains('timeline-track-area')) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + timelineRef.current.scrollLeft;
    const time = x / pixelsPerSecond;
    setCurrentTime(Math.max(0, Math.min(totalDuration, time)));
    if (!e.shiftKey) {
      clearClipSelection();
    }
  };

  const handleClipMouseDown = (e: React.MouseEvent, clip: TimelineClip) => {
    e.stopPropagation();

    if (e.shiftKey) {
      toggleClipSelection(clip.id, true);
    } else if (selectedClipIds.includes(clip.id) && selectedClipIds.length > 1) {
      // do nothing, allow drag of the group
    } else {
      setSelectedClipId(clip.id);
    }

    setDraggingClip(clip.id);

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset(e.clientX - rect.left);
  };

  const handleTrackMouseDown = (e: React.MouseEvent) => {
    if (e.target !== trackRef.current) return;
    if (!e.shiftKey) {
      clearClipSelection();
    }

    const containerRect = timelineRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    const scrollLeft = timelineRef.current?.scrollLeft || 0;
    const startX = e.clientX - containerRect.left + scrollLeft;
    const startY = e.clientY - containerRect.top;

    setBoxSelect({
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      active: true,
    });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (boxSelect?.active && timelineRef.current) {
        const containerRect = timelineRef.current.getBoundingClientRect();
        const scrollLeft = timelineRef.current.scrollLeft;
        const currentX = e.clientX - containerRect.left + scrollLeft;
        const currentY = e.clientY - containerRect.top;
        setBoxSelect((prev) => prev ? { ...prev, currentX, currentY } : null);
        return;
      }

      if (!draggingClip || !timelineRef.current) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - dragOffset;
      const newStartTime = Math.max(0, x / pixelsPerSecond);

      const clip = timeline.find((c) => c.id === draggingClip);
      if (clip) {
        const snapInterval = zoom > 2 ? 0.1 : zoom > 1 ? 0.5 : 1;
        const snappedTime = Math.round(newStartTime / snapInterval) * snapInterval;
        moveClip(draggingClip, snappedTime);
      }
    },
    [draggingClip, dragOffset, timeline, pixelsPerSecond, moveClip, zoom, boxSelect]
  );

  const handleMouseUp = useCallback(() => {
    if (boxSelect?.active && trackRef.current) {
      const containerRect = timelineRef.current?.getBoundingClientRect();
      if (containerRect) {
        const scrollLeft = timelineRef.current?.scrollLeft || 0;
        const left = Math.min(boxSelect.startX, boxSelect.currentX);
        const right = Math.max(boxSelect.startX, boxSelect.currentX);
        const top = Math.min(boxSelect.startY, boxSelect.currentY);
        const bottom = Math.max(boxSelect.startY, boxSelect.currentY);

        const trackRect = trackRef.current.getBoundingClientRect();
        const trackOffsetTop = trackRect.top - containerRect.top;
        const trackOffsetLeft = trackRect.left - containerRect.left + scrollLeft;

        const selectedIds: string[] = [];
        timeline.forEach((clip) => {
          const clipLeft = trackOffsetLeft + clip.startTime * pixelsPerSecond;
          const clipRight = trackOffsetLeft + clip.endTime * pixelsPerSecond;
          const clipTop = trackOffsetTop + 8;
          const clipBottom = trackOffsetTop + 64;

          if (clipLeft < right && clipRight > left && clipTop < bottom && clipBottom > top) {
            selectedIds.push(clip.id);
          }
        });

        if (selectedIds.length > 0) {
          useEditorStore.getState().setSelectedClipIds(selectedIds);
        }
      }
    }
    setBoxSelect(null);
    setDraggingClip(null);
  }, [boxSelect, timeline, pixelsPerSecond]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = window.setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= totalDuration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 0.1;
        });
      }, 100);
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    }

    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [isPlaying, totalDuration, setCurrentTime, setIsPlaying]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        selectAllClips();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedClipIds.length > 1) {
          batchRemoveClips(selectedClipIds);
        } else if (selectedClipId) {
          removeClip(selectedClipId);
        }
      }
      if (e.key === 'Escape') {
        clearClipSelection();
        setShowFilterPanel(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedClipIds, selectedClipId, batchRemoveClips, removeClip, selectAllClips, clearClipSelection]);

  const getClipColor = (index: number) => {
    const colors = [
      'from-indigo-500 to-purple-500',
      'from-cyan-500 to-blue-500',
      'from-emerald-500 to-teal-500',
      'from-amber-500 to-orange-500',
      'from-pink-500 to-rose-500',
      'from-violet-500 to-fuchsia-500',
    ];
    return colors[index % colors.length];
  };

  const handleBatchDelete = () => {
    if (selectedClipIds.length === 0) return;
    batchRemoveClips(selectedClipIds);
    setShowFilterPanel(false);
  };

  const handleBatchApplyFilter = (filterType: FilterType) => {
    if (selectedClipIds.length === 0) return;
    const filter: FilterConfig = {
      type: filterType,
      params: { intensity: 1.0 },
    };
    batchApplyFilter(selectedClipIds, filter);
    setShowFilterPanel(false);
  };

  const boxSelectRect = boxSelect?.active
    ? {
        left: Math.min(boxSelect.startX, boxSelect.currentX),
        top: Math.min(boxSelect.startY, boxSelect.currentY),
        width: Math.abs(boxSelect.currentX - boxSelect.startX),
        height: Math.abs(boxSelect.currentY - boxSelect.startY),
      }
    : null;

  return (
    <div className="flex flex-col h-full bg-slate-900/50 rounded-lg border border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <button
            className="p-2 hover:bg-slate-700 rounded transition-colors"
            onClick={() => setCurrentTime(0)}
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            className="p-2 bg-indigo-600 hover:bg-indigo-500 rounded transition-colors"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </button>
          <button
            className="p-2 hover:bg-slate-700 rounded transition-colors"
            onClick={() => setCurrentTime(totalDuration)}
          >
            <SkipForward className="w-4 h-4" />
          </button>
          <span className="ml-4 text-sm font-mono text-slate-300">
            {formatTime(currentTime)} / {formatTime(actualTotalDuration)}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            <span>成片时长: <span className="text-white font-medium">{formatDuration(actualTotalDuration)}</span></span>
          </div>
          <div className="w-px h-4 bg-slate-600" />
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Layers className="w-3.5 h-3.5" />
            <span>片段: <span className="text-white font-medium">{clipCount}</span></span>
          </div>

          {selectedClipIds.length > 1 && (
            <>
              <div className="w-px h-4 bg-slate-600" />
              <div className="flex items-center gap-1.5 text-xs text-indigo-400">
                <span>已选 {selectedClipIds.length} 个</span>
              </div>
            </>
          )}

          {selectedClipIds.length > 0 && (
            <>
              <div className="w-px h-4 bg-slate-600" />
              <button
                className="flex items-center gap-1 px-2 py-1 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors"
                onClick={handleBatchDelete}
                title={selectedClipIds.length > 1 ? '批量删除' : '删除'}
              >
                <Trash2 className="w-3 h-3" />
                {selectedClipIds.length > 1 ? `删除 (${selectedClipIds.length})` : '删除'}
              </button>
              <div className="relative">
                <button
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 rounded transition-colors"
                  onClick={() => setShowFilterPanel(!showFilterPanel)}
                  title="批量套滤镜"
                >
                  <Palette className="w-3 h-3" />
                  套滤镜 {selectedClipIds.length > 1 ? `(${selectedClipIds.length})` : ''}
                </button>
                {showFilterPanel && (
                  <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-2 z-50 w-48">
                    <p className="text-xs text-slate-400 mb-2 px-1">选择滤镜</p>
                    <div className="grid grid-cols-2 gap-1">
                      {FILTER_PRESETS.map((preset) => (
                        <button
                          key={preset.type}
                          className="flex flex-col items-center gap-1 p-2 rounded hover:bg-slate-700 transition-colors"
                          onClick={() => handleBatchApplyFilter(preset.type)}
                        >
                          <div className={cn('w-full h-6 rounded bg-gradient-to-r', preset.color)} />
                          <span className="text-xs text-slate-300">{preset.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="w-px h-4 bg-slate-600" />
          <button
            className="p-2 hover:bg-slate-700 rounded transition-colors"
            onClick={() => setZoom(zoom * 0.8)}
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-slate-400 w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            className="p-2 hover:bg-slate-700 rounded transition-colors"
            onClick={() => setZoom(zoom * 1.2)}
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        ref={timelineRef}
        className="flex-1 overflow-x-auto overflow-y-auto relative"
        onClick={handleTimelineClick}
      >
        <div
          className="relative"
          style={{ width: timelineWidth, minWidth: '100%' }}
        >
          <div className="sticky top-0 z-10 h-8 bg-slate-800 border-b border-slate-700 timeline-ruler">
            {timeMarkers.map((time) => (
              <div
                key={time}
                className="absolute bottom-0 h-full border-l border-slate-600"
                style={{ left: time * pixelsPerSecond }}
              >
                <span className="absolute top-1 left-1 text-xs text-slate-400 font-mono">
                  {formatTime(time)}
                </span>
              </div>
            ))}
          </div>

          <div
            className="absolute top-8 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
            style={{ left: currentTime * pixelsPerSecond }}
          >
            <div className="absolute -top-0 -left-1.5 w-3 h-3 bg-red-500 rotate-45" />
          </div>

          <div className="relative mt-2" style={{ height: 80 }}>
            <div className="absolute left-0 top-0 bottom-0 w-20 bg-slate-800/80 border-r border-slate-700 flex items-center px-2">
              <span className="text-xs text-slate-400">视频轨道</span>
            </div>

            <div
              ref={trackRef}
              className="ml-20 relative h-full timeline-track-area"
              onMouseDown={handleTrackMouseDown}
            >
              {timeline
                .filter((c) => c.track === 0)
                .sort((a, b) => a.startTime - b.startTime)
                .map((clip, index) => {
                  const material = getMaterial(clip.materialId);
                  const isSelected = selectedClipIds.includes(clip.id);
                  const width = (clip.endTime - clip.startTime) * pixelsPerSecond;

                  return (
                    <div
                      key={clip.id}
                      className={cn(
                        'absolute top-2 h-14 rounded-md cursor-grab overflow-hidden',
                        'bg-gradient-to-r border transition-all',
                        getClipColor(index),
                        isSelected
                          ? 'border-yellow-400 ring-2 ring-yellow-400/50 z-10'
                          : 'border-transparent hover:brightness-110'
                      )}
                      style={{
                        left: clip.startTime * pixelsPerSecond,
                        width: Math.max(width, 4),
                      }}
                      onMouseDown={(e) => handleClipMouseDown(e, clip)}
                    >
                      <div className="flex items-center h-full px-2 gap-2">
                        <GripVertical className="w-4 h-4 text-white/60 flex-shrink-0" />
                        <span className="text-xs text-white font-medium truncate flex-1">
                          {material?.name || clip.id}
                        </span>
                        {isSelected && selectedClipIds.length === 1 && (
                          <button
                            className="p-1 hover:bg-white/20 rounded flex-shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeClip(clip.id);
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {clip.filters.length > 0 && (
                        <div className="absolute bottom-1 left-2 right-2 h-1 bg-white/20 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-white/60"
                            style={{ width: `${Math.min(100, clip.filters.length * 25)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

              {boxSelectRect && boxSelectRect.width > 2 && boxSelectRect.height > 2 && (
                <div
                  className="absolute border-2 border-indigo-400/60 bg-indigo-400/10 rounded pointer-events-none z-30"
                  style={{
                    left: boxSelectRect.left - 80,
                    top: boxSelectRect.top - 40,
                    width: boxSelectRect.width,
                    height: boxSelectRect.height,
                  }}
                />
              )}
            </div>
          </div>

          {timeline.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm mt-8">
              拖拽素材到这里或点击素材添加到时间轴
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimelineEditor;
