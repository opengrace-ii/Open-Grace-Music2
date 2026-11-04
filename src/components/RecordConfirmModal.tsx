import React from 'react';

export const RecordConfirmModal: React.FC<{
  prompt: string;
  mp3Instead: string;
  onRecord: () => void;
  onMp3: () => void;
  onCancel: () => void;
}> = ({ prompt, mp3Instead, onRecord, onMp3, onCancel }) => {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="cassette-card w-full max-w-sm rounded-2xl p-4 space-y-3">
        <p className="text-sm font-mono text-[#f0ece1] leading-snug">{prompt}</p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="cassette-btn cassette-btn-primary w-full py-2.5 text-xs font-mono"
            onClick={onRecord}
          >
            Record
          </button>
          <button
            type="button"
            className="cassette-btn w-full py-2.5 text-xs font-mono"
            onClick={onMp3}
          >
            {mp3Instead}
          </button>
          <button
            type="button"
            className="cassette-btn w-full py-2.5 text-xs font-mono text-[#9fa396]"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
