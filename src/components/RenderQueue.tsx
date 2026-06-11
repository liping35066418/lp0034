import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  X,
  Download,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  PauseCircle,
} from 'lucide-react';
import type { RenderTask } from '@/types/shared';
import { cn } from '@/lib/utils';
import { renderAPI } from '@/lib/api';
import useEditorStore from '@/stores/useEditorStore';

interface RenderQueueProps {
  tasks: RenderTask[];
}

export const RenderQueue: React.FC<RenderQueueProps> = ({ tasks }) => {
  const updateRenderTask = useEditorStore((state) => state.updateRenderTask);
  const removeRenderTask = useEditorStore((state) => state.removeRenderTask);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processing':
        return <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'paused':
        return <PauseCircle className="w-4 h-4 text-amber-400" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-slate-400" />;
      case 'cancelled':
        return <X className="w-4 h-4 text-slate-400" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'processing':
        return '处理中';
      case 'completed':
        return '已完成';
      case 'failed':
        return '失败';
      case 'paused':
        return '已暂停';
      case 'pending':
        return '等待中';
      case 'cancelled':
        return '已取消';
      default:
        return status;
    }
  };

  const getStageText = (stage?: string) => {
    switch (stage) {
      case 'analyzing':
        return '分析中';
      case 'processing':
        return '处理中';
      case 'encoding':
        return '编码中';
      case 'finalizing':
        return '收尾中';
      default:
        return '';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processing':
        return 'text-indigo-400';
      case 'completed':
        return 'text-emerald-400';
      case 'failed':
        return 'text-red-400';
      case 'paused':
        return 'text-amber-400';
      case 'pending':
        return 'text-slate-400';
      default:
        return 'text-slate-400';
    }
  };

  const handlePause = async (taskId: string) => {
    try {
      await renderAPI.pause(taskId);
      updateRenderTask(taskId, { status: 'paused' });
    } catch (err) {
      console.error('Pause failed:', err);
    }
  };

  const handleResume = async (taskId: string) => {
    try {
      await renderAPI.resume(taskId);
      updateRenderTask(taskId, { status: 'processing' });
    } catch (err) {
      console.error('Resume failed:', err);
    }
  };

  const handleRetry = async (taskId: string) => {
    try {
      await renderAPI.retry(taskId);
      updateRenderTask(taskId, { status: 'pending', progress: 0 });
    } catch (err) {
      console.error('Retry failed:', err);
    }
  };

  const handleCancel = async (taskId: string) => {
    try {
      await renderAPI.cancel(taskId);
      updateRenderTask(taskId, { status: 'cancelled' });
    } catch (err) {
      console.error('Cancel failed:', err);
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      await renderAPI.delete(taskId);
      removeRenderTask(taskId);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-3">
      {tasks.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">暂无渲染任务</p>
          <p className="text-xs mt-1">提交渲染后任务将显示在这里</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {getStatusIcon(task.status)}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium truncate" title={task.name}>
                      {task.name}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn('text-xs', getStatusColor(task.status))}>
                        {getStatusText(task.status)}
                      </span>
                      {task.stage && task.status === 'processing' && (
                        <span className="text-xs text-slate-500">
                          · {getStageText(task.stage)}
                        </span>
                      )}
                      <span className="text-xs text-slate-500">
                        · {formatDate(task.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {task.status === 'processing' && (
                    <button
                      className="p-1.5 hover:bg-slate-700 rounded transition-colors"
                      onClick={() => handlePause(task.id)}
                      title="暂停"
                    >
                      <Pause className="w-4 h-4" />
                    </button>
                  )}
                  {task.status === 'paused' && (
                    <button
                      className="p-1.5 hover:bg-slate-700 rounded transition-colors"
                      onClick={() => handleResume(task.id)}
                      title="继续"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  )}
                  {(task.status === 'failed' || task.status === 'cancelled') && (
                    <button
                      className="p-1.5 hover:bg-slate-700 rounded transition-colors"
                      onClick={() => handleRetry(task.id)}
                      title="重试"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                  {(task.status === 'pending' ||
                    task.status === 'processing' ||
                    task.status === 'paused') && (
                    <button
                      className="p-1.5 hover:bg-red-600/20 hover:text-red-400 rounded transition-colors"
                      onClick={() => handleCancel(task.id)}
                      title="取消"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {task.status === 'completed' && (
                    <a
                      href={renderAPI.getDownloadUrl(task.id)}
                      className="p-1.5 hover:bg-emerald-600/20 hover:text-emerald-400 rounded transition-colors"
                      title="下载"
                      download
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                  {(task.status === 'completed' ||
                    task.status === 'failed' ||
                    task.status === 'cancelled') && (
                    <button
                      className="p-1.5 hover:bg-red-600/20 hover:text-red-400 rounded transition-colors"
                      onClick={() => handleDelete(task.id)}
                      title="删除"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>{Math.round(task.progress)}%</span>
                  {task.speed && <span>速度: {task.speed}</span>}
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-all duration-300',
                      task.status === 'failed'
                        ? 'bg-red-500'
                        : task.status === 'completed'
                        ? 'bg-emerald-500'
                        : task.status === 'cancelled'
                        ? 'bg-slate-500'
                        : 'bg-gradient-to-r from-indigo-500 to-purple-500'
                    )}
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
              </div>

              <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                <span>
                  分辨率: {task.outputSettings.width}×{task.outputSettings.height}
                </span>
                <span>{task.outputSettings.fps} fps</span>
                <span>.{task.outputSettings.format}</span>
              </div>

              {task.errorMessage && (
                <div className="mt-2 p-2 bg-red-900/20 rounded text-xs text-red-400">
                  {task.errorMessage}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RenderQueue;
