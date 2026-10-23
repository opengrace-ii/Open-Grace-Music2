import React, { useMemo, useState } from 'react';
import {
  X,
  Download,
  Code2,
  Terminal,
  CheckCircle2,
  Layers,
  Disc3,
  Shield,
} from 'lucide-react';
import { GramophoneDiscLogo } from './GramophoneDiscLogo';
import { apkDownloadUrl, isMobileDevice, mobileApkDownloadHint } from '../utils/apkDownload';

interface AndroidProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenInstallGuide?: () => void;
}

export const AndroidProjectModal: React.FC<AndroidProjectModalProps> = ({
  isOpen,
  onClose,
  onOpenInstallGuide,
}) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'KOTLIN_CODE' | 'BUILD_INSTRUCTIONS'>('OVERVIEW');
  const [showMobileApkHint, setShowMobileApkHint] = useState(false);
  const apkUrl = useMemo(() => apkDownloadUrl(), []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-[#171814] border border-[#292a24] rounded-3xl p-5 sm:p-7 shadow-2xl flex flex-col max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-[#292a24]">
          <div className="flex items-center gap-3">
            <GramophoneDiscLogo size={44} isPlaying={false} showHornOverlay={false} badgeFrame={false} />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif-display text-lg font-bold text-[#eeeae2]">
                  Open Grace Music — Native Android
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#21291d] text-[#b8d99e] border border-[#3a4433]">
                  Kotlin · Jetpack Compose
                </span>
              </div>
              <p className="text-xs text-[#a3a198]">
                Compiled APK + unified Gradle project — lossless FLAC, ALAC, DSD & MP3
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-[#a3a198] hover:text-[#eeeae2] hover:bg-[#252820] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {onOpenInstallGuide && (
          <button
            type="button"
            onClick={onOpenInstallGuide}
            className="mt-4 w-full p-3.5 rounded-2xl bg-[#1a2116] border border-[#3a4433] text-left hover:border-[#b8d99e]/40 transition-colors"
          >
            <p className="text-xs font-semibold text-[#b8d99e] flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Samsung S25 / Play Protect / Advanced Protection?
            </p>
            <p className="text-[11px] text-[#a3a198] mt-1">
              Open the install guide — recommended PWA (Add to Home screen) and step-by-step APK
              sideload help.
            </p>
          </button>
        )}

        <div className="flex items-center gap-2 mt-4 pb-2 border-b border-[#292a24]">
          <button
            type="button"
            onClick={() => setActiveTab('OVERVIEW')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              activeTab === 'OVERVIEW'
                ? 'bg-[#b8d99e] text-[#11120f] font-semibold'
                : 'text-[#a3a198] hover:text-[#eeeae2] bg-[#11120f]'
            }`}
          >
            1-Tap APK & Source Download
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('BUILD_INSTRUCTIONS')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              activeTab === 'BUILD_INSTRUCTIONS'
                ? 'bg-[#b8d99e] text-[#11120f] font-semibold'
                : 'text-[#a3a198] hover:text-[#eeeae2] bg-[#11120f]'
            }`}
          >
            Gradle APK Build
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('KOTLIN_CODE')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              activeTab === 'KOTLIN_CODE'
                ? 'bg-[#b8d99e] text-[#11120f] font-semibold'
                : 'text-[#a3a198] hover:text-[#eeeae2] bg-[#11120f]'
            }`}
          >
            Native Android Architecture
          </button>
        </div>

        {activeTab === 'OVERVIEW' && (
          <div className="space-y-4 my-4">
            <div className="p-4 rounded-2xl bg-[#11120f] border border-[#3a4433] space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-[#b8d99e] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#86efac]" />
                  Signed Android APK — built from this repository
                </h4>
                <p className="text-xs text-[#eeeae2] mt-1.5 leading-relaxed">
                  Unified Kotlin + Jetpack Compose app (`app/`, Gradle 9) with Media3 playback,
                  Room library, and MediaStore export. Not listed on Google Play yet — use the
                  install guide if Play Protect or Advanced Protection blocks sideloading.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#171814] border border-[#3a4433] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-[#eeeae2] flex items-center gap-2">
                    <span>OpenGraceMusic.apk</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#21291d] text-[#b8d99e]">
                      Signed APK
                    </span>
                  </p>
                  <p className="text-[11px] text-[#a3a198] mt-0.5">
                    Native offline playback, lock-screen controls, and Music/OpenGraceMusic export.
                  </p>
                </div>

                <a
                  href={apkUrl}
                  download="OpenGraceMusic.apk"
                  onClick={() => {
                    if (isMobileDevice()) setShowMobileApkHint(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[#b8d99e] text-[#11120f] hover:bg-[#c8e6b0] font-bold text-xs flex items-center gap-2 shadow-md transition-all active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Android .APK</span>
                </a>
              </div>
              {showMobileApkHint && (
                <p className="text-[11px] text-[#fbbf24] leading-relaxed px-1">
                  {mobileApkDownloadHint()}
                </p>
              )}

              <div className="p-3.5 rounded-xl bg-[#171814] border border-[#292a24] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[#eeeae2]">
                    OpenGraceMusic-Android.zip (Android Studio Source Project)
                  </p>
                  <p className="text-[11px] text-[#a3a198] mt-0.5">
                    Complete unified Gradle project (`app/src/main/java/com/example/...`)
                  </p>
                </div>

                <a
                  href="/OpenGraceMusic-Android.zip"
                  download="OpenGraceMusic-Android.zip"
                  className="px-4 py-2 rounded-xl bg-[#21291d] text-[#b8d99e] hover:bg-[#2b3626] border border-[#3a4433] font-semibold text-xs flex items-center gap-2 transition-all active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Studio Project (.zip)</span>
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-[#11120f] border border-[#292a24]">
                <Disc3 className="w-4 h-4 text-[#b8d99e] mb-2" />
                <h5 className="text-xs font-semibold text-[#eeeae2]">Lossless Audio Engine</h5>
                <p className="text-[11px] text-[#a3a198] mt-1">
                  24-bit/96kHz FLAC, ALAC (.m4a), DSD/PCM, WAV, and 320kbps MP3
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#11120f] border border-[#292a24]">
                <Layers className="w-4 h-4 text-[#86efac] mb-2" />
                <h5 className="text-xs font-semibold text-[#eeeae2]">Jetpack Compose UI</h5>
                <p className="text-[11px] text-[#a3a198] mt-1">
                  Gramophone turntable theme with live equalizer and cassette-style controls
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#11120f] border border-[#292a24]">
                <Code2 className="w-4 h-4 text-[#fbbf24] mb-2" />
                <h5 className="text-xs font-semibold text-[#eeeae2]">Foreground Service</h5>
                <p className="text-[11px] text-[#a3a198] mt-1">
                  `OgmPlaybackService` lock-screen controls, Room DB, and MediaStore sync
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'BUILD_INSTRUCTIONS' && (
          <div className="space-y-4 my-4 text-xs">
            <div className="p-4 rounded-2xl bg-[#11120f] border border-[#292a24] font-mono text-[#eeeae2] space-y-3">
              <div className="flex items-center gap-2 text-[#b8d99e] font-semibold">
                <Terminal className="w-4 h-4" />
                <span>Unified Single-Repo Android Gradle Build:</span>
              </div>
              <ol className="list-decimal list-inside space-y-2 text-[#a3a198] leading-relaxed">
                <li>
                  Install the pre-compiled APK via <span className="text-[#b8d99e]">/OpenGraceMusic.apk</span>, or clone/unzip the unified repository.
                </li>
                <li>
                  Build from the root directory with Gradle:
                  <div className="mt-1 p-2 rounded-lg bg-[#171814] text-[#b8d99e] select-all">
                    ./gradlew assembleDebug testDebugUnitTest
                  </div>
                </li>
                <li>
                  Output APK location:
                  <div className="mt-1 p-2 rounded-lg bg-[#171814] text-[#86efac] select-all">
                    app/build/outputs/apk/debug/app-debug.apk
                  </div>
                </li>
              </ol>
            </div>
          </div>
        )}

        {activeTab === 'KOTLIN_CODE' && (
          <div className="space-y-3 my-4">
            <div className="p-3.5 rounded-xl bg-[#11120f] border border-[#292a24] text-xs">
              <span className="font-mono text-[#b8d99e]">app/src/main/java/com/example/ui/OgmApp.kt</span>
              <p className="text-[11px] text-[#a3a198] mt-1">
                Main Jetpack Compose screen with Lossless library filters, converter dialog, and turntable player.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#11120f] border border-[#292a24] text-xs">
              <span className="font-mono text-[#b8d99e]">app/src/main/java/com/example/ui/components/FullPlayerDialog.kt</span>
              <p className="text-[11px] text-[#a3a198] mt-1">
                Rotating vinyl turntable with real-time animated Visual Frequency Equalizer bars and speed/loop controls.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#11120f] border border-[#292a24] text-xs">
              <span className="font-mono text-[#b8d99e]">app/src/main/java/com/example/player/OgmPlaybackService.kt</span>
              <p className="text-[11px] text-[#a3a198] mt-1">
                Android foreground media playback service with notification controls when screen is off or minimized.
              </p>
            </div>
          </div>
        )}

        <div className="pt-2 text-right">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#21291d] text-[#eeeae2] hover:bg-[#2b3626] text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
