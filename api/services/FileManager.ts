import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_ROOT = path.resolve(__dirname, '../../storage');

const PATHS = {
  source: {
    videos: path.join(STORAGE_ROOT, 'source/videos'),
    images: path.join(STORAGE_ROOT, 'source/images'),
    audio: path.join(STORAGE_ROOT, 'source/audio'),
  },
  temp: {
    renders: path.join(STORAGE_ROOT, 'temp/renders'),
    chunks: path.join(STORAGE_ROOT, 'temp/chunks'),
    thumbnails: path.join(STORAGE_ROOT, 'temp/thumbnails'),
  },
  output: {
    completed: path.join(STORAGE_ROOT, 'output/completed'),
  },
};

export function initStorage(): void {
  const allPaths = [
    PATHS.source.videos,
    PATHS.source.images,
    PATHS.source.audio,
    PATHS.temp.renders,
    PATHS.temp.chunks,
    PATHS.temp.thumbnails,
    PATHS.output.completed,
  ];

  for (const p of allPaths) {
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
    }
  }
}

export function getStoragePaths() {
  return PATHS;
}

export function getMaterialDir(type: 'video' | 'image' | 'audio'): string {
  const dirMap = {
    video: PATHS.source.videos,
    image: PATHS.source.images,
    audio: PATHS.source.audio,
  };
  return dirMap[type];
}

export function getChunkDir(sessionId: string): string {
  const dir = path.join(PATHS.temp.chunks, sessionId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getRenderTempDir(taskId: string): string {
  const dir = path.join(PATHS.temp.renders, taskId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getThumbnailPath(materialId: string): string {
  return path.join(PATHS.temp.thumbnails, `${materialId}.jpg`);
}

export function getOutputPath(taskId: string, format: string): string {
  return path.join(PATHS.output.completed, `${taskId}.${format}`);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

export function cleanupTempFiles(dir: string, maxAgeMs: number = 24 * 60 * 60 * 1000): void {
  if (!fs.existsSync(dir)) return;
  
  const now = Date.now();
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > maxAgeMs) {
        if (stat.isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(filePath);
        }
      }
    } catch (e) {
      // ignore cleanup errors
    }
  }
}

export default {
  initStorage,
  getStoragePaths,
  getMaterialDir,
  getChunkDir,
  getRenderTempDir,
  getThumbnailPath,
  getOutputPath,
  formatFileSize,
  formatDuration,
  cleanupTempFiles,
};
