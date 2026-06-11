import React, { useState } from 'react';
import {
  Wand2,
  Scissors,
  Music,
  Palette,
  Zap,
  Settings,
  Sliders,
} from 'lucide-react';
import { aiAPI } from '@/lib/api';
import useEditorStore from '@/stores/useEditorStore';
import { cn } from '@/lib/utils';

interface AIPanelProps {
  selectedMaterialIds: string[];
}

export const AIPanel: React.FC<AIPanelProps> = ({ selectedMaterialIds }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [targetDuration, setTargetDuration] = useState(60);
  const [selectedStyle, setSelectedStyle] = useState('cinematic');
  const timeline = useEditorStore((state) => state.timeline);
  const setTimeline = useEditorStore((state) => state.setTimeline);
  const materials = useEditorStore((state) => state.materials);

  const materialIds =
    selectedMaterialIds.length > 0
      ? selectedMaterialIds
      : materials.slice(0, 10).map((m) => m.id);

  const handleSmartCut = async () => {
    if (materialIds.length === 0) return;

    setIsProcessing(true);
    try {
      const result = await aiAPI.smartCut(materialIds, {
        targetDuration,
        enableTransition: true,
        enableColorCorrection: true,
      });
      setTimeline(result.timeline);
    } catch (err) {
      console.error('Smart cut failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBatchColorGrade = async () => {
    setIsProcessing(true);
    try {
      const result = await aiAPI.batchColorGrade(selectedStyle);
      console.log('Color grade filters:', result.filters);
    } catch (err) {
      console.error('Batch color grade failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTrimEnds = async () => {
    if (selectedMaterialIds.length !== 1) return;

    setIsProcessing(true);
    try {
      const result = await aiAPI.trimEnds(selectedMaterialIds[0], 0.5, 0.5);
      console.log('Trim ends result:', result);
    } catch (err) {
      console.error('Trim ends failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const colorStyles = [
    { id: 'cinematic', name: '电影感', color: 'from-indigo-500 to-purple-500' },
    { id: 'warm', name: '暖色调', color: 'from-amber-500 to-orange-500' },
    { id: 'cool', name: '冷色调', color: 'from-cyan-500 to-blue-500' },
    { id: 'vintage', name: '复古风', color: 'from-yellow-600 to-amber-700' },
  ];

  return (
    <div className="space-y-4">
      <div className="p-4 bg-gradient-to-br from-indigo-600/20 to-purple-600/20 rounded-lg border border-indigo-500/30">
        <div className="flex items-center gap-2 mb-3">
          <Wand2 className="w-5 h-5 text-indigo-400" />
          <h3 className="font-medium">一键智能剪辑</h3>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          AI 自动筛选精彩镜头、匹配转场、卡点对齐
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">目标时长（秒）</label>
            <input
              type="number"
              value={targetDuration}
              onChange={(e) => setTargetDuration(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm focus:outline-none focus:border-indigo-500"
              min={5}
              max={300}
            />
          </div>
          <button
            className={cn(
              'w-full py-2.5 rounded-lg font-medium transition-all flex items-center justify-center gap-2',
              isProcessing
                ? 'bg-slate-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400'
            )}
            onClick={handleSmartCut}
            disabled={isProcessing || materialIds.length === 0}
          >
            <Zap className="w-4 h-4" />
            {isProcessing ? '处理中...' : '开始智能剪辑'}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Scissors className="w-4 h-4 text-slate-400" />
          <h4 className="text-sm font-medium">镜头编辑</h4>
        </div>

        <button
          className="w-full p-3 text-left bg-slate-800/50 hover:bg-slate-700/50 rounded-lg border border-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleTrimEnds}
          disabled={isProcessing || selectedMaterialIds.length !== 1}
        >
          <div className="flex items-center gap-2">
            <Scissors className="w-4 h-4 text-emerald-400" />
            <span className="text-sm">智能掐头去尾</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            自动识别并去除开头结尾的空白片段
          </p>
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-slate-400" />
          <h4 className="text-sm font-medium">批量调色</h4>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {colorStyles.map((style) => (
            <button
              key={style.id}
              className={cn(
                'p-2 rounded-lg border transition-all text-left',
                selectedStyle === style.id
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-slate-700 hover:border-slate-600'
              )}
              onClick={() => setSelectedStyle(style.id)}
            >
              <div
                className={cn(
                  'h-8 rounded mb-2 bg-gradient-to-r',
                  style.color
                )}
              />
              <span className="text-xs">{style.name}</span>
            </button>
          ))}
        </div>

        <button
          className="w-full py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleBatchColorGrade}
          disabled={isProcessing || timeline.length === 0}
        >
          <Sliders className="w-4 h-4" />
          应用到时间轴
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-slate-400" />
          <h4 className="text-sm font-medium">音乐卡点</h4>
        </div>
        <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 border-dashed text-center">
          <Music className="w-8 h-8 mx-auto mb-2 text-slate-500" />
          <p className="text-xs text-slate-500">
            添加音频素材后可启用卡点对齐
          </p>
        </div>
      </div>

      <div className="pt-2 border-t border-slate-700">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Settings className="w-3.5 h-3.5" />
          <span>已选 {selectedMaterialIds.length} 个素材</span>
          <span>·</span>
          <span>时间轴 {timeline.length} 个片段</span>
        </div>
      </div>
    </div>
  );
};

export default AIPanel;
