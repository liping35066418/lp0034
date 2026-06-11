import { Router } from 'express';
import aiService from '../services/AIService.js';
import materialService from '../services/MaterialService.js';
import type { Request, Response } from 'express';
import type { SmartCutOptions } from '../../shared/types.js';

const router = Router();

router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { materialId } = req.body;

    if (!materialId) {
      return res.status(400).json({ error: 'materialId is required' });
    }

    const material = materialService.getMaterial(materialId);
    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }

    const analysis = await materialService.analyzeMaterial(materialId);
    res.json({ materialId, analysis });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/smart-cut', async (req: Request, res: Response) => {
  try {
    const { materialIds, options } = req.body as {
      materialIds: string[];
      options?: SmartCutOptions;
    };

    if (!Array.isArray(materialIds) || materialIds.length === 0) {
      return res.status(400).json({ error: 'materialIds must be a non-empty array' });
    }

    const materials = [];
    for (const id of materialIds) {
      const material = materialService.getMaterial(id);
      if (material && material.status === 'ready') {
        if (!material.aiAnalysis) {
          try {
            await materialService.analyzeMaterial(id);
            const updated = materialService.getMaterial(id);
            if (updated) materials.push(updated);
          } catch (e) {
            materials.push(material);
          }
        } else {
          materials.push(material);
        }
      }
    }

    if (materials.length === 0) {
      return res.status(400).json({ error: 'No valid materials found' });
    }

    const timeline = aiService.generateSmartCut(materials, options);

    res.json({
      success: true,
      timeline,
      totalDuration: timeline.length > 0 ? timeline[timeline.length - 1].endTime : 0,
      clipCount: timeline.length,
    });
  } catch (error: any) {
    console.error('Smart cut error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/music-beat', async (req: Request, res: Response) => {
  try {
    const { audioId } = req.body;

    if (!audioId) {
      return res.status(400).json({ error: 'audioId is required' });
    }

    const material = materialService.getMaterial(audioId);
    if (!material) {
      return res.status(404).json({ error: 'Audio material not found' });
    }

    const beats = await aiService.analyzeMusicBeats(material.filePath);

    res.json({
      audioId,
      beats,
      beatCount: beats.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/align-beats', (req: Request, res: Response) => {
  try {
    const { clips, beats } = req.body;

    if (!Array.isArray(clips) || !Array.isArray(beats)) {
      return res.status(400).json({ error: 'clips and beats must be arrays' });
    }

    const alignedClips = aiService.alignClipsToBeats(clips, beats);

    res.json({
      success: true,
      clips: alignedClips,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/batch-color-grade', (req: Request, res: Response) => {
  try {
    const { style = 'cinematic' } = req.body;

    const filters = aiService.batchColorGrade([], style);

    res.json({
      success: true,
      style,
      filters,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/trim-ends', (req: Request, res: Response) => {
  try {
    const { materialId, trimStart = 0.5, trimEnd = 0.5 } = req.body;

    if (!materialId) {
      return res.status(400).json({ error: 'materialId is required' });
    }

    const material = materialService.getMaterial(materialId);
    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }

    const result = aiService.smartTrimEnds(material, trimStart, trimEnd);

    res.json({
      materialId,
      trimmedStart: result.start,
      trimmedEnd: result.end,
      newDuration: result.end - result.start,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
