import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  Sparkles,
  Mic2,
  Guitar,
  RefreshCw,
  Share2,
  Download,
} from 'lucide-react';
import { LyricOrChord, Track } from '../types';
import { fetchAiLyricsOrChord, unavailableLyrics } from '../services/lyricsService';

interface LyricsModalProps {
  isOpen: boolean;
  track: Track | null;
  onClose: () => void;
}

export const LyricsModal: React.FC<LyricsModalProps> = ({ isOpen, track, onClose }) => {
  const [data, setData] = useState<LyricOrChord | null>(null);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (track) {
      loadContent(track.title, track.artist);
    }
  }, [track]);

  const loadContent = async (title: string, artist: string) => {
    setIsLoading(true);
    try {
      const result = await fetchAiLyricsOrChord(title, artist);
      setData(result);
    } catch {
      setData(unavailableLyrics(title, artist));
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !track) return null;

  const handleCopy = () => {
    if (data?.content) {
      navigator.clipboard.writeText(data.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleShare = async () => {
    if (!data?.content) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${track.title} — ${data.isInstrumental ? 'Chord Sheet' : 'Vocal Lyrics'}`,
          text: data.content,
        });
        setShared(true);
        setTimeout(() => setShared(false), 2500);
        return;
      } catch {
        // Fallback to clipboard copy
      }
    }
    handleCopy();
  };

  const handleDownloadTxt = () => {
    if (!data?.content) return;
    const blob = new Blob([data.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = data.isInstrumental ? 'Chords' : 'Lyrics';
    a.download = `${track.title.replace(/[^a-zA-Z0-9._ -]/g, '')}_${suffix}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleToggleMode = (mode: 'LYRICS' | 'CHORDS') => {
    if (!track) return;
    if (mode === 'CHORDS') {
      setData({
        title: track.title,
        artist: track.artist || 'Open Grace Music',
        isInstrumental: true,
        content:
          'Chord sheet hidden until verified chart data exists.\n\nMark instrumental tracks in your library notes, or import a PDF chart from your files app.',
      });
      return;
    }
    void loadContent(track.title, track.artist);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl cassette-card rounded-3xl p-5 sm:p-7 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#272c23]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-[#1c2418] text-[#b8d99e] border border-[#3a4533]">
              {data?.isInstrumental ? <Guitar className="w-5 h-5" /> : <Mic2 className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="font-serif-display text-lg font-bold text-[#f0ece1] truncate">
                {track.title}
              </h3>
              <p className="text-xs font-mono text-[#e2c986] truncate">
                {track.artist || 'Open Grace Music'} · {data?.key || 'C Major'} · {data?.bpm || 118} BPM
              </p>
            </div>
          </div>

          <div className="cassette-bank flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleShare}
              title="Share Sheet"
              className="cassette-btn cassette-btn-primary px-3 py-1.5 text-xs font-mono"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{shared ? 'SHARED' : 'SHARE'}</span>
            </button>

            <button
              onClick={handleCopy}
              className="cassette-btn px-2.5 py-1.5 text-xs font-mono"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#86efac]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={handleDownloadTxt}
              title="Download .txt"
              className="cassette-btn px-2.5 py-1.5 text-xs font-mono text-[#e2c986]"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onClose}
              className="cassette-btn px-2.5 py-1.5 text-xs text-[#9fa396]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="py-3 flex items-center justify-between gap-3">
          <div className="cassette-bank flex items-center gap-1.5">
            <button
              onClick={() => handleToggleMode('LYRICS')}
              className={`cassette-btn px-3.5 py-1.5 text-xs font-mono ${
                !data?.isInstrumental ? 'cassette-btn-engaged' : 'text-[#9fa396]'
              }`}
            >
              <Mic2 className="w-3.5 h-3.5" />
              <span>LYRICS</span>
            </button>
            <button
              onClick={() => handleToggleMode('CHORDS')}
              className={`cassette-btn px-3.5 py-1.5 text-xs font-mono ${
                data?.isInstrumental ? 'cassette-btn-engaged' : 'text-[#9fa396]'
              }`}
            >
              <Guitar className="w-3.5 h-3.5" />
              <span>CHORDS</span>
            </button>
          </div>

          <button
            onClick={() => loadContent(track.title, track.artist)}
            disabled={isLoading}
            title="Refresh"
            className="cassette-btn px-3 py-1.5 text-xs font-mono text-[#b8d99e]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Content Sheet Body */}
        <div className="flex-1 overflow-y-auto my-1 p-5 rounded-2xl cassette-window font-mono text-xs sm:text-sm text-[#f0ece1] leading-relaxed whitespace-pre-wrap selection:bg-[#b8d99e] selection:text-[#11120f]">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-[#9fa396] gap-2">
              <Sparkles className="w-6 h-6 animate-spin text-[#b8d99e]" />
              <p>TUNING HARMONY & LYRICS...</p>
            </div>
          ) : (
            data?.content || 'No lyrics or chord chart available.'
          )}
        </div>
      </div>
    </div>
  );
};
