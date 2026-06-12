import React, { useState } from 'react';
import { X, Download, Settings, Film, Monitor, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import useEditorStore from '@/stores/useEditorStore';
import { renderAPI } from '@/lib/api';
import type { OutputSettings } from '@/types/shared';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RESOLUTION_PRESETS = [
  { name: '4K (3840×2160)', width: 3840, height: 2160, icon: Monitor },
  { name: '2K (2560×1440)', width: 2560, height: 1440, icon: Monitor },
  { name: '全高清 (1920×1080)', width: 1920, height: 1080, icon: Film },
  { name: '高清 (1280×720)', width: 1280, height: 720, icon: Film },
  { name: '竖屏 1080P (1080×1920)', width: 1080, height: 1920, icon: Smartphone },
  { name: '竖屏 720P (720×1280)', width: 720, height: 1280, icon: Smartphone },
];

const FPS_OPTIONS = [24, 25, 30, 60];

const FORMAT_OPTIONS = [
  { value: 'mp4', label: 'MP4', desc: '最通用格式' },
  { value: 'mov', label: 'MOV', desc: 'Apple 格式' },
  { value: 'webm', label: 'WebM', desc: 'Web 优化格式' },
];

const QUALITY_OPTIONS = [
  { value: 'low', label: '低质量', bitrate: 2000 },
  { value: 'medium', label: '中等', bitrate: 8000 },
  { value: 'high', label: '高质量', bitrate: 20000 },
];

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const outputSettings = useEditorStore((state) => state.outputSettings);
  const setOutputSettings = useEditorStore((state) => state.setOutputSettings);
  const getTimelineData = useEditorStore((state) => state.getTimelineData);
  const getTotalDuration = useEditorStore((state) => state.getTotalDuration);
  const addRenderTask = useEditorStore((state) => state.addRenderTask);
  const setActiveTab = useEditorStore((state) => state.setActiveTab);

  const [customWidth, setCustomWidth] = useState(outputSettings.width);
  const [customHeight, setCustomHeight] = useState(outputSettings.height);
  const [isCustomResolution, setIsCustomResolution] = useState(false);

  const handlePresetSelect = (preset: typeof RESOLUTION_PRESETS[0]) => {
    setIsCustomResolution(false);
    setOutputSettings({ width: preset.width, height: preset.height });
    setCustomWidth(preset.width);
    setCustomHeight(preset.height);
  };

  const handleCustomApply = () => {
    setOutputSettings({ width: customWidth, height: customHeight });
  };

  const handleExport = async () => {
    const timelineData = getTimelineData();
    if (timelineData.clips.length === 0) {
      alert('时间轴为空，请先添加素材');
      return;
    }

    try {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
      const name = `剪辑作品_${timeStr}`;

      const result = await renderAPI.submit(name, timelineData, outputSettings);
      console.log('Export submitted:', result);

      onClose();
      setActiveTab('render');

      setTimeout(async () => {
        const tasks = await renderAPI.list();
        tasks.forEach((t) => addRenderTask(t));
      }, 500);
    } catch (err) {
      console.error('Export failed:', err);
      alert('导出失败: ' + (err as Error).message);
    }
  };

  if (!isOpen) return null;

  const totalDuration = getTotalDuration();
  const timelineDataPreview = getTimelineData();
  const estimatedSize =
    (outputSettings.bitrate * totalDuration) / 8 / 1024;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl bg-slate-900 rounded-xl border border-slate-700 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <Download className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">导出视频</h2>
              <p className="text-xs text-slate-400">
                设置输出参数，提交渲染任务
              </p>
            </div>
          </div>
          <button
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <div>
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Settings className="w-4 h-4" />
              分辨率
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {RESOLUTION_PRESETS.map((preset) => {
                const Icon = preset.icon;
                const isSelected =
                  !isCustomResolution &&
                  outputSettings.width === preset.width &&
                  outputSettings.height === preset.height;

                return (
                  <button
                    key={preset.name}
                    className={cn(
                      'p-3 rounded-lg border text-left transition-all',
                      isSelected
                        ? 'border-indigo-500 bg-indigo-500/10'
                        : 'border-slate-700 hover:border-slate-600'
                    )}
                    onClick={() => handlePresetSelect(preset)}
                  >
                    <Icon className="w-5 h-5 mb-1 text-slate-400" />
                    <p className="text-xs font-medium">{preset.name}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 p-3 bg-slate-800/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-slate-400">自定义分辨率</label>
                <button
                  className={cn(
                    'text-xs px-2 py-0.5 rounded transition-colors',
                    isCustomResolution
                      ? 'bg-indigo-600'
                      : 'bg-slate-700 hover:bg-slate-600'
                  )}
                  onClick={() => setIsCustomResolution(!isCustomResolution)}
                >
                  {isCustomResolution ? '已启用' : '启用'}
                </button>
              </div>
              {isCustomResolution && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(Number(e.target.value))}
                    className="flex-1 px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-sm focus:outline-none focus:border-indigo-500"
                    placeholder="宽度"
                  />
                  <span className="text-slate-500">×</span>
                  <input
                    type="number"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(Number(e.target.value))}
                    className="flex-1 px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-sm focus:outline-none focus:border-indigo-500"
                    placeholder="高度"
                  />
                  <button
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm transition-colors"
                    onClick={handleCustomApply}
                  >
                    应用
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-3">帧率</h3>
            <div className="flex gap-2">
              {FPS_OPTIONS.map((fps) => (
                <button
                  key={fps}
                  className={cn(
                    'flex-1 py-2 rounded-lg border text-sm transition-all',
                    outputSettings.fps === fps
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-slate-700 hover:border-slate-600'
                  )}
                  onClick={() => setOutputSettings({ fps })}
                >
                  {fps} fps
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-3">输出格式</h3>
            <div className="flex gap-2">
              {FORMAT_OPTIONS.map((format) => (
                <button
                  key={format.value}
                  className={cn(
                    'flex-1 p-3 rounded-lg border text-left transition-all',
                    outputSettings.format === format.value
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-slate-700 hover:border-slate-600'
                  )}
                  onClick={() =>
                    setOutputSettings({
                      format: format.value as OutputSettings['format'],
                    })
                  }
                >
                  <p className="text-sm font-medium">{format.label}</p>
                  <p className="text-xs text-slate-500">{format.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-3">质量</h3>
            <div className="flex gap-2">
              {QUALITY_OPTIONS.map((quality) => (
                <button
                  key={quality.value}
                  className={cn(
                    'flex-1 p-3 rounded-lg border text-left transition-all',
                    outputSettings.quality === quality.value
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-slate-700 hover:border-slate-600'
                  )}
                  onClick={() => {
                    setOutputSettings({
                      quality: quality.value as OutputSettings['quality'],
                      bitrate: quality.bitrate,
                    });
                  }}
                >
                  <p className="text-sm font-medium">{quality.label}</p>
                  <p className="text-xs text-slate-500">{quality.bitrate} kbps</p>
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 bg-slate-800/50 rounded-lg">
            <h3 className="text-sm font-medium mb-3">导出摘要</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-slate-500">分辨率</span>
                <p className="font-medium">
                  {outputSettings.width} × {outputSettings.height}
                </p>
              </div>
              <div>
                <span className="text-slate-500">帧率</span>
                <p className="font-medium">{outputSettings.fps} fps</p>
              </div>
              <div>
                <span className="text-slate-500">格式</span>
                <p className="font-medium uppercase">
                  .{outputSettings.format}
                </p>
              </div>
              <div>
                <span className="text-slate-500">时长</span>
                <p className="font-medium">
                  {Math.floor(totalDuration / 60)}:
                  {Math.floor(totalDuration % 60)
                    .toString()
                    .padStart(2, '0')}
                </p>
              </div>
              <div>
                <span className="text-slate-500">片段数</span>
                <p className="font-medium">{timelineDataPreview.clips.length} 个</p>
              </div>
              <div>
                <span className="text-slate-500">预估大小</span>
                <p className="font-medium">{estimatedSize.toFixed(1)} MB</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700 bg-slate-800/50">
          <div className="text-sm text-slate-400">
            {timelineDataPreview.clips.length === 0 && '⚠️ 时间轴为空'}
          </div>
          <div className="flex gap-3">
            <button
              className="px-5 py-2.5 border border-slate-600 hover:bg-slate-800 rounded-lg transition-colors"
              onClick={onClose}
            >
              取消
            </button>
            <button
              className={cn(
                'px-6 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2',
                timelineDataPreview.clips.length === 0
                  ? 'bg-slate-600 cursor-not-allowed'
                  : 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400'
              )}
              onClick={handleExport}
              disabled={timelineDataPreview.clips.length === 0}
            >
              <Download className="w-4 h-4" />
              提交渲染
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
