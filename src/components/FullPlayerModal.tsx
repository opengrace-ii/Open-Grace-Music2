import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Download,
  ListMusic,
  Music2,
  Volume2,
  VolumeX,
  Disc3,
} from 'lucide-react';
import { LoopMode, Track } from '../types';
import { playerEngine } from '../services/playerService';
import { GramophoneDiscLogo } from './GramophoneDiscLogo';

interface FullPlayerModalProps {
  isOpen: boolean;
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isShuffle: boolean;
  loopMode: LoopMode;
  playbackSpeed: number;
  volume: number;
  queue: Track[];
  onClose: () => void;
  onTogglePlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (time: number) => void;
  onToggleShuffle: () => void;
  onCycleLoop: () => void;
  onSetSpeed: (speed: number) => void;
  onVolumeChange: (vol: number) => void;
  onSelectTrack: (track: Track) => void;
  onExportTrack: (track: Track) => void;
  onOpenLyrics: (track: Track) => void;
}

export const FullPlayerModal: React.FC<FullPlayerModalProps> = ({
  isOpen,
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  isShuffle,
  loopMode,
  playbackSpeed,
  volume,
  queue,
  onClose,
  onTogglePlayPause,
  onPrevious,
  onNext,
  onSeek,
  onToggleShuffle,
  onCycleLoop,
  onSetSpeed,
  onVolumeChange,
  onSelectTrack,
  onExportTrack,
  onOpenLyrics,
}) => {
  const [showQueue, setShowQueue] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!isOpen || showQueue) return;

    let animId: number;
    const freqBuffer = new Uint8Array(32);

    const drawEqualizer = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const width = canvas.width;
          const height = canvas.height;
          ctx.clearRect(0, 0, width, height);

          const hasLiveAudio = isPlaying && playerEngine.getFrequencyData(freqBuffer);
          const barCount = 32;
          const gap = 3;
          const barWidth = (width - gap * (barCount - 1)) / barCount;
          const now = performance.now() / 210;

          for (let i = 0; i < barCount; i++) {
            let ratio = 0.14;
            if (hasLiveAudio) {
              const val = freqBuffer[i % freqBuffer.length] || 0;
              if (val > 0) {
                ratio = Math.max(0.14, Math.min(1.0, val / 245));
              } else {
                ratio =
                  0.2 +
                  0.62 *
                    Math.abs(
                      Math.sin(now + i * 0.42) * Math.cos(now * 0.7 - i * 0.25)
                    );
              }
            } else if (isPlaying) {
              ratio =
                0.2 +
                0.65 *
                  Math.abs(
                    Math.sin(now + i * 0.42) * Math.cos(now * 0.7 - i * 0.25)
                  );
            }

            const barHeight = Math.max(4, ratio * height);
            const x = i * (barWidth + gap);
            const y = height - barHeight;

            ctx.fillStyle =
              ratio > 0.78
                ? '#e2c986'
                : ratio > 0.45
                ? '#b8d99e'
                : 'rgba(184, 217, 158, 0.5)';
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, 2);
            ctx.fill();
          }
        }
      }
      animId = requestAnimationFrame(drawEqualizer);
    };

    animId = requestAnimationFrame(drawEqualizer);
    return () => cancelAnimationFrame(animId);
  }, [isOpen, isPlaying, showQueue]);

  if (!isOpen || !currentTrack) return null;

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const speeds = [0.75, 1.0, 1.25, 1.5, 2.0];
  const isLossless = ['FLAC', 'ALAC', 'DSD', 'WAV'].includes(
    currentTrack.format.toUpperCase()
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl cassette-card rounded-3xl p-5 sm:p-7 shadow-2xl flex flex-col max-h-[94vh] overflow-y-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-[#272c23]">
          <div className="flex items-center gap-2.5">
            <GramophoneDiscLogo
              isPlaying={isPlaying}
              size={30}
              showHornOverlay={true}
              badgeFrame={true}
            />
            <span className={`cassette-led ${isPlaying ? 'cassette-led-on' : 'cassette-led-rec'}`} />
            <span className="font-cinzel text-xs font-bold tracking-widest text-[#e2c986] uppercase">
              Gramophone Master Deck
            </span>
          </div>

          <div className="cassette-bank flex items-center gap-1.5">
            <button
              onClick={() => onOpenLyrics(currentTrack)}
              title="Lyrics & Chord Sheet"
              className="cassette-btn px-3 py-1.5 text-xs font-mono text-[#b8d99e]"
            >
              <Music2 className="w-3.5 h-3.5" />
              <span>LYRICS / CHORDS</span>
            </button>

            <button
              onClick={() => setShowQueue(!showQueue)}
              title="Tape Queue"
              className={`cassette-btn px-2.5 py-1.5 text-xs font-mono ${
                showQueue ? 'cassette-btn-engaged' : 'text-[#9fa396]'
              }`}
            >
              <ListMusic className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onClose}
              className="cassette-btn px-2.5 py-1.5 text-xs text-[#9fa396]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Queue Drawer View */}
        {showQueue ? (
          <div className="my-5 flex-1 flex flex-col min-h-[300px]">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-mono uppercase tracking-wider text-[#b8d99e]">
                CASSETTE RACK ({queue.length})
              </h4>
              <button
                onClick={() => setShowQueue(false)}
                className="cassette-btn px-3 py-1 text-xs font-mono text-[#e2c986]"
              >
                RETURN TO TURNTABLE
              </button>
            </div>
            <div className="space-y-2 overflow-y-auto max-h-[360px] pr-1">
              {queue.map((t, idx) => (
                <div
                  key={t.id}
                  onClick={() => {
                    onSelectTrack(t);
                    setShowQueue(false);
                  }}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    t.id === currentTrack.id
                      ? 'cassette-card-active text-[#b8d99e]'
                      : 'cassette-card text-[#f0ece1] hover:border-[#3a4533]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono text-[#686b60] w-5 text-center">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-serif-display text-sm font-bold truncate">{t.title}</p>
                      <p className="text-xs font-mono text-[#9fa396] truncate">
                        {t.artist || 'Open Grace Music'} · {t.format}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-[#e2c986]">
                    {formatTime(t.duration)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Gramophone Turntable Stage + Live VU Spectrum */
          <div className="my-4 flex flex-col items-center">
            <div className="relative w-60 h-60 sm:w-68 sm:h-68 my-1 flex items-center justify-center">
              {/* Warm Ambient Radial Glow when Playing */}
              {isPlaying && (
                <div className="absolute inset-0 rounded-full bg-[#b8d99e]/15 blur-2xl animate-pulse pointer-events-none" />
              )}

              {/* Rotating Gramophone Vinyl Platter with Brass Horn & Stylus */}
              <GramophoneDiscLogo
                isPlaying={isPlaying}
                size={236}
                showHornOverlay={true}
                badgeFrame={false}
                thumbnailUrl={currentTrack.thumbnailUrl}
                className="w-56 h-56 sm:w-64 sm:h-64 drop-shadow-2xl"
              />
            </div>

            {/* Analog VU Spectrum Window */}
            <div className="w-full max-w-md mt-3 px-4 py-2.5 rounded-2xl cassette-window">
              <div className="flex items-center justify-between text-[10px] font-mono text-[#e2c986] mb-1.5">
                <span>ANALOG VU SPECTRUM</span>
                <span>
                  {currentTrack.format} ·{' '}
                  {currentTrack.sampleRateHz
                    ? `${currentTrack.sampleRateHz / 1000} KHZ`
                    : isLossless
                    ? '96 KHZ'
                    : '48 KHZ'}{' '}
                  · {currentTrack.bitDepth || (isLossless ? '24-BIT' : '16-BIT')}
                </span>
              </div>
              <canvas
                ref={canvasRef}
                width={380}
                height={42}
                className="w-full h-10 block"
              />
            </div>

            {/* Track Title & Artist */}
            <div className="text-center mt-3.5 max-w-lg px-4">
              <h3 className="font-serif-display text-xl sm:text-2xl font-bold text-[#f0ece1] tracking-wide line-clamp-1">
                {currentTrack.title}
              </h3>
              <p className="text-xs sm:text-sm font-mono text-[#b8d99e] mt-1">
                {currentTrack.artist || 'Open Grace Ensemble'}
              </p>
            </div>
          </div>
        )}

        {/* Scrubber Progress Slider */}
        <div className="space-y-1 my-2">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="w-full accent-[#b8d99e] cursor-pointer h-1.5 bg-[#0e100d] rounded-lg"
          />
          <div className="flex justify-between text-xs font-mono text-[#9fa396]">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Tactile Cassette Transport Bank */}
        <div className="cassette-bank flex items-center justify-center gap-2 sm:gap-3 my-2 py-2 px-3 self-center">
          <button
            onClick={onToggleShuffle}
            title="Shuffle"
            className={`cassette-btn px-3 py-2.5 text-xs font-mono ${
              isShuffle ? 'cassette-btn-engaged' : 'text-[#9fa396]'
            }`}
          >
            <Shuffle className="w-4 h-4" />
          </button>

          <button
            onClick={onPrevious}
            title="Rewind"
            className="cassette-btn px-4 py-2.5 text-xs font-mono"
          >
            <SkipBack className="w-5 h-5 fill-current" />
            <span className="hidden sm:inline">REW</span>
          </button>

          <button
            onClick={onTogglePlayPause}
            title={isPlaying ? 'Pause' : 'Play'}
            className="cassette-btn cassette-btn-primary px-6 py-3 text-sm font-mono font-bold"
          >
            {isPlaying ? (
              <>
                <Pause className="w-5 h-5 fill-current" />
                <span>PAUSE</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current" />
                <span>PLAY</span>
              </>
            )}
          </button>

          <button
            onClick={onNext}
            title="Fast Forward"
            className="cassette-btn px-4 py-2.5 text-xs font-mono"
          >
            <span className="hidden sm:inline">FF</span>
            <SkipForward className="w-5 h-5 fill-current" />
          </button>

          <button
            onClick={onCycleLoop}
            title={`Loop: ${loopMode}`}
            className={`cassette-btn px-3 py-2.5 text-xs font-mono ${
              loopMode !== 'OFF' ? 'cassette-btn-engaged' : 'text-[#9fa396]'
            }`}
          >
            {loopMode === 'ONE' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
          </button>
        </div>

        {/* Bottom Hardware Controls: Pitch/Speed & Export */}
        <div className="pt-3 mt-2 border-t border-[#272c23] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="cassette-bank flex items-center gap-1">
            {speeds.map((s) => (
              <button
                key={s}
                onClick={() => onSetSpeed(s)}
                className={`cassette-btn px-2.5 py-1 font-mono text-[11px] ${
                  playbackSpeed === s ? 'cassette-btn-engaged' : 'text-[#9fa396]'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0b0d0a] border border-[#262c22]">
              <button
                onClick={() => onVolumeChange(volume === 0 ? 0.85 : 0)}
                className="text-[#9fa396] hover:text-[#f0ece1]"
              >
                {volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                className="w-16 accent-[#b8d99e] cursor-pointer h-1.5 bg-[#272c23] rounded-lg"
              />
            </div>

            <button
              onClick={() => onExportTrack(currentTrack)}
              className="cassette-btn px-3 py-1.5 font-mono text-xs text-[#e2c986]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>SAVE .{currentTrack.format.toUpperCase()}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
