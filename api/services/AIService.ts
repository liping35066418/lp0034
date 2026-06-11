import videoService from './VideoService.js';
import type { 
  Material, 
  TimelineClip, 
  Shot, 
  AIAnalysisResult,
  SmartCutOptions,
  TransitionConfig
} from '../../shared/types.js';
import { nanoid } from 'nanoid';

export class AIService {
  async analyzeMaterial(material: Material): Promise<AIAnalysisResult> {
    if (material.type === 'video') {
      return this.analyzeVideo(material);
    } else if (material.type === 'image') {
      return this.analyzeImage(material);
    }
    throw new Error(`Unsupported material type: ${material.type}`);
  }

  private async analyzeVideo(material: Material): Promise<AIAnalysisResult> {
    try {
      const scenes = await videoService.detectScenes(material.filePath, 0.25);
      const metadata = await videoService.getMetadata(material.filePath);

      const shots: Shot[] = [];
      
      if (scenes.length === 0) {
        const duration = metadata.duration;
        const segmentCount = Math.max(1, Math.floor(duration / 5));
        const segmentDuration = duration / segmentCount;

        for (let i = 0; i < segmentCount; i++) {
          shots.push({
            startTime: i * segmentDuration,
            endTime: (i + 1) * segmentDuration,
            duration: segmentDuration,
            score: 0.5 + Math.random() * 0.5,
          });
        }
      } else {
        let prevTime = 0;
        for (const scene of scenes) {
          const duration = scene.timestamp - prevTime;
          if (duration > 0.5) {
            shots.push({
              startTime: prevTime,
              endTime: scene.timestamp,
              duration,
              score: Math.min(1, scene.score),
            });
          }
          prevTime = scene.timestamp;
        }

        if (metadata.duration - prevTime > 0.5) {
          shots.push({
            startTime: prevTime,
            endTime: metadata.duration,
            duration: metadata.duration - prevTime,
            score: 0.6,
          });
        }
      }

      const quality = Math.min(1, (metadata.width * metadata.height * metadata.fps) / (1920 * 1080 * 30));
      const motionLevel = Math.min(1, scenes.length / Math.max(1, metadata.duration / 2));
      const brightness = 0.5 + Math.random() * 0.3;
      const colorfulness = 0.4 + Math.random() * 0.4;

      return {
        shots,
        quality,
        motionLevel,
        brightness,
        colorfulness,
      };
    } catch (error) {
      console.error('Video analysis failed:', error);
      return {
        shots: [{
          startTime: 0,
          endTime: material.duration || 5,
          duration: material.duration || 5,
          score: 0.5,
        }],
        quality: 0.5,
        motionLevel: 0.5,
        brightness: 0.5,
        colorfulness: 0.5,
      };
    }
  }

  private async analyzeImage(material: Material): Promise<AIAnalysisResult> {
    return {
      shots: [{
        startTime: 0,
        endTime: 5,
        duration: 5,
        score: 0.7,
      }],
      quality: 0.8,
      motionLevel: 0,
      brightness: 0.5 + Math.random() * 0.3,
      colorfulness: 0.5 + Math.random() * 0.3,
    };
  }

  generateSmartCut(
    materials: Material[],
    options: SmartCutOptions = {}
  ): TimelineClip[] {
    const {
      targetDuration = 60,
      enableTransition = true,
      enableColorCorrection = true,
    } = options;

    const clips: TimelineClip[] = [];
    let currentTime = 0;
    let totalDuration = 0;

    const videoMaterials = materials.filter(m => m.type === 'video' && m.aiAnalysis);
    const imageMaterials = materials.filter(m => m.type === 'image');

    const allMaterials = [...videoMaterials, ...imageMaterials];

    if (allMaterials.length === 0) {
      return [];
    }

    const targetClipDuration = Math.max(2, targetDuration / allMaterials.length);

    for (const material of allMaterials) {
      if (totalDuration >= targetDuration) break;

      let bestShot: Shot | null = null;
      let clipDuration = targetClipDuration;

      if (material.aiAnalysis && material.aiAnalysis.shots.length > 0) {
        const scoredShots = [...material.aiAnalysis.shots]
          .filter(s => s.duration >= 1)
          .sort((a, b) => b.score - a.score);

        if (scoredShots.length > 0) {
          bestShot = scoredShots[0];
          clipDuration = Math.min(targetClipDuration, bestShot.duration * 0.8);
        }
      }

      const sourceStart = bestShot ? bestShot.startTime + bestShot.duration * 0.1 : 0;
      const sourceEnd = Math.min(
        sourceStart + clipDuration,
        material.duration || sourceStart + 5
      );

      const actualDuration = sourceEnd - sourceStart;
      if (actualDuration < 0.5) continue;

      const clip: TimelineClip = {
        id: nanoid(),
        materialId: material.id,
        track: 0,
        startTime: currentTime,
        endTime: currentTime + actualDuration,
        sourceStartTime: sourceStart,
        sourceEndTime: sourceEnd,
        filters: [],
        speed: 1,
      };

      if (enableColorCorrection) {
        clip.filters = this.generateAutoFilters(material);
      }

      if (enableTransition && clips.length > 0) {
        clip.transition = this.generateTransition();
      }

      clips.push(clip);
      currentTime += actualDuration;
      totalDuration += actualDuration;
    }

    return this.autoTrimToTarget(clips, targetDuration);
  }

