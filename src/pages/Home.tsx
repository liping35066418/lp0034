import React, { useState, useEffect } from 'react';
import {
  Video,
  FolderOpen,
  Wand2,
  ListVideo,
  Download,
  Search,
  Filter,
  Grid,
  List,
  Sparkles,
  Clock,
  CheckCircle,
} from 'lucide-react';
import MaterialCard from '@/components/MaterialCard';
import UploadZone from '@/components/UploadZone';
import TimelineEditor from '@/components/TimelineEditor';
import RenderQueue from '@/components/RenderQueue';
import AIPanel from '@/components/AIPanel';
import ExportModal from '@/components/ExportModal';
import useEditorStore from '@/stores/useEditorStore';
import useWebSocket from '@/hooks/useWebSocket';
import { materialsAPI, renderAPI } from '@/lib/api';
import type { Material } from '@/types/shared';
import { cn } from '@/lib/utils';

const Home: React.FC = () => {
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterType, setFilterType] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const materials = useEditorStore((state) => state.materials);
  const setMaterials = useEditorStore((state) => state.setMaterials);
  const selectedMaterialId = useEditorStore((state) => state.selectedMaterialId);
  const setSelectedMaterialId = useEditorStore(
    (state) => state.setSelectedMaterialId
  );
  const addMaterialToTimeline = useEditorStore(
    (state) => state.addMaterialToTimeline
  );
  const renderTasks = useEditorStore((state) => state.renderTasks);
  const setRenderTasks = useEditorStore((state) => state.setRenderTasks);
  const activeTab = useEditorStore((state) => state.activeTab);
  const setActiveTab = useEditorStore((state) => state.setActiveTab);

  useWebSocket();

  useEffect(() => {
    loadMaterials();
    loadRenderTasks();
  }, []);

  const loadMaterials = async () => {
    try {
      const data = await materialsAPI.list();
      setMaterials(data);
    } catch (err) {
      console.error('Failed to load materials:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadRenderTasks = async () => {
    try {
      const data = await renderAPI.list(50);
      setRenderTasks(data);
    } catch (err) {
      console.error('Failed to load render tasks:', err);
    }
  };

  const handleDeleteMaterial = async (id: string) => {
    if (!confirm('确定要删除这个素材吗？')) return;

    try {
      await materialsAPI.delete(id);
      loadMaterials();
      if (selectedMaterialId === id) {
        setSelectedMaterialId(null);
      }
    } catch (err) {
      console.error('Failed to delete material:', err);
    }
  };

  const filteredMaterials = materials.filter((m) => {
    if (filterType && m.type !== filterType) return false;
    if (searchQuery && !m.name.toLowerCase().includes(searchQuery.toLowerCase()))
      return false;
    return true;
  });

  const selectedMaterialIds = selectedMaterialId ? [selectedMaterialId] : [];

  const processingCount = renderTasks.filter(
    (t) => t.status === 'processing'
  ).length;
  const pendingCount = renderTasks.filter((t) => t.status === 'pending').length;
  const completedToday = renderTasks.filter((t) => {
    const today = new Date();
    const taskDate = new Date(t.createdAt);
    return (
      t.status === 'completed' &&
      taskDate.getDate() === today.getDate() &&
      taskDate.getMonth() === today.getMonth() &&
      taskDate.getFullYear() === today.getFullYear()
    );
  }).length;

  const leftTabs = [
    { id: 'materials', label: '素材库', icon: FolderOpen },
    { id: 'ai', label: 'AI 剪辑', icon: Wand2 },
    { id: 'render', label: '渲染队列', icon: ListVideo },
  ];

  return (
    <div className="h-screen flex flex-col bg-[#0F0F1A] text-white overflow-hidden">
      {/* 顶部导航栏 */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Video className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              AI 智能剪辑
            </h1>
            <p className="text-xs text-slate-500">短视频创作工作站</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Clock className="w-4 h-4" />
              <span>队列 {pendingCount}</span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle className="w-4 h-4" />
              <span>今日 {completedToday}</span>
            </div>
          </div>

          <button
            className="px-5 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 rounded-lg font-medium transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/25"
            onClick={() => setExportModalOpen(true)}
          >
            <Download className="w-4 h-4" />
            导出视频
          </button>
        </div>
      </header>

      {/* 主体内容 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧面板 */}
        <aside className="w-80 border-r border-slate-800 bg-slate-900/50 flex flex-col">
          {/* Tab 切换 */}
          <div className="flex border-b border-slate-800 p-1">
            {leftTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  className={cn(
                    'flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-1.5',
                    isActive
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  )}
                  onClick={() => setActiveTab(tab.id as any)}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab 内容 */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'materials' && (
              <div className="space-y-4">
                <UploadZone />

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="搜索素材..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <button
                      className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                      title="筛选"
                    >
                      <Filter className="w-4 h-4" />
                    </button>
                    <div className="flex bg-slate-800 rounded-lg p-0.5">
                      <button
                        className={cn(
                          'p-1.5 rounded transition-colors',
                          viewMode === 'grid'
                            ? 'bg-slate-700 text-white'
                            : 'text-slate-400 hover:text-white'
                        )}
                        onClick={() => setViewMode('grid')}
                      >
                        <Grid className="w-4 h-4" />
                      </button>
                      <button
                        className={cn(
                          'p-1.5 rounded transition-colors',
                          viewMode === 'list'
                            ? 'bg-slate-700 text-white'
                            : 'text-slate-400 hover:text-white'
                        )}
                        onClick={() => setViewMode('list')}
                      >
                        <List className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-1">
                    {[
                      { key: null, label: '全部' },
                      { key: 'video', label: '视频' },
                      { key: 'image', label: '图片' },
                      { key: 'audio', label: '音频' },
                    ].map((item) => (
                      <button
                        key={item.key || 'all'}
                        className={cn(
                          'px-3 py-1 text-xs rounded-full transition-colors',
                          filterType === item.key
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        )}
                        onClick={() => setFilterType(item.key)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {isLoading ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="bg-slate-800 rounded-lg aspect-video animate-pulse"
                      />
                    ))}
                  </div>
                ) : filteredMaterials.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">暂无素材</p>
                    <p className="text-xs mt-1">上传视频或图片开始创作</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {filteredMaterials.map((material) => (
                      <MaterialCard
                        key={material.id}
                        material={material}
                        isSelected={selectedMaterialId === material.id}
                        onSelect={(m) => setSelectedMaterialId(m.id)}
                        onAddToTimeline={addMaterialToTimeline}
                        onDelete={handleDeleteMaterial}
                      />
                    ))}
                  </div>
                )}

                <div className="pt-2 text-xs text-slate-500 text-center">
                  共 {filteredMaterials.length} 个素材
                </div>
              </div>
            )}

            {activeTab === 'ai' && (
              <AIPanel selectedMaterialIds={selectedMaterialIds} />
            )}

            {activeTab === 'render' && <RenderQueue tasks={renderTasks} />}
          </div>
        </aside>

        {/* 中间主区域 */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* 预览区域 */}
          <div className="flex-1 flex items-center justify-center bg-slate-950 p-8 min-h-0">
            <div className="relative w-full max-w-4xl aspect-video bg-black rounded-xl shadow-2xl overflow-hidden border border-slate-800">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <Sparkles className="w-16 h-16 mx-auto mb-4 text-indigo-500/50" />
                  <p className="text-slate-400 text-lg font-medium">
                    视频预览区域
                  </p>
                  <p className="text-slate-600 text-sm mt-1">
                    添加素材到时间轴后可预览效果
                  </p>
                </div>
              </div>

              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/80 to-transparent" />

              <div className="absolute bottom-3 left-4 right-4 flex items-center gap-3">
                <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full w-0 bg-indigo-500 rounded-full" />
                </div>
                <span className="text-xs text-white/70 font-mono">
                  00:00.00
                </span>
              </div>
            </div>
          </div>

          {/* 时间轴区域 */}
          <div className="h-72 border-t border-slate-800">
            <TimelineEditor materials={materials} />
          </div>
        </main>

        {/* 右侧属性面板 */}
        <aside className="w-72 border-l border-slate-800 bg-slate-900/50 p-4 overflow-y-auto">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
            <Filter className="w-4 h-4" />
            属性面板
          </h3>

          <div className="space-y-4">
            <div className="p-3 bg-slate-800/50 rounded-lg">
              <h4 className="text-xs font-medium text-slate-400 mb-3">快调色</h4>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: '电影感', color: 'from-indigo-500 to-purple-500' },
                  { name: '清新', color: 'from-cyan-400 to-blue-500' },
                  { name: '暖调', color: 'from-amber-400 to-orange-500' },
                  { name: '复古', color: 'from-yellow-600 to-amber-700' },
                  { name: '冷调', color: 'from-blue-400 to-cyan-500' },
                  { name: '黑白', color: 'from-gray-400 to-gray-600' },
                ].map((preset) => (
                  <button
                    key={preset.name}
                    className="group"
                    title={preset.name}
                  >
                    <div
                      className={`h-12 rounded-lg bg-gradient-to-br ${preset.color} transition-transform group-hover:scale-105`}
                    />
                    <p className="text-xs text-center mt-1 text-slate-400">
                      {preset.name}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 bg-slate-800/50 rounded-lg">
              <h4 className="text-xs font-medium text-slate-400 mb-3">
                基础调整
              </h4>
              <div className="space-y-3">
                {[
                  { name: '亮度', value: 50 },
                  { name: '对比度', value: 50 },
                  { name: '饱和度', value: 50 },
                  { name: '色温', value: 50 },
                ].map((item) => (
                  <div key={item.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">{item.name}</span>
                      <span className="text-slate-500">{item.value}</span>
                    </div>
                    <input
                      type="range"
                      defaultValue={item.value}
                      className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 bg-slate-800/50 rounded-lg">
              <h4 className="text-xs font-medium text-slate-400 mb-3">转场效果</h4>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: '淡入淡出', icon: '◯' },
                  { name: '溶解', icon: '◐' },
                  { name: '擦除', icon: '▷' },
                  { name: '滑动', icon: '→' },
                  { name: '缩放', icon: '◎' },
                  { name: '无', icon: '—' },
                ].map((trans) => (
                  <button
                    key={trans.name}
                    className="p-2 bg-slate-900/50 hover:bg-slate-700/50 rounded border border-slate-700 transition-colors"
                    title={trans.name}
                  >
                    <span className="text-lg text-slate-400">{trans.icon}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-700">
            <div className="text-xs text-slate-500 space-y-1">
              <p>素材数量: {materials.length}</p>
              <p>时间轴片段: {useEditorStore.getState().timeline.length}</p>
              <p>
                总时长:{' '}
                {useEditorStore.getState().getTotalDuration().toFixed(1)}秒
              </p>
            </div>
          </div>
        </aside>
      </div>

      {/* 导出弹窗 */}
      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
      />
    </div>
  );
};

export default Home;
