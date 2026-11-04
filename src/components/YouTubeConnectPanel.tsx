import React, { useEffect, useState } from 'react';
import { Youtube, Loader2 } from 'lucide-react';
import {
  clearYouTubeSession,
  isNativeYouTubeLoginAvailable,
  startYouTubeLogin,
  statusLabel,
  subscribeYouTubeSession,
  youtubeSessionStatus,
  type YoutubeSessionStatus,
} from '../services/youtubeSession';

interface YouTubeConnectPanelProps {
  compact?: boolean;
}

/** APK-only. Web Record uses the PC recorder, not a TV OAuth session. */
export const YouTubeConnectPanel: React.FC<YouTubeConnectPanelProps> = ({ compact }) => {
  const nativeLogin = isNativeYouTubeLoginAvailable();
  const [status, setStatus] = useState<YoutubeSessionStatus>(() => youtubeSessionStatus());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStatus(youtubeSessionStatus());
    return subscribeYouTubeSession((next) => {
      setBusy(false);
      setStatus(next);
    });
  }, []);

  if (!nativeLogin) return null;

  const connectNative = () => {
    setBusy(true);
    const ok = startYouTubeLogin();
    if (!ok) setBusy(false);
  };

  const signOut = () => {
    clearYouTubeSession();
    setStatus('not_connected');
    setBusy(false);
  };

  const blurb =
    status === 'connected'
      ? 'Signed in on this phone. Record can use this session.'
      : 'Sign in on Google’s page in this app. We never collect your password.';

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
              onClick={connectNative}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-[#b8d99e] text-[#11120f] text-[11px] font-mono font-bold disabled:opacity-40 inline-flex items-center gap-1"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Connect YouTube
            </button>
          )}
        </div>
      </div>
      <p className="text-[11px] text-[#a3a198] leading-snug">{blurb}</p>
    </div>
  );
};
