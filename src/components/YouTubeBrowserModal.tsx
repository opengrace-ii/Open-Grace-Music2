import React, { useCallback, useEffect, useState } from 'react';
import { X, Search, Youtube, Radio, Play, ClipboardPaste } from 'lucide-react';
import { extractYouTubeId } from '../services/mediaResolver';
import { apiUrl, fetchWithTimeout } from '../services/converterApi';

interface YouTubeBrowserModalProps {
  isOpen: boolean;
  initialUrl?: string | null;
  onClose: () => void;
  onConvertVideo: (
    videoUrl: string,
    meta?: { title?: string; author?: string }
  ) => void;
}

type TunerMode = 'browse' | 'watch';

interface CatalogVideo {
  id: string;
  title: string;
  author: string;
  thumbnailUrl: string;
}

const embedUrl = (videoId: string) =>
  `https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0&modestbranding=1&autoplay=1&enablejsapi=1&origin=${encodeURIComponent(
    typeof window !== 'undefined' ? window.location.origin : ''
  )}`;

export const YouTubeBrowserModal: React.FC<YouTubeBrowserModalProps> = ({
  isOpen,
  initialUrl,
  onClose,
  onConvertVideo,
}) => {
  const initialId = extractYouTubeId(initialUrl || '');
  const [mode, setMode] = useState<TunerMode>(initialId ? 'watch' : 'browse');
  const [searchInput, setSearchInput] = useState(initialUrl || '');
  const [selectedYtId, setSelectedYtId] = useState<string | null>(initialId);
  const [previewInfo, setPreviewInfo] = useState<{ title: string; author: string } | null>(null);
  const [embedReady, setEmbedReady] = useState(false);
  const [catalog, setCatalog] = useState<CatalogVideo[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const fetchInfo = useCallback(async (id: string) => {
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`
      );
      if (res.ok) {
        const json = await res.json();
        setPreviewInfo({ title: json.title, author: json.author_name });
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
    setSearchInput(initialUrl || '');
    setSelectedYtId(id);
    setMode(id ? 'watch' : 'browse');
    setEmbedReady(false);
    if (id) fetchInfo(id);
    else void loadCatalog('');
  }, [isOpen, initialUrl, fetchInfo, loadCatalog]);

  useEffect(() => {
    if (selectedYtId) fetchInfo(selectedYtId);
  }, [selectedYtId, fetchInfo]);

  if (!isOpen) return null;

  const applyVideoId = (id: string, meta?: { title?: string; author?: string }) => {
    setSelectedYtId(id);
    setSearchInput(`https://www.youtube.com/watch?v=${id}`);
    setMode('watch');
    setEmbedReady(false);
    if (meta?.title && meta?.author) setPreviewInfo({ title: meta.title, author: meta.author });
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
      className="relative w-full rounded-2xl overflow-hidden border border-[#2b3326] bg-[#0e0f0d] shadow-lg flex-1 min-h-[220px] max-h-[min(52vh,560px)]"
      style={{ aspectRatio: '16 / 9' }}
    >
      {!embedReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#141812] z-10">
          <div className="w-8 h-8 border-2 border-[#b8d99e] border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      )}
      <iframe
        key={selectedYtId}
        src={embedUrl(selectedYtId)}
        title="YouTube"
        className="absolute inset-0 w-full h-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        onLoad={() => setEmbedReady(true)}
      />
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0c09]/95 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex flex-col flex-1 min-h-0 w-full max-w-5xl mx-auto sm:my-2 sm:rounded-3xl sm:border sm:border-[#2b3326] cassette-card shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#272c23] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#2a1818] text-[#f87171] border border-[#4a2626]">
              <Youtube className="w-5 h-5" />
            </div>
            <h3 className="font-serif-display text-base sm:text-lg font-bold text-[#f0ece1]">
              YouTube Studio Tuner
            </h3>
          </div>
          <button onClick={onClose} className="cassette-btn p-2 text-[#9fa396]" type="button">
            <X className="w-4 h-4" />
          </button>
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

              <div className="p-3 rounded-2xl cassette-window flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-3 shrink-0">
                <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <div className="flex flex-wrap items-center gap-2 min-w-0 mb-1">
                    <span className="inline-flex px-2 py-0.5 rounded-md bg-[#1c2418] border border-[#3a4533] text-[10px] font-mono font-bold text-[#b8d99e] whitespace-nowrap shrink-0">
                      VIDEO DETECTED
                    </span>
                    <h4 className="font-serif-display text-sm sm:text-base font-bold text-[#f0ece1] truncate min-w-0 flex-1">
                      {previewInfo?.title || `YouTube Master (${selectedYtId})`}
                    </h4>
                  </div>
                  <p className="text-xs font-mono text-[#b8d99e] mt-0.5 truncate">
                    {previewInfo?.author || 'Studio Stream Ready'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    watchUrl &&
                    onConvertVideo(watchUrl, previewInfo
                      ? { title: previewInfo.title, author: previewInfo.author }
                      : undefined)
                  }
                  className="cassette-btn cassette-btn-primary w-full sm:w-auto px-5 py-2.5 text-xs font-mono shrink-0"
                >
                  <Radio className="w-4 h-4" />
                  <span>⏺ RECORD TO CASSETTE LIBRARY</span>
                </button>
              </div>
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
