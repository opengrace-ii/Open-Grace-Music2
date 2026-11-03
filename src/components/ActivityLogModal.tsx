import React, { useEffect, useState } from 'react';
import {
  X,
  Trash2,
  CheckCircle2,
  XCircle,
  Radio,
  Loader2,
  Download,
  Upload,
  RefreshCw,
  Info,
} from 'lucide-react';
import {
  ActivityEntry,
  ActivityResult,
  clearActivityLog,
  formatBytes,
  formatIst,
  formatLocal,
  shortenSource,
  subscribeActivityLog,
} from '../services/activityLog';

interface ActivityLogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RESULT_META: Record<
  ActivityResult,
  { label: string; className: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  saved: {
    label: 'SAVED',
    className: 'bg-[#1c2418] text-[#b8d99e] border-[#384730]',
    Icon: CheckCircle2,
  },
  failed: {
    label: 'FAILED',
    className: 'bg-[#2a1616] text-[#f0a1a1] border-[#5c2b2b]',
    Icon: XCircle,
  },
  'online-only': {
    label: 'ONLINE-ONLY',
    className: 'bg-[#2a2416] text-[#e2c986] border-[#524929]',
    Icon: Radio,
  },
  started: {
    label: 'STARTED',
    className: 'bg-[#141712] text-[#9fa396] border-[#272c23]',
    Icon: Loader2,
  },
  progress: {
    label: 'PROGRESS',
    className: 'bg-[#141712] text-[#9fa396] border-[#272c23]',
    Icon: Loader2,
  },
  info: {
    label: 'INFO',
    className: 'bg-[#141712] text-[#9fa396] border-[#272c23]',
    Icon: Info,
  },
};

function ActionIcon({ action }: { action: ActivityEntry['action'] }) {
  const common = 'w-3.5 h-3.5';
  if (action === 'record') return <Download className={common} />;
  if (action === 'import') return <Upload className={common} />;
  if (action === 'convert') return <RefreshCw className={common} />;
  if (action === 'listen-live') return <Radio className={common} />;
  return <Info className={common} />;
}

export const ActivityLogModal: React.FC<ActivityLogModalProps> = ({ isOpen, onClose }) => {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = subscribeActivityLog(setEntries);
    return unsubscribe;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) setConfirmClear(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    clearActivityLog();
    setConfirmClear(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#171814] border border-[#292a24] rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-start justify-between pb-4 border-b border-[#292a24] gap-3">
          <div className="min-w-0">
            <h3 className="font-serif-display text-lg font-bold text-[#eeeae2]">Activity log</h3>
            <p className="text-xs font-mono text-[#a3a198] mt-0.5">
              Every record · import · conversion — Saved (offline), Failed, or Online-only
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close activity log"
            className="cassette-btn px-2.5 py-2 text-[#9fa396] shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 py-3">
          <span className="text-[11px] font-mono text-[#686b60]">
            {entries.length > 0
              ? `${entries.length} event${entries.length === 1 ? '' : 's'} · newest first · times in IST`
              : 'No events recorded yet'}
          </span>
          {entries.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className={`cassette-btn px-2.5 py-1.5 text-[11px] font-mono ${
                confirmClear ? 'text-[#f0a1a1] border-[#5c2b2b]' : 'text-[#9fa396]'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{confirmClear ? 'Tap again to clear' : 'Clear log'}</span>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-2">
          {entries.length === 0 ? (
            <div className="cassette-window rounded-2xl p-6 text-center">
              <p className="text-sm font-mono text-[#9fa396]">The tape log is empty.</p>
              <p className="text-[11px] font-mono text-[#686b60] mt-2 leading-relaxed">
                Record a YouTube/audio link, import a device file, or convert a tape and each
                moment — the chosen format and whether it landed in the Library or failed — shows up
                here.
              </p>
            </div>
          ) : (
            entries.map((entry) => {
              const meta = RESULT_META[entry.result];
              const Icon = meta.Icon;
              const spinning = entry.result === 'started' || entry.result === 'progress';
              return (
                <div
                  key={entry.id}
                  className="cassette-card rounded-2xl p-3 sm:p-3.5 flex items-start gap-3"
                >
                  <div className="cassette-window rounded-xl w-9 h-9 shrink-0 flex items-center justify-center text-[#b8d99e]">
                    <ActionIcon action={entry.action} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="font-mono text-sm text-[#f0ece1] truncate">
                        {entry.label}
                      </span>
                      {entry.format && (
                        <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border bg-[#141712] text-[#e2c986] border-[#272c23]">
                          {entry.format.toUpperCase()}
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border ${meta.className}`}
                      >
                        <Icon className={`w-3 h-3 ${spinning ? 'animate-spin' : ''}`} />
                        {meta.label}
                      </span>
                      {entry.sizeBytes ? (
                        <span className="text-[10px] font-mono text-[#9fa396]">
                          {formatBytes(entry.sizeBytes)}
                        </span>
                      ) : null}
                    </div>
                    {entry.detail && (
                      <p className="text-[11px] font-mono text-[#9fa396] mt-1 leading-snug break-words">
                        {entry.detail}
                      </p>
                    )}
                    {entry.source && (
                      <p className="text-[10px] font-mono text-[#686b60] mt-1 break-all">
                        {shortenSource(entry.source, 80)}
                      </p>
                    )}
                    <p className="text-[10px] font-mono text-[#686b60] mt-1.5">
                      {formatIst(entry.ts)}
                      <span className="text-[#4a4e43]"> · device {formatLocal(entry.ts)}</span>
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
