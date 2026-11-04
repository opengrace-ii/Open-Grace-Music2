import React, { useEffect, useState } from 'react';
import {
  Download,
  Settings,
  Smartphone,
  AlertCircle,
  ScrollText,
} from 'lucide-react';
import { getActivityLog, subscribeActivityLog } from '../services/activityLog';
import { YouTubeConnectPanel } from './YouTubeConnectPanel';

interface MorePageProps {
  converterApiOnline: boolean | null;
  converterUrlLabel: string;
  isAndroid: boolean;
  isInstallable: boolean;
  isInstalled: boolean;
  onOpenSettings: () => void;
  onOpenInstall: () => void;
  onOpenAndroidProject: () => void;
  onOpenActivityLog: () => void;
  onPwaInstall: () => void;
}

export const MorePage: React.FC<MorePageProps> = ({
  converterApiOnline,
  converterUrlLabel,
  isAndroid,
  isInstallable,
  isInstalled,
  onOpenSettings,
  onOpenInstall,
  onOpenAndroidProject,
  onOpenActivityLog,
  onPwaInstall,
}) => {
  const [logCount, setLogCount] = useState(() => getActivityLog().length);

  useEffect(() => subscribeActivityLog((entries) => setLogCount(entries.length)), []);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-serif-display text-xl font-bold text-[#f0ece1]">More</h2>
        <p className="text-xs font-mono text-[#9fa396] mt-0.5">Install, converter, and Android project</p>
      </div>

      {converterApiOnline === false && (
        <div className="p-3 rounded-xl bg-[#2a2416] border border-[#524929] flex items-start gap-2 text-xs text-[#fcd34d]">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="leading-snug">
            Site API is unreachable at {converterUrlLabel || '(no server set)'}. Record needs this
            site plus the PC recorder (Settings).
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={onOpenActivityLog}
        className="cassette-btn w-full justify-between px-4 py-3 text-sm font-mono"
      >
        <span className="inline-flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-[#b8d99e]" />
          Activity log
        </span>
        <span className="text-[11px] font-mono text-[#9fa396]">
          {logCount > 0 ? `${logCount} event${logCount === 1 ? '' : 's'}` : 'empty'}
        </span>
      </button>

      <YouTubeConnectPanel />

      <p className="text-[11px] font-mono text-[#686b60] leading-relaxed px-0.5">
        About: YouTube downloads may be blocked by Google and may conflict with YouTube’s terms. We never collect your password.
      </p>

      <button type="button" onClick={onOpenSettings} className="cassette-btn w-full justify-start px-4 py-3 text-sm font-mono">
        <Settings className="w-4 h-4 text-[#e2c986]" />
        Settings
      </button>
      <button type="button" onClick={onOpenInstall} className="cassette-btn w-full justify-start px-4 py-3 text-sm font-mono">
        <Download className="w-4 h-4 text-[#b8d99e]" />
        {isAndroid && !isInstalled ? 'Install / APK' : 'APK & install help'}
      </button>
      {isInstallable && (
        <button type="button" onClick={onPwaInstall} className="cassette-btn w-full justify-start px-4 py-3 text-sm font-mono">
          <Download className="w-4 h-4 text-[#b8d99e]" />
          Install app
        </button>
      )}
      <button
        type="button"
        onClick={onOpenAndroidProject}
        className="cassette-btn w-full justify-start px-4 py-3 text-sm font-mono"
      >
        <Smartphone className="w-4 h-4 text-[#e2c986]" />
        Android Studio project
      </button>
    </section>
  );
};
