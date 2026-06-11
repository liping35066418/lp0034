import React, { useCallback, useRef } from 'react';
import { Upload, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import useChunkUpload from '@/hooks/useChunkUpload';

interface UploadZoneProps {
  className?: string;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ className }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploads, isUploading, uploadFiles, cancelUpload, clearCompleted } = useChunkUpload();

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.files) {
        uploadFiles(e.dataTransfer.files);
      }
    },
    [uploadFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        uploadFiles(e.target.files);
        e.target.value = '';
      }
    },
    [uploadFiles]
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'uploading':
      case 'merging':
        return <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />;
      default:
        return <Upload className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'uploading':
        return '上传中...';
      case 'merging':
        return '处理中...';
      case 'completed':
        return '完成';
      case 'error':
        return '失败';
      default:
        return '等待中';
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer',
          'border-slate-600 hover:border-indigo-500 hover:bg-slate-800/50'
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="w-10 h-10 mx-auto mb-3 text-slate-400" />
        <p className="text-sm font-medium">拖拽文件到这里或点击上传</p>
        <p className="text-xs text-slate-500 mt-1">
          支持视频、图片、音频格式
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*,image/*,audio/*"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {uploads.length > 0 && (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>上传列表 ({uploads.length})</span>
            <button
              className="text-indigo-400 hover:text-indigo-300"
              onClick={clearCompleted}
            >
              清除已完成
            </button>
          </div>
          {uploads.map((upload) => (
            <div
              key={upload.id}
              className="flex items-center gap-3 p-2 bg-slate-800/50 rounded-lg"
            >
              {getStatusIcon(upload.status)}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" title={upload.file.name}>
                  {upload.file.name}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full transition-all duration-300',
                        upload.status === 'error'
                          ? 'bg-red-500'
                          : upload.status === 'completed'
                          ? 'bg-emerald-500'
                          : 'bg-indigo-500'
                      )}
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-400 w-12 text-right">
                    {upload.progress}%
                  </span>
                </div>
              </div>
              <span className="text-xs text-slate-400 w-16">
                {getStatusText(upload.status)}
              </span>
              {upload.status !== 'completed' && upload.status !== 'error' && (
                <button
                  className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                  onClick={() => cancelUpload(upload.id)}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default UploadZone;
