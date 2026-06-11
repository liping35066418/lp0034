import { Router } from 'express';
import uploadService from '../services/UploadService.js';
import type { Request, Response } from 'express';

const router = Router();

router.post('/init', (req: Request, res: Response) => {
  try {
    const { filename, totalSize } = req.body;

    if (!filename || !totalSize) {
      return res.status(400).json({ error: 'filename and totalSize are required' });
    }

    const result = uploadService.initUpload(filename, totalSize);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/chunk', (req: Request, res: Response) => {
  try {
    const sessionId = req.headers['x-session-id'] as string;
    const chunkIndexStr = req.headers['x-chunk-index'] as string;

    if (!sessionId || chunkIndexStr === undefined) {
      return res.status(400).json({ error: 'sessionId and chunkIndex are required' });
    }

    const chunkIndex = parseInt(chunkIndexStr, 10);
    if (isNaN(chunkIndex)) {
      return res.status(400).json({ error: 'Invalid chunkIndex' });
    }

    const chunks: Buffer[] = [];
    let totalLength = 0;

    req.on('data', (chunk) => {
      chunks.push(chunk);
      totalLength += chunk.length;
    });

    req.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks, totalLength);
        const result = await uploadService.uploadChunk(sessionId, chunkIndex, buffer);
        res.json(result);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    req.on('error', (err) => {
      res.status(500).json({ error: err.message });
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/merge', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const result = await uploadService.mergeChunks(sessionId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/status/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const status = uploadService.getUploadStatus(sessionId);

    if (!status) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const success = uploadService.cancelUpload(sessionId);

    if (!success) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
