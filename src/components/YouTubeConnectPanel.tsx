import React, { useEffect, useState } from 'react';
import { Youtube, Loader2, ExternalLink, Copy } from 'lucide-react';
import { isInsideApk } from '../services/onDeviceDownload';
import {
  clearYouTubeSession,
  isNativeYouTubeLoginAvailable,
  isYouTubeLoginAvailable,
  openYouTubeActivateTab,
  pollWebYouTubeDeviceLogin,
  pullNativeYoutubeCookies,
  startWebYouTubeDeviceLogin,
  startYouTubeLogin,
  statusLabel,
  subscribeYouTubeSession,
  youtubeSessionStatus,
  type YoutubeSessionStatus,
} from '../services/youtubeSession';

interface YouTubeConnectPanelProps {
  /** Called after native cookies or a web TV session is stored. */
  onCookies?: (header: string) => void;
  compact?: boolean;
}

export const YouTubeConnectPanel: React.FC<YouTubeConnectPanelProps> = ({ onCookies, compact }) => {
  const nativeLogin = isNativeYouTubeLoginAvailable();
  const canLogin = isYouTubeLoginAvailable();
  const insideApk = isInsideApk();
  const [status, setStatus] = useState<YoutubeSessionStatus>(() => youtubeSessionStatus());
  const [busy, setBusy] = useState(false);
  const [userCode, setUserCode] = useState('');
  const [verificationUrl, setVerificationUrl] = useState('https://www.google.com/device');
  const [deviceCode, setDeviceCode] = useState('');
  const [webHint, setWebHint] = useState<string | null>(null);
  const onCookiesRef = React.useRef(onCookies);
  onCookiesRef.current = onCookies;

  useEffect(() => {
    setStatus(youtubeSessionStatus());
    if (isNativeYouTubeLoginAvailable() && youtubeSessionStatus() === 'connected') {
      const h = pullNativeYoutubeCookies();
      if (h) onCookiesRef.current?.(h);
    }
    return subscribeYouTubeSession((next) => {
      setBusy(false);
      setStatus(next);
      if (next === 'connected') {
        const h = pullNativeYoutubeCookies();
        if (h) onCookiesRef.current?.(h);
        setUserCode('');
        setDeviceCode('');
        setWebHint(null);
      }
    });
  }, []);

  useEffect(() => {
    if (!deviceCode || status === 'connected') return;
    let cancelled = false;
    let delay = 5000;
    const tick = async () => {
      try {
        const result = await pollWebYouTubeDeviceLogin(deviceCode);
        if (cancelled) return;
        if (result.status === 'connected') {
          setBusy(false);
          setStatus('connected');
          setUserCode('');
          setDeviceCode('');
          setWebHint(null);
          return;
        }
        if (result.status === 'expired') {
          setBusy(false);
          setWebHint('That code expired. Tap Connect YouTube again.');
          setDeviceCode('');
          return;
        }
        if (result.status === 'denied') {
          setBusy(false);
          setWebHint('YouTube declined the link. Tap Connect YouTube to try again.');
          setDeviceCode('');
          return;
        }
        if (result.status === 'error') {
          setBusy(false);
          setWebHint(result.error || 'Could not finish YouTube TV sign-in.');
          return;
        }
        if (result.interval) delay = Math.max(3000, result.interval * 1000);
      } catch {
        if (!cancelled) setWebHint('Waiting for YouTube — check your connection.');
      }
      if (!cancelled) timer = window.setTimeout(() => void tick(), delay);
    };
    let timer = window.setTimeout(() => void tick(), delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [deviceCode, status]);

  const connectNative = () => {
    setBusy(true);
    const ok = startYouTubeLogin();
    if (!ok) setBusy(false);
  };

  const connectWeb = async () => {
    setBusy(true);
    setWebHint(null);
    try {
      const started = await startWebYouTubeDeviceLogin();
      setUserCode(started.userCode);
      setVerificationUrl(started.verificationUrl || started.activateUrl || 'https://www.google.com/device');
      setDeviceCode(started.deviceCode);
      openYouTubeActivateTab(started.verificationUrl, started.userCode);
    } catch (err) {
      setWebHint(err instanceof Error ? err.message : 'Could not start YouTube TV sign-in.');
      setBusy(false);
    }
  };

  const signOut = () => {
    clearYouTubeSession();
    setStatus('not_connected');
    setUserCode('');
    setDeviceCode('');
    setBusy(false);
    setWebHint(null);
    onCookies?.('');
  };

  const copyCode = async () => {
    if (!userCode) return;
    try {
      await navigator.clipboard.writeText(userCode.replace(/-/g, ''));
    } catch {
      // ignore
    }
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
                onClick={nativeLogin ? connectNative : () => void connectWeb()}
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
      {nativeLogin ? (
        <p className="text-[11px] text-[#a3a198] leading-relaxed">
          One-time sign-in on <strong className="text-[#eeeae2] font-medium">Google’s real pages</strong> inside
          this app. We never collect your password. After connecting, retry Record. This is your own YouTube
          session — Google can still block, expire cookies, or ask for extra checks. Downloading may still be
          against YouTube’s terms; we do not promise a bypass.
        </p>
      ) : insideApk ? (
        <p className="text-[11px] text-[#a3a198] leading-relaxed">
          This installed APK is too old for native Connect YouTube. Reinstall <strong className="text-[#eeeae2]">1.3.2+</strong>{' '}
          (versionCode 8+) for the in-app Google page, or use the TV code below in Chrome.
        </p>
      ) : (
        <p className="text-[11px] text-[#a3a198] leading-relaxed">
          One-time <strong className="text-[#eeeae2] font-medium">YouTube TV / device code</strong> in a new tab
          (Google’s pages — we never collect your password). Chrome cannot read YouTube HttpOnly cookies from this
          origin. Google may still block; this is not an unlimited bypass. Exact video only. Optional: paste
          Netscape cookies via the key icon.
        </p>
      )}
      {!nativeLogin && userCode ? (
        <div className="rounded-lg border border-[#3a4433] bg-[#0c0d0b] p-2.5 space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-wide text-[#9fa396]">Enter this code on YouTube</p>
          <p className="text-lg sm:text-xl font-mono font-bold tracking-[0.2em] text-[#eeeae2] text-center">
            {userCode}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => openYouTubeActivateTab(verificationUrl, userCode)}
              className="px-3 py-1.5 rounded-lg bg-[#b8d99e] text-[#11120f] text-[11px] font-mono font-bold inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              Open YouTube
            </button>
            <button
              type="button"
              onClick={() => void copyCode()}
              className="px-3 py-1.5 rounded-lg border border-[#292a24] text-[11px] font-mono text-[#a3a198] inline-flex items-center gap-1"
            >
              <Copy className="w-3 h-3" />
              Copy code
            </button>
          </div>
          <p className="text-[10px] text-[#8a877f] leading-relaxed">
            Approve on <span className="font-mono text-[#b8d99e]">youtube.com/activate</span> or{' '}
            <span className="font-mono text-[#b8d99e]">google.com/device</span>, then wait here until the status
            reads Connected.
          </p>
        </div>
      ) : null}
      {webHint ? <p className="text-[11px] text-[#e2c986] leading-relaxed">{webHint}</p> : null}
    </div>
  );
};
