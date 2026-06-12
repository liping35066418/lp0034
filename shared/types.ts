export type MaterialType = 'video' | 'image' | 'audio';

export type MaterialStatus = 'uploading' | 'ready' | 'error' | 'processing';

export interface Shot {
  startTime: number;
  endTime: number;
  duration: number;
  score: number;
  thumbnail?: string;
}

export interface AIAnalysisResult {
  shots: Shot[];
  quality: number;
  motionLevel: number;
  brightness: number;
  colorfulness: number;
}

export interface Material {
  id: string;
  name: string;
  type: MaterialType;
  size: number;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  format: string;
  thumbnailPath?: string;
  filePath: string;
  status: MaterialStatus;
  createdAt: number;
  aiAnalysis?: AIAnalysisResult;
}

export type TransitionType = 'fade' | 'dissolve' | 'wipe' | 'slide' | 'zoom' | 'none';

export interface TransitionConfig {
  type: TransitionType;
  duration: number;
  params?: Record<string, any>;
}

export type FilterType = 
  | 'brightness' 
  | 'contrast' 
  | 'saturation' 
  | 'grayscale' 
  | 'sepia' 
  | 'vignette' 
  | 'warm' 
  | 'cool'
  | 'cinematic'
  | 'vintage';

export interface FilterConfig {
  type: FilterType;
  params: Record<string, any>;
}

export interface TimelineClip {
  id: string;
  materialId: string;
  track: number;
  startTime: number;
  endTime: number;
  sourceStartTime: number;
  sourceEndTime: number;
  filters: FilterConfig[];
  transition?: TransitionConfig;
  speed: number;
  volume?: number;
}

export interface BackgroundMusicTrack {
  materialId: string;
  startTime: number;
  endTime: number;
  volume: number;
  fadeInDuration: number;
  fadeOutDuration: number;
}

export interface TimelineData {
  clips: TimelineClip[];
  backgroundMusic?: BackgroundMusicTrack[];
  masterVolume?: number;
}

export type RenderStatus = 'pending' | 'processing' | 'paused' | 'completed' | 'failed' | 'cancelled';

export type RenderStage = 'analyzing' | 'processing' | 'encoding' | 'finalizing';

export interface OutputSettings {
  width: number;
  height: number;
  fps: number;
  format: 'mp4' | 'mov' | 'webm';
  bitrate: number;
  quality: 'low' | 'medium' | 'high';
}

export interface RenderTask {
  id: string;
  name: string;
  status: RenderStatus;
  progress: number;
  stage?: RenderStage;
  timeline: TimelineData;
  outputSettings: OutputSettings;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  errorMessage?: string;
  outputPath?: string;
  speed?: string;
  currentFrame?: number;
  totalFrames?: number;
}

export interface UploadSession {
  id: string;
  filename: string;
  totalSize: number;
  totalChunks: number;
  uploadedChunks: number;
  status: 'active' | 'completed' | 'error';
  createdAt: number;
}

export interface WSMessage {
  type: 'progress' | 'status' | 'log' | 'error';
  taskId: string;
  data?: any;
}

export interface RenderProgressMessage {
  type: 'progress';
  taskId: string;
  progress: number;
  stage: RenderStage;
  currentFrame?: number;
  totalFrames?: number;
  speed?: string;
}

export interface SmartCutOptions {
  targetDuration?: number;
  enableTransition?: boolean;
  enableColorCorrection?: boolean;
  musicId?: string;
}

export const DEFAULT_OUTPUT_SETTINGS: OutputSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  format: 'mp4',
  bitrate: 8000,
  quality: 'medium',
};

export const CHUNK_SIZE = 5 * 1024 * 1024;

export const SUPPORTED_VIDEO_FORMATS = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv'];
export const SUPPORTED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
export const SUPPORTED_AUDIO_FORMATS = ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'];
