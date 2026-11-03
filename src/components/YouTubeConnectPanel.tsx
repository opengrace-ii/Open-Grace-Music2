import React, { useEffect, useState } from 'react';
import { Youtube, Loader2 } from 'lucide-react';
import { isInsideApk } from '../services/onDeviceDownload';
import {
  clearYouTubeSession,
  isYouTubeLoginAvailable,
  pullNativeYoutubeCookies,
  startYouTubeLogin,
  statusLabel,
  subscribeYouTubeSession,
  youtubeSessionStatus,
  type YoutubeSessionStatus,
} from '../services/youtubeSession';

interface YouTubeConnectPanelProps {
  /** Called after native cookies are copied into local youtubeCookies storage. */
  onCookies?: (header: string) => void;
  compact?: boolean;
}

export const YouTubeConnectPanel: React.FC<YouTubeConnectPanelProps> = ({ onCookies, compact }) => {
  const canLogin = isYouTubeLoginAvailable();
  const insideApk = isInsideApk();
  const [status, setStatus] = useState<YoutubeSessionStatus>(() => youtubeSessionStatus());
  const [busy, setBusy] = useState(false);
  const onCookiesRef = React.useRef(onCookies);
  onCookiesRef.current = onCookies;

  useEffect(() => {
    setStatus(youtubeSessionStatus());
    if (isYouTubeLoginAvailable() && youtubeSessionStatus() === 'connected') {
      const h = pullNativeYoutubeCookies();
      if (h) onCookiesRef.current?.(h);
    }
    return subscribeYouTubeSession((next) => {
      setBusy(false);
      setStatus(next);
      if (next === 'connected') {
        const h = pullNativeYoutubeCookies();
        if (h) onCookiesRef.current?.(h);
      }
    });
  }, []);

  const connect = () => {
    setBusy(true);
    const ok = startYouTubeLogin();
    if (!ok) setBusy(false);
  };

  const signOut = () => {
    clearYouTubeSession();
    setStatus('not_connected');
    onCookies?.('');
  };

  return (
    <div className={`rounded-xl border border-[#3a4433] bg-[#11120f] ${compact ? 'p-2.5' : 'p-3.5'} space-y-2`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Youtube className="w-4 h-4 text-[#f87171] shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#eeeae2]">YouTube session</p>
            <p className="text-[11px] font-mono text-[#b8d99e]">
              {statusLabel(status)}
              {busy ? ' · signing in…' : ''}
            </p>
          </div>
        </div>
        {canLogin ? (
          <div className="flex items-center gap-1.5 shrink-0">
            {status === 'connected' ? (
              <button
                type="button"
                onClick={signOut}
                className="px-3 py-1.5 rounded-lg border border-[#292a24] text-[11px] font-mono text-[#a3a198] hover:text-[#eeeae2]"
              >
                Sign out
              </button>
            ) : (
              <button
                type="button"
                onClick={connect}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg bg-[#b8d99e] text-[#11120f] text-[11px] font-mono font-bold disabled:opacity-40 inline-flex items-center gap-1"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Connect YouTube
              </button>
            )}
          </div>
        ) : null}
      </div>
      {canLogin ? (
        <p className="text-[11px] text-[#a3a198] leading-relaxed">
          One-time sign-in on <strong className="text-[#eeeae2] font-medium">Google’s real pages</strong> inside
          this app. We never collect your password. After connecting, retry Record. This is your own YouTube
          session — Google can still block, expire cookies, or ask for extra checks. Downloading may still be
          against YouTube’s terms; we do not promise a bypass.
        </p>
      ) : insideApk ? (
        <p className="text-[11px] text-[#a3a198] leading-relaxed">
          This installed APK is too old for Connect YouTube. Reinstall <strong className="text-[#eeeae2]">1.3.2+</strong>{' '}
          (versionCode 8+), then sign in on Google’s real pages in the app.
        </p>
      ) : (
        <p className="text-[11px] text-[#a3a198] leading-relaxed">
          Sign-in for downloads works in the <strong className="text-[#eeeae2] font-medium">Android APK</strong>.
          Chrome cannot read YouTube’s HttpOnly cookies from this page, so a Google login iframe here would not
          work. Use the key icon to paste Netscape / Cookie-header cookies, or install the APK and tap Connect
          YouTube.
        </p>
      )}
    </div>
  );
};
