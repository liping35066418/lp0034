import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { getThumbnailPath, getRenderTempDir, getOutputPath } from './FileManager.js';
import type { 
  OutputSettings, 
  TimelineClip, 
  FilterConfig, 
  TransitionConfig,
  TimelineData,
  BackgroundMusicTrack
} from '../../shared/types.js';

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

type FfmpegCommand = ReturnType<typeof ffmpeg>;

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

  private trackFfmpegPid(
    command: FfmpegCommand,
    onPidStart?: (pid: number) => void,
    onPidEnd?: (pid: number) => void
  ): void {
    (command as any).on('start', (commandLine: string) => {
      const pid = (command as any).ffmpegProc?.pid;
      if (pid && onPidStart) onPidStart(pid);
    });
    command.on('end', () => {
      const pid = (command as any).ffmpegProc?.pid;
      if (pid && onPidEnd) onPidEnd(pid);
    });
    command.on('error', () => {
      const pid = (command as any).ffmpegProc?.pid;
      if (pid && onPidEnd) onPidEnd(pid);
    });
  }

  private checkCancelled(
    isCancelled: () => boolean,
    command: FfmpegCommand,
    reject: (err: Error) => void
  ): void {
    if (!isCancelled()) return;
    try {
      const pid = (command as any).ffmpegProc?.pid;
      if (pid) process.kill(pid, 'SIGTERM');
    } catch {}
    reject(new Error('Render cancelled'));
  }

  async renderTimeline(
    timeline: TimelineData | TimelineClip[],
    materials: Map<string, { filePath: string; type: string }>,
    outputSettings: OutputSettings,
    taskId: string,
    onProgress: (progress: number, stage: string) => void,
    isCancelled?: () => boolean,
    isPaused?: () => boolean,
    onFfmpegStart?: (pid: number) => void,
    onFfmpegEnd?: (pid: number) => void
  ): Promise<string> {
    const tempDir = getRenderTempDir(taskId);
    const outputPath = getOutputPath(taskId, outputSettings.format);

    const clips: TimelineClip[] = Array.isArray(timeline) ? timeline : (timeline.clips || []);
    const backgroundMusic: BackgroundMusicTrack[] = Array.isArray(timeline) ? [] : (timeline.backgroundMusic || []);
    const masterVolume = Array.isArray(timeline) ? 1 : (timeline.masterVolume ?? 1);

    onProgress(5, 'analyzing');

    const hasAnyTransition = clips.some(c => c.transition && c.transition.type !== 'none' && c.transition.duration > 0);

    const segmentPaths: string[] = [];
    const segmentDurations: number[] = [];
    const segmentTransitions: (TransitionConfig | undefined)[] = [];
    const hasAudioList: boolean[] = [];

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const material = materials.get(clip.materialId);
      if (!material) {
        throw new Error(`Material ${clip.materialId} not found`);
      }

      const segmentPath = path.join(tempDir, `segment-${i.toString().padStart(4, '0')}.mp4`);
      const clipDuration = clip.sourceEndTime - clip.sourceStartTime;

      onProgress(5 + (i / clips.length) * 30, 'processing');

      if (isCancelled?.()) throw new Error('Render cancelled');

      if (material.type === 'video') {
        await this.processVideoSegment(
          material.filePath,
          segmentPath,
          clip.sourceStartTime,
          clipDuration,
          outputSettings,
          clip.filters,
          clip.speed,
          clip.volume,
          isCancelled,
          onFfmpegStart,
          onFfmpegEnd
        );
        hasAudioList.push(true);
      } else if (material.type === 'image') {
        await this.processImageSegment(
          material.filePath,
          segmentPath,
          clipDuration,
          outputSettings,
          clip.filters,
          isCancelled,
          onFfmpegStart,
          onFfmpegEnd
        );
        hasAudioList.push(false);
      } else {
        continue;
      }

      segmentPaths.push(segmentPath);
      segmentDurations.push(clipDuration / (clip.speed || 1));
      segmentTransitions.push(clip.transition);
    }

    if (segmentPaths.length === 0) {
      throw new Error('No valid segments to render');
    }

    onProgress(40, 'encoding');

    let concatVideoPath: string;
    let concatAudioPath: string | null = null;
    const hasAnyAudio = hasAudioList.some(v => v);

    if (hasAnyTransition) {
      onProgress(42, 'applying transitions');
      const transitionResult = await this.concatWithTransitions(
        segmentPaths,
        segmentDurations,
        segmentTransitions,
        hasAudioList,
        tempDir,
        outputSettings,
        (p) => onProgress(42 + p * 50, 'applying transitions'),
        isCancelled,
        onFfmpegStart,
        onFfmpegEnd
      );
      concatVideoPath = transitionResult.videoPath;
      concatAudioPath = transitionResult.audioPath;
    } else {
      onProgress(42, 'concatenating');
      const concatListPath = path.join(tempDir, 'concat-list.txt');
      const listContent = segmentPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
      fs.writeFileSync(concatListPath, listContent);

      concatVideoPath = path.join(tempDir, 'concat-intermediate.mp4');
      await this.concatVideosSimple(
        concatListPath,
        concatVideoPath,
        outputSettings,
        (p) => onProgress(42 + p * 50, 'concatenating'),
        isCancelled,
        onFfmpegStart,
        onFfmpegEnd
      );

      if (hasAnyAudio) {
        concatAudioPath = concatVideoPath;
      }
    }

    onProgress(92, 'mixing audio');

    const bgmFilePaths: { track: BackgroundMusicTrack; filePath: string }[] = [];
    for (const track of backgroundMusic) {
      const mat = materials.get(track.materialId);
      if (mat) bgmFilePaths.push({ track, filePath: mat.filePath });
    }

    await this.finalMix(
      concatVideoPath,
      concatAudioPath,
      bgmFilePaths,
      masterVolume,
      outputSettings,
      outputPath,
      (p) => onProgress(92 + p * 7, 'mixing audio'),
      isCancelled,
      onFfmpegStart,
      onFfmpegEnd
    );

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
    speed: number,
    volume: number = 1,
    isCancelled?: () => boolean,
    onFfmpegStart?: (pid: number) => void,
    onFfmpegEnd?: (pid: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration);

      const vfFilters: string[] = [];
      const afFilters: string[] = [];

      if (speed !== 1) {
        vfFilters.push(`setpts=${1 / speed}*PTS`);
        afFilters.push(`atempo=${speed}`);
      }

      if (volume !== 1) {
        afFilters.push(`volume=${volume}`);
      }

      vfFilters.push(`scale=${settings.width}:${settings.height}:force_original_aspect_ratio=decrease,pad=${settings.width}:${settings.height}:(ow-iw)/2:(oh-ih)/2:black,fps=${settings.fps}`);

      for (const filter of filters) {
        vfFilters.push(this.filterToFfmpegString(filter));
      }

      if (vfFilters.length > 0) {
        command = command.outputOptions(['-vf', vfFilters.join(',')]);
      }

      if (afFilters.length > 0) {
        command = command.outputOptions(['-af', afFilters.join(',')]);
      }

      command
        .outputOptions([
          `-b:v ${settings.bitrate}k`,
          '-c:v libx264',
          '-preset fast',
          '-pix_fmt yuv420p',
          '-c:a aac',
          '-b:a 192k',
          '-ar 44100',
          '-ac 2',
          '-movflags +faststart',
        ])
        .output(outputPath);

      this.trackFfmpegPid(command, onFfmpegStart, onFfmpegEnd);

      command
        .on('end', () => {
          if (isCancelled?.()) return reject(new Error('Render cancelled'));
          resolve();
        })
        .on('error', (err) => reject(err))
        .run();
    });
  }

  private async processImageSegment(
    inputPath: string,
    outputPath: string,
    duration: number,
    settings: OutputSettings,
    filters: FilterConfig[],
    isCancelled?: () => boolean,
    onFfmpegStart?: (pid: number) => void,
    onFfmpegEnd?: (pid: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const vfFilters: string[] = [];
      vfFilters.push(`scale=${settings.width}:${settings.height}:force_original_aspect_ratio=decrease,pad=${settings.width}:${settings.height}:(ow-iw)/2:(oh-ih)/2:black,fps=${settings.fps}`);

      for (const filter of filters) {
        vfFilters.push(this.filterToFfmpegString(filter));
      }

      const command = ffmpeg(inputPath)
        .inputOptions([`-t ${duration}`, '-loop 1'])
        .outputOptions([
          `-vf ${vfFilters.join(',')}`,
          `-t ${duration}`,
          `-b:v ${settings.bitrate}k`,
          '-c:v libx264',
          '-preset fast',
          '-pix_fmt yuv420p',
          '-an',
          '-movflags +faststart',
        ])
        .output(outputPath);

      this.trackFfmpegPid(command, onFfmpegStart, onFfmpegEnd);

      command
        .on('end', () => {
          if (isCancelled?.()) return reject(new Error('Render cancelled'));
          resolve();
        })
        .on('error', (err) => reject(err))
        .run();
    });
  }

  private async concatVideosSimple(
    listPath: string,
    outputPath: string,
    settings: OutputSettings,
    onProgress?: (progress: number) => void,
    isCancelled?: () => boolean,
    onFfmpegStart?: (pid: number) => void,
    onFfmpegEnd?: (pid: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg()
        .input(listPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions([
          '-c:v libx264',
          '-c:a aac',
          '-b:a 192k',
          '-ar 44100',
          '-ac 2',
          '-preset fast',
          '-pix_fmt yuv420p',
          '-movflags +faststart',
        ])
        .output(outputPath)
        .on('start', () => {
          if (onProgress) onProgress(0);
        })
        .on('progress', (progress) => {
          if (onProgress && progress.percent !== undefined) {
            onProgress(Math.min(1, progress.percent / 100));
          }
          if (isCancelled?.()) this.checkCancelled(isCancelled, command, reject);
        })
        .on('end', () => {
          if (onProgress) onProgress(1);
          if (isCancelled?.()) return reject(new Error('Render cancelled'));
          resolve();
        })
        .on('error', (err) => reject(err));

      this.trackFfmpegPid(command, onFfmpegStart, onFfmpegEnd);
      command.run();
    });
  }

  private transitionToXfade(transition: TransitionConfig | undefined): { name: string; opts: string } {
    if (!transition || transition.type === 'none') {
      return { name: 'fade', opts: 'duration=0:offset=0' };
    }
    const d = Math.max(0.01, transition.duration || 0.5);
    switch (transition.type) {
      case 'fade':
      case 'dissolve':
        return { name: 'dissolve', opts: `duration=${d}` };
      case 'wipe':
        return { name: 'wipeleft', opts: `duration=${d}` };
      case 'slide':
        return { name: 'slideleft', opts: `duration=${d}` };
      case 'zoom':
        return { name: 'fadeblack', opts: `duration=${d}` };
      default:
        return { name: 'dissolve', opts: `duration=${d}` };
    }
  }

  private async concatWithTransitions(
    segmentPaths: string[],
    segmentDurations: number[],
    segmentTransitions: (TransitionConfig | undefined)[],
    hasAudioList: boolean[],
    tempDir: string,
    settings: OutputSettings,
    onProgress?: (progress: number) => void,
    isCancelled?: () => boolean,
    onFfmpegStart?: (pid: number) => void,
    onFfmpegEnd?: (pid: number) => void
  ): Promise<{ videoPath: string; audioPath: string | null }> {
    return new Promise((resolve, reject) => {
      if (segmentPaths.length === 0) {
        return reject(new Error('No segments'));
      }
      if (segmentPaths.length === 1) {
        return resolve({ videoPath: segmentPaths[0], audioPath: hasAudioList[0] ? segmentPaths[0] : null });
      }

      const outputVideoPath = path.join(tempDir, 'transition-output.mp4');
      const n = segmentPaths.length;

      let command = ffmpeg();
      for (const p of segmentPaths) {
        command = command.input(p);
      }

      const filterComplex: string[] = [];
      const videoLabels: string[] = [];
      const audioLabels: string[] = [];

      let videoCursor = segmentDurations[0];
      filterComplex.push(`[0:v]settb=AVTB,fps=${settings.fps},setpts=PTS-STARTPTS[v0]`);
      videoLabels.push('v0');

      const hasAnyAudio = hasAudioList.some(v => v);
      if (hasAnyAudio) {
        if (hasAudioList[0]) {
          filterComplex.push(`[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,asetpts=PTS-STARTPTS[a0]`);
        } else {
          filterComplex.push(`aevalsrc=0:d=${segmentDurations[0]},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a0]`);
        }
        audioLabels.push('a0');
      }

      for (let i = 1; i < n; i++) {
        const prevLabel = videoLabels[i - 1];
        const curRaw = `cur${i}`;
        const nextLabel = `v${i}`;

        filterComplex.push(`[${i}:v]settb=AVTB,fps=${settings.fps},setpts=PTS-STARTPTS[${curRaw}]`);

        const transition = segmentTransitions[i];
        const { name: xfadeName, opts: xfadeOpts } = this.transitionToXfade(transition);
        const duration = transition && transition.type !== 'none' ? Math.max(0.01, transition.duration) : 0.01;

        const offset = Math.max(0, videoCursor - duration);
        filterComplex.push(`[${prevLabel}][${curRaw}]xfade=transition=${xfadeName}:${xfadeOpts}:offset=${offset}[${nextLabel}]`);
        videoLabels.push(nextLabel);
        videoCursor = videoCursor + segmentDurations[i] - duration;

        if (hasAnyAudio) {
          const prevALabel = audioLabels[i - 1];
          const curARaw = `cura${i}`;
          const nextALabel = `a${i}`;

          if (hasAudioList[i]) {
            filterComplex.push(`[${i}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,asetpts=PTS-STARTPTS[${curARaw}]`);
          } else {
            filterComplex.push(`aevalsrc=0:d=${segmentDurations[i]},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[${curARaw}]`);
          }

          const acrossfadeD = duration > 0.5 ? 0.5 : duration;
          const aoffset = Math.max(0, offset);
          filterComplex.push(`[${prevALabel}][${curARaw}]acrossfade=d=${acrossfadeD}:c1=tri:c2=tri:o=1[${nextALabel}]`);
          audioLabels.push(nextALabel);
        }
      }

      const outVideoLabel = videoLabels[videoLabels.length - 1];
      const outAudioLabel = hasAnyAudio ? audioLabels[audioLabels.length - 1] : null;

      command = command
        .complexFilter(filterComplex)
        .outputOptions([
          `-map [${outVideoLabel}]`,
          '-c:v libx264',
          `-b:v ${settings.bitrate}k`,
          '-preset fast',
          '-pix_fmt yuv420p',
          '-r ' + settings.fps,
          '-movflags +faststart',
        ]);

      if (outAudioLabel) {
        command = command.outputOptions([
          `-map [${outAudioLabel}]`,
          '-c:a aac',
          '-b:a 192k',
          '-ar 44100',
          '-ac 2',
        ]);
      } else {
        command = command.outputOptions(['-an']);
      }

      command = command.output(outputVideoPath)
        .on('start', () => {
          if (onProgress) onProgress(0);
        })
        .on('progress', (progress) => {
          if (onProgress && progress.percent !== undefined) {
            onProgress(Math.min(1, progress.percent / 100));
          }
          if (isCancelled?.()) this.checkCancelled(isCancelled, command, reject);
        })
        .on('end', () => {
          if (onProgress) onProgress(1);
          if (isCancelled?.()) return reject(new Error('Render cancelled'));
          resolve({
            videoPath: outputVideoPath,
            audioPath: outAudioLabel ? outputVideoPath : null,
          });
        })
        .on('error', (err) => reject(err));

      this.trackFfmpegPid(command, onFfmpegStart, onFfmpegEnd);
      command.run();
    });
  }

  private async finalMix(
    videoPath: string,
    audioPath: string | null,
    bgmTracks: { track: BackgroundMusicTrack; filePath: string }[],
    masterVolume: number,
    settings: OutputSettings,
    outputPath: string,
    onProgress?: (progress: number) => void,
    isCancelled?: () => boolean,
    onFfmpegStart?: (pid: number) => void,
    onFfmpegEnd?: (pid: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const hasBgm = bgmTracks.length > 0;
      const hasMainAudio = !!audioPath;

      if (!hasBgm && hasMainAudio && videoPath === audioPath && masterVolume === 1) {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        fs.copyFileSync(videoPath, outputPath);
        if (onProgress) onProgress(1);
        return resolve();
      }

      let command = ffmpeg(videoPath);
      const inputs: string[] = [videoPath];
      const filterComplex: string[] = [];

      let mainAudioLabel: string | null = null;

      if (hasMainAudio) {
        if (audioPath !== videoPath) {
          command = command.input(audioPath);
          inputs.push(audioPath);
        }
        const audioIdx = audioPath === videoPath ? 0 : 1;
        const vol = masterVolume !== 1 ? `,volume=${masterVolume}` : '';
        filterComplex.push(`[${audioIdx}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo${vol}[main_a]`);
        mainAudioLabel = 'main_a';
      }

      const bgmLabels: string[] = [];
      const totalDuration = this.getVideoDurationSync(videoPath);

      for (let i = 0; i < bgmTracks.length; i++) {
        const { track, filePath } = bgmTracks[i];
        command = command.input(filePath);
        const inputIdx = inputs.length;
        inputs.push(filePath);

        const clipDuration = Math.min(track.endTime - track.startTime, totalDuration - track.startTime);
        if (clipDuration <= 0) continue;

        const fadeIn = Math.min(track.fadeInDuration, clipDuration / 2);
        const fadeOut = Math.min(track.fadeOutDuration, clipDuration / 2);
        const vol = Math.max(0, Math.min(10, track.volume));

        const delaySamples = Math.round(track.startTime * 44100);
        const af: string[] = [];
        af.push(`atrim=0:${clipDuration}`);
        if (fadeIn > 0 || fadeOut > 0) {
          af.push(`afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${Math.max(0, clipDuration - fadeOut)}:d=${fadeOut}`);
        }
        if (vol !== 1) {
          af.push(`volume=${vol}`);
        }
        if (delaySamples > 0) {
          af.push(`adelay=${delaySamples}|${delaySamples}`);
        }
        af.push(`aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo`);
        const label = `bgm${i}`;
        filterComplex.push(`[${inputIdx}:a]${af.join(',')}[${label}]`);
        bgmLabels.push(label);
      }

      let finalAudioLabel: string | null = null;

      if (mainAudioLabel && bgmLabels.length > 0) {
        const allLabels = [mainAudioLabel, ...bgmLabels];
        const inputsStr = allLabels.map(l => `[${l}]`).join('');
        filterComplex.push(`${inputsStr}amix=inputs=${allLabels.length}:duration=longest:dropout_transition=3[final_a]`);
        finalAudioLabel = 'final_a';
      } else if (mainAudioLabel) {
        finalAudioLabel = mainAudioLabel;
      } else if (bgmLabels.length > 0) {
        if (bgmLabels.length === 1) {
          finalAudioLabel = bgmLabels[0];
        } else {
          const inputsStr = bgmLabels.map(l => `[${l}]`).join('');
          filterComplex.push(`${inputsStr}amix=inputs=${bgmLabels.length}:duration=longest:dropout_transition=3[final_a]`);
          finalAudioLabel = 'final_a';
        }
      }

      command = command.outputOptions(['-c:v copy', '-map 0:v']);

      if (filterComplex.length > 0) {
        command = command.complexFilter(filterComplex);
      }

      if (finalAudioLabel) {
        command = command.outputOptions([
          `-map [${finalAudioLabel}]`,
          '-c:a aac',
          '-b:a 192k',
          '-ar 44100',
          '-ac 2',
          '-shortest',
        ]);
      } else {
        command = command.outputOptions(['-an']);
      }

      command = command
        .outputOptions(['-movflags +faststart'])
        .output(outputPath)
        .on('start', () => {
          if (onProgress) onProgress(0);
        })
        .on('progress', (progress) => {
          if (onProgress && progress.percent !== undefined) {
            onProgress(Math.min(1, progress.percent / 100));
          }
          if (isCancelled?.()) this.checkCancelled(isCancelled, command, reject);
        })
        .on('end', () => {
          if (onProgress) onProgress(1);
          if (isCancelled?.()) return reject(new Error('Render cancelled'));
          resolve();
        })
        .on('error', (err) => reject(err));

      this.trackFfmpegPid(command, onFfmpegStart, onFfmpegEnd);
      command.run();
    });
  }

  private getVideoDurationSync(videoPath: string): number {
    try {
      const stat = fs.statSync(videoPath);
      return stat.size / 100000;
    } catch {
      return 0;
    }
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
