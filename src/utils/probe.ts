import { SourceMetadata } from '../types';

/**
 * Parses FFmpeg stderr logs produced during inspection (-i input)
 */
export function parseFFmpegProbeLogs(logs: string[]): Partial<SourceMetadata> {
  const meta: Partial<SourceMetadata> = {
    hasVideo: false,
    hasAudio: false,
    parsedStreams: [],
  };

  const combined = logs.join('\n');

  // Match Duration: 00:01:23.45, start: 0.000000, bitrate: 2450 kb/s
  const durationMatch = combined.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/i);
  if (durationMatch) {
    const hours = parseFloat(durationMatch[1]);
    const minutes = parseFloat(durationMatch[2]);
    const seconds = parseFloat(durationMatch[3]);
    meta.duration = hours * 3600 + minutes * 60 + seconds;
  }

  // Match overall bitrate: bitrate: 2450 kb/s
  const bitrateMatch = combined.match(/bitrate:\s*(\d+)\s*kb\/s/i);
  if (bitrateMatch) {
    meta.bitrate = parseInt(bitrateMatch[1], 10);
  }

  // Find Streams
  // Stream #0:0(eng): Video: h264 (High), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 23.98 fps
  // Stream #0:1(eng): Audio: aac (LC), 48000 Hz, stereo, fltp, 128 kb/s
  const streamLines = combined.split('\n').filter((l) => l.includes('Stream #'));
  meta.parsedStreams = streamLines.map((l) => l.trim());

  for (const line of streamLines) {
    if (line.includes('Video:')) {
      meta.hasVideo = true;
      const videoPart = line.split('Video:')[1];
      if (videoPart) {
        const parts = videoPart.split(',').map((p) => p.trim());
        meta.videoCodec = parts[0]?.split(' ')[0]?.toLowerCase();

        // Resolution: e.g. 1920x1080 or 1280x720
        for (const part of parts) {
          const resMatch = part.match(/(\d{3,5})x(\d{3,5})/);
          if (resMatch) {
            meta.width = parseInt(resMatch[1], 10);
            meta.height = parseInt(resMatch[2], 10);
          }
          // FPS
          const fpsMatch = part.match(/(\d+(?:\.\d+)?)\s*fps/);
          if (fpsMatch) {
            meta.fps = Math.round(parseFloat(fpsMatch[1]));
          }
          // Pixel Format (e.g. yuv420p, yuv420p10le, yuv444p)
          const pixMatch = part.match(/(yuv[\w]+)/i);
          if (pixMatch) {
            meta.pixelFormat = pixMatch[1].toLowerCase();
          }
        }

        // 10-bit / HDR Detection
        const is10 = line.includes('10le') || line.includes('Main 10') || line.includes('High 10') || (meta.pixelFormat && meta.pixelFormat.includes('10'));
        meta.is10Bit = Boolean(is10);

        // 4K UHD Detection
        const is4k = (meta.width && meta.width >= 3840) || (meta.height && meta.height >= 2160);
        meta.is4K = Boolean(is4k);

        // High Bitrate Detection (>15000 kbps)
        if (meta.bitrate && meta.bitrate >= 15000) {
          meta.isHighBitrate = true;
        }
      }
    }

    if (line.includes('Audio:')) {
      meta.hasAudio = true;
      const audioPart = line.split('Audio:')[1];
      if (audioPart) {
        const parts = audioPart.split(',').map((p) => p.trim());
        meta.audioCodec = parts[0]?.split(' ')[0]?.toLowerCase();

        for (const part of parts) {
          // Sample rate: e.g. 48000 Hz
          const srMatch = part.match(/(\d{4,6})\s*Hz/i);
          if (srMatch) {
            meta.audioSampleRate = parseInt(srMatch[1], 10);
          }
          // Channels
          if (part.includes('stereo')) meta.audioChannels = 2;
          else if (part.includes('mono')) meta.audioChannels = 1;
          else if (part.includes('5.1')) meta.audioChannels = 6;
        }
      }
    }
  }

  return meta;
}

/**
 * Attempts fast HTML5 media element inspection as a quick baseline
 */
export async function probeMediaElement(file: File): Promise<Partial<SourceMetadata>> {
  return new Promise((resolve) => {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const isAudioOnly = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'].includes(ext);

    const url = URL.createObjectURL(file);

    if (isAudioOnly) {
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve({
          duration: audio.duration,
          hasAudio: true,
          hasVideo: false,
        });
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({
          hasAudio: true,
          hasVideo: false,
        });
      };
      audio.src = url;
    } else {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve({
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
          hasVideo: video.videoWidth > 0,
          hasAudio: true, // usually video containers have audio unless silent
        });
      };
      video.onerror = () => {
        // Container might not be decodable by browser HTML5 tag (e.g. MKV/AVI/FLV)
        URL.revokeObjectURL(url);
        resolve({
          hasVideo: true,
          hasAudio: true,
        });
      };
      video.src = url;
    }
  });
}
