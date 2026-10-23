import React from 'react';
import { Play, Pause, RefreshCw, FileText, Download, Trash2, Heart } from 'lucide-react';
import { Track } from '../types';

interface TrackCardProps {
  track: Track;
  isPlayingThis: boolean;
  isCurrentlyPlaying: boolean;
  isConverting?: boolean;
  conversionProgress?: number;
  onPlayClick: () => void;
  onConvertToMp3: () => void;
  onLyricsClick: () => void;
  onExportClick: () => void;
  onDeleteClick: () => void;
  onToggleFavorite: () => void;
}

export const TrackCard: React.FC<TrackCardProps> = ({
  track,
  isPlayingThis,
  isCurrentlyPlaying,
  isConverting = false,
  conversionProgress = 0,
  onPlayClick,
  onConvertToMp3,
  onLyricsClick,
  onExportClick,
  onDeleteClick,
  onToggleFavorite,
}) => {
  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return '—';
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    return `${Math.round(bytes / 1e3)} KB`;
  };

  const getInitials = (title: string) => {
    const words = (title || 'OGM').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '♪';
    return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  };

  const fmtUpper = track.format.toUpperCase();
  const isLossless = ['FLAC', 'ALAC', 'DSD', 'WAV'].includes(fmtUpper);

  const audiophileBadge = (() => {
    if (fmtUpper === 'FLAC') {
      return `FLAC · ${track.bitDepth || '24-bit'}/${(track.sampleRateHz || 96000) / 1000}kHz`;
    }
    if (fmtUpper === 'ALAC') {
      return `ALAC · ${track.bitDepth || '24-bit'}/${(track.sampleRateHz || 96000) / 1000}kHz`;
    }
    if (fmtUpper === 'DSD') {
      return 'DSD · 24-bit/192kHz';
    }
    if (fmtUpper === 'WAV') {
      return `WAV · ${track.bitDepth || '24-bit'} PCM`;
    }
    return `${fmtUpper} · ${track.bitrateKbps || 320} kbps`;
  })();

  const statusLabel =
    track.storageStatus === 'PERSISTENT'
      ? {
          text: '● OFFLINE READY',
          bg: 'bg-[#1b2b1e]',
          color: 'text-[#86efac]',
          border: 'border-[#2b3e2f]',
        }
      : track.storageStatus === 'DEVICE_LOCAL'
      ? {
          text: '◐ DEVICE CACHED',
          bg: 'bg-[#2e2713]',
          color: 'text-[#fbbf24]',
          border: 'border-[#433a1f]',
        }
      : {
          text: '✕ SAVE FAILED',
          bg: 'bg-[#3a1d1d]',
          color: 'text-[#f87171]',
          border: 'border-[#5a2a2a]',
        };

  return (
    <div
      className={`group relative rounded-2xl border transition-all duration-200 p-3.5 sm:p-4 bg-[#171814] ${
        isPlayingThis
          ? 'border-[#b8d99e] shadow-[0_0_20px_rgba(184,217,158,0.12)] bg-[#1c1f18]'
          : 'border-[#292a24] hover:border-[#3a4433] hover:bg-[#1a1c16]'
      }`}
    >
      <div className="flex items-center gap-3.5">
        {/* Cover / Monogram */}
        <div
          onClick={onPlayClick}
          className="relative w-13 h-13 sm:w-14 sm:h-14 rounded-xl overflow-hidden shrink-0 cursor-pointer bg-[#21291d] border border-[#3a4433] flex items-center justify-center text-[#b8d99e] shadow-inner font-serif-display text-lg font-bold"
        >
          {track.thumbnailUrl ? (
            <img
              src={track.thumbnailUrl}
              alt={track.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <span>{getInitials(track.title)}</span>
          )}

          {/* Hover / Active Play Overlay */}
          <div
            className={`absolute inset-0 bg-black/50 backdrop-blur-[1px] flex items-center justify-center transition-opacity ${
              isPlayingThis ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            {isPlayingThis && isCurrentlyPlaying ? (
              <Pause className="w-6 h-6 text-[#b8d99e] fill-[#b8d99e]" />
            ) : (
              <Play className="w-6 h-6 text-[#b8d99e] fill-[#b8d99e] translate-x-0.5" />
            )}
          </div>
        </div>

        {/* Track Metadata */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-2">
            <h4
              onClick={onPlayClick}
              className={`text-sm sm:text-base font-semibold truncate cursor-pointer transition-colors ${
                isPlayingThis ? 'text-[#b8d99e]' : 'text-[#eeeae2] hover:text-[#b8d99e]'
              }`}
              title={track.title}
            >
              {track.title}
            </h4>
          </div>

          <p className="text-xs text-[#a3a198] truncate mt-0.5">
            {track.artist || 'Open Grace Music'} {track.album ? `· ${track.album}` : ''}
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-[11px] text-[#6e6d66] font-mono">
              {formatTime(track.duration)} · {formatSize(track.sizeBytes)}
            </span>

            {/* Audiophile Format chip */}
            <span
              className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
                isLossless
                  ? 'bg-[#21291d] text-[#b8d99e] border-[#3a4433]'
                  : 'bg-[#11120f] text-[#a3a198] border-[#292a24]'
              }`}
            >
              {audiophileBadge}
            </span>

            {/* Storage status chip */}
            <span
              className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-full border ${statusLabel.bg} ${statusLabel.color} ${statusLabel.border}`}
            >
              {statusLabel.text}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onToggleFavorite}
            title={track.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            className={`p-2 rounded-lg transition-colors ${
              track.isFavorite
                ? 'text-[#f87171] hover:bg-[#2a1d1d]'
                : 'text-[#6e6d66] hover:text-[#eeeae2] hover:bg-[#21291d]'
            }`}
          >
            <Heart className={`w-4 h-4 ${track.isFavorite ? 'fill-[#f87171]' : ''}`} />
          </button>

          <button
            onClick={onLyricsClick}
            title="Vocal Lyrics & Chord Sheet"
            className="p-2 rounded-lg text-[#a3a198] hover:text-[#b8d99e] hover:bg-[#21291d] transition-colors"
          >
            <FileText className="w-4 h-4" />
          </button>

          <button
            onClick={onExportClick}
            title={`Download .${track.format.toLowerCase()} to device Music folder`}
            className="p-2 rounded-lg text-[#b8d99e] hover:text-[#eeeae2] hover:bg-[#21291d] transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={onDeleteClick}
            title="Remove from library"
            className="p-2 rounded-lg text-[#6e6d66] hover:text-[#f87171] hover:bg-[#2b1b1b] transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isConverting && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] text-[#b8d99e] mb-1">
            <span className="flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Transcoding audio...
            </span>
            <span>{Math.round(conversionProgress * 100)}%</span>
          </div>
          <div className="w-full h-1.5 bg-[#292a24] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#b8d99e] transition-all duration-150 rounded-full"
              style={{ width: `${Math.round(conversionProgress * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
