import React, { useState } from 'react';
import { X, Search, Youtube, Radio, Play } from 'lucide-react';
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
    { id: 'DWcJFNfaw9c', title: 'Acoustic Guitar Peaceful Sanctuary', author: 'Acoustic Morning' },
    { id: '0T8NnR21s0Q', title: 'Open Grace Classical Masterpieces', author: 'Symphony Hall' },
    { id: 'jfKfPfyJRdk', title: 'Midnight Instrumental Sessions', author: 'Lofi Studio' },
    { id: '5qap5aO4i9A', title: 'Warm Vinyl Chillhop Beats', author: 'Chillhop Music' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl cassette-card rounded-3xl p-5 sm:p-7 shadow-2xl flex flex-col max-h-[92vh] overflow-y-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#272c23]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#2a1818] text-[#f87171] border border-[#4a2626]">
              <Youtube className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif-display text-lg font-bold text-[#f0ece1]">
                YouTube Studio Tuner
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="cassette-btn p-2 text-[#9fa396]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search / URL input */}
        <form onSubmit={handleSearchSubmit} className="mt-4 flex gap-2">
          <div className="relative flex-1 cassette-window rounded-xl flex items-center px-3">
            <Search className="w-4 h-4 text-[#686b60] shrink-0" />
            <input
              type="text"
              placeholder="Paste YouTube Link or Video ID..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full px-2.5 py-2.5 bg-transparent text-[#f0ece1] placeholder-[#686b60] text-xs sm:text-sm focus:outline-none font-mono"
            />
          </div>
          <button
            type="submit"
            className="cassette-btn px-4 py-2 text-xs font-mono text-[#b8d99e] shrink-0"
          >
            TUNE
          </button>
        </form>

        {/* Video Player Preview Stage */}
        {selectedYtId && (
          <div className="mt-4 rounded-2xl overflow-hidden border border-[#2b3326] bg-black aspect-video relative shadow-lg">
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
          <div className="mt-3 p-3.5 rounded-2xl cassette-window flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <h4 className="font-serif-display text-sm sm:text-base font-bold text-[#f0ece1] truncate">
                {previewInfo?.title || `YouTube Master (${selectedYtId})`}
              </h4>
              <p className="text-xs font-mono text-[#b8d99e] mt-0.5">
                {previewInfo?.author || 'Studio Stream Ready'}
              </p>
            </div>
            <button
              onClick={() => onConvertVideo(`https://www.youtube.com/watch?v=${selectedYtId}`)}
              className="cassette-btn cassette-btn-primary w-full sm:w-auto px-5 py-2.5 text-xs font-mono shrink-0"
            >
              <Radio className="w-4 h-4" />
              <span>⏺ RECORD TO CASSETTE LIBRARY</span>
            </button>
          </div>
        )}

        {/* Curated Stations */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {curatedVideos.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setSelectedYtId(v.id);
                setSearchInput(`https://www.youtube.com/watch?v=${v.id}`);
                fetchInfo(v.id);
              }}
              className={`cassette-btn justify-start p-2.5 text-left ${
                selectedYtId === v.id ? 'cassette-btn-engaged' : ''
              }`}
            >
              <div className="w-11 h-8 rounded bg-[#1c2418] overflow-hidden shrink-0 relative">
                <img
                  src={`https://img.youtube.com/vi/${v.id}/hqdefault.jpg`}
                  alt={v.title}
                  className="w-full h-full object-cover"
                />
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
      </div>
    </div>
  );
};
