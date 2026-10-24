import React, { useEffect, useState } from 'react';
import { X, Server, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  CONVERTER_SERVER_URL_HELPER,
  getSavedConverterServerUrl,
  resolveConverterApiBaseUrl,
  setSavedConverterServerUrl,
} from '../services/converterServerUrl';
import { checkConverterApiAvailable } from '../services/converterApi';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSaved }) => {
  const [url, setUrl] = useState('');
  const [checking, setChecking] = useState(false);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setUrl(getSavedConverterServerUrl());
    setHealthOk(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const effective = resolveConverterApiBaseUrl();

  const handleSave = async () => {
    setSavedConverterServerUrl(url);
    setChecking(true);
    setHealthOk(null);
    try {
      const ok = await checkConverterApiAvailable();
      setHealthOk(ok);
      onSaved?.();
    } finally {
      setChecking(false);
    }
  };

  const handleClear = () => {
    setUrl('');
    setSavedConverterServerUrl('');
    setHealthOk(null);
    onSaved?.();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#171814] border border-[#292a24] rounded-3xl p-5 sm:p-7 shadow-2xl">
        <div className="flex items-start justify-between pb-4 border-b border-[#292a24] gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Server className="w-5 h-5 text-[#b8d99e] shrink-0" />
            <h3 className="font-serif-display text-lg font-bold text-[#eeeae2]">Settings</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-[#a3a198] hover:text-[#eeeae2] hover:bg-[#252820] transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-xs font-semibold text-[#b8d99e]">Converter server URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={typeof window !== 'undefined' ? window.location.origin : 'https://your-host:43123'}
            className="w-full px-3 py-2.5 rounded-xl bg-[#11120f] border border-[#3a4433] text-sm text-[#eeeae2] placeholder:text-[#6b675e] focus:outline-none focus:border-[#b8d99e]"
          />
          <p className="text-[11px] text-[#a3a198] leading-relaxed">{CONVERTER_SERVER_URL_HELPER}</p>
          <p className="text-[11px] text-[#8a877f] leading-relaxed">
            Leave blank to use this page&apos;s address ({effective || 'none'}). You do{' '}
            <strong className="text-[#eeeae2] font-medium">not</strong> need AppDeploy — run{' '}
            <code className="text-[#b8d99e]">npm start</code> on your PC, VPS, or Cursor agent and paste that HTTPS
            URL here (APK) or open the app from that URL (PWA).
          </p>

          {healthOk === true && (
            <p className="flex items-center gap-2 text-xs text-[#86efac]">
              <CheckCircle2 className="w-4 h-4" /> Converter API reachable at {resolveConverterApiBaseUrl()}
            </p>
          )}
          {healthOk === false && (
            <p className="flex items-start gap-2 text-xs text-[#fcd34d]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              Could not reach /api/health on that URL. Check the server is running and your phone is on the same Wi‑Fi
              (or use a public HTTPS tunnel).
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={handleClear}
            className="px-4 py-2 rounded-xl bg-[#171814] text-[#a3a198] hover:text-[#eeeae2] border border-[#292a24] text-xs font-medium"
          >
            Use page origin
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={checking}
            className="px-4 py-2 rounded-xl bg-[#b8d99e] text-[#11120f] hover:bg-[#c8e6b0] font-bold text-xs flex items-center gap-2"
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save & test
          </button>
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
