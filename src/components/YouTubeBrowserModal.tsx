import React, { useState } from 'react';
import { X, Search, Youtube, Download, ExternalLink, Play, Sparkles } from 'lucide-react';
import { extractYouTubeId } from '../services/mediaResolver';

interface YouTubeBrowserModalProps {
  isOpen: boolean;
  initialUrl?: string | null;
  onClose: () => void;
  onConvertVideo: (videoUrl: string) => void;
}

export const YouTubeBrowserModal: React.FC<YouTubeBrowserModalProps> = ({
  isOpen,
  initialUrl,
  onClose,
  onConvertVideo,
}) => {
  const [searchInput, setSearchInput] = useState(initialUrl || '');
  const [selectedYtId, setSelectedYtId] = useState<string | null>(
    extractYouTubeId(initialUrl || '') || 'Xc6JIstj8GY'
  );
  const [previewInfo, setPreviewInfo] = useState<{ title: string; author: string } | null>(null);

  if (!isOpen) return null;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractYouTubeId(searchInput.trim());
    if (id) {
      setSelectedYtId(id);
      fetchInfo(id);
    }
  };

  const fetchInfo = async (id: string) => {
    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
      if (res.ok) {
        const json = await res.json();
        setPreviewInfo({ title: json.title, author: json.author_name });
      }
    } catch {
      // ignore
    }
  };

  const curatedVideos = [
    { id: 'jfKfPfyJRdk', title: 'Lofi Girl - Relaxing Beats to Study/Chill to', author: 'Lofi Girl' },
    { id: '5qap5aO4i9A', title: 'Lofi Hip Hop Radio - Beats to Sleep/Chill to', author: 'Lofi Records' },
    { id: 'DWcJFNfaw9c', title: 'Acoustic Guitar Peaceful Meditation', author: 'Acoustic Morning' },
    { id: '0T8NnR21s0Q', title: 'Open Grace Classical Masterpieces', author: 'Symphony Hall' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-[#141814] border border-[#282E27] rounded-3xl p-5 sm:p-7 shadow-2xl flex flex-col max-h-[92vh] overflow-y-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#242A23]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#3A1E1E] text-[#F87171]">
              <Youtube className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif-display text-lg font-bold text-[#F1F5EC]">
                YouTube Audio Browser
              </h3>
              <p className="text-xs text-[#A2ACA0]">
                Search or paste video URL to extract and keep in your offline library
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-[#A2ACA0] hover:text-[#F1F5EC] hover:bg-[#252C24] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search / URL input */}
        <form onSubmit={handleSearchSubmit} className="mt-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#6F796E] absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Paste YouTube Link or Video ID (e.g. https://youtu.be/0T8NnR21s0Q)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#1A1F1A] border border-[#2E372C] text-[#F1F5EC] placeholder-[#6F796E] text-xs sm:text-sm focus:outline-none focus:border-[#B8D99E]"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-[#2B3626] text-[#B8D99E] hover:bg-[#34422E] font-medium text-xs border border-[#43543B] transition-colors shrink-0"
          >
            Load Video
          </button>
        </form>

        {/* Video Player Preview Stage */}
        {selectedYtId && (
          <div className="mt-4 rounded-2xl overflow-hidden border border-[#282E27] bg-black aspect-video relative shadow-lg">
            <iframe
              src={`https://www.youtube.com/embed/${selectedYtId}?autoplay=0&enablejsapi=1`}
              title="YouTube video player"
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        {/* Selected Video Action bar */}
        {selectedYtId && (
          <div className="mt-3 p-3.5 rounded-xl bg-[#1A201A] border border-[#2B3529] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-[#F1F5EC] truncate">
                {previewInfo?.title || `YouTube Video (${selectedYtId})`}
              </h4>
              <p className="text-xs text-[#B8D99E] mt-0.5">
                {previewInfo?.author || 'Selected Audio Source'}
              </p>
            </div>
            <button
              onClick={() => onConvertVideo(`https://www.youtube.com/watch?v=${selectedYtId}`)}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#B8D99E] text-[#0F150C] hover:bg-[#C9E7B1] font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>Convert & Save to Library</span>
            </button>
          </div>
        )}

        {/* Curated Recommendations */}
        <div className="mt-4">
          <label className="text-xs font-semibold text-[#6F796E] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#B8D99E]" />
            Featured Listening Inspirations:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
            {curatedVideos.map((v) => (
              <div
                key={v.id}
                onClick={() => {
                  setSelectedYtId(v.id);
                  setSearchInput(`https://www.youtube.com/watch?v=${v.id}`);
                  fetchInfo(v.id);
                }}
                className={`p-2.5 rounded-xl border flex items-center gap-3 cursor-pointer transition-colors ${
                  selectedYtId === v.id
                    ? 'bg-[#222A20] border-[#B8D99E]'
                    : 'bg-[#181D18] border-[#262C25] hover:border-[#384236]'
                }`}
              >
                <div className="w-12 h-9 rounded bg-[#2B3626] overflow-hidden shrink-0 relative">
                  <img
                    src={`https://img.youtube.com/vi/${v.id}/hqdefault.jpg`}
                    alt={v.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Play className="w-3 h-3 text-white fill-white" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[#F1F5EC] truncate">{v.title}</p>
                  <p className="text-[10px] text-[#A2ACA0] truncate mt-0.5">{v.author}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
