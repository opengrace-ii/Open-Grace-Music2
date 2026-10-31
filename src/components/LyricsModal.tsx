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
  NotebookPen,
  Radio,
} from 'lucide-react';
import { LyricOrChord, Track } from '../types';
import { extractYouTubeId } from '../services/mediaResolver';
import { fetchAiLyricsOrChord, unavailableLyrics, unavailableTranscript } from '../services/lyricsService';
import { fetchListenNotes, fetchOgmTranscript, fetchRelatedNext } from '../services/ogmAiService';

interface LyricsModalProps {
  isOpen: boolean;
  track: Track | null;
  onClose: () => void;
  onListenRelated?: (query: string) => void;
}

type SheetMode = 'LYRICS' | 'CHORDS' | 'TRANSCRIPT' | 'NOTES' | 'NEXT';

export const LyricsModal: React.FC<LyricsModalProps> = ({ isOpen, track, onClose, onListenRelated }) => {
  const [mode, setMode] = useState<SheetMode>('LYRICS');
  const [data, setData] = useState<LyricOrChord | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [related, setRelated] = useState<string[]>([]);
  const [relatedError, setRelatedError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [relatedLoading, setRelatedLoading] = useState(false);

  useEffect(() => {
    if (!track) return;
    setMode('LYRICS');
    setNotes('');
    setRelated([]);
    setRelatedError(null);
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
    setTranscriptLoading(true);
    try {
      const videoId = current.ytVideoId || extractYouTubeId(current.originalUrl || '');
      if (!videoId) {
        setTranscript(unavailableTranscript(current.title, current.artist));
        return;
      }
      const result = await fetchOgmTranscript({ videoId, title: current.title });
      setTranscript(result.content);
    } catch {
      setTranscript(unavailableTranscript(current.title, current.artist));
    } finally {
      setTranscriptLoading(false);
    }
  };

  const loadNotes = async (current: Track) => {
    const text = transcript.trim();
    if (!text || /Add GEMINI_API_KEY|not available|Need audio/i.test(text)) {
      setNotes('Open the Transcript tab first. Listen notes are written from our own transcript — never from a guessed sermon.');
      return;
    }
    setNotesLoading(true);
    try {
      setNotes(await fetchListenNotes(text, current.title));
    } catch {
      setNotes('Listen notes failed. Check GEMINI_API_KEY or NVIDIA_API_KEY in Settings / .env.');
    } finally {
      setNotesLoading(false);
    }
  };

  const loadRelated = async (current: Track) => {
    setRelatedLoading(true);
    setRelatedError(null);
    try {
      const queries = await fetchRelatedNext({
        query: current.album?.startsWith('Fresh listen') ? current.album.replace(/^Fresh listen · /, '') : current.title,
        title: current.title,
        transcript: transcript || '',
      });
      if (!queries.length) {
        setRelatedError('No related searches yet. Play a tape or add a fresh query.');
        setRelated([]);
      } else {
        setRelated(queries);
      }
    } catch {
      setRelatedError('Could not suggest next listens.');
      setRelated([]);
    } finally {
      setRelatedLoading(false);
    }
  };

  useEffect(() => {
    if (!track || !isOpen) return;
    if (mode === 'NOTES' && !notes && !notesLoading) void loadNotes(track);
    if (mode === 'NEXT' && related.length === 0 && !relatedLoading && !relatedError) void loadRelated(track);
  }, [mode, track, isOpen]);

  if (!isOpen || !track) return null;

  const activeText =
    mode === 'TRANSCRIPT'
      ? transcript
      : mode === 'NOTES'
        ? notes
        : mode === 'NEXT'
          ? related.join('\n')
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
    const label =
      mode === 'CHORDS'
        ? 'Chords'
        : mode === 'TRANSCRIPT'
          ? 'Transcript'
          : mode === 'NOTES'
            ? 'Listen notes'
            : mode === 'NEXT'
              ? 'Related next'
              : 'Lyrics';
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
    else if (mode === 'NOTES') void loadNotes(track);
    else if (mode === 'NEXT') void loadRelated(track);
    else void loadLyrics(track);
  };

  const showSpinner =
    (mode === 'TRANSCRIPT' && transcriptLoading) ||
    (mode === 'NOTES' && notesLoading) ||
    (mode === 'NEXT' && relatedLoading) ||
    (mode !== 'TRANSCRIPT' && mode !== 'NOTES' && mode !== 'NEXT' && isLoading);

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
              ) : mode === 'NOTES' ? (
                <NotebookPen className="w-5 h-5" />
              ) : mode === 'NEXT' ? (
                <Radio className="w-5 h-5" />
              ) : (
                <Mic2 className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-serif-display text-lg font-bold text-[#f0ece1] truncate">{track.title}</h3>
              <p className="text-xs font-mono text-[#e2c986] truncate">
                {track.artist || 'Open Grace Music'}
                {mode === 'TRANSCRIPT' ? ' · Studio AI transcript' : mode === 'NOTES' ? ' · Listen notes' : ''}
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
                { id: 'NOTES' as const, label: 'NOTES', Icon: NotebookPen },
                { id: 'NEXT' as const, label: 'RELATED', Icon: Radio },
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
            disabled={showSpinner}
            title="Refresh"
            className="cassette-btn px-3 py-1.5 text-xs font-mono text-[#b8d99e]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${showSpinner ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto my-1 p-5 rounded-2xl cassette-window font-mono text-xs sm:text-sm text-[#f0ece1] leading-relaxed whitespace-pre-wrap selection:bg-[#b8d99e] selection:text-[#11120f]">
          {showSpinner ? (
            <div className="py-12 flex flex-col items-center justify-center text-[#9fa396] gap-2">
              <Sparkles className="w-6 h-6 animate-spin text-[#b8d99e]" />
              <p>
                {mode === 'TRANSCRIPT'
                  ? 'LISTENING TO THE TAPE…'
                  : mode === 'NOTES'
                    ? 'WRITING LISTEN NOTES…'
                    : mode === 'NEXT'
                      ? 'FINDING RELATED SEARCHES…'
                      : 'TUNING THE SHEET…'}
              </p>
            </div>
          ) : mode === 'NEXT' ? (
            related.length ? (
              <div className="space-y-2">
                <p className="text-[10px] text-[#9fa396]">
                  Next listens from this query family — tap to search in the YouTube tuner. Nothing is hardcoded.
                </p>
                {related.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="cassette-btn w-full justify-start px-3 py-2 text-left text-xs font-mono text-[#e2c986]"
                    onClick={() => onListenRelated?.(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            ) : (
              relatedError || 'Nothing on this sheet yet.'
            )
          ) : (
            activeText || 'Nothing on this sheet yet.'
          )}
        </div>
      </div>
    </div>
  );
};
