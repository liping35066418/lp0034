import fs from 'fs';
import path from 'path';
import { getChunkDir, getMaterialDir } from './FileManager.js';
import materialService from './MaterialService.js';
import type { MaterialType } from '../../shared/types.js';
import { SUPPORTED_VIDEO_FORMATS, SUPPORTED_IMAGE_FORMATS, SUPPORTED_AUDIO_FORMATS, CHUNK_SIZE } from '../../shared/types.js';

export interface ChunkUploadResult {
  success: boolean;
  uploadedChunks: number;
  totalChunks: number;
}

export interface MergeResult {
  success: boolean;
  materialId?: string;
  message?: string;
}

class UploadService {
  private sessions: Map<string, {
    filename: string;
    totalSize: number;
    totalChunks: number;
    uploadedChunks: Set<number>;
    status: 'active' | 'completed' | 'error';
    createdAt: number;
  }> = new Map();

  initUpload(filename: string, totalSize: number): {
    sessionId: string;
    totalChunks: number;
    chunkSize: number;
  } {
    const sessionId = crypto.randomUUID();
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

    this.sessions.set(sessionId, {
      filename,
      totalSize,
      totalChunks,
      uploadedChunks: new Set(),
      status: 'active',
      createdAt: Date.now(),
    });

    const chunkDir = getChunkDir(sessionId);
    if (!fs.existsSync(chunkDir)) {
      fs.mkdirSync(chunkDir, { recursive: true });
    }

    return {
      sessionId,
      totalChunks,
      chunkSize: CHUNK_SIZE,
    };
  }

  async uploadChunk(
    sessionId: string,
    chunkIndex: number,
    chunkBuffer: Buffer
  ): Promise<ChunkUploadResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Upload session not found');
    }

    if (session.status !== 'active') {
      throw new Error(`Upload session is ${session.status}`);
    }

    const chunkDir = getChunkDir(sessionId);
    const chunkPath = path.join(chunkDir, `chunk-${chunkIndex.toString().padStart(6, '0')}`);

    await fs.promises.writeFile(chunkPath, chunkBuffer);

    session.uploadedChunks.add(chunkIndex);

    return {
      success: true,
      uploadedChunks: session.uploadedChunks.size,
      totalChunks: session.totalChunks,
    };
  }

  async mergeChunks(sessionId: string): Promise<MergeResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, message: 'Upload session not found' };
    }

    if (session.uploadedChunks.size !== session.totalChunks) {
      return {
        success: false,
        message: `Missing chunks: ${session.totalChunks - session.uploadedChunks.size}`,
      };
    }

    try {
      const ext = path.extname(session.filename).slice(1).toLowerCase();
      const materialType = this.getMaterialType(ext);

      if (!materialType) {
        return { success: false, message: `Unsupported file format: ${ext}` };
      }

      const outputDir = getMaterialDir(materialType);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const outputFileName = `${sessionId}${path.extname(session.filename)}`;
      const outputPath = path.join(outputDir, outputFileName);

      await this.mergeChunkFiles(sessionId, session.totalChunks, outputPath);

      const material = await materialService.createMaterial(
        session.filename,
        outputPath,
        materialType,
        session.totalSize
      );

      this.cleanupSession(sessionId);

      return {
        success: true,
        materialId: material.id,
      };
    } catch (error: any) {
      session.status = 'error';
      return { success: false, message: error.message };
    }
  }

  private async mergeChunkFiles(
    sessionId: string,
    totalChunks: number,
    outputPath: string
  ): Promise<void> {
    const chunkDir = getChunkDir(sessionId);
    const writeStream = fs.createWriteStream(outputPath);

    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(chunkDir, `chunk-${i.toString().padStart(6, '0')}`);
      const chunkBuffer = await fs.promises.readFile(chunkPath);
      await new Promise<void>((resolve, reject) => {
        writeStream.write(chunkBuffer, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.end((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private cleanupSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const chunkDir = getChunkDir(sessionId);
    try {
      if (fs.existsSync(chunkDir)) {
        fs.rmSync(chunkDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn('Failed to cleanup chunk directory:', err);
    }

    this.sessions.delete(sessionId);
  }

  getUploadStatus(sessionId: string): {
    uploadedChunks: number;
    totalChunks: number;
    status: string;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      uploadedChunks: session.uploadedChunks.size,
      totalChunks: session.totalChunks,
      status: session.status,
    };
  }

  cancelUpload(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.status = 'error';
    this.cleanupSession(sessionId);
    return true;
  }

  private getMaterialType(ext: string): MaterialType | null {
    if (SUPPORTED_VIDEO_FORMATS.includes(ext)) return 'video';
    if (SUPPORTED_IMAGE_FORMATS.includes(ext)) return 'image';
    if (SUPPORTED_AUDIO_FORMATS.includes(ext)) return 'audio';
    return null;
  }

  cleanupOldSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.createdAt > maxAgeMs && session.status === 'active') {
        this.cleanupSession(sessionId);
      }
    }
  }
}

export default new UploadService();