  private generateAutoFilters(material: Material) {
    const filters = [];

    if (material.aiAnalysis) {
      if (material.aiAnalysis.brightness < 0.4) {
        filters.push({
          type: 'brightness' as const,
          params: { value: 0.1 },
        });
      } else if (material.aiAnalysis.brightness > 0.7) {
        filters.push({
          type: 'brightness' as const,
          params: { value: -0.05 },
        });
      }

      if (material.aiAnalysis.colorfulness < 0.4) {
        filters.push({
          type: 'saturation' as const,
          params: { value: 1.2 },
        });
      }

      if (material.aiAnalysis.quality < 0.5) {
        filters.push({
          type: 'contrast' as const,
          params: { value: 1.1 },
        });
      }
    }

    return filters;
  }

  private generateTransition(): TransitionConfig {
    const types: Array<'fade' | 'dissolve' | 'wipe' | 'slide' | 'zoom'> = 
      ['fade', 'dissolve', 'wipe', 'slide', 'zoom'];
    const type = types[Math.floor(Math.random() * types.length)];

    return {
      type,
      duration: 0.5,
    };
  }

  private autoTrimToTarget(clips: TimelineClip[], targetDuration: number): TimelineClip[] {
    if (clips.length === 0) return clips;

    const totalDuration = clips[clips.length - 1].endTime;

    if (totalDuration <= targetDuration) {
      return clips;
    }

    const ratio = targetDuration / totalDuration;
    let currentTime = 0;

    return clips.map(clip => {
      const originalDuration = clip.endTime - clip.startTime;
      const newDuration = originalDuration * ratio;
      const sourceDuration = clip.sourceEndTime - clip.sourceStartTime;
      const newSourceDuration = sourceDuration * ratio;

      const newClip = {
        ...clip,
        startTime: currentTime,
        endTime: currentTime + newDuration,
        sourceEndTime: clip.sourceStartTime + newSourceDuration,
      };

      currentTime += newDuration;
      return newClip;
    });
  }

  analyzeMusicBeats(audioPath: string): Promise<number[]> {
    return new Promise((resolve) => {
      const beats: number[] = [];
      const beatInterval = 0.5 + Math.random() * 0.3;
      let time = 0;

      for (let i = 0; i < 120; i++) {
        beats.push(time);
        time += beatInterval * (0.8 + Math.random() * 0.4);
      }

      setTimeout(() => resolve(beats), 500);
    });
  }

  alignClipsToBeats(clips: TimelineClip[], beats: number[]): TimelineClip[] {
    if (beats.length === 0 || clips.length === 0) return clips;

    const result: TimelineClip[] = [];
    let beatIndex = 0;
    let currentTime = 0;

    for (const clip of clips) {
      const duration = clip.endTime - clip.startTime;

      while (beatIndex < beats.length && beats[beatIndex] <= currentTime + duration * 0.5) {
        beatIndex++;
      }

      let targetEndTime = currentTime + duration;
      if (beatIndex < beats.length && beats[beatIndex] < currentTime + duration * 1.3) {
        targetEndTime = beats[beatIndex];
        beatIndex++;
      }

      const newDuration = targetEndTime - currentTime;
      const speed = (clip.endTime - clip.startTime) / newDuration;

      result.push({
        ...clip,
        startTime: currentTime,
        endTime: targetEndTime,
        speed: Math.max(0.5, Math.min(2, speed)),
      });

      currentTime = targetEndTime;
    }

    return result;
  }

  smartTrimEnds(material: Material, trimStart: number = 0.5, trimEnd: number = 0.5): { start: number; end: number } {
    const duration = material.duration || 0;
    return {
      start: Math.min(trimStart, duration * 0.1),
      end: Math.max(0, duration - trimEnd),
    };
  }

  batchColorGrade(materials: Material[], style: string = 'cinematic') {
    const filterPresets: Record<string, Array<{ type: string; params: Record<string, any> }>> = {
      cinematic: [
        { type: 'contrast', params: { value: 1.2 } },
        { type: 'saturation', params: { value: 0.9 } },
        { type: 'brightness', params: { value: -0.03 } },
      ],
      warm: [
        { type: 'warm', params: {} },
        { type: 'saturation', params: { value: 1.1 } },
      ],
      cool: [
        { type: 'cool', params: {} },
        { type: 'contrast', params: { value: 1.05 } },
      ],
      vintage: [
        { type: 'vintage', params: {} },
        { type: 'vignette', params: { intensity: 0.4 } },
      ],
    };

    return filterPresets[style] || filterPresets.cinematic;
  }
}

export default new AIService();
