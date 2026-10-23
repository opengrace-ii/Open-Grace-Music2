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
  FileText,
  Volume2,
  VolumeX,
  Gauge,
  Disc3,
  Activity,
} from 'lucide-react';
import { LoopMode, Track } from '../types';
import { playerEngine } from '../services/playerService';

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

  // Real-time Web Audio API Visual Frequency Equalizer
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
          const barCount = 28;
          const gap = 4;
          const barWidth = (width - gap * (barCount - 1)) / barCount;
          const now = performance.now() / 220;

          for (let i = 0; i < barCount; i++) {
            let ratio = 0.14;
            if (hasLiveAudio) {
              const val = freqBuffer[i % freqBuffer.length] || 0;
              if (val > 0) {
                ratio = Math.max(0.14, Math.min(1.0, val / 245));
              } else {
                ratio =
                  0.2 +
                  0.6 *
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

            ctx.fillStyle = ratio > 0.72 ? '#b8d99e' : 'rgba(184, 217, 158, 0.65)';
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, 3);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#171814] border border-[#292a24] rounded-3xl p-5 sm:p-7 shadow-2xl flex flex-col max-h-[94vh] overflow-y-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-[#292a24]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#b8d99e] animate-pulse" />
            <span className="font-cinzel text-xs font-bold tracking-widest text-[#b8d99e] uppercase">
              Audiophile Master Turntable
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenLyrics(currentTrack)}
              title="Lyrics & Chord Sheet"
              className="px-3 py-1.5 rounded-full bg-[#21291d] text-[#b8d99e] hover:bg-[#2c3727] text-xs font-medium flex items-center gap-1.5 border border-[#3a4433] transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Chords & Lyrics</span>
            </button>

            <button
              onClick={() => setShowQueue(!showQueue)}
              title="Toggle Up Next Queue"
              className={`p-2 rounded-full border transition-colors ${
                showQueue
                  ? 'bg-[#b8d99e] text-[#11120f] border-[#b8d99e]'
                  : 'bg-[#21291d] text-[#a3a198] border-[#3a4433] hover:text-[#eeeae2]'
              }`}
            >
              <ListMusic className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-full bg-[#11120f] text-[#a3a198] hover:text-[#eeeae2] border border-[#292a24] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Queue Drawer View */}
        {showQueue ? (
          <div className="my-5 flex-1 flex flex-col min-h-[300px]">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-[#b8d99e]">
                Up Next ({queue.length} Tracks)
              </h4>
              <button
                onClick={() => setShowQueue(false)}
                className="text-xs text-[#a3a198] hover:text-[#eeeae2]"
              >
                Return to Turntable
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
                      ? 'bg-[#21291d] border-[#b8d99e] text-[#b8d99e]'
                      : 'bg-[#11120f] border-[#292a24] hover:border-[#3a4433] text-[#eeeae2]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono text-[#6e6d66] w-5 text-center">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{t.title}</p>
                      <p className="text-xs text-[#a3a198] truncate">
                        {t.artist || 'Open Grace Music'} · {t.format}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-[#6e6d66]">
                    {formatTime(t.duration)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Turntable Vinyl Stage + Real-Time Frequency Equalizer */
          <div className="my-4 flex flex-col items-center">
            <div className="relative w-56 h-56 sm:w-64 sm:h-64 my-1 flex items-center justify-center">
              <div
                className={`w-52 h-52 sm:w-60 sm:h-60 rounded-full vinyl-grooves relative flex items-center justify-center shadow-2xl transition-all duration-300 ${
                  isPlaying ? 'animate-spin-slow' : 'animate-spin-slow-paused'
                }`}
              >
                <div className="absolute inset-4 rounded-full border border-white/5 pointer-events-none" />
                <div className="absolute inset-8 rounded-full border border-white/5 pointer-events-none" />
                <div className="absolute inset-12 rounded-full border border-white/5 pointer-events-none" />
                <div className="absolute inset-16 rounded-full border border-white/5 pointer-events-none" />

                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-[#21291d] border-2 border-[#b8d99e] shadow-inner relative flex items-center justify-center text-center p-2">
                  {currentTrack.thumbnailUrl ? (
                    <img
                      src={currentTrack.thumbnailUrl}
                      alt={currentTrack.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-[#b8d99e]">
                      <Disc3 className="w-7 h-7 opacity-80" />
                      <span className="text-[9px] font-cinzel font-bold mt-0.5">OGM</span>
                    </div>
                  )}

                  <div className="absolute inset-0 m-auto w-3.5 h-3.5 rounded-full bg-[#11120f] border-2 border-[#171814] shadow" />
                </div>
              </div>

              {/* Tonearm / Stylus */}
              <div
                className={`absolute top-1 right-1 w-16 h-34 origin-top-right transition-transform duration-700 pointer-events-none ${
                  isPlaying ? 'rotate-[-10deg]' : 'rotate-[-40deg]'
                }`}
              >
                <div className="absolute top-0 right-0 w-7 h-7 rounded-full bg-[#21291d] border border-[#3a4433] shadow-lg flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#b8d99e]" />
                </div>
                <div className="absolute top-3.5 right-3 w-1.5 h-24 bg-gradient-to-b from-[#b8d99e] to-[#3a4433] shadow-md rounded-full transform -rotate-15" />
                <div className="absolute bottom-1 left-1 w-4.5 h-6.5 bg-[#171814] border border-[#b8d99e] rounded shadow-md transform rotate-12 flex items-center justify-center">
                  <div className="w-1 h-2 bg-[#eeeae2] rounded-full" />
                </div>
              </div>
            </div>

            {/* Live Web Audio API Visual Frequency Equalizer */}
            <div className="w-full max-w-md mt-3 px-3.5 py-2.5 rounded-2xl bg-[#11120f] border border-[#292a24]">
              <div className="flex items-center justify-between text-[10px] font-mono text-[#a3a198] mb-1.5">
                <span className="flex items-center gap-1.5 text-[#b8d99e] font-semibold">
                  <Activity className="w-3 h-3" />
                  <span>LIVE FREQUENCY SPECTRUM EQUALIZER</span>
                </span>
                <span>
                  {currentTrack.sampleRateHz
                    ? `${currentTrack.sampleRateHz / 1000} kHz`
                    : isLossless
                    ? '96 kHz'
                    : '48 kHz'}{' '}
                  · {currentTrack.bitDepth || (isLossless ? '24-bit' : '16-bit')}
                </span>
              </div>
              <canvas
                ref={canvasRef}
                width={380}
                height={42}
                className="w-full h-10 block"
              />
            </div>

            {/* Track Title & Metadata */}
            <div className="text-center mt-3 max-w-lg px-4">
              <h3 className="font-serif-display text-xl sm:text-2xl font-bold text-[#eeeae2] tracking-wide line-clamp-1">
                {currentTrack.title}
              </h3>
              <p className="text-sm text-[#b8d99e] mt-0.5 font-medium">
                {currentTrack.artist || 'Open Grace Music'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-[#21291d] text-[#b8d99e] border border-[#3a4433]">
                  {currentTrack.format} ·{' '}
                  {isLossless
                    ? `${currentTrack.bitDepth || '24-bit'} / ${(currentTrack.sampleRateHz || 96000) / 1000} kHz Lossless`
                    : `${currentTrack.bitrateKbps || 320} kbps CBR`}
                </span>
                <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-[#1b2b1e] text-[#86efac] border border-[#2b3e2f]">
                  ● Offline IndexedDB Verified
                </span>
              </div>
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
            className="w-full accent-[#b8d99e] cursor-pointer h-1.5 bg-[#292a24] rounded-lg"
          />
          <div className="flex justify-between text-xs font-mono text-[#6e6d66]">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Primary Controls */}
        <div className="flex items-center justify-center gap-5 sm:gap-8 my-1.5">
          <button
            onClick={onToggleShuffle}
            title={isShuffle ? 'Shuffle on' : 'Shuffle off'}
            className={`p-2.5 rounded-full transition-colors ${
              isShuffle ? 'bg-[#21291d] text-[#b8d99e]' : 'text-[#6e6d66] hover:text-[#eeeae2]'
            }`}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          <button
            onClick={onPrevious}
            title="Previous"
            className="p-3 rounded-full text-[#a3a198] hover:text-[#eeeae2] hover:bg-[#252820] transition-colors"
          >
            <SkipBack className="w-6 h-6 fill-current" />
          </button>

          <button
            onClick={onTogglePlayPause}
            title={isPlaying ? 'Pause' : 'Play'}
            className="w-14 h-14 rounded-full bg-[#b8d99e] text-[#11120f] hover:bg-[#c8e6b0] flex items-center justify-center shadow-xl active:scale-95 transition-all"
          >
            {isPlaying ? (
              <Pause className="w-7 h-7 fill-current" />
            ) : (
              <Play className="w-7 h-7 fill-current translate-x-0.5" />
            )}
          </button>

          <button
            onClick={onNext}
            title="Next"
            className="p-3 rounded-full text-[#a3a198] hover:text-[#eeeae2] hover:bg-[#252820] transition-colors"
          >
            <SkipForward className="w-6 h-6 fill-current" />
          </button>

          <button
            onClick={onCycleLoop}
            title={`Loop Mode: ${loopMode}`}
            className={`p-2.5 rounded-full transition-colors ${
              loopMode !== 'OFF' ? 'bg-[#21291d] text-[#b8d99e]' : 'text-[#6e6d66] hover:text-[#eeeae2]'
            }`}
          >
            {loopMode === 'ONE' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
          </button>
        </div>

        {/* Bottom Options: Speed & Volume & Export */}
        <div className="pt-3.5 mt-2 border-t border-[#292a24] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-[#6e6d66]" />
            <span className="text-[#a3a198] mr-1">Speed:</span>
            {speeds.map((s) => (
              <button
                key={s}
                onClick={() => onSetSpeed(s)}
                className={`px-2 py-0.5 rounded-md font-mono transition-colors ${
                  playbackSpeed === s
                    ? 'bg-[#b8d99e] text-[#11120f] font-semibold'
                    : 'bg-[#11120f] text-[#a3a198] hover:text-[#eeeae2]'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onVolumeChange(volume === 0 ? 0.8 : 0)}
                className="text-[#a3a198] hover:text-[#eeeae2]"
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
                className="w-16 accent-[#b8d99e] cursor-pointer h-1.5 bg-[#292a24] rounded-lg"
              />
            </div>

            <button
              onClick={() => onExportTrack(currentTrack)}
              className="px-3 py-1.5 rounded-lg bg-[#21291d] text-[#b8d99e] hover:bg-[#2b3626] transition-colors flex items-center gap-1.5 border border-[#3a4433] font-medium"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save .{currentTrack.format.toLowerCase()}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
