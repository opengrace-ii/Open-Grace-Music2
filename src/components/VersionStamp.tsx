import React, { useEffect, useState } from 'react';
import { apiUrl } from '../services/converterApi';
import {
  formatOgmVersionLabel,
  OGM_GIT_SHA,
  OGM_WEB_VERSION,
  readApkShellVersion,
} from '../version';

export const VersionStamp: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [label, setLabel] = useState(() =>
    formatOgmVersionLabel(OGM_WEB_VERSION, OGM_GIT_SHA, readApkShellVersion())
  );

  useEffect(() => {
    const apk = readApkShellVersion();
    let cancelled = false;
    void fetch(apiUrl('/api/health'))
      .then((r) => r.json())
      .then((data: { version?: string; git?: string }) => {
        if (cancelled) return;
        const version = data.version || OGM_WEB_VERSION;
        const sha = data.git || OGM_GIT_SHA;
        setLabel(formatOgmVersionLabel(version, sha, apk));
      })
      .catch(() => {
        if (!cancelled) setLabel(formatOgmVersionLabel(OGM_WEB_VERSION, OGM_GIT_SHA, apk));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <p className={`text-[10px] font-mono text-[#686b60] tracking-wide ${className}`} title="Open Grace Music version">
      {label}
    </p>
  );
};
