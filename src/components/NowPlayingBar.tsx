import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Maximize2,
  Volume2,
  VolumeX,
  Disc3,
} from 'lucide-react';
import { LoopMode, Track } from '../types';

interface NowPlayingBarProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isShuffle: boolean;
  loopMode: LoopMode;
  volume: number;
  onTogglePlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (time: number) => void;
  onToggleShuffle: () => void;
  onCycleLoop: () => void;
  onVolumeChange: (val: number) => void;
  onOpenFullPlayer: () => void;
}

export const NowPlayingBar: React.FC<NowPlayingBarProps> = ({
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  isShuffle,
  loopMode,
  volume,
  onTogglePlayPause,
  onPrevious,
  onNext,
  onSeek,
  onToggleShuffle,
  onCycleLoop,
  onVolumeChange,
  onOpenFullPlayer,
}) => {
  if (!currentTrack) return null;

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 bg-[#141814]/95 backdrop-blur-md border-t border-[#282E27] px-4 py-2.5 sm:py-3 shadow-2xl">
      {/* Top Scrubber Line */}
      <div className="absolute -top-1 left-0 right-0 group cursor-pointer h-2">
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          className="w-full absolute inset-0 opacity-0 cursor-pointer z-10"
        />
        <div className="h-1 bg-[#252C24] w-full">
          <div
            className="h-full bg-[#B8D99E] transition-all relative"
            style={{ width: `${progressPercent}%` }}
          >
            <div className="absolute right-0 -top-1 w-2.5 h-2.5 rounded-full bg-[#F1F5EC] shadow scale-0 group-hover:scale-100 transition-transform" />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Left: Track Info & Vinyl Art */}
        <div
          onClick={onOpenFullPlayer}
          className="flex items-center gap-3 min-w-0 cursor-pointer group flex-1 sm:flex-initial"
        >
          <div className="relative w-11 h-11 rounded-full overflow-hidden shrink-0 border border-[#3E4D37] shadow-md bg-[#181C18]">
            {currentTrack.thumbnailUrl ? (
              <img
                src={currentTrack.thumbnailUrl}
                alt={currentTrack.title}
                className={`w-full h-full object-cover ${
                  isPlaying ? 'animate-spin-slow' : 'animate-spin-slow-paused'
                }`}
              />
            ) : (
              <div
                className={`w-full h-full flex items-center justify-center bg-[#2B3626] text-[#B8D99E] ${
                  isPlaying ? 'animate-spin-slow' : 'animate-spin-slow-paused'
                }`}
              >
                <Disc3 className="w-6 h-6" />
              </div>
            )}
            {/* Center vinyl hole */}
            <div className="absolute inset-0 m-auto w-2.5 h-2.5 rounded-full bg-[#111411] border border-[#282E27]" />
          </div>

          <div className="min-w-0">
            <h5 className="text-sm font-semibold text-[#F1F5EC] truncate group-hover:text-[#B8D99E] transition-colors">
              {currentTrack.title}
            </h5>
            <p className="text-xs text-[#A2ACA0] truncate">
              {currentTrack.artist || 'Open Grace Music'}
            </p>
          </div>
        </div>

        {/* Center: Controls */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={onToggleShuffle}
              title={isShuffle ? 'Shuffle on' : 'Shuffle off'}
              className={`p-1.5 rounded-lg transition-colors hidden sm:block ${
                isShuffle ? 'text-[#B8D99E] bg-[#2B3626]' : 'text-[#6F796E] hover:text-[#F1F5EC]'
              }`}
            >
              <Shuffle className="w-4 h-4" />
            </button>

            <button
              onClick={onPrevious}
              title="Previous Track"
              className="p-1.5 text-[#A2ACA0] hover:text-[#F1F5EC] transition-colors"
            >
              <SkipBack className="w-5 h-5 fill-current" />
            </button>

            <button
              onClick={onTogglePlayPause}
              title={isPlaying ? 'Pause' : 'Play'}
              className="w-10 h-10 rounded-full bg-[#B8D99E] text-[#0F150C] hover:bg-[#C9E7B1] flex items-center justify-center shadow-lg transition-transform active:scale-95"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current translate-x-0.5" />
              )}
            </button>

            <button
              onClick={onNext}
              title="Next Track"
              className="p-1.5 text-[#A2ACA0] hover:text-[#F1F5EC] transition-colors"
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>

            <button
              onClick={onCycleLoop}
              title={`Loop: ${loopMode}`}
              className={`p-1.5 rounded-lg transition-colors hidden sm:block ${
                loopMode !== 'OFF' ? 'text-[#B8D99E] bg-[#2B3626]' : 'text-[#6F796E] hover:text-[#F1F5EC]'
              }`}
            >
              {loopMode === 'ONE' ? (
                <Repeat1 className="w-4 h-4" />
              ) : (
                <Repeat className="w-4 h-4" />
              )}
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-[#6F796E]">
            <span>{formatTime(currentTime)}</span>
            <span>/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: Volume & Expand */}
        <div className="flex items-center gap-3">
          {/* Volume slider (desktop) */}
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={() => onVolumeChange(volume === 0 ? 0.8 : 0)}
              className="text-[#A2ACA0] hover:text-[#F1F5EC]"
            >
              {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-20 accent-[#B8D99E] cursor-pointer h-1.5 bg-[#252C24] rounded-lg"
            />
          </div>

          <button
            onClick={onOpenFullPlayer}
            title="Expand Full Vinyl Player"
            className="p-2 rounded-lg bg-[#252C24] text-[#B8D99E] hover:bg-[#2F382E] transition-colors flex items-center gap-1 text-xs font-medium"
          >
            <Maximize2 className="w-4 h-4" />
            <span className="hidden sm:inline">Vinyl View</span>
          </button>
        </div>
      </div>
    </footer>
  );
};
