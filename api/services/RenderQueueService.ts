import taskRepository from './TaskRepository.js';
import materialService from './MaterialService.js';
import videoService from './VideoService.js';
import wsService from './WSService.js';
import type { 
  RenderTask, 
  RenderStatus, 
  TimelineClip, 
  OutputSettings,
  RenderStage 
} from '../../shared/types.js';

interface TaskControl {
  cancelled: boolean;
  paused: boolean;
}

export class RenderQueueService {
  private taskControls: Map<string, TaskControl> = new Map();
  private activeTask: string | null = null;
  private pendingTasks: string[] = [];
  private maxConcurrent: number = 1;

  constructor() {
    this.loadPendingTasks();
  }

  private async loadPendingTasks(): Promise<void> {
    try {
      const tasks = taskRepository.findAll(100);
      for (const task of tasks) {
        if (task.status === 'processing') {
          taskRepository.updateStatus(task.id, 'failed', 'Server restarted during processing');
        }
        if (task.status === 'pending') {
          this.pendingTasks.push(task.id);
        }
      }
      this.processNext();
    } catch (err) {
      console.error('Failed to load pending tasks:', err);
    }
  }

  submitTask(
    name: string,
    timeline: TimelineClip[],
    outputSettings: OutputSettings
  ): RenderTask {
    const task = taskRepository.create({
      name,
      timeline,
      outputSettings,
    });

    this.pendingTasks.push(task.id);
    wsService.sendTaskStatus(task.id, 'pending');

    this.processNext();

    return task;
  }

  private processNext(): void {
    const activeCount = this.activeTask ? 1 : 0;
    if (activeCount >= this.maxConcurrent) return;
    if (this.pendingTasks.length === 0) return;

    const taskId = this.pendingTasks.shift();
    if (!taskId) return;

    this.activeTask = taskId;
    this.executeTask(taskId);
  }

  private async executeTask(taskId: string): Promise<void> {
    const control: TaskControl = { cancelled: false, paused: false };
    this.taskControls.set(taskId, control);

    try {
      const task = taskRepository.findById(taskId);
      if (!task) {
        throw new Error('Task not found');
      }

      taskRepository.updateStatus(taskId, 'processing');
      wsService.sendTaskStatus(taskId, 'processing');

      const materials = new Map<string, { filePath: string; type: string }>();

      for (const clip of task.timeline) {
        const material = materialService.getMaterial(clip.materialId);
        if (material && material.status === 'ready') {
          materials.set(clip.materialId, {
            filePath: material.filePath,
            type: material.type,
          });
        }
      }

      if (materials.size === 0) {
        throw new Error('No valid materials found in timeline');
      }

      const outputPath = await videoService.renderTimeline(
        task.timeline,
        materials,
        task.outputSettings,
        taskId,
        (progress: number, stage: string) => {
          if (control.cancelled) return;

          while (control.paused && !control.cancelled) {
            this.sleep(100);
          }

          taskRepository.updateProgress(taskId, progress, stage as RenderStage);
          wsService.sendProgress(taskId, {
            type: 'progress',
            taskId,
            progress,
            stage: stage as RenderStage,
          });
        }
      );

      if (control.cancelled) {
        taskRepository.updateStatus(taskId, 'cancelled');
        wsService.sendTaskStatus(taskId, 'cancelled');
        return;
      }

      taskRepository.updateOutputPath(taskId, outputPath);
      taskRepository.updateStatus(taskId, 'completed');
      wsService.sendTaskStatus(taskId, 'completed', { outputPath });

    } catch (error: any) {
      console.error(`Render task ${taskId} failed:`, error);
      taskRepository.updateStatus(taskId, 'failed', error.message || 'Unknown error');
      wsService.sendTaskStatus(taskId, 'failed', { error: error.message });
    } finally {
      this.taskControls.delete(taskId);
      this.activeTask = null;
      this.processNext();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  pauseTask(taskId: string): boolean {
    const control = this.taskControls.get(taskId);
    if (!control) return false;

    control.paused = true;
    wsService.sendTaskStatus(taskId, 'paused');
    return true;
  }

  resumeTask(taskId: string): boolean {
    const control = this.taskControls.get(taskId);
    if (!control) return false;

    control.paused = false;
    wsService.sendTaskStatus(taskId, 'processing');
    return true;
  }

  cancelTask(taskId: string): boolean {
    const control = this.taskControls.get(taskId);
    if (!control) {
      const task = taskRepository.findById(taskId);
      if (task && task.status === 'pending') {
        const index = this.pendingTasks.indexOf(taskId);
        if (index > -1) {
          this.pendingTasks.splice(index, 1);
        }
        taskRepository.updateStatus(taskId, 'cancelled');
        wsService.sendTaskStatus(taskId, 'cancelled');
        return true;
      }
      return false;
    }

    control.cancelled = true;
    control.paused = false;
    return true;
  }

  retryTask(taskId: string): boolean {
    const task = taskRepository.findById(taskId);
    if (!task) return false;

    if (task.status !== 'failed' && task.status !== 'cancelled') {
      return false;
    }

    taskRepository.updateStatus(taskId, 'pending');
    taskRepository.updateProgress(taskId, 0);
    this.pendingTasks.push(taskId);
    wsService.sendTaskStatus(taskId, 'pending');

    this.processNext();
    return true;
  }

  getTask(taskId: string): RenderTask | null {
    return taskRepository.findById(taskId);
  }

  listTasks(limit?: number): RenderTask[] {
    return taskRepository.findAll(limit);
  }

  deleteTask(taskId: string): boolean {
    const task = taskRepository.findById(taskId);
    if (!task) return false;

    if (task.status === 'processing') {
      this.cancelTask(taskId);
    }

    return taskRepository.delete(taskId);
  }

  getActiveTaskId(): string | null {
    return this.activeTask;
  }

  getPendingCount(): number {
    return this.pendingTasks.length;
  }
}

export default new RenderQueueService();
