import materialRepository from './MaterialRepository.js';
import videoService from './VideoService.js';
import aiService from './AIService.js';
import fileManager from './FileManager.js';
import fs from 'fs';
import path from 'path';
import type { Material, MaterialType, MaterialStatus, AIAnalysisResult } from '../../shared/types.js';
import { nanoid } from 'nanoid';

export class MaterialService {
  async createMaterial(
    fileName: string,
    filePath: string,
    type: MaterialType,
    size: number
  ): Promise<Material> {
    const ext = path.extname(fileName).slice(1).toLowerCase();
    const name = path.basename(fileName, path.extname(fileName));

    const material = materialRepository.create({
      name,
      type,
      size,
      format: ext,
      filePath,
      status: 'processing',
    });

    this.processMaterial(material.id).catch(err => {
      console.error('Material processing failed:', err);
      materialRepository.updateStatus(material.id, 'error');
    });

    return material;
  }

  private async processMaterial(id: string): Promise<void> {
    const material = materialRepository.findById(id);
    if (!material) return;

    try {
      if (material.type === 'video') {
        const metadata = await videoService.getMetadata(material.filePath);

        materialRepository.update(id, {
          duration: metadata.duration,
          width: metadata.width,
          height: metadata.height,
          fps: metadata.fps,
        });

        const thumbnailTime = Math.min(1, metadata.duration * 0.1);
        try {
          const thumbnailPath = await videoService.extractThumbnail(
            material.filePath,
            id,
            thumbnailTime
          );
          materialRepository.update(id, { thumbnailPath });
        } catch (thumbErr) {
          console.warn('Thumbnail extraction failed:', thumbErr);
        }

        const isValid = await videoService.validateVideo(material.filePath);
        if (!isValid) {
          materialRepository.updateStatus(id, 'error');
          return;
        }
      } else if (material.type === 'image') {
        const size = await this.getImageSize(material.filePath);
        if (size) {
          materialRepository.update(id, {
            width: size.width,
            height: size.height,
            duration: 5,
          });
        }
      }

      materialRepository.updateStatus(id, 'ready');
    } catch (error) {
      console.error('Material processing error:', error);
      materialRepository.updateStatus(id, 'error');
    }
  }

  private async getImageSize(filePath: string): Promise<{ width: number; height: number } | null> {
    return new Promise((resolve) => {
      import('sharp')
        .then(({ default: sharp }) => {
          sharp(filePath)
            .metadata()
            .then(meta => {
              if (meta.width && meta.height) {
                resolve({ width: meta.width, height: meta.height });
              } else {
                resolve({ width: 1920, height: 1080 });
              }
            })
            .catch(() => resolve({ width: 1920, height: 1080 }));
        })
        .catch(() => resolve({ width: 1920, height: 1080 }));
    });
  }

  async analyzeMaterial(id: string): Promise<AIAnalysisResult> {
    const material = materialRepository.findById(id);
    if (!material) {
      throw new Error('Material not found');
    }

    if (material.aiAnalysis) {
      return material.aiAnalysis;
    }

    materialRepository.updateStatus(id, 'processing');

    try {
      const analysis = await aiService.analyzeMaterial(material);
      materialRepository.updateAiAnalysis(id, analysis);
      materialRepository.updateStatus(id, 'ready');
      return analysis;
    } catch (error) {
      materialRepository.updateStatus(id, 'error');
      throw error;
    }
  }

  getMaterial(id: string): Material | null {
    return materialRepository.findById(id);
  }

  listMaterials(type?: MaterialType): Material[] {
    return materialRepository.findAll(type);
  }

  async deleteMaterial(id: string): Promise<boolean> {
    const material = materialRepository.findById(id);
    if (!material) return false;

    try {
      if (fs.existsSync(material.filePath)) {
        fs.unlinkSync(material.filePath);
      }

      const thumbnailPath = fileManager.getThumbnailPath(id);
      if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath);
      }
    } catch (err) {
      console.warn('Failed to delete material files:', err);
    }

    return materialRepository.delete(id);
  }

  async bulkAnalyze(ids: string[]): Promise<Map<string, AIAnalysisResult>> {
    const results = new Map<string, AIAnalysisResult>();

    for (const id of ids) {
      try {
        const analysis = await this.analyzeMaterial(id);
        results.set(id, analysis);
      } catch (err) {
        console.warn(`Analysis failed for material ${id}:`, err);
      }
    }

    return results;
  }

  getMaterialFilePath(id: string): string | null {
    const material = materialRepository.findById(id);
    return material ? material.filePath : null;
  }
}

export default new MaterialService();
