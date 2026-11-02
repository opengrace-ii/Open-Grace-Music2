import React from 'react';
import { Download, Settings, Smartphone, AlertCircle } from 'lucide-react';

interface MorePageProps {
  converterApiOnline: boolean | null;
  converterUrlLabel: string;
  isAndroid: boolean;
  isInstallable: boolean;
  isInstalled: boolean;
  onOpenSettings: () => void;
  onOpenInstall: () => void;
  onOpenAndroidProject: () => void;
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
  onPwaInstall,
}) => {
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
            Converter API is not reachable at {converterUrlLabel || '(no server set)'}. Home still works — set a URL in
            Settings if you need recording.
          </p>
        </div>
      )}

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
