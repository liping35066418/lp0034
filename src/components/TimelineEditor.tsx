import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, ZoomIn, ZoomOut, Trash2, GripVertical } from 'lucide-react';
import useEditorStore from '@/stores/useEditorStore';
import type { Material, TimelineClip } from '@/types/shared';
import { cn } from '@/lib/utils';

interface TimelineEditorProps {
  materials: Material[];
}

export const TimelineEditor: React.FC<TimelineEditorProps> = ({ materials }) => {
  const timeline = useEditorStore((state) => state.timeline);
  const selectedClipId = useEditorStore((state) => state.selectedClipId);
  const currentTime = useEditorStore((state) => state.currentTime);
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const zoom = useEditorStore((state) => state.zoom);

  const setSelectedClipId = useEditorStore((state) => state.setSelectedClipId);
  const setCurrentTime = useEditorStore((state) => state.setCurrentTime);
  const setIsPlaying = useEditorStore((state) => state.setIsPlaying);
  const setZoom = useEditorStore((state) => state.setZoom);
  const moveClip = useEditorStore((state) => state.moveClip);
  const removeClip = useEditorStore((state) => state.removeClip);
  const getTotalDuration = useEditorStore((state) => state.getTotalDuration);

  const timelineRef = useRef<HTMLDivElement>(null);
  const [draggingClip, setDraggingClip] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const playIntervalRef = useRef<number | null>(null);

  const totalDuration = Math.max(getTotalDuration(), 30);
  const pixelsPerSecond = 100 * zoom;
  const timelineWidth = totalDuration * pixelsPerSecond;

  const getMaterial = (id: string) => materials.find((m) => m.id === id);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const timeMarkers = [];
  const markerInterval = zoom > 2 ? 1 : zoom > 1 ? 2 : 5;
  for (let t = 0; t <= totalDuration; t += markerInterval) {
    timeMarkers.push(t);
  }

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = x / pixelsPerSecond;
    setCurrentTime(Math.max(0, Math.min(totalDuration, time)));
  };

  const handleClipMouseDown = (e: React.MouseEvent, clip: TimelineClip) => {
    e.stopPropagation();
    setSelectedClipId(clip.id);
    setDraggingClip(clip.id);

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset(e.clientX - rect.left);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
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
    [draggingClip, dragOffset, timeline, pixelsPerSecond, moveClip, zoom]
  );

  const handleMouseUp = useCallback(() => {
    setDraggingClip(null);
  }, []);

  useEffect(() => {
    if (draggingClip) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingClip, handleMouseMove, handleMouseUp]);

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
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </span>
        </div>

        <div className="flex items-center gap-2">
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
          <div className="sticky top-0 z-10 h-8 bg-slate-800 border-b border-slate-700">
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

            <div className="ml-20 relative h-full">
              {timeline
                .filter((c) => c.track === 0)
                .sort((a, b) => a.startTime - b.startTime)
                .map((clip, index) => {
                  const material = getMaterial(clip.materialId);
                  const isSelected = selectedClipId === clip.id;
                  const width = (clip.endTime - clip.startTime) * pixelsPerSecond;

                  return (
                    <div
                      key={clip.id}
                      className={cn(
                        'absolute top-2 h-14 rounded-md cursor-grab overflow-hidden',
                        'bg-gradient-to-r border transition-all',
                        getClipColor(index),
                        isSelected
                          ? 'border-white ring-2 ring-white/50 z-10'
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
                        {isSelected && (
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
