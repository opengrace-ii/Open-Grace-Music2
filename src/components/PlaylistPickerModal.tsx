import React, { useState } from 'react';
import { X, ListMusic, Plus } from 'lucide-react';
import { UserPlaylist } from '../types';

interface PlaylistPickerModalProps {
  isOpen: boolean;
  trackTitle?: string;
  playlists: UserPlaylist[];
  onClose: () => void;
  onCreate: (name: string) => void;
  onPick: (playlistId: string) => void;
}

export const PlaylistPickerModal: React.FC<PlaylistPickerModalProps> = ({
  isOpen,
  trackTitle,
  playlists,
  onClose,
  onCreate,
  onPick,
}) => {
  const [name, setName] = useState('');
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md cassette-card rounded-3xl p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <ListMusic className="w-5 h-5 text-[#e2c986] shrink-0" />
            <div className="min-w-0">
              <h3 className="font-serif-display font-bold text-[#f0ece1]">
                {trackTitle ? 'Add to mix' : 'Your mixes'}
              </h3>
              {trackTitle ? (
                <p className="text-[11px] font-mono text-[#9fa396] truncate">{trackTitle}</p>
              ) : (
                <p className="text-[11px] font-mono text-[#9fa396]">
                  Name it yourself — instrumental, messages, Hindi Christian…
                </p>
              )}
            </div>
          </div>
          <button type="button" className="cassette-btn p-2 text-[#9fa396]" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          className="flex gap-2 mb-4"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            onCreate(trimmed);
            setName('');
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mix name you choose"
            className="flex-1 cassette-window rounded-xl px-3 py-2 bg-transparent text-sm text-[#f0ece1] placeholder-[#686b60] font-mono focus:outline-none"
          />
          <button type="submit" className="cassette-btn cassette-btn-primary px-3 py-2 text-xs font-mono">
            <Plus className="w-4 h-4" />
            MAKE
          </button>
        </form>

        <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
          {playlists.length === 0 ? (
            <p className="text-xs font-mono text-[#9fa396] py-6 text-center">
              No mixes yet. Type a name above — nothing is pre-loaded.
            </p>
          ) : (
            playlists.map((pl) => (
              <button
                key={pl.id}
                type="button"
                onClick={() => onPick(pl.id)}
                className="cassette-btn w-full justify-between px-3 py-2.5 text-left"
              >
                <span className="font-serif-display text-sm text-[#f0ece1] truncate">{pl.name}</span>
                <span className="text-[10px] font-mono text-[#e2c986]">{pl.trackIds.length}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
