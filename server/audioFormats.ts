export interface AudioFormatSpec {
  format: 'FLAC' | 'ALAC' | 'DSD' | 'WAV' | 'MP3';
  extension: string;
  mimeType: string;
  sampleRate: number;
  bitDepth: string;
  bitrateLabel: string;
  ffmpegArgs: string[];
}

export function resolveFormatSpec(rawFormat?: string, rawBitrate?: number): AudioFormatSpec {
  const fmt = (rawFormat || 'MP3').toUpperCase().trim();
  const mp3Bitrate =
    rawBitrate && [128, 192, 256, 320].includes(Number(rawBitrate)) ? Number(rawBitrate) : 320;

  switch (fmt) {
    case 'FLAC':
      return {
        format: 'FLAC',
        extension: 'flac',
        mimeType: 'audio/flac',
        sampleRate: 96000,
        bitDepth: '24-bit',
        bitrateLabel: '24-bit / 96 kHz Lossless (~2300 kbps)',
        ffmpegArgs: ['-vn', '-c:a', 'flac', '-sample_fmt', 's32', '-ar', '96000', '-compression_level', '8'],
      };
    case 'ALAC':
      return {
        format: 'ALAC',
        extension: 'm4a',
        mimeType: 'audio/mp4',
        sampleRate: 96000,
        bitDepth: '24-bit',
        bitrateLabel: '24-bit / 96 kHz Apple Lossless ALAC',
        ffmpegArgs: ['-vn', '-c:a', 'alac', '-sample_fmt', 's32p', '-ar', '96000'],
      };
    case 'DSD':
    case 'DSF':
      return {
        format: 'DSD',
        extension: 'wav',
        mimeType: 'audio/wav',
        sampleRate: 192000,
        bitDepth: '24-bit',
        bitrateLabel: '24-bit / 192 kHz Hi-Res Master DSD/PCM',
        ffmpegArgs: ['-vn', '-c:a', 'pcm_s24le', '-ar', '192000'],
      };
    case 'WAV':
      return {
        format: 'WAV',
        extension: 'wav',
        mimeType: 'audio/wav',
        sampleRate: 48000,
        bitDepth: '24-bit',
        bitrateLabel: '24-bit / 48 kHz Uncompressed PCM',
        ffmpegArgs: ['-vn', '-c:a', 'pcm_s24le', '-ar', '48000'],
      };
    case 'MP3':
    default:
      return {
        format: 'MP3',
        extension: 'mp3',
        mimeType: 'audio/mpeg',
        sampleRate: 48000,
        bitDepth: '16-bit',
        bitrateLabel: `${mp3Bitrate} kbps CBR Master`,
        ffmpegArgs: ['-vn', '-c:a', 'libmp3lame', '-b:a', `${mp3Bitrate}k`, '-ar', '48000'],
      };
  }
}
