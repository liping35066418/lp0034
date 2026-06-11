import React, { useState } from 'react';
import { Film, Image, Music, Play, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Material } from '@/types/shared';

interface MaterialCardProps {
  material: Material;
  isSelected?: boolean;
  onSelect?: (material: Material) => void;
  onAddToTimeline?: (material: Material) => void;
  onDelete?: (id: string) => void;
}

export const MaterialCard: React.FC<MaterialCardProps> = ({
  material,
  isSelected,
  onSelect,
  onAddToTimeline,
  onDelete,
}) => {
  const [imageError, setImageError] = useState(false);

  const getTypeIcon = () => {
    switch (material.type) {
      case 'video':
        return <Film className="w-5 h-5" />;
      case 'image':
        return <Image className="w-5 h-5" />;
      case 'audio':
        return <Music className="w-5 h-5" />;
    }
  };

  const getStatusColor = () => {
    switch (material.status) {
      case 'ready':
        return 'bg-emerald-500';
      case 'processing':
      case 'uploading':
        return 'bg-amber-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div
      className={cn(
        'group relative bg-slate-800/50 rounded-lg overflow-hidden border transition-all cursor-pointer',
        isSelected
          ? 'border-indigo-500 ring-2 ring-indigo-500/50'
          : 'border-slate-700 hover:border-slate-600'
      )}
      onClick={() => onSelect?.(material)}
    >
      <div className="relative aspect-video bg-slate-900 flex items-center justify-center">
        {material.thumbnailPath && !imageError ? (
          <img
            src={`/api/materials/${material.id}/thumbnail`}
            alt={material.name}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="text-slate-500">
            {getTypeIcon()}
          </div>
        )}

        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="p-1.5 bg-slate-900/80 rounded hover:bg-indigo-600 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onAddToTimeline?.(material);
            }}
            title="添加到时间轴"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            className="p-1.5 bg-slate-900/80 rounded hover:bg-red-600 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(material.id);
            }}
            title="删除素材"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {material.type === 'video' && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 rounded text-xs font-mono">
            {formatDuration(material.duration)}
          </div>
        )}

        <div className={`absolute top-2 left-2 w-2 h-2 rounded-full ${getStatusColor()}`} />
      </div>

      <div className="p-3">
        <h3 className="text-sm font-medium truncate" title={material.name}>
          {material.name}
        </h3>
        <div className="flex items-center justify-between mt-1 text-xs text-slate-400">
          <span className="uppercase">{material.format}</span>
          <span>{formatSize(material.size)}</span>
        </div>
      </div>
    </div>
  );
};

export default MaterialCard;
