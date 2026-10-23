import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  Youtube,
  Clipboard,
  Loader2,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Disc3,
} from 'lucide-react';
import { AUDIOPHILE_FORMATS, AudiophileFormatId } from '../types';
import { extractYouTubeId } from '../services/mediaResolver';

interface DownloadDialogProps {
  isOpen: boolean;
  initialUrl?: string | null;
  isDownloading: boolean;
  downloadProgress: number;
  downloadStatus: string;
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
  onClose,
  onStartDownload,
  onOpenYouTubeBrowser,
}) => {
  const [url, setUrl] = useState('');
  const [selectedFormat, setSelectedFormat] = useState<AudiophileFormatId>('FLAC');
  const [mp3Bitrate, setMp3Bitrate] = useState<number>(320);
  const [hasRights, setHasRights] = useState(true);
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
      const res = await fetch(`/api/validate-url?url=${encodeURIComponent(trimmed)}`);
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
        setValidationError(data.error || 'Please enter a valid YouTube or direct audio URL.');
      }
    } catch {
      const ytId = extractYouTubeId(trimmed);
      if (ytId) {
        setPreviewData({
          valid: true,
          isYouTube: true,
          id: ytId,
          title: `YouTube Track (${ytId})`,
          author: 'YouTube Music',
          thumbnailUrl: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
        });
      } else {
        setPreviewData(null);
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
    if (!url.trim() || !hasRights || isDownloading) return;
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
      <div className="relative w-full max-w-xl bg-[#171814] border border-[#292a24] rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-[#292a24]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#21291d] text-[#b8d99e] border border-[#3a4433]">
              <Disc3 className="w-5 h-5 text-[#b8d99e]" />
            </div>
            <div>
              <h3 className="font-serif-display text-lg font-bold text-[#eeeae2]">
                Audiophile Lossless & Hi-Res Converter
              </h3>
              <p className="text-xs text-[#a3a198]">
                FLAC 24-bit/96kHz · ALAC · DSD 192kHz · WAV · MP3 320k
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDownloading}
            className="p-1.5 rounded-full text-[#a3a198] hover:text-[#eeeae2] hover:bg-[#252820] transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-[11px] font-mono font-medium text-[#a3a198] uppercase tracking-wider mb-1.5">
              PASTE YOUTUBE OR DIRECT AUDIO LINK
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                disabled={isDownloading}
                className="w-full pl-3.5 pr-20 py-2.5 rounded-xl bg-[#11120f] border border-[#292a24] text-[#eeeae2] placeholder-[#6e6d66] text-xs sm:text-sm focus:outline-none focus:border-[#b8d99e] transition-colors"
              />
              <button
                type="button"
                onClick={handlePaste}
                title="Paste link from clipboard"
                className="absolute right-2 px-2.5 py-1 rounded-lg bg-[#21291d] text-[#b8d99e] hover:bg-[#2b3626] border border-[#3a4433] text-xs font-medium flex items-center gap-1 transition-colors"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span>Paste</span>
              </button>
            </div>
          </div>

          {/* Audiophile Format Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-mono font-medium text-[#a3a198] uppercase tracking-wider">
                SELECT MASTER AUDIO FORMAT
              </label>
              <span className="text-[11px] font-mono text-[#b8d99e]">
                {activeFormatObj.spec}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {AUDIOPHILE_FORMATS.map((fmt) => {
                const isSelected = selectedFormat === fmt.id;
                return (
                  <button
                    key={fmt.id}
                    type="button"
                    disabled={isDownloading}
                    onClick={() => setSelectedFormat(fmt.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-[#b8d99e] text-[#11120f] border-[#b8d99e] shadow-md'
                        : 'bg-[#11120f] text-[#eeeae2] border-[#292a24] hover:border-[#3a4433]'
                    }`}
                  >
                    <div className="font-mono text-xs font-bold">{fmt.id}</div>
                    <div
                      className={`text-[10px] font-mono mt-0.5 ${
                        isSelected ? 'text-[#11120f]/80 font-semibold' : 'text-[#a3a198]'
                      }`}
                    >
                      {fmt.badge}
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedFormat === 'MP3' && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[11px] text-[#a3a198] font-mono">MP3 Bitrate:</span>
                {[320, 256, 192].map((br) => (
                  <button
                    key={br}
                    type="button"
                    onClick={() => setMp3Bitrate(br)}
                    className={`px-2.5 py-0.5 rounded-lg text-[11px] font-mono border transition-colors ${
                      mp3Bitrate === br
                        ? 'bg-[#21291d] text-[#b8d99e] border-[#b8d99e]'
                        : 'bg-[#11120f] text-[#a3a198] border-[#292a24]'
                    }`}
                  >
                    {br} kbps
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Live URL Validation & Simultaneous Embedded Video Preview */}
          {isLoadingPreview && (
            <div className="p-3 rounded-xl bg-[#11120f] border border-[#292a24] flex items-center gap-2 text-xs text-[#a3a198]">
              <Loader2 className="w-4 h-4 animate-spin text-[#b8d99e]" />
              <span>Validating link & probing stream metadata...</span>
            </div>
          )}

          {validationError && !isLoadingPreview && (
            <div className="p-3 rounded-xl bg-[#2a1616] border border-[#522929] flex items-center gap-2 text-xs text-[#fca5a5]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {previewData && (
            <div className="rounded-2xl border border-[#3a4433] bg-[#11120f] p-3.5 space-y-3">
              <div className="flex items-center gap-3">
                {previewData.thumbnailUrl ? (
                  <img
                    src={previewData.thumbnailUrl}
                    alt={previewData.title}
                    className="w-16 h-12 object-cover rounded-lg border border-[#3a4433] shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-[#21291d] border border-[#3a4433] flex items-center justify-center text-[#b8d99e]">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs sm:text-sm font-semibold text-[#eeeae2] truncate">
                    {previewData.title}
                  </h4>
                  <p className="text-[11px] font-mono text-[#b8d99e] truncate mt-0.5">
                    {previewData.author} · Target: {selectedFormat} ({activeFormatObj.badge})
                  </p>
                </div>
              </div>

              {previewData.isYouTube && (
                <div className="rounded-xl overflow-hidden aspect-video bg-black border border-[#292a24] relative">
                  <iframe
                    src={`https://www.youtube.com/embed/${previewData.id}?autoplay=0&enablejsapi=1`}
                    title="YouTube Live Preview"
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] text-[#86efac]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#86efac] animate-pulse" />
                  <span>Verified Audio Stream · Ready for {selectedFormat} Master Transcode</span>
                </span>
                <span className="font-mono text-[#b8d99e]">.{activeFormatObj.extension}</span>
              </div>
            </div>
          )}

          {/* Optional YouTube Account Cookies / Login Accordion */}
          <div className="rounded-xl bg-[#11120f] border border-[#292a24] p-3">
            <button
              type="button"
              onClick={() => setShowCookieBox(!showCookieBox)}
              className="w-full flex items-center justify-between text-xs text-[#a3a198] hover:text-[#eeeae2]"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <KeyRound className="w-3.5 h-3.5 text-[#b8d99e]" />
                <span>YouTube Account / Cookie Login (Optional for Restricted Videos)</span>
              </span>
              <span className="font-mono text-[10px] text-[#b8d99e]">
                {showCookieBox ? 'Hide ▲' : 'Configure ▼'}
              </span>
            </button>
            {showCookieBox && (
              <div className="mt-2.5 space-y-1.5">
                <textarea
                  rows={2}
                  value={cookies}
                  onChange={(e) => setCookies(e.target.value)}
                  placeholder="Optional: Paste YouTube Netscape cookies.txt or SID=...; HSID=... for private/age-restricted streams"
                  className="w-full p-2 rounded-lg bg-[#171814] border border-[#292a24] text-[11px] font-mono text-[#eeeae2] placeholder-[#6e6d66] focus:outline-none focus:border-[#b8d99e]"
                />
                <p className="text-[10px] text-[#6e6d66]">
                  Standard public tracks convert automatically via our studio FFmpeg + yt-dlp engine without cookies.
                </p>
              </div>
            )}
          </div>

          {/* Toggle: Save directly to phone Music / Downloads folder */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-[#11120f] border border-[#292a24]">
            <div>
              <p className="text-xs font-medium text-[#eeeae2]">
                Save directly to device Music / Downloads folder
              </p>
              <p className="text-[10px] text-[#a3a198]">
                Downloads the .{activeFormatObj.extension} file to your phone + saves in offline IndexedDB
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={saveToPhoneFolder}
                onChange={(e) => setSaveToPhoneFolder(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-[#292a24] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#b8d99e]"></div>
            </label>
          </div>

          {/* Rights Checkbox */}
          <label className="flex items-start gap-2.5 cursor-pointer pt-0.5">
            <input
              type="checkbox"
              checked={hasRights}
              onChange={(e) => setHasRights(e.target.checked)}
              className="mt-0.5 accent-[#b8d99e] rounded cursor-pointer"
            />
            <span className="text-xs text-[#a3a198] leading-relaxed">
              I own or have authorized access to convert and store this media in my personal offline library.
            </span>
          </label>

          {/* Converting / Loading indicator */}
          {isDownloading && (
            <div className="p-3.5 rounded-xl bg-[#11120f] border border-[#3a4433] space-y-2">
              <div className="flex items-center justify-between text-xs text-[#b8d99e]">
                <span className="flex items-center gap-1.5 font-medium">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {downloadStatus || `Transcoding ${selectedFormat} Master...`}
                </span>
                <span className="font-mono">{Math.round(downloadProgress * 100)}%</span>
              </div>
              <div className="w-full h-1.5 bg-[#292a24] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#b8d99e] transition-all duration-150 rounded-full"
                  style={{ width: `${Math.round(downloadProgress * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Action button */}
          <div className="pt-1 flex flex-col gap-2">
            <button
              type="submit"
              disabled={!url.trim() || !hasRights || isDownloading}
              className="w-full py-3.5 rounded-2xl bg-[#b8d99e] text-[#11120f] hover:bg-[#c8e6b0] font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Transcoding {selectedFormat} Master...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>
                    Convert to {selectedFormat} ({activeFormatObj.badge}) & Save
                  </span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => onOpenYouTubeBrowser(url || undefined)}
              className="text-xs text-[#a3a198] hover:text-[#b8d99e] py-1 text-center transition-colors flex items-center justify-center gap-1"
            >
              <Youtube className="w-3.5 h-3.5 text-[#b8d99e]" />
              <span>Search & Browse YouTube in app →</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
