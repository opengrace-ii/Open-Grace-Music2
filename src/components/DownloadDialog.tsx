import React, { useState, useEffect } from 'react';
import {
  X,
  Youtube,
  Clipboard,
  Loader2,
  KeyRound,
  AlertCircle,
  Disc3,
  Radio,
} from 'lucide-react';
import { AUDIOPHILE_FORMATS, AudiophileFormatId } from '../types';
import { extractYouTubeId } from '../services/mediaResolver';
import { loadSavedYoutubeCookies, saveYoutubeCookies } from '../services/youtubeCookies';
import {
  apiUrl,
  fetchWithTimeout,
  humanizeConverterError,
  studioFormatWarning,
} from '../services/converterApi';

interface DownloadDialogProps {
  isOpen: boolean;
  initialUrl?: string | null;
  isDownloading: boolean;
  downloadProgress: number;
  downloadStatus: string;
  downloadError?: string | null;
  onClose: () => void;
  onStartDownload: (
    url: string,
    format: AudiophileFormatId,
    bitrateKbps: number,
    saveToDeviceFolder: boolean,
    cookies?: string,
    customTitle?: string,
    customArtist?: string
  ) => void;
  onOpenYouTubeBrowser: (url?: string) => void;
}

export const DownloadDialog: React.FC<DownloadDialogProps> = ({
  isOpen,
  initialUrl,
  isDownloading,
  downloadProgress,
  downloadStatus,
  downloadError,
  onClose,
  onStartDownload,
  onOpenYouTubeBrowser,
}) => {
  const [url, setUrl] = useState('');
  const [selectedFormat, setSelectedFormat] = useState<AudiophileFormatId>('MP3');
  const [mp3Bitrate, setMp3Bitrate] = useState<number>(320);
  const [saveToPhoneFolder, setSaveToPhoneFolder] = useState(true);
  const [showCookieBox, setShowCookieBox] = useState(false);
  const [cookies, setCookies] = useState('');
  const [previewData, setPreviewData] = useState<{
    valid: boolean;
    isYouTube: boolean;
    id: string;
    title: string;
    author: string;
    thumbnailUrl: string;
  } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  useEffect(() => {
    setCookies(loadSavedYoutubeCookies());
  }, []);

  useEffect(() => {
    saveYoutubeCookies(cookies);
  }, [cookies]);

  useEffect(() => {
    if (initialUrl) {
      setUrl(initialUrl);
      validateUrl(initialUrl);
    }
  }, [initialUrl]);

  const validateUrl = async (rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      setPreviewData(null);
      setValidationError(null);
      return;
    }

    setIsLoadingPreview(true);
    setValidationError(null);
    try {
      const res = await fetchWithTimeout(apiUrl(`/api/validate-url?url=${encodeURIComponent(trimmed)}`), {
        timeoutMs: 20_000,
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setPreviewData({
          valid: true,
          isYouTube: !!data.isYouTube,
          id: data.videoId || data.id,
          title: data.title || 'Audio Stream',
          author: data.author || 'Open Grace Music',
          thumbnailUrl: data.thumbnailUrl || '',
        });
      } else {
        setPreviewData(null);
        setValidationError(data.error || 'Enter a valid YouTube or audio stream URL.');
      }
    } catch (err: unknown) {
      const ytId = extractYouTubeId(trimmed);
      const { message, code } = humanizeConverterError(err);
      if (ytId) {
        setPreviewData({
          valid: true,
          isYouTube: true,
          id: ytId,
          title: `YouTube Track (${ytId})`,
          author: 'YouTube Music',
          thumbnailUrl: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
        });
        if (code === 'NETWORK') {
          setValidationError(message);
        }
      } else {
        setPreviewData(null);
        setValidationError(message);
      }
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleUrlChange = (newVal: string) => {
    setUrl(newVal);
    validateUrl(newVal);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        validateUrl(text);
      }
    } catch {
      // ignore
    }
  };

  if (!isOpen) return null;

  const activeFormatObj =
    AUDIOPHILE_FORMATS.find((f) => f.id === selectedFormat) || AUDIOPHILE_FORMATS[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || isDownloading) return;
    const effectiveBitrate =
      selectedFormat === 'MP3' ? mp3Bitrate : activeFormatObj.bitrateKbps;
    onStartDownload(
      url.trim(),
      selectedFormat,
      effectiveBitrate,
      saveToPhoneFolder,
      cookies.trim() || undefined,
      previewData?.title,
      previewData?.author
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl cassette-card rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-[#272c23]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1c2418] border border-[#3a4533] flex items-center justify-center text-[#b8d99e]">
              <Disc3 className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="cassette-led cassette-led-rec" />
                <h3 className="font-serif-display text-lg font-bold text-[#f0ece1]">
                  Master Tape Deck Recorder
                </h3>
              </div>
              <p className="text-[11px] font-mono text-[#9fa396]">
                {activeFormatObj.id} · {activeFormatObj.badge}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDownloading}
            className="cassette-btn p-2 text-[#9fa396]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* URL Slot */}
          <div className="cassette-window p-2 rounded-2xl flex items-center gap-2">
            <input
              type="text"
              placeholder="Paste YouTube or Audio Stream URL..."
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              disabled={isDownloading}
              className="flex-1 bg-transparent px-3 py-2 text-[#f0ece1] placeholder-[#686b60] text-xs sm:text-sm focus:outline-none font-mono"
            />
            <button
              type="button"
              onClick={handlePaste}
              title="Paste link"
              className="cassette-btn px-3 py-2 text-xs font-mono text-[#b8d99e] shrink-0"
            >
              <Clipboard className="w-3.5 h-3.5" />
              <span>PASTE</span>
            </button>
          </div>

          {/* Tape Bias / Master Format Selector Bank */}
          <div className="cassette-bank grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            {AUDIOPHILE_FORMATS.map((fmt) => {
              const isSelected = selectedFormat === fmt.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  disabled={isDownloading}
                  onClick={() => setSelectedFormat(fmt.id)}
                  className={`cassette-btn flex-col items-start px-3 py-2 text-left ${
                    isSelected ? 'cassette-btn-engaged' : ''
                  }`}
                >
                  <div className="w-full flex items-center justify-between">
                    <span className="font-mono text-xs font-bold">{fmt.id}</span>
                    <span className={`cassette-led ${isSelected ? 'cassette-led-on' : ''}`} />
                  </div>
                  <div className="text-[10px] font-mono text-[#9fa396] mt-0.5 truncate w-full">
                    {fmt.badge}
                  </div>
                </button>
              );
            })}
          </div>

          {studioFormatWarning(selectedFormat) && (
            <p className="mt-2 text-[11px] font-mono text-[#e2c986] leading-snug">
              {studioFormatWarning(selectedFormat)}
            </p>
          )}

          {selectedFormat === 'MP3' && (
            <div className="cassette-bank flex items-center justify-between px-3 py-1.5">
              <span className="text-[11px] font-mono text-[#9fa396]">TAPE BIAS BITRATE</span>
              <div className="flex items-center gap-1.5">
                {[320, 256, 192].map((br) => (
                  <button
                    key={br}
                    type="button"
                    onClick={() => setMp3Bitrate(br)}
                    className={`cassette-btn px-2.5 py-1 text-[11px] font-mono ${
                      mp3Bitrate === br ? 'cassette-btn-engaged' : ''
                    }`}
                  >
                    {br}K
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Live URL Validation & Monitor Screen */}
          {isLoadingPreview && (
            <div className="cassette-window p-3 rounded-xl flex items-center gap-2 text-xs font-mono text-[#b8d99e]">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>TUNING STREAM SIGNAL...</span>
            </div>
          )}

          {validationError && !isLoadingPreview && (
            <div className="p-3 rounded-xl bg-[#2a1616] border border-[#522929] flex items-center gap-2 text-xs text-[#fca5a5]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {previewData && (
            <div className="cassette-window rounded-2xl p-3.5 space-y-3">
              <div className="flex items-center gap-3">
                <span className="cassette-led cassette-led-on shrink-0" />
                <div className="min-w-0 flex-1">
                  <h4 className="font-serif-display text-sm sm:text-base font-bold text-[#f0ece1] truncate">
                    {previewData.title}
                  </h4>
                  <p className="text-[11px] font-mono text-[#b8d99e] truncate">
                    {previewData.author} · {selectedFormat} ({activeFormatObj.badge})
                  </p>
                </div>
              </div>

              {previewData.isYouTube && (
                <div
                  className="relative w-full rounded-xl overflow-hidden border border-[#272c23] bg-[#0e0f0d] min-h-[200px]"
                  style={{ aspectRatio: '16 / 9' }}
                >
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${previewData.id}?playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}`}
                    title="YouTube Monitor"
                    className="absolute inset-0 w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    allowFullScreen
                  />
                </div>
              )}
            </div>
          )}

          {/* Compact Hardware Switches */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => setSaveToPhoneFolder(!saveToPhoneFolder)}
              className={`cassette-btn px-3 py-1.5 text-xs font-mono ${
                saveToPhoneFolder ? 'cassette-btn-engaged' : 'text-[#9fa396]'
              }`}
            >
              <span className={`cassette-led ${saveToPhoneFolder ? 'cassette-led-on' : ''}`} />
              <span>EXPORT .{activeFormatObj.extension.toUpperCase()} TO DEVICE</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCookieBox(!showCookieBox)}
              className={`cassette-btn px-3 py-1.5 text-xs font-mono ${
                showCookieBox ? 'cassette-btn-engaged' : 'text-[#9fa396]'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5 text-[#e2c986]" />
              <span>STUDIO KEY</span>
            </button>
          </div>

          {showCookieBox && (
            <div className="cassette-window p-2.5 rounded-xl">
              <textarea
                rows={2}
                value={cookies}
                onChange={(e) => setCookies(e.target.value)}
                placeholder="Paste YouTube cookies if needed for private streams..."
                className="w-full bg-transparent text-[11px] font-mono text-[#f0ece1] placeholder-[#686b60] focus:outline-none"
              />
            </div>
          )}

          {/* Recording Progress Meter */}
          {isDownloading && (
            <div className="cassette-window p-3.5 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-[#b8d99e]">
                <span className="flex items-center gap-2">
                  <span className="cassette-led cassette-led-rec animate-ping" />
                  <span>{downloadStatus || `RECORDING ${selectedFormat} MASTER...`}</span>
                </span>
                <span>{Math.round(downloadProgress * 100)}%</span>
              </div>
              <div className="w-full h-2 bg-[#161a13] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#b8d99e] to-[#e2c986] transition-all duration-150 rounded-full"
                  style={{ width: `${Math.round(downloadProgress * 100)}%` }}
                />
              </div>
            </div>
          )}

          {downloadError && !isDownloading && (
            <div className="p-3.5 rounded-xl bg-[#2a1616] border border-[#522929] flex items-start gap-2.5 text-xs text-[#fca5a5]">
              <span className="cassette-led cassette-led-rec shrink-0 mt-1" />
              <div className="min-w-0">
                <p className="font-mono font-bold uppercase tracking-wide">Recording failed</p>
                <p className="mt-1 leading-snug">{downloadError}</p>
              </div>
            </div>
          )}

          {/* Primary Cassette Transport Action Bank */}
          <div className="cassette-bank flex flex-col sm:flex-row gap-2 pt-1">
            <button
              type="submit"
              disabled={!url.trim() || isDownloading}
              className="cassette-btn cassette-btn-primary flex-1 py-3.5 px-5 text-xs sm:text-sm font-mono uppercase tracking-wider disabled:opacity-40"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>RECORDING {selectedFormat}...</span>
                </>
              ) : (
                <>
                  <Radio className="w-4 h-4" />
                  <span>⏺ RECORD {selectedFormat} TO LIBRARY</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => onOpenYouTubeBrowser(url || undefined)}
              className="cassette-btn px-4 py-3 text-xs font-mono text-[#e2c986]"
            >
              <Youtube className="w-4 h-4" />
              <span>YOUTUBE TUNER</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
