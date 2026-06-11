import { Router } from 'express';
import materialService from '../services/MaterialService.js';
import aiService from '../services/AIService.js';
import fileManager from '../services/FileManager.js';
import path from 'path';
import fs from 'fs';
import type { Request, Response } from 'express';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const type = req.query.type as 'video' | 'image' | 'audio' | undefined;
    const materials = materialService.listMaterials(type);
    res.json(materials);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const material = materialService.getMaterial(id);

    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }

    res.json(material);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/metadata', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const material = materialService.getMaterial(id);

    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }

    res.json({
      id: material.id,
      name: material.name,
      type: material.type,
      size: material.size,
      duration: material.duration,
      width: material.width,
      height: material.height,
      fps: material.fps,
      format: material.format,
      status: material.status,
      fileSizeFormatted: fileManager.formatFileSize(material.size),
      durationFormatted: material.duration ? fileManager.formatDuration(material.duration) : null,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/analyze', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const analysis = await materialService.analyzeMaterial(id);
    res.json({ materialId: id, analysis });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = await materialService.deleteMaterial(id);

    if (!success) {
      return res.status(404).json({ error: 'Material not found' });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/thumbnail', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const material = materialService.getMaterial(id);

    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }

    if (material.thumbnailPath && fs.existsSync(material.thumbnailPath)) {
      res.sendFile(material.thumbnailPath);
    } else {
      const filePath = material.filePath;
      if (fs.existsSync(filePath)) {
        if (material.type === 'image') {
          res.sendFile(filePath);
        } else {
          res.status(404).json({ error: 'Thumbnail not available' });
        }
      } else {
        res.status(404).json({ error: 'File not found' });
      }
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/bulk-analyze', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: 'ids must be an array' });
    }

    const results = await materialService.bulkAnalyze(ids);
    const analysisMap: Record<string, any> = {};
    results.forEach((value, key) => {
      analysisMap[key] = value;
    });

    res.json({ results: analysisMap });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
