import React from 'react';
import { HardDrive, ShieldCheck, ShieldAlert } from 'lucide-react';
import { StorageInfo } from '../types';

interface StorageBannerProps {
  storageInfo: StorageInfo;
  onRequestPersistence: () => void;
}

export const StorageBanner: React.FC<StorageBannerProps> = ({
  storageInfo,
  onRequestPersistence,
}) => {
  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 MB';
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
    return (bytes / 1e6).toFixed(1) + ' MB';
  };

  const used = formatBytes(storageInfo.usedBytes);
  const quota = formatBytes(storageInfo.quotaBytes);

  return (
    <div className="mx-4 sm:mx-6 my-2 px-4 py-3 rounded-xl bg-[#181C18] border border-[#282E27] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${storageInfo.isPersistent ? 'bg-[#1B2B1E] text-[#86EFAC]' : 'bg-[#2E2713] text-[#FBBF24]'}`}>
          {storageInfo.isPersistent ? (
            <ShieldCheck className="w-5 h-5" />
          ) : (
            <HardDrive className="w-5 h-5" />
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                storageInfo.isPersistent ? 'bg-[#86EFAC]' : 'bg-[#FBBF24]'
              }`}
            />
            <span className="text-xs font-semibold uppercase tracking-wider text-[#F1F5EC]">
              {storageInfo.isPersistent ? 'Protected Offline Storage' : 'Device Storage Cache'}
            </span>
          </div>
          <p className="text-xs text-[#A2ACA0] mt-0.5">
            {storageInfo.isPersistent
              ? `Granted · ${used} of ${quota} used · ${storageInfo.trackCount} ${storageInfo.trackCount === 1 ? 'track' : 'tracks'} saved on this device`
              : `${used} of ${quota} used · ${storageInfo.trackCount} ${storageInfo.trackCount === 1 ? 'track' : 'tracks'} · OS may evict if space runs low`}
          </p>
        </div>
      </div>

      {!storageInfo.isPersistent && (
        <button
          onClick={onRequestPersistence}
          className="self-stretch sm:self-auto text-xs px-3.5 py-1.5 rounded-full bg-[#2B3626] text-[#B8D99E] hover:bg-[#34422E] border border-[#43543B] transition-colors font-medium flex items-center justify-center gap-1.5"
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          Request Persistent Lock
        </button>
      )}
    </div>
  );
};
