import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { getThumbnailPath, getRenderTempDir, getOutputPath } from './FileManager.js';
import type { OutputSettings, TimelineClip, FilterConfig, TransitionConfig } from '../../shared/types.js';

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  codec: string;
  format: string;
  size: number;
}

export interface FrameExtractionOptions {
  count?: number;
  interval?: number;
  timestamps?: number[];
}

export class VideoService {
  async getMetadata(filePath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) return reject(err);

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        if (!videoStream) {
          return reject(new Error('No video stream found'));
        }

        const fpsStr = videoStream.r_frame_rate || '30/1';
        const [num, den] = fpsStr.split('/').map(Number);
        const fps = num / den;

        resolve({
          duration: metadata.format.duration || 0,
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          fps,
          bitrate: metadata.format.bit_rate ? Number(metadata.format.bit_rate) : 0,
          codec: videoStream.codec_name || '',
          format: metadata.format.format_name || '',
          size: metadata.format.size ? Number(metadata.format.size) : 0,
        });
      });
    });
  }

  async extractThumbnail(videoPath: string, materialId: string, time: number = 1): Promise<string> {
    const outputPath = getThumbnailPath(materialId);

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: [time],
          filename: path.basename(outputPath),
          folder: path.dirname(outputPath),
          size: '320x?',
        })
        .on('end', () => resolve(outputPath))
        .on('error', (err) => reject(err));
    });
  }

  async extractFrames(
    videoPath: string,
    outputDir: string,
    options: FrameExtractionOptions = {}
  ): Promise<string[]> {
    const { count = 10 } = options;

    return new Promise((resolve, reject) => {
      const frames: string[] = [];
      const pattern = path.join(outputDir, 'frame-%04d.jpg');

      ffmpeg(videoPath)
        .outputOptions([
          `-vf fps=${count}/10`,
          '-q:v 2',
        ])
        .output(pattern)
        .on('end', () => {
          try {
            const files = fs.readdirSync(outputDir)
              .filter(f => f.startsWith('frame-'))
              .sort()
              .map(f => path.join(outputDir, f));
            resolve(files);
          } catch (e) {
            reject(e);
          }
        })
        .on('error', (err) => reject(err))
        .run();
    });
  }

  async trimVideo(
    inputPath: string,
    outputPath: string,
    startTime: number,
    duration: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .outputOptions(['-c copy', '-avoid_negative_ts 1'])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  async renderTimeline(
    clips: TimelineClip[],
    materials: Map<string, { filePath: string; type: string }>,
    outputSettings: OutputSettings,
    taskId: string,
    onProgress: (progress: number, stage: string) => void
  ): Promise<string> {
    const tempDir = getRenderTempDir(taskId);
    const outputPath = getOutputPath(taskId, outputSettings.format);

    const segmentPaths: string[] = [];

    onProgress(5, 'analyzing');

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const material = materials.get(clip.materialId);
      if (!material) continue;

      const segmentPath = path.join(tempDir, `segment-${i.toString().padStart(4, '0')}.mp4`);
      const clipDuration = clip.sourceEndTime - clip.sourceStartTime;

      onProgress(5 + (i / clips.length) * 30, 'processing');

      if (material.type === 'video') {
        await this.processVideoSegment(
          material.filePath,
          segmentPath,
          clip.sourceStartTime,
          clipDuration,
          outputSettings,
          clip.filters,
          clip.speed
        );
      } else if (material.type === 'image') {
        await this.processImageSegment(
          material.filePath,
          segmentPath,
          clipDuration,
          outputSettings,
          clip.filters
        );
      }

      segmentPaths.push(segmentPath);
    }

    onProgress(40, 'encoding');

    const concatListPath = path.join(tempDir, 'concat-list.txt');
    const listContent = segmentPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(concatListPath, listContent);

    await this.concatVideos(concatListPath, outputPath, outputSettings, (progress) => {
      onProgress(40 + progress * 0.55, 'encoding');
    });

    onProgress(95, 'finalizing');

    if (clips.some(c => c.transition && c.transition.type !== 'none')) {
      await this.applyTransitions(outputPath, clips, outputSettings, tempDir);
    }

    onProgress(100, 'finalizing');

    return outputPath;
  }

  private async processVideoSegment(
    inputPath: string,
    outputPath: string,
    startTime: number,
    duration: number,
    settings: OutputSettings,
    filters: FilterConfig[],
    speed: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration);

      const vfFilters: string[] = [];

      if (speed !== 1) {
        vfFilters.push(`setpts=${1 / speed}*PTS`);
      }

      vfFilters.push(`scale=${settings.width}:${settings.height}:force_original_aspect_ratio=decrease,pad=${settings.width}:${settings.height}:(ow-iw)/2:(oh-ih)/2:black`);

      for (const filter of filters) {
        vfFilters.push(this.filterToFfmpegString(filter));
      }

      if (vfFilters.length > 0) {
        command = command.outputOptions(['-vf', vfFilters.join(',')]);
      }

      command
        .outputOptions([
          `-r ${settings.fps}`,
          `-b:v ${settings.bitrate}k`,
          '-c:v libx264',
          '-preset fast',
          '-pix_fmt yuv420p',
          '-an',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  private async processImageSegment(
    inputPath: string,
    outputPath: string,
    duration: number,
    settings: OutputSettings,
    filters: FilterConfig[]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .inputOptions([`-t ${duration}`, '-loop 1']);

      const vfFilters: string[] = [];
      vfFilters.push(`scale=${settings.width}:${settings.height}:force_original_aspect_ratio=decrease,pad=${settings.width}:${settings.height}:(ow-iw)/2:(oh-ih)/2:black`);

      for (const filter of filters) {
        vfFilters.push(this.filterToFfmpegString(filter));
      }

      command
        .outputOptions([
          `-vf ${vfFilters.join(',')}`,
          `-r ${settings.fps}`,
          `-t ${duration}`,
          `-b:v ${settings.bitrate}k`,
          '-c:v libx264',
          '-preset fast',
          '-pix_fmt yuv420p',
          '-an',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  private async concatVideos(
    listPath: string,
    outputPath: string,
    settings: OutputSettings,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let totalDuration = 0;

      const command = ffmpeg()
        .input(listPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions([
          '-c copy',
          '-movflags +faststart',
        ])
        .output(outputPath)
        .on('start', () => {
          if (onProgress) onProgress(0);
        })
        .on('progress', (progress) => {
          if (onProgress && progress.percent !== undefined) {
            onProgress(progress.percent / 100);
          }
        })
        .on('end', () => {
          if (onProgress) onProgress(1);
          resolve();
        })
        .on('error', (err) => reject(err));

      command.run();
    });
  }

  private async applyTransitions(
    outputPath: string,
    clips: TimelineClip[],
    settings: OutputSettings,
    tempDir: string
  ): Promise<void> {
    // 简化：对于有转场的情况，使用 xfade 滤镜重新编码
    // 实际项目中应该在合并时就应用转场
    return Promise.resolve();
  }

  private filterToFfmpegString(filter: FilterConfig): string {
    const { type, params } = filter;

    switch (type) {
      case 'brightness':
        return `eq=brightness=${params.value || 0}`;
      case 'contrast':
        return `eq=contrast=${params.value || 1}`;
      case 'saturation':
        return `eq=saturation=${params.value || 1}`;
      case 'grayscale':
        return 'hue=s=0';
      case 'sepia':
        return 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131';
      case 'vignette':
        return `vignette=${params.intensity || 0.5}`;
      case 'warm':
        return 'colorbalance=rs=0.1:gs=0.05:bs=-0.05';
      case 'cool':
        return 'colorbalance=rs=-0.05:gs=0:bs=0.1';
      case 'cinematic':
        return 'eq=contrast=1.2:saturation=0.9:brightness=-0.05';
      case 'vintage':
        return 'eq=contrast=1.1:saturation=0.7,colorchannelmixer=.9:.7:.3:0:.7:.9:.4:0:.5:.6:.8';
      default:
        return '';
    }
  }

  async validateVideo(filePath: string): Promise<boolean> {
    try {
      const metadata = await this.getMetadata(filePath);
      return metadata.duration > 0 && metadata.width > 0 && metadata.height > 0;
    } catch {
      return false;
    }
  }

  async detectScenes(videoPath: string, threshold: number = 0.3): Promise<{ timestamp: number; score: number }[]> {
    return new Promise((resolve, reject) => {
      const scenes: { timestamp: number; score: number }[] = [];

      ffmpeg(videoPath)
        .outputOptions([
          '-vf', `select='gt(scene,${threshold})',showinfo`,
          '-f', 'null',
        ])
        .output('-')
        .on('stderr', (stderrLine) => {
          const ptsTimeMatch = stderrLine.match(/pts_time:([\d.]+)/);
          const sceneMatch = stderrLine.match(/scene:([\d.]+)/);
          if (ptsTimeMatch && sceneMatch) {
            scenes.push({
              timestamp: parseFloat(ptsTimeMatch[1]),
              score: parseFloat(sceneMatch[1]),
            });
          }
        })
        .on('end', () => resolve(scenes))
        .on('error', (err) => reject(err))
        .run();
    });
  }
}

export default new VideoService();
