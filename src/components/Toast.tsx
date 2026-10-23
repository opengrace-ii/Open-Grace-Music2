import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (!toasts.length) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto p-3.5 rounded-2xl border shadow-xl flex items-center justify-between gap-3 text-xs font-medium backdrop-blur-md transition-all animate-in slide-in-from-top-2 duration-200 ${
            t.type === 'success'
              ? 'bg-[#18261A]/95 border-[#2E4731] text-[#A6F4C5]'
              : t.type === 'error'
              ? 'bg-[#2E1818]/95 border-[#542929] text-[#FCA5A5]'
              : 'bg-[#1C221C]/95 border-[#303B2E] text-[#F1F5EC]'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {t.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-[#86EFAC]" />}
            {t.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 text-[#F87171]" />}
            {t.type === 'info' && <Info className="w-4 h-4 shrink-0 text-[#B8D99E]" />}
            <span className="truncate">{t.text}</span>
          </div>
          <button
            onClick={() => onDismiss(t.id)}
            className="p-1 rounded-full hover:bg-white/10 shrink-0 text-current"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
