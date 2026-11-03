export type TargetCategory = 'video' | 'audio';

export type VideoContainer = 'mp4' | 'webm' | 'mkv' | 'mov' | 'avi' | 'gif';
export type AudioContainer = 'mp3' | 'm4a' | 'wav' | 'flac' | 'ogg';

export type ContainerFormat = VideoContainer | AudioContainer;

export type VideoCodec = 
  | 'copy' 
  | 'libx264' 
  | 'libx265' 
  | 'libvpx-vp9' 
  | 'prores' 
  | 'gif';

export type AudioCodec = 
  | 'copy' 
  | 'aac' 
  | 'libmp3lame' 
  | 'libopus' 
  | 'flac' 
  | 'pcm_s16le' 
  | 'none';

export type RateControlMode = 'crf' | 'bitrate';

export type ResolutionPreset = 
  | 'source' 
  | '3840x2160' 
  | '2560x1440' 
  | '1920x1080' 
  | '1280x720' 
  | '854x480';

export type FrameratePreset = 'source' | '24' | '30' | '60';

export type PresetSpeed = 
  | 'ultrafast' 
  | 'superfast' 
  | 'veryfast' 
  | 'faster' 
  | 'fast' 
  | 'medium';

export type AudioBitrate = '64k' | '96k' | '128k' | '192k' | '256k' | '320k' | 'lossless';

export type ChannelLayout = 'source' | 'mono' | 'stereo' | '5.1';

export type SubtitleHandlingMode = 'convert' | 'copy' | 'drop';

export interface VideoTrackInfo {
  streamIndex: number; // global stream index e.g. 0
  typeIndex: number; // video stream specifier index e.g. 0 for 0:v:0
  codec: string;
  profile?: string;
  pixelFormat?: string;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number; // in kbps
  language?: string;
  title?: string;
  isDefault?: boolean;
  isForced?: boolean;
  is10Bit?: boolean;
  rawInfo: string;
}

export interface AudioTrackInfo {
  streamIndex: number; // global stream index e.g. 1
  typeIndex: number; // audio stream specifier index e.g. 0 for 0:a:0
  codec: string;
  profile?: string;
  sampleRate?: number;
  channels?: number;
  channelLayout?: string;
  bitrate?: number; // in kbps
  language?: string;
  title?: string;
  isDefault?: boolean;
  isForced?: boolean;
  isMp4Compatible: boolean;
  rawInfo: string;
}

export interface SubtitleTrackInfo {
  streamIndex: number; // global stream index e.g. 2
  typeIndex: number; // subtitle stream specifier index e.g. 0 for 0:s:0
  codec: string; // e.g. 'subrip', 'ass', 'webvtt', 'mov_text', 'hdmv_pgs_subtitle', 'dvd_subtitle'
  formatType: 'text' | 'bitmap';
  language?: string;
  title?: string;
  isDefault?: boolean;
  isForced?: boolean;
  rawInfo: string;
}

export interface ChapterInfo {
  index: number;
  start: number; // in seconds
  end: number; // in seconds
  title?: string;
}

export interface AttachmentInfo {
  streamIndex: number;
  typeIndex: number;
  codec: string;
  filename?: string;
  mimetype?: string;
}

export interface SourceMetadata {
  name: string;
  size: number;
  type: string;
  extension: string;
  duration?: number; // in seconds
  width?: number;
  height?: number;
  fps?: number;
  hasVideo: boolean;
  hasAudio: boolean;
  videoCodec?: string;
  audioCodec?: string;
  audioSampleRate?: number;
  audioChannels?: number;
  bitrate?: number;
  pixelFormat?: string;
  is10Bit?: boolean;
  is4K?: boolean;
  isHighBitrate?: boolean;
  parsedStreams?: string[];
  // Detailed multi-track inspection
  videoTracks?: VideoTrackInfo[];
  audioTracks?: AudioTrackInfo[];
  subtitleTracks?: SubtitleTrackInfo[];
  chapters?: ChapterInfo[];
  attachments?: AttachmentInfo[];
}

export interface EncodingConfig {
  targetCategory: TargetCategory;
  container: ContainerFormat;
  // Video settings
  videoCodec: VideoCodec;
  rateControl: RateControlMode;
  crf: number; // 18 - 35
  videoBitrate: string; // e.g. "2500k", "5000k"
  resolution: ResolutionPreset;
  framerate: FrameratePreset;
  speedPreset: PresetSpeed;
  // Audio settings
  audioCodec: AudioCodec;
  audioBitrate: AudioBitrate;
  audioChannels: ChannelLayout;
  audioSampleRate: 'source' | '48000' | '44100';
  // Multi-track selection & smart remuxing
  selectedVideoTrackIndices?: number[]; // 0:v:X typeIndices
  selectedAudioTrackIndices?: number[]; // 0:a:X typeIndices
  selectedSubtitleTrackIndices?: number[]; // 0:s:X typeIndices
  subtitleMode?: SubtitleHandlingMode;
  preserveMetadataTags?: boolean;
  conditionalAudioTranscode?: boolean;
  // Hardware & Apple Silicon Optimization
  appleOptimized?: boolean;
  fastStart?: boolean;
  pixelFormat?: 'yuv420p' | 'yuv420p10le' | 'auto';
  hardwareThreads?: number;
  hardwareAcceleration?: boolean;
  hardwareEngine?: 'auto' | 'webgpu' | 'stream-copy' | 'cpu';
  webgpuFilter?: 'none' | 'grayscale';
}

export interface ProgressTelemetry {
  percent: number;
  currentTime: number; // in seconds
  duration: number; // in seconds
  fps: number;
  speed: string;
  elapsedMs: number;
  etaSeconds: number | null;
  currentPass?: number;
  totalPasses?: number;
  accelerationMode?: string;
}

export interface LogMessage {
  id: string;
  timestamp: string;
  type: 'stdout' | 'stderr' | 'system' | 'error';
  text: string;
}

export interface ConversionResult {
  outputUrl: string;
  blob: Blob;
  outputName: string;
  outputSize: number;
  durationSeconds?: number;
  container: ContainerFormat;
  elapsedMs: number;
  command: string[];
}

export interface FFmpegDiagnostic {
  title: string;
  explanation: string;
  suggestion: string;
  code?: number;
}

