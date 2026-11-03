import React, { useEffect, useState } from 'react';
import { Youtube, Loader2, ExternalLink, Copy } from 'lucide-react';
import { isInsideApk } from '../services/onDeviceDownload';
import {
  clearYouTubeSession,
  isNativeYouTubeLoginAvailable,
  isYouTubeLoginAvailable,
  openYouTubeActivateTab,
  pollWebYouTubeDeviceLogin,
  startWebYouTubeDeviceLogin,
  startYouTubeLogin,
  statusLabel,
  subscribeYouTubeSession,
  youtubeSessionStatus,
  type YoutubeSessionStatus,
} from '../services/youtubeSession';

interface YouTubeConnectPanelProps {
  compact?: boolean;
}

export const YouTubeConnectPanel: React.FC<YouTubeConnectPanelProps> = ({ compact }) => {
  const nativeLogin = isNativeYouTubeLoginAvailable();
  const canLogin = isYouTubeLoginAvailable();
  const insideApk = isInsideApk();
  const [status, setStatus] = useState<YoutubeSessionStatus>(() => youtubeSessionStatus());
  const [busy, setBusy] = useState(false);
  const [userCode, setUserCode] = useState('');
  const [verificationUrl, setVerificationUrl] = useState('https://www.google.com/device');
  const [deviceCode, setDeviceCode] = useState('');
  const [webHint, setWebHint] = useState<string | null>(null);

  useEffect(() => {
    setStatus(youtubeSessionStatus());
    return subscribeYouTubeSession((next) => {
      setBusy(false);
      setStatus(next);
      if (next === 'connected') {
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
          setWebHint('Code expired. Tap Connect YouTube again.');
          setDeviceCode('');
          return;
        }
        if (result.status === 'denied') {
          setBusy(false);
          setWebHint('YouTube declined. Tap Connect YouTube to retry.');
          setDeviceCode('');
          return;
        }
        if (result.status === 'error') {
          setBusy(false);
          setWebHint(result.error || 'Could not finish YouTube sign-in.');
          return;
        }
        if (result.interval) delay = Math.max(3000, result.interval * 1000);
      } catch {
        if (!cancelled) setWebHint('Waiting for YouTube…');
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
      setWebHint(err instanceof Error ? err.message : 'Could not start YouTube sign-in.');
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
  };

  const copyCode = async () => {
    if (!userCode) return;
    try {
      await navigator.clipboard.writeText(userCode.replace(/-/g, ''));
    } catch {
      // ignore
    }
  };

  const blurb = nativeLogin
    ? status === 'connected'
      ? 'Signed in on this phone. Record uses this session.'
      : 'Sign in on Google’s page in this app. We never collect your password.'
    : insideApk
      ? 'This APK is too old. Reinstall 1.3.5+ for Connect YouTube, or use a TV code in Chrome.'
      : status === 'connected'
        ? 'Valid in this browser. Record captures this tab’s audio in Chrome. TV Connected is not cookies — paste the key only for Render extract.'
        : 'TV code stays in this browser — not a download session. Record still captures this tab’s audio in Chrome.';

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
      <p className="text-[11px] text-[#a3a198] leading-snug">{blurb}</p>
      {!nativeLogin && userCode ? (
        <div className="rounded-lg border border-[#3a4433] bg-[#0c0d0b] p-2.5 space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-wide text-[#9fa396]">YouTube code</p>
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
        </div>
      ) : null}
      {webHint ? <p className="text-[11px] text-[#e2c986] leading-snug">{webHint}</p> : null}
    </div>
  );
};
