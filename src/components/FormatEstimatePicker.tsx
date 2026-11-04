import React from 'react';
import { AUDIOPHILE_FORMATS, AudiophileFormatId } from '../types';
import { compactFormatName, formatOptionSubline } from '../utils/recordEstimate';

export const FormatEstimatePicker: React.FC<{
  selected: AudiophileFormatId;
  onSelect: (id: AudiophileFormatId) => void;
  durationSec: number;
  mp3Bitrate?: number;
  disabled?: boolean;
}> = ({ selected, onSelect, durationSec, mp3Bitrate = 320, disabled = false }) => {
  return (
    <div className="cassette-bank grid grid-cols-2 sm:grid-cols-5 gap-1.5">
      {AUDIOPHILE_FORMATS.map((fmt) => {
        const isSelected = selected === fmt.id;
        const title = compactFormatName(fmt.id, mp3Bitrate);
        const sub = formatOptionSubline(fmt.id, durationSec, mp3Bitrate);
        return (
          <button
            key={fmt.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(fmt.id)}
            className={`cassette-btn flex-col items-start px-3 py-2 text-left ${
              isSelected ? 'cassette-btn-engaged' : ''
            }`}
          >
            <div className="w-full flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] font-bold leading-tight">{title}</span>
              <span className={`cassette-led shrink-0 ${isSelected ? 'cassette-led-on' : ''}`} />
            </div>
            {sub ? (
              <div className="text-[10px] font-mono text-[#9fa396] mt-0.5 leading-tight w-full">
                {sub}
              </div>
            ) : (
              <div className="text-[10px] font-mono text-[#9fa396] mt-0.5 truncate w-full">
                {fmt.badge}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};
