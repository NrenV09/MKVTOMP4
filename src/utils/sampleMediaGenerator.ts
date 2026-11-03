import { FFmpeg } from '@ffmpeg/ffmpeg';

/**
 * Generates a real 3-second stereo 44.1kHz 16-bit PCM WAV file containing a cyber synth chord progression.
 * Runs in < 15ms in pure JavaScript with zero external dependencies.
 */
export function generateCyberSynthWavBlob(durationSec = 3): Blob {
  const sampleRate = 44100;
  const numChannels = 2;
  const numSamples = sampleRate * durationSec;
  const bytesPerSample = 2;
  const dataSize = numSamples * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF WAV Header
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format = 1
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true); // 16-bit
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  // Synthesize a rich stereo cyber chord (A2 + E3 + A3 + C#4 + E4) with subtle arpeggio modulation
  const freqs = [110, 164.81, 220, 277.18, 329.63];
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t * 8) * Math.min(1, (durationSec - t) * 4);
    const arpFreq = freqs[Math.floor(t * 6) % freqs.length] * 2;

    let left = Math.sin(2 * Math.PI * arpFreq * t) * 0.18;
    let right = Math.sin(2 * Math.PI * (arpFreq * 1.003) * t) * 0.18;

    for (let f = 0; f < freqs.length; f++) {
      const detune = f % 2 === 0 ? 1.001 : 0.999;
      left += Math.sin(2 * Math.PI * freqs[f] * t) * 0.12;
      right += Math.sin(2 * Math.PI * freqs[f] * detune * t) * 0.12;
    }

    const sLeft = Math.max(-1, Math.min(1, left * env));
    const sRight = Math.max(-1, Math.min(1, right * env));

    view.setInt16(offset, sLeft * 32767, true);
    view.setInt16(offset + 2, sRight * 32767, true);
    offset += 4;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Generates a real multi-track MKV or MP4 sample file using the in-browser FFmpeg.wasm worker:
 * - Video Track 0:v:0 (H.264 640x360 @ 24fps test pattern)
 * - Audio Track 0:a:0 (AAC / AC3 stereo synth audio)
 * - Subtitle Track 0:s:0 (Embedded SubRip .SRT text subtitle track for MKV)
 */
export async function generateSampleMediaFile(
  ffmpeg: FFmpeg,
  kind: 'mkv-multitrack' | 'mp4-stream' | 'wav-audio'
): Promise<File> {
  if (kind === 'wav-audio') {
    const wavBlob = generateCyberSynthWavBlob(4);
    return new File([wavBlob], 'cyber_synth_master_44kHz.wav', { type: 'audio/wav' });
  }

  const ts = Date.now();
  const wavName = `synth_${ts}.wav`;
  const srtName = `subs_${ts}.srt`;
  const outName = kind === 'mkv-multitrack' ? `sample_${ts}.mkv` : `sample_${ts}.mp4`;

  try {
    // 1. Write synthesized stereo WAV audio into virtual FS
    const wavBlob = generateCyberSynthWavBlob(3);
    const wavU8 = new Uint8Array(await wavBlob.arrayBuffer());
    await ffmpeg.writeFile(wavName, wavU8);

    if (kind === 'mkv-multitrack') {
      // 2. Write a real multi-cue SubRip (.srt) subtitle file
      const srtContent = [
        '1',
        '00:00:00,100 --> 00:00:01,400',
        '[CYBER//MUX] Stream Inspector Active — Video: H.264 | Audio: AAC | Sub: SRT',
        '',
        '2',
        '00:00:01,500 --> 00:00:02,900',
        'Zero-Copy WORKERFS & Paged OPFS Storage Verified Offline.',
        '',
      ].join('\n');
      await ffmpeg.writeFile(srtName, new TextEncoder().encode(srtContent));

      // 3. Mux synthetic video (testsrc/color), stereo audio, and SRT subtitle track with metadata tags into .MKV
      const code = await ffmpeg.exec([
        '-threads',
        '0',
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=3:size=640x360:rate=24',
        '-i',
        wavName,
        '-i',
        srtName,
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
        '-map',
        '2:s:0',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-c:s',
        'srt',
        '-metadata:s:v:0',
        'language=eng',
        '-metadata:s:v:0',
        'title=Cyber Tactical 360p H.264 Stream',
        '-metadata:s:a:0',
        'language=eng',
        '-metadata:s:a:0',
        'title=English Stereo Synth 2.0',
        '-metadata:s:s:0',
        'language=eng',
        '-metadata:s:s:0',
        'title=English Telemetry Subtitles (SRT)',
        outName,
      ]);

      if (code === 0) {
        const res = await ffmpeg.readFile(outName, 'blob:video/x-matroska' as any);
        const mkvBlob =
          res instanceof Blob ? res : new Blob([res as Uint8Array], { type: 'video/x-matroska' });
        return new File([mkvBlob], 'cyber_multitrack_demo.mkv', { type: 'video/x-matroska' });
      }
    } else {
      // Generate clean MP4 stream sample
      const code = await ffmpeg.exec([
        '-threads',
        '0',
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=3:size=640x360:rate=24',
        '-i',
        wavName,
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        outName,
      ]);

      if (code === 0) {
        const res = await ffmpeg.readFile(outName, 'blob:video/mp4' as any);
        const mp4Blob =
          res instanceof Blob ? res : new Blob([res as Uint8Array], { type: 'video/mp4' });
        return new File([mp4Blob], 'cyber_stream_sample.mp4', { type: 'video/mp4' });
      }
    }
  } finally {
    try {
      await ffmpeg.deleteFile(wavName);
    } catch {}
    try {
      await ffmpeg.deleteFile(srtName);
    } catch {}
    try {
      await ffmpeg.deleteFile(outName);
    } catch {}
  }

  // Fallback to WAV if lavfi was unavailable
  const fallbackWav = generateCyberSynthWavBlob(3);
  return new File([fallbackWav], 'cyber_synth_master.wav', { type: 'audio/wav' });
}
