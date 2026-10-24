import React, { useMemo, useState } from 'react';
import {
  X,
  Smartphone,
  Shield,
  Download,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { GramophoneDiscLogo } from './GramophoneDiscLogo';
import {
  apkDownloadLandingUrl,
  apkDownloadUrl,
  isMobileDevice,
  mobileApkDownloadHint,
} from '../utils/apkDownload';

const REPO_URL =
  import.meta.env.VITE_GITHUB_REPO_URL ||
  'https://github.com/opengrace/open-grace-music';

interface InstallGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAndroid: boolean;
  isInstallable: boolean;
  onPwaInstall: () => Promise<boolean>;
}

export const InstallGuideModal: React.FC<InstallGuideModalProps> = ({
  isOpen,
  onClose,
  isAndroid,
  isInstallable,
  onPwaInstall,
}) => {
  const [showMobileApkHint, setShowMobileApkHint] = useState(false);
  const apkUrl = useMemo(() => apkDownloadUrl(), []);
  const downloadPageUrl = useMemo(() => apkDownloadLandingUrl(), []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#171814] border border-[#292a24] rounded-3xl p-5 sm:p-7 shadow-2xl flex flex-col max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between pb-4 border-b border-[#292a24] gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <GramophoneDiscLogo size={48} isPlaying={false} showHornOverlay={false} badgeFrame={false} />
            <div className="min-w-0">
              <h3 className="font-serif-display text-lg font-bold text-[#eeeae2]">
                Install Open Grace Music
              </h3>
              <p className="text-xs text-[#a3a198] mt-0.5">
                Same offline library on Samsung, Pixel, and other Android phones
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-[#a3a198] hover:text-[#eeeae2] hover:bg-[#252820] transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="my-4 p-3.5 rounded-2xl bg-[#11120f] border border-[#3a4433] text-xs text-[#c8c4bc] leading-relaxed space-y-2">
          <p className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-[#b8d99e] shrink-0 mt-0.5" />
            <span>
              Open Grace Music is open source. Audio stays on your device. The APK is built from
              this repository and is not on Google Play yet. For maximum security on Samsung{' '}
              <strong className="text-[#eeeae2] font-medium">Advanced Protection</strong>, use{' '}
              <strong className="text-[#b8d99e] font-medium">Add to Home screen</strong> (PWA) —
              no sideload required.
            </span>
          </p>
          <p>
            <strong className="text-[#eeeae2] font-medium">Primary host: AppDeploy.</strong> YouTube→MP3/FLAC
            uses the converter on{' '}
            <code className="text-[#b8d99e]">ogm-open-grace-music-w3bpvx.v2.appdeploy.ai</code> by default — APK
            users usually leave Settings blank. Override only if you self-host with{' '}
            <code className="text-[#b8d99e]">npm start</code>. Offline library and local import need no server.
          </p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-[#b8d99e] hover:text-[#c8e6b0] font-medium"
          >
            View source on GitHub
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {isAndroid && (
          <section className="space-y-3 mb-5">
            <h4 className="text-sm font-semibold text-[#b8d99e] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Recommended — Install on Samsung (PWA)
            </h4>
            <ol className="list-decimal list-inside space-y-2 text-xs text-[#eeeae2] leading-relaxed pl-1">
              <li>
                Open this site in <strong>Chrome</strong> (or Samsung Internet).
              </li>
              <li>
                Tap the menu (⋮) → <strong>Install app</strong> or{' '}
                <strong>Add to Home screen</strong>.
              </li>
              <li>
                Launch from your home screen — fullscreen, offline library, same gramophone UI.
              </li>
            </ol>
            {isInstallable && (
              <button
                type="button"
                onClick={() => void onPwaInstall()}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#b8d99e] text-[#11120f] hover:bg-[#c8e6b0] font-bold text-xs flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Install app now
              </button>
            )}
          </section>
        )}

        {(isMobileDevice() || showMobileApkHint) && (
          <div className="mb-4 p-3.5 rounded-2xl bg-[#2a1f14]/50 border border-[#5c4a2a] text-xs text-[#eeeae2] leading-relaxed">
            <p className="font-semibold text-[#fbbf24] mb-1">Cursor on phone?</p>
            <p>
              In-app preview often cannot download APKs. Open{' '}
              <a
                href={downloadPageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#b8d99e] underline break-all"
              >
                {downloadPageUrl}
              </a>{' '}
              in <strong>Chrome</strong> using your agent&apos;s public URL (not localhost).
            </p>
          </div>
        )}

        <section className="space-y-3 mb-5">
          <h4 className="text-sm font-semibold text-[#e2c986] flex items-center gap-2">
            <Smartphone className="w-4 h-4" />
            Optional — Install the native APK
          </h4>
          <p className="text-xs text-[#a3a198] leading-relaxed">
            Works when <strong className="text-[#eeeae2]">Advanced Protection is off</strong> and
            you allow installs from your file manager or browser.
          </p>
          <ol className="list-decimal list-inside space-y-2 text-xs text-[#eeeae2] leading-relaxed pl-1">
            <li>
              Download <code className="text-[#b8d99e]">OpenGraceMusic.apk</code> (~25 MB) below or
              from the mobile download page.
            </li>
            <li>
              Settings → Security → <strong>Install unknown apps</strong> → allow{' '}
              <strong>My Files</strong> or <strong>Chrome</strong>.
            </li>
            <li>
              Samsung <strong>Auto Blocker</strong>: Settings → Security and privacy → Auto
              Blocker → allow installation from your chosen source, or pause Auto Blocker for
              this install.
            </li>
            <li>
              Open the APK in Downloads and tap Install. Debug or sideload builds may show a Play
              Protect notice — tap <strong>Install anyway</strong> only if you trust this source.
            </li>
          </ol>
          <div className="flex flex-col sm:flex-row gap-2">
            <a
              href={apkUrl}
              download="OpenGraceMusic.apk"
              onClick={() => {
                if (isMobileDevice()) setShowMobileApkHint(true);
              }}
              className="inline-flex px-4 py-2.5 rounded-xl bg-[#21291d] text-[#b8d99e] hover:bg-[#2b3626] border border-[#3a4433] font-semibold text-xs items-center gap-2 justify-center"
            >
              <Download className="w-4 h-4" />
              Download OpenGraceMusic.apk (25 MB)
            </a>
            <a
              href={downloadPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex px-4 py-2.5 rounded-xl bg-[#171814] text-[#a3a198] hover:text-[#eeeae2] border border-[#292a24] font-semibold text-xs items-center gap-2 justify-center"
            >
              <ExternalLink className="w-4 h-4" />
              Open download page
            </a>
          </div>
          {showMobileApkHint && (
            <p className="text-[11px] text-[#fbbf24] leading-relaxed">{mobileApkDownloadHint()}</p>
          )}
        </section>

        <section className="p-4 rounded-2xl bg-[#2a1f14]/40 border border-[#5c4a2a] space-y-2">
          <h4 className="text-sm font-semibold text-[#fbbf24] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Google Play Protect — Advanced Protection
          </h4>
          <p className="text-xs text-[#eeeae2] leading-relaxed">
            If your phone shows{' '}
            <em>&quot;App blocked by Advanced Protection&quot;</em>, Android will not install
            sideloaded APKs — only apps from Google Play and pre-installed stores (e.g. Samsung
            Galaxy Store). This is a device policy, not something the app can bypass.
          </p>
          <p className="text-xs text-[#b8d99e] font-medium">
            Use <strong>Add to Home screen</strong> above, or turn off Advanced Protection in
            Google account settings if your organization allows sideloading.
          </p>
          <a
            href="https://support.google.com/accounts/answer/9375703"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[#86efac] hover:underline"
          >
            Learn more about Advanced Protection
            <ExternalLink className="w-3 h-3" />
          </a>
        </section>

        <div className="pt-2 text-right">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#21291d] text-[#eeeae2] hover:bg-[#2b3626] text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
