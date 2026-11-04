import React, { useCallback, useEffect, useState } from 'react';
import { X, Search, Youtube, Radio, Play, ClipboardPaste, Plus, Square } from 'lucide-react';
import { extractYouTubeId } from '../services/mediaResolver';
import { apiUrl, fetchWithTimeout } from '../services/converterApi';
import {
  addTunerSearchChip,
  loadTunerSearchChips,
  removeTunerSearchChip,
} from '../services/tunerSearchChips';
import { compactRecordLabel } from '../services/converterApi';
import { RecorderStatusLine } from './RecorderStatusLine';
import { FormatEstimatePicker } from './FormatEstimatePicker';
import { AudiophileFormatId } from '../types';

interface YouTubeBrowserModalProps {
  isOpen: boolean;
  initialUrl?: string | null;
  initialQuery?: string | null;
  onClose: () => void;
  presentation?: 'overlay' | 'page';
  onConvertVideo: (
    videoUrl: string,
    meta?: { title?: string; author?: string }
  ) => void;
  onListenVideo?: (
    videoUrl: string,
    meta?: { title?: string; author?: string }
  ) => void;
  isRecording?: boolean;
  recordPercent?: number;
  recordStatus?: string;
  recordError?: string | null;
  recordSaved?: boolean;
  recorderOnline?: boolean | null;
  recorderSecretConfigured?: boolean | null;
  onCancelRecord?: () => void;
  selectedFormat?: AudiophileFormatId;
  onSelectFormat?: (id: AudiophileFormatId) => void;
  mp3Bitrate?: number;
}

type TunerMode = 'browse' | 'watch';

interface CatalogVideo {
  id: string;
  title: string;
  author: string;
  thumbnailUrl: string;
}

