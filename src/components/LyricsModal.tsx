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
import { fetchAiLyricsOrChord, generateLocalLyricsOrChord } from '../services/lyricsService';

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
      setData(generateLocalLyricsOrChord(title, artist));
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
    if (track) {
      const dummyTitle =
        mode === 'CHORDS'
          ? `${track.title} (Instrumental)`
          : track.title.replace(/\(Instrumental\)/i, '');
      setData(generateLocalLyricsOrChord(dummyTitle, track.artist));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#171814] border border-[#292a24] rounded-3xl p-5 sm:p-7 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#292a24]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-[#21291d] text-[#b8d99e] border border-[#3a4433]">
              {data?.isInstrumental ? <Guitar className="w-5 h-5" /> : <Mic2 className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="font-serif-display text-lg font-bold text-[#eeeae2] truncate">
                {data?.isInstrumental ? 'Instrument Chord Sheet' : 'Vocal Lyrics & Guide'}
              </h3>
              <p className="text-xs text-[#a3a198] truncate">
                {track.title} · {track.artist || 'Open Grace Music'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleShare}
              title="Share Lyrics or Chord Sheet"
              className="px-3 py-1.5 rounded-xl bg-[#b8d99e] text-[#11120f] hover:bg-[#c8e6b0] text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{shared ? 'Shared!' : 'Share'}</span>
            </button>

            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-xl bg-[#11120f] text-[#eeeae2] hover:bg-[#21291d] border border-[#292a24] text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#86efac]" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              onClick={handleDownloadTxt}
              title="Download .txt Sheet"
              className="p-1.5 rounded-xl bg-[#11120f] text-[#b8d99e] hover:bg-[#21291d] border border-[#292a24] transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-[#a3a198] hover:text-[#eeeae2] hover:bg-[#252820] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mode Switcher & Meta Pills */}
        <div className="py-3 flex flex-wrap items-center justify-between gap-3 border-b border-[#292a24]">
          <div className="flex items-center gap-1.5 bg-[#11120f] p-1 rounded-xl border border-[#292a24]">
            <button
              onClick={() => handleToggleMode('LYRICS')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                !data?.isInstrumental
                  ? 'bg-[#b8d99e] text-[#11120f] font-semibold'
                  : 'text-[#a3a198] hover:text-[#eeeae2]'
              }`}
            >
              <Mic2 className="w-3.5 h-3.5" />
              <span>Vocal Lyrics</span>
            </button>
            <button
              onClick={() => handleToggleMode('CHORDS')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                data?.isInstrumental
                  ? 'bg-[#b8d99e] text-[#11120f] font-semibold'
                  : 'text-[#a3a198] hover:text-[#eeeae2]'
              }`}
            >
              <Guitar className="w-3.5 h-3.5" />
              <span>Chord Sheet</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="px-2 py-0.5 rounded bg-[#21291d] text-[#86efac] border border-[#3a4433]">
              Key: {data?.key || 'C Major'}
            </span>
            <span className="px-2 py-0.5 rounded bg-[#21291d] text-[#b8d99e] border border-[#3a4433]">
              Tempo: {data?.bpm || 118} BPM
            </span>
            <button
              onClick={() => loadContent(track.title, track.artist)}
              disabled={isLoading}
              title="Regenerate with Gemini AI"
              className="p-1.5 rounded-lg bg-[#21291d] text-[#b8d99e] hover:bg-[#2b3626] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Content Sheet Body */}
        <div className="flex-1 overflow-y-auto my-3 p-4 rounded-2xl bg-[#11120f] border border-[#292a24] font-mono text-xs sm:text-sm text-[#eeeae2] leading-relaxed whitespace-pre-wrap selection:bg-[#b8d99e] selection:text-[#11120f]">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-[#a3a198] gap-2">
              <Sparkles className="w-6 h-6 animate-spin text-[#b8d99e]" />
              <p>Transcribing musical harmony & vocal lyrics...</p>
            </div>
          ) : (
            data?.content || 'No lyrics or chord chart available.'
          )}
        </div>

        {/* Footer info */}
        <div className="pt-2 text-[11px] font-mono text-[#6e6d66] flex items-center justify-between">
          <span>Open Grace Music · Vocal Lyrics & Chord Sheet</span>
          <span>1-Tap Share Ready</span>
        </div>
      </div>
    </div>
  );
};
