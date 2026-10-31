import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  Sparkles,
  Mic2,
  Guitar,
  ScrollText,
  RefreshCw,
  Share2,
  Download,
} from 'lucide-react';
import { LyricOrChord, Track } from '../types';
import { extractYouTubeId } from '../services/mediaResolver';
import {
  fetchAiLyricsOrChord,
  fetchYoutubeTranscript,
  unavailableLyrics,
  unavailableTranscript,
} from '../services/lyricsService';

interface LyricsModalProps {
  isOpen: boolean;
  track: Track | null;
  onClose: () => void;
}

type SheetMode = 'LYRICS' | 'CHORDS' | 'TRANSCRIPT';

export const LyricsModal: React.FC<LyricsModalProps> = ({ isOpen, track, onClose }) => {
  const [mode, setMode] = useState<SheetMode>('LYRICS');
  const [data, setData] = useState<LyricOrChord | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!track) return;
    setMode('LYRICS');
    void loadLyrics(track);
    void loadTranscript(track);
  }, [track]);

  const loadLyrics = async (current: Track) => {
    setIsLoading(true);
    try {
      const result = await fetchAiLyricsOrChord(current.title, current.artist);
      setData(result);
    } catch {
      setData(unavailableLyrics(current.title, current.artist));
    } finally {
      setIsLoading(false);
    }
  };

  const loadTranscript = async (current: Track) => {
    const videoId = current.ytVideoId || extractYouTubeId(current.originalUrl || '');
    if (!videoId) {
      setTranscript(unavailableTranscript(current.title, current.artist));
      return;
    }
    const text = await fetchYoutubeTranscript(videoId);
    setTranscript(text || unavailableTranscript(current.title, current.artist));
  };

  if (!isOpen || !track) return null;

  const activeText =
    mode === 'TRANSCRIPT'
      ? transcript
      : mode === 'CHORDS'
        ? data?.isInstrumental
          ? data.content
          : `Chord sheet hidden until verified chart data exists.\n\n${track.title}\n${track.artist || ''}`
        : data?.content || '';

  const handleCopy = () => {
    if (!activeText) return;
    navigator.clipboard.writeText(activeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShare = async () => {
    if (!activeText) return;
    const label = mode === 'CHORDS' ? 'Chords' : mode === 'TRANSCRIPT' ? 'Transcript' : 'Lyrics';
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${track.title} — ${label}`,
          text: activeText,
        });
        setShared(true);
        setTimeout(() => setShared(false), 2500);
        return;
      } catch {
        // fall through
      }
    }
    handleCopy();
  };

  const handleDownloadTxt = () => {
    if (!activeText) return;
    const blob = new Blob([activeText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${track.title.replace(/[^a-zA-Z0-9._ -]/g, '')}_${mode}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRefresh = () => {
    if (mode === 'TRANSCRIPT') void loadTranscript(track);
    else void loadLyrics(track);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl cassette-card rounded-3xl p-5 sm:p-7 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between pb-4 border-b border-[#272c23]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-[#1c2418] text-[#b8d99e] border border-[#3a4533]">
              {mode === 'CHORDS' ? (
                <Guitar className="w-5 h-5" />
              ) : mode === 'TRANSCRIPT' ? (
                <ScrollText className="w-5 h-5" />
              ) : (
                <Mic2 className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-serif-display text-lg font-bold text-[#f0ece1] truncate">
                {track.title}
              </h3>
              <p className="text-xs font-mono text-[#e2c986] truncate">
                {track.artist || 'Open Grace Music'}
                {mode === 'TRANSCRIPT' ? ' · Spoken / captions' : ''}
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

            <button onClick={handleCopy} className="cassette-btn px-2.5 py-1.5 text-xs font-mono">
              {copied ? <Check className="w-3.5 h-3.5 text-[#86efac]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={handleDownloadTxt}
              title="Download .txt"
              className="cassette-btn px-2.5 py-1.5 text-xs font-mono text-[#e2c986]"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            <button onClick={onClose} className="cassette-btn px-2.5 py-1.5 text-xs text-[#9fa396]">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="py-3 flex items-center justify-between gap-3">
          <div className="cassette-bank flex items-center gap-1.5 flex-wrap">
            {(
              [
                { id: 'LYRICS' as const, label: 'LYRICS', Icon: Mic2 },
                { id: 'CHORDS' as const, label: 'CHORDS', Icon: Guitar },
                { id: 'TRANSCRIPT' as const, label: 'TRANSCRIPT', Icon: ScrollText },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setMode(tab.id)}
                className={`cassette-btn px-3 py-1.5 text-xs font-mono ${
                  mode === tab.id ? 'cassette-btn-engaged' : 'text-[#9fa396]'
                }`}
              >
                <tab.Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <button
            onClick={handleRefresh}
            disabled={isLoading}
            title="Refresh"
            className="cassette-btn px-3 py-1.5 text-xs font-mono text-[#b8d99e]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto my-1 p-5 rounded-2xl cassette-window font-mono text-xs sm:text-sm text-[#f0ece1] leading-relaxed whitespace-pre-wrap selection:bg-[#b8d99e] selection:text-[#11120f]">
          {isLoading && mode !== 'TRANSCRIPT' ? (
            <div className="py-12 flex flex-col items-center justify-center text-[#9fa396] gap-2">
              <Sparkles className="w-6 h-6 animate-spin text-[#b8d99e]" />
              <p>TUNING THE SHEET…</p>
            </div>
          ) : (
            activeText || 'Nothing on this sheet yet.'
          )}
        </div>
      </div>
    </div>
  );
};
