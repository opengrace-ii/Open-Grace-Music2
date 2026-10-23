import React from 'react';
import { Play, Pause, RefreshCw, Music2, Download, Trash2, Heart } from 'lucide-react';
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

  const fmtUpper = track.format.toUpperCase();
  const isLossless = ['FLAC', 'ALAC', 'DSD', 'WAV'].includes(fmtUpper);
  const isSpinning = isPlayingThis && isCurrentlyPlaying;

  const tapeTypeBadge = (() => {
    if (fmtUpper === 'FLAC') return 'TYPE IV METAL · FLAC 24-BIT';
    if (fmtUpper === 'ALAC') return 'TYPE II CrO₂ · ALAC 24-BIT';
    if (fmtUpper === 'DSD') return 'MASTER REEL · DSD 192KHZ';
    if (fmtUpper === 'WAV') return 'STUDIO MASTER · WAV 24-BIT';
    return `TYPE I NORMAL · MP3 ${track.bitrateKbps || 320}K`;
  })();

  return (
    <div
      className={`group relative rounded-2xl transition-all duration-200 p-3.5 sm:p-4 ${
        isPlayingThis ? 'cassette-card-active' : 'cassette-card hover:border-[#43503b]'
      }`}
    >
      {/* Subtle Cassette Corner Screws */}
      <span className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-[#2a3124] border border-[#0b0d0a] pointer-events-none" />
      <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#2a3124] border border-[#0b0d0a] pointer-events-none" />
      <span className="absolute bottom-2 left-2 w-1.5 h-1.5 rounded-full bg-[#2a3124] border border-[#0b0d0a] pointer-events-none" />
      <span className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-[#2a3124] border border-[#0b0d0a] pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
        {/* Left & Center: Cassette Spool Window + Song Info */}
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          {/* Cassette Reel & Cover Window */}
          <div
            onClick={onPlayClick}
            className="cassette-window relative w-16 h-14 sm:w-20 sm:h-14 rounded-xl overflow-hidden shrink-0 cursor-pointer flex items-center justify-center gap-1.5 px-2"
            title={isSpinning ? 'Pause Cassette' : 'Play Cassette'}
          >
            {track.thumbnailUrl && (
              <img
                src={track.thumbnailUrl}
                alt={track.title}
                className="absolute inset-0 w-full h-full object-cover opacity-35 group-hover:opacity-45 transition-opacity"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            )}

            {/* Left Cassette Spool */}
            <svg
              viewBox="0 0 40 40"
              className={`relative z-10 w-7 h-7 text-[#b8d99e] drop-shadow ${
                isSpinning ? 'animate-spin-reel' : 'animate-spin-reel-paused'
              }`}
            >
              <circle cx="20" cy="20" r="16" fill="#10130e" stroke="currentColor" strokeWidth="2.2" />
              <circle cx="20" cy="20" r="6" fill="none" stroke="#e2c986" strokeWidth="1.8" strokeDasharray="3 3" />
              <line x1="20" y1="4" x2="20" y2="12" stroke="currentColor" strokeWidth="2" />
              <line x1="20" y1="28" x2="20" y2="36" stroke="currentColor" strokeWidth="2" />
              <line x1="4" y1="20" x2="12" y2="20" stroke="currentColor" strokeWidth="2" />
              <line x1="28" y1="20" x2="36" y2="20" stroke="currentColor" strokeWidth="2" />
            </svg>

            {/* Right Cassette Spool (visible on sm+) */}
            <svg
              viewBox="0 0 40 40"
              className={`hidden sm:block relative z-10 w-7 h-7 text-[#e2c986] drop-shadow ${
                isSpinning ? 'animate-spin-reel' : 'animate-spin-reel-paused'
              }`}
            >
              <circle cx="20" cy="20" r="16" fill="#10130e" stroke="currentColor" strokeWidth="2.2" />
              <circle cx="20" cy="20" r="6" fill="none" stroke="#b8d99e" strokeWidth="1.8" strokeDasharray="3 3" />
              <line x1="20" y1="4" x2="20" y2="12" stroke="currentColor" strokeWidth="2" />
              <line x1="20" y1="28" x2="20" y2="36" stroke="currentColor" strokeWidth="2" />
              <line x1="4" y1="20" x2="12" y2="20" stroke="currentColor" strokeWidth="2" />
              <line x1="28" y1="20" x2="36" y2="20" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>

          {/* Cassette Label Metadata */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`cassette-led shrink-0 ${
                  isSpinning ? 'cassette-led-on' : isPlayingThis ? 'cassette-led-rec' : ''
                }`}
              />
              <h4
                onClick={onPlayClick}
                className={`font-serif-display text-base sm:text-lg font-bold truncate cursor-pointer transition-colors ${
                  isPlayingThis ? 'text-[#b8d99e]' : 'text-[#f0ece1] group-hover:text-[#b8d99e]'
                }`}
                title={track.title}
              >
                {track.title}
              </h4>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-xs text-[#9fa396] truncate max-w-[200px] sm:max-w-[260px]">
                {track.artist || 'Open Grace Ensemble'}
              </span>
              <span className="text-[#3a4533]">•</span>
              <span className="text-[11px] font-mono text-[#e2c986]">
                {formatTime(track.duration)}
              </span>
              <span
                className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${
                  isLossless
                    ? 'bg-[#1c2418] text-[#b8d99e] border-[#384730]'
                    : 'bg-[#141712] text-[#9fa396] border-[#272c23]'
                }`}
              >
                {tapeTypeBadge}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Tactile Cassette Deck Transport Keys */}
        <div className="cassette-bank flex items-center justify-end gap-1.5 self-end sm:self-center shrink-0">
          <button
            onClick={onPlayClick}
            className={`cassette-btn px-3 py-2 text-xs font-mono font-bold ${
              isPlayingThis ? 'cassette-btn-primary' : ''
            }`}
            title={isSpinning ? 'Pause Tape' : 'Play Tape'}
          >
            {isSpinning ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>PAUSE</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>PLAY</span>
              </>
            )}
          </button>

          <button
            onClick={onLyricsClick}
            title="Lyrics & Chords"
            className="cassette-btn px-2.5 py-2 text-xs font-mono text-[#b8d99e]"
          >
            <Music2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline">NOTES</span>
          </button>

          <button
            onClick={onExportClick}
            title={`Save .${track.format.toLowerCase()} to device`}
            className="cassette-btn px-2.5 py-2 text-xs font-mono text-[#e2c986]"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onToggleFavorite}
            title="Favorite Tape"
            className={`cassette-btn px-2.5 py-2 text-xs ${
              track.isFavorite ? 'text-[#f87171] border-[#5c2b2b]' : 'text-[#9fa396]'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${track.isFavorite ? 'fill-[#f87171]' : ''}`} />
          </button>

          <button
            onClick={onDeleteClick}
            title="Eject Tape"
            className="cassette-btn px-2.5 py-2 text-xs text-[#686b60] hover:text-[#f87171]"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isConverting && (
        <div className="mt-3 pt-2 border-t border-[#262c22]">
          <div className="flex items-center justify-between text-[11px] font-mono text-[#b8d99e] mb-1">
            <span className="flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3 animate-spin" />
              RECORDING TAPE...
            </span>
            <span>{Math.round(conversionProgress * 100)}%</span>
          </div>
          <div className="w-full h-1.5 bg-[#0e100d] rounded-full overflow-hidden">
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
