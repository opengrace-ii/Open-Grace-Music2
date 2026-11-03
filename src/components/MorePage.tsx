import React, { useState } from 'react';
import { Download, Settings, Smartphone, AlertCircle, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

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
  const [studioHelpOpen, setStudioHelpOpen] = useState(false);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-serif-display text-xl font-bold text-[#f0ece1]">More</h2>
        <p className="text-xs font-mono text-[#9fa396] mt-0.5">Install, converter, and Android project</p>
      </div>

      <div className="cassette-window rounded-2xl p-3.5 space-y-1.5 text-[11px] font-mono text-[#9fa396] leading-relaxed">
        <p className="text-[#e2c986] font-semibold uppercase tracking-wider text-[10px]">APK updates</p>
        <p>
          <span className="text-[#b8d99e]">UI / music features</span> load from the live site after Render
          redeploys — <span className="text-[#f0ece1]">no APK reinstall</span> if you already have WebView
          shell 1.1+ (bottom Listen / Library / Tuner / Schedule / More).
        </p>
        <p>
          <span className="text-[#e2c986]">Reinstall the APK</span> only when the native shell changes
          (background audio, permissions). Phone still looks old? Force-stop + reopen, clear app cache, or
          uninstall and install the latest APK from this site if you still see Compose-only UI without bottom
          nav.
        </p>
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

      <p className="text-[11px] font-mono text-[#686b60] leading-relaxed px-0.5">
        Studio AI is not a chat bot on this screen. Open a playing tape → full player STUDIO AI or NOTES → Transcript /
        Listen notes.
      </p>

      <button
        type="button"
        onClick={() => setStudioHelpOpen((v) => !v)}
        className="cassette-btn w-full justify-between px-4 py-3 text-sm font-mono"
      >
        <span className="inline-flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#e2c986]" />
          Studio AI help
        </span>
        {studioHelpOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {studioHelpOpen && (
        <div className="cassette-window rounded-2xl p-4 space-y-2 text-[11px] font-mono text-[#9fa396] leading-relaxed">
          <p>
            Keys in Settings are sent to this app&apos;s server for Transcript / Listen notes / Related — they do not
            spawn a floating agent on Listen.
          </p>
          <p>
            1. Play a tape (YouTube devotion or library). 2. Open the full player (expand / TURNTABLE). 3. Tap STUDIO AI,
            then Transcript or NOTES.
          </p>
          <p>Until you open Transcript, a saved Gemini/NVIDIA key sits idle — that is expected.</p>
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