export const YouTubeBrowserModal: React.FC<YouTubeBrowserModalProps> = ({
  isOpen,
  initialUrl,
  initialQuery,
  onClose,
  presentation = 'overlay',
  onConvertVideo,
  onListenVideo,
  isRecording = false,
  recordPercent = 0,
  recordStatus = '',
  recordError = null,
  recordSaved = false,
  recorderOnline = null,
  recorderSecretConfigured = null,
  onCancelRecord,
  selectedFormat = 'MP3',
  onSelectFormat,
  mp3Bitrate = 320,
}) => {
  const initialId = extractYouTubeId(initialUrl || '');
  const [mode, setMode] = useState<TunerMode>(initialId ? 'watch' : 'browse');
  const [searchInput, setSearchInput] = useState(initialUrl || '');
  const [selectedYtId, setSelectedYtId] = useState<string | null>(initialId);
  const [previewInfo, setPreviewInfo] = useState<{ title: string; author: string; durationSec?: number } | null>(
    null
  );
  const [catalog, setCatalog] = useState<CatalogVideo[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [savedSearches, setSavedSearches] = useState<string[]>(() => loadTunerSearchChips());
  const [chipDraft, setChipDraft] = useState('');

  const fetchInfo = useCallback(async (id: string) => {
    try {
      const res = await fetchWithTimeout(
        apiUrl(`/api/validate-url?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`),
        { timeoutMs: 12_000 }
      );
      const json = (await res.json()) as {
        title?: string;
        author?: string;
        durationSec?: number;
      };
      if (res.ok) {
        setPreviewInfo({
          title: json.title || `YouTube ${id}`,
          author: json.author || 'YouTube',
          durationSec: Number(json.durationSec) || 0,
        });
        return;
      }
    } catch {
      // fall through to oEmbed
    }
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`
      );
      if (res.ok) {
        const json = await res.json();
        setPreviewInfo({ title: json.title, author: json.author_name, durationSec: 0 });
      }
    } catch {
      // ignore
    }
  }, []);

  const loadCatalog = useCallback(async (query: string) => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const q = query.trim();
      const path = q
        ? `/api/youtube/search?q=${encodeURIComponent(q)}`
        : '/api/youtube/search';
      const res = await fetchWithTimeout(apiUrl(path), { timeoutMs: 20_000 });
      const json = (await res.json()) as { videos?: CatalogVideo[]; error?: string };
      const videos = json.videos || [];
      setCatalog(videos);
      if (!res.ok && json.error) setCatalogError(json.error);
    } catch {
      setCatalogError('YouTube catalog is warming up — try a search in a moment.');
      setCatalog([]);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const id = extractYouTubeId(initialUrl || '');
    const q = (initialQuery || '').trim();
    setSearchInput(id ? initialUrl || '' : q || initialUrl || '');
    setSelectedYtId(id);
    setMode(id ? 'watch' : 'browse');
    if (id) fetchInfo(id);
    void loadCatalog(id ? '' : q);
  }, [isOpen, initialUrl, initialQuery, fetchInfo, loadCatalog]);

  useEffect(() => {
    if (selectedYtId) fetchInfo(selectedYtId);
  }, [selectedYtId, fetchInfo]);

  const addSavedSearch = (raw: string) => {
    const next = addTunerSearchChip(raw, savedSearches);
    setSavedSearches(next);
    setChipDraft('');
  };

  if (!isOpen) return null;

  const applyVideoId = (id: string, meta?: { title?: string; author?: string }) => {
    setSelectedYtId(id);
    setSearchInput(`https://www.youtube.com/watch?v=${id}`);
    setMode('watch');
    if (meta?.title && meta?.author) {
      setPreviewInfo({ title: meta.title, author: meta.author });
      void loadCatalog(`${meta.title} ${meta.author}`);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = searchInput.trim();
    const id = extractYouTubeId(raw);
    if (id) {
      applyVideoId(id);
      return;
    }
    setMode('browse');
    void loadCatalog(raw);
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return;
      setSearchInput(text.trim());
      const id = extractYouTubeId(text.trim());
      if (id) applyVideoId(id);
    } catch {
      // clipboard denied
    }
  };

  const watchUrl = selectedYtId ? `https://www.youtube.com/watch?v=${selectedYtId}` : null;

  const videoPlayer = selectedYtId ? (
    <div
      className="relative w-full rounded-2xl overflow-hidden border border-[#2b3326] bg-[#0e0f0d] shadow-lg min-h-[120px] max-h-[180px]"
      style={{ aspectRatio: '16 / 9' }}
    >
      <img
        src={`https://img.youtube.com/vi/${selectedYtId}/hqdefault.jpg`}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
        <Play className="w-8 h-8 text-white fill-white" />
      </div>
    </div>
  ) : null;

  const resultGrid = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto scrollbar-none min-h-0 flex-1">
      {catalog.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => applyVideoId(v.id, { title: v.title, author: v.author })}
          className={`cassette-btn justify-start p-2.5 text-left ${
            selectedYtId === v.id ? 'cassette-btn-engaged' : ''
          }`}
        >
          <div className="w-16 h-10 rounded bg-[#1c2418] overflow-hidden shrink-0 relative">
            <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
              <Play className="w-3 h-3 text-white fill-white" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[#f0ece1] truncate">{v.title}</p>
            <p className="text-[10px] font-mono text-[#9fa396] truncate">{v.author}</p>
          </div>
        </button>
      ))}
    </div>
  );

  const shellClass =
    presentation === 'page'
      ? 'flex flex-col flex-1 min-h-[70vh] w-full cassette-card rounded-3xl overflow-hidden'
      : 'fixed inset-0 z-50 flex flex-col bg-[#0a0c09]/95 backdrop-blur-sm animate-in fade-in duration-200';
  const innerClass =
    presentation === 'page'
      ? 'flex flex-col flex-1 min-h-0 w-full overflow-hidden'
      : 'flex flex-col flex-1 min-h-0 w-full max-w-5xl mx-auto sm:my-2 sm:rounded-3xl sm:border sm:border-[#2b3326] cassette-card shadow-2xl overflow-hidden';

  return (
    <div className={shellClass}>
      <div className={innerClass}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#272c23] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-[#2a1818] text-[#f87171] border border-[#4a2626] shrink-0">
              <Youtube className="w-5 h-5" />
            </div>
            <h3 className="font-serif-display text-base sm:text-lg font-bold text-[#f0ece1] truncate">
              YouTube Studio Tuner
            </h3>
          </div>
          {presentation === 'overlay' && (
            <button onClick={onClose} className="cassette-btn p-2 text-[#9fa396]" type="button">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="cassette-bank flex gap-1.5 px-4 py-2 shrink-0 border-b border-[#1f241c]">
          {(
            [
              { id: 'browse' as const, label: 'Browse YouTube' },
              { id: 'watch' as const, label: 'Watch & Record' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMode(tab.id)}
              className={`cassette-btn px-3 py-1.5 text-xs font-mono ${
                mode === tab.id ? 'cassette-btn-engaged' : 'text-[#9fa396]'
              }`}
            >
              <span className={`cassette-led ${mode === tab.id ? 'cassette-led-on' : ''}`} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="px-4 pt-2 flex flex-col gap-1.5 shrink-0">
          {savedSearches.length === 0 ? (
            <p className="text-[11px] font-mono text-[#9fa396]">Add a search you use often.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {savedSearches.map((station) => (
                <div key={station} className="cassette-btn px-2 py-1 text-[10px] font-mono text-[#e2c986] max-w-full">
                  <button
                    type="button"
                    className="min-w-0 break-words text-left"
                    onClick={() => {
                      setSearchInput(station);
                      setMode('browse');
                      void loadCatalog(station);
                    }}
                  >
                    {station}
                  </button>
                  <button
                    type="button"
                    className="text-[#686b60] hover:text-[#f87171] shrink-0"
                    title="Remove saved search"
                    onClick={() => setSavedSearches(removeTunerSearchChip(station, savedSearches))}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              addSavedSearch(chipDraft);
            }}
          >
            <input
              value={chipDraft}
              onChange={(e) => setChipDraft(e.target.value)}
              placeholder="Save a search you use often"
              className="flex-1 cassette-window rounded-xl px-3 py-1.5 bg-transparent text-[11px] font-mono text-[#f0ece1] placeholder-[#686b60] focus:outline-none min-w-0"
            />
            <button type="submit" className="cassette-btn px-2.5 py-1.5 text-[10px] font-mono text-[#b8d99e] shrink-0">
              <Plus className="w-3 h-3" />
              Add
            </button>
          </form>
        </div>

        <form onSubmit={handleSearchSubmit} className="px-4 py-2 flex gap-2 shrink-0">
          <div className="relative flex-1 cassette-window rounded-xl flex items-center px-3 min-w-0">
            <Search className="w-4 h-4 text-[#686b60] shrink-0" />
            <input
              type="text"
              placeholder="Search YouTube or paste a watch link…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full px-2.5 py-2.5 bg-transparent text-[#f0ece1] placeholder-[#686b60] text-xs sm:text-sm focus:outline-none font-mono truncate"
            />
          </div>
          <button
            type="button"
            onClick={pasteFromClipboard}
            className="cassette-btn px-3 py-2 text-[#b8d99e] shrink-0"
            title="Paste"
          >
            <ClipboardPaste className="w-4 h-4" />
          </button>
          <button type="submit" className="cassette-btn px-4 py-2 text-xs font-mono text-[#b8d99e] shrink-0">
            TUNE
          </button>
        </form>

        <div className="flex-1 min-h-0 flex flex-col px-4 pb-4 gap-2">
          {mode === 'browse' ? (
            <div className="flex-1 min-h-0 flex flex-col gap-2">
              {selectedYtId ? videoPlayer : null}
              {catalogLoading ? (
                <div className="flex-1 min-h-[30vh] flex items-center justify-center cassette-window rounded-2xl">
                  <div className="w-8 h-8 border-2 border-[#b8d99e] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : catalog.length > 0 ? (
                resultGrid
              ) : (
                <div className="flex-1 min-h-[30vh] flex flex-col items-center justify-center gap-2 cassette-window rounded-2xl">
                  <Youtube className="w-10 h-10 text-[#f87171]" />
                  <p className="text-xs font-mono text-[#9fa396]">
                    {catalogError || 'Search YouTube in the bar above'}
                  </p>
                </div>
              )}
            </div>
          ) : selectedYtId ? (
            <div className="flex-1 min-h-0 flex flex-col gap-2">
              {videoPlayer}

              <div className="p-3 rounded-2xl cassette-window flex flex-col gap-3 shrink-0">
                <div className="min-w-0 w-full">
                  <span className="inline-flex px-2 py-0.5 rounded-md bg-[#1c2418] border border-[#3a4533] text-[10px] font-mono font-bold text-[#b8d99e]">
                    VIDEO DETECTED
                  </span>
                  <h4 className="font-serif-display text-sm sm:text-base font-bold text-[#f0ece1] break-words mt-1.5">
                    {previewInfo?.title || `YouTube Master (${selectedYtId})`}
                  </h4>
                  <p className="text-xs font-mono text-[#b8d99e] mt-0.5 break-words">
                    {previewInfo?.author || 'Studio Stream Ready'}
                  </p>
                </div>
                <div className="flex flex-col gap-2 w-full">
                  <FormatEstimatePicker
                    selected={selectedFormat}
                    onSelect={(id) => onSelectFormat?.(id)}
                    durationSec={Number(previewInfo?.durationSec) || 0}
                    mp3Bitrate={mp3Bitrate}
                    disabled={isRecording}
                  />
                  <RecorderStatusLine online={recorderOnline} secretConfigured={recorderSecretConfigured} />
                  <button
                    type="button"
                    disabled={isRecording}
                    onClick={() =>
                      watchUrl &&
                      (onListenVideo || onConvertVideo)(
                        watchUrl,
                        previewInfo ? { title: previewInfo.title, author: previewInfo.author } : undefined
                      )
                    }
                    className="cassette-btn w-full px-5 py-2.5 text-xs font-mono"
                  >
                    <Play className="w-4 h-4" />
                    <span>LISTEN</span>
                  </button>
                  {isRecording ? (
                    <button
                      type="button"
                      onClick={() => onCancelRecord?.()}
                      className="cassette-btn cassette-btn-primary w-full px-5 py-2.5 text-xs font-mono"
                    >
                      <Square className="w-4 h-4 fill-current" />
                      <span>{compactRecordLabel(true, false, recordPercent, recordStatus)}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        watchUrl &&
                        onConvertVideo(
                          watchUrl,
                          previewInfo ? { title: previewInfo.title, author: previewInfo.author } : undefined
                        )
                      }
                      className="cassette-btn cassette-btn-primary w-full px-5 py-2.5 text-xs font-mono"
                    >
                      <Radio className="w-4 h-4" />
                      <span>
                        {compactRecordLabel(false, recordSaved, recordPercent, recordStatus)}
                      </span>
                    </button>
                  )}
                  {isRecording && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-mono text-[#b8d99e]">
                        {compactRecordLabel(true, false, recordPercent, recordStatus)}
                        {recordStatus ? ` · ${recordStatus}` : ''}
                      </p>
                      <div className="w-full h-2 bg-[#161a13] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#b8d99e] to-[#e2c986] transition-all duration-200 rounded-full"
                          style={{ width: `${Math.round(recordPercent * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {recordSaved && !isRecording && !recordError && (
                    <p className="text-[11px] font-mono text-[#86efac]">Saved to Library</p>
                  )}
                  {recordError && !isRecording && (
                    <p className="text-[11px] font-mono text-[#fca5a5] leading-snug">{recordError}</p>
                  )}
                </div>
              </div>
              {catalog.length > 0 ? (
                <div className="min-h-0 flex-1 flex flex-col gap-1">
                  <p className="text-[10px] font-mono text-[#686b60] uppercase tracking-wider">More in this mood</p>
                  {resultGrid}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex-1 min-h-[40vh] flex flex-col items-center justify-center cassette-window rounded-2xl">
              <p className="text-xs font-mono text-[#9fa396]">Pick a tape from Browse YouTube</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
