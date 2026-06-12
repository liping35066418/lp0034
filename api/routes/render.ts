import { Router } from 'express';
import renderQueueService from '../services/RenderQueueService.js';
import fileManager from '../services/FileManager.js';
import fs from 'fs';
import type { Request, Response } from 'express';
import type { TimelineClip, OutputSettings, TimelineData } from '../../shared/types.js';
import { DEFAULT_OUTPUT_SETTINGS } from '../../shared/types.js';

const router = Router();

router.get('/tasks', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const tasks = renderQueueService.listTasks(limit);
    res.json(tasks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/tasks/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const task = renderQueueService.getTask(id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/submit', (req: Request, res: Response) => {
  try {
    const { name, timeline, outputSettings } = req.body as {
      name: string;
      timeline: TimelineData | TimelineClip[];
      outputSettings?: Partial<OutputSettings>;
    };

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    let normalizedTimeline: TimelineData;
    if (Array.isArray(timeline)) {
      normalizedTimeline = { clips: timeline, backgroundMusic: [], masterVolume: 1 };
    } else if (timeline && Array.isArray(timeline.clips)) {
      normalizedTimeline = {
        clips: timeline.clips,
        backgroundMusic: timeline.backgroundMusic || [],
        masterVolume: timeline.masterVolume ?? 1,
      };
    } else {
      return res.status(400).json({ error: 'timeline must be a non-empty array or TimelineData' });
    }

    if (normalizedTimeline.clips.length === 0) {
      return res.status(400).json({ error: 'timeline.clips must have at least one clip' });
    }

    const settings: OutputSettings = {
      ...DEFAULT_OUTPUT_SETTINGS,
      ...outputSettings,
    };

    const task = renderQueueService.submitTask(name, normalizedTimeline, settings);

    const estimatedTime = estimateRenderTime(normalizedTimeline, settings);

    res.json({
      taskId: task.id,
      status: task.status,
      estimatedTime,
      position: renderQueueService.getPendingCount(),
    });
  } catch (error: any) {
    console.error('Submit render task error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/tasks/:id/pause', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = renderQueueService.pauseTask(id);

    if (!success) {
      return res.status(400).json({ error: 'Cannot pause task' });
    }

    res.json({ success: true, message: 'Task paused' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/tasks/:id/resume', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = renderQueueService.resumeTask(id);

    if (!success) {
      return res.status(400).json({ error: 'Cannot resume task' });
    }

    res.json({ success: true, message: 'Task resumed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/tasks/:id/retry', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = renderQueueService.retryTask(id);

    if (!success) {
      return res.status(400).json({ error: 'Cannot retry task' });
    }

    res.json({ success: true, message: 'Task retried' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/tasks/:id/cancel', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = renderQueueService.cancelTask(id);

    if (!success) {
      return res.status(400).json({ error: 'Cannot cancel task' });
    }

    res.json({ success: true, message: 'Task cancelled' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/tasks/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = renderQueueService.deleteTask(id);

    if (!success) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/tasks/:id/download', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const task = renderQueueService.getTask(id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.status !== 'completed' || !task.outputPath) {
      return res.status(400).json({ error: 'Task is not completed' });
    }

    if (!fs.existsSync(task.outputPath)) {
      return res.status(404).json({ error: 'Output file not found' });
    }

    const fileName = `${task.name}.${task.outputSettings.format}`;
    res.download(task.outputPath, fileName);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', (_req: Request, res: Response) => {
  try {
    const activeTaskId = renderQueueService.getActiveTaskId();
    const pendingCount = renderQueueService.getPendingCount();
    const tasks = renderQueueService.listTasks(100);

    const completedToday = tasks.filter(t => {
      const today = new Date();
      const taskDate = new Date(t.createdAt);
      return t.status === 'completed' &&
        taskDate.getDate() === today.getDate() &&
        taskDate.getMonth() === today.getMonth() &&
        taskDate.getFullYear() === today.getFullYear();
    }).length;

    res.json({
      activeTaskId,
      pendingCount,
      completedToday,
      totalTasks: tasks.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

function estimateRenderTime(timeline: TimelineData | TimelineClip[], settings: OutputSettings): number {
  const clips = Array.isArray(timeline) ? timeline : timeline.clips;
  if (clips.length === 0) return 0;

  const totalDuration = clips.reduce((max, c) => Math.max(max, c.endTime), 0);
  const resolutionFactor = (settings.width * settings.height) / (1920 * 1080);
  const fpsFactor = settings.fps / 30;
  const clipFactor = 1 + clips.length * 0.05;

  return totalDuration * resolutionFactor * fpsFactor * clipFactor * 1.5;
}

export default router;
