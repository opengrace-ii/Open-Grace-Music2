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
import { GramophoneDiscLogo } from './GramophoneDiscLogo';

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
    <footer className="fixed bottom-0 left-0 right-0 z-40 bg-[#121510]/95 backdrop-blur-md border-t border-[#2b3326] px-3 sm:px-6 py-2.5 shadow-[0_-12px_32px_rgba(0,0,0,0.85)]">
      {/* Top Analog Tape Scrubber Ribbon */}
      <div className="absolute -top-1.5 left-0 right-0 group cursor-pointer h-3">
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          className="w-full absolute inset-0 opacity-0 cursor-pointer z-10"
        />
        <div className="h-1.5 bg-[#0a0c09] w-full border-b border-[#252c21]">
          <div
            className="h-full bg-gradient-to-r from-[#b8d99e] to-[#e2c986] transition-all relative"
            style={{ width: `${progressPercent}%` }}
          >
            <div className="absolute right-0 -top-1 w-3 h-3 rounded-full bg-[#f0ece1] border border-[#121510] shadow scale-0 group-hover:scale-100 transition-transform" />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        {/* Left: Spinning Gramophone Disc & Track Title */}
        <div
          onClick={onOpenFullPlayer}
          className="flex items-center gap-3 min-w-0 cursor-pointer group flex-1 sm:flex-initial max-w-[44%] sm:max-w-xs"
        >
          <GramophoneDiscLogo
            isPlaying={isPlaying}
            size={48}
            showHornOverlay={true}
            badgeFrame={true}
            thumbnailUrl={currentTrack.thumbnailUrl}
            title="Expand Gramophone Turntable Player"
          />

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`cassette-led shrink-0 ${isPlaying ? 'cassette-led-on' : ''}`} />
              <h5 className="font-serif-display text-sm sm:text-base font-bold text-[#f0ece1] truncate group-hover:text-[#b8d99e] transition-colors">
                {currentTrack.title}
              </h5>
            </div>
            <p className="text-[11px] font-mono text-[#9fa396] truncate mt-0.5">
              {currentTrack.artist || 'Open Grace Music'} · {formatTime(currentTime)} / {formatTime(duration)}
            </p>
          </div>
        </div>

        {/* Center: Tactile Cassette Deck Transport Keys */}
        <div className="cassette-bank flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={onToggleShuffle}
            title="Shuffle"
            className={`cassette-btn px-2.5 py-2 text-xs hidden sm:inline-flex ${
              isShuffle ? 'cassette-btn-engaged' : 'text-[#9fa396]'
            }`}
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onPrevious}
            title="Rewind / Previous"
            className="cassette-btn px-2.5 sm:px-3 py-2 text-xs font-mono"
          >
            <SkipBack className="w-4 h-4 fill-current" />
          </button>

          <button
            onClick={onTogglePlayPause}
            title={isPlaying ? 'Pause' : 'Play'}
            className="cassette-btn cassette-btn-primary px-4 py-2 text-xs font-mono font-bold"
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span className="hidden xs:inline">PAUSE</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span className="hidden xs:inline">PLAY</span>
              </>
            )}
          </button>

          <button
            onClick={onNext}
            title="Fast Forward / Next"
            className="cassette-btn px-2.5 sm:px-3 py-2 text-xs font-mono"
          >
            <SkipForward className="w-4 h-4 fill-current" />
          </button>

          <button
            onClick={onCycleLoop}
            title={`Loop: ${loopMode}`}
            className={`cassette-btn px-2.5 py-2 text-xs hidden sm:inline-flex ${
              loopMode !== 'OFF' ? 'cassette-btn-engaged' : 'text-[#9fa396]'
            }`}
          >
            {loopMode === 'ONE' ? (
              <Repeat1 className="w-3.5 h-3.5" />
            ) : (
              <Repeat className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Right: Volume & Gramophone Stage Button */}
        <div className="flex items-center gap-2.5">
          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#0b0d0a] border border-[#262c22]">
            <button
              onClick={() => onVolumeChange(volume === 0 ? 0.85 : 0)}
              className="text-[#9fa396] hover:text-[#f0ece1]"
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
              className="w-16 accent-[#b8d99e] cursor-pointer h-1.5 bg-[#252c24] rounded-lg"
            />
          </div>

          <button
            onClick={onOpenFullPlayer}
            title="Open Gramophone Stage"
            className="cassette-btn px-3 py-2 text-xs font-mono text-[#b8d99e]"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">TURNTABLE</span>
          </button>
        </div>
      </div>
    </footer>
  );
};
