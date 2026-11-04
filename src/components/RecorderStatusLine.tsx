import React from 'react';

export type RecorderStatus = {
  online: boolean | null;
  secretConfigured: boolean | null;
};

export const RecorderStatusLine: React.FC<RecorderStatus & { className?: string }> = ({
  online,
  secretConfigured,
  className = '',
}) => {
  let label = 'PC recorder: …';
  let tone = 'text-[#686b60]';
  if (secretConfigured === false) {
    label = 'PC recorder: hub secret missing';
    tone = 'text-[#fcd34d]';
  } else if (online === true) {
    label = 'PC recorder: online';
    tone = 'text-[#86efac]';
  } else if (online === false) {
    label = 'PC recorder: offline';
    tone = 'text-[#fcd34d]';
  }
  return <p className={`text-[10px] font-mono ${tone} ${className}`}>{label}</p>;
};
