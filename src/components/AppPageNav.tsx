import React from 'react';
import { Bell, Disc3, Home, MoreHorizontal, Youtube } from 'lucide-react';
import { AppPage } from '../types';

interface AppPageNavProps {
  active: AppPage;
  onChange: (page: AppPage) => void;
  variant: 'bottom' | 'header';
}

const ITEMS: Array<{ id: AppPage; label: string; Icon: typeof Home }> = [
  { id: 'home', label: 'Listen', Icon: Home },
  { id: 'library', label: 'Library', Icon: Disc3 },
  { id: 'tuner', label: 'Tuner', Icon: Youtube },
  { id: 'schedule', label: 'Schedule', Icon: Bell },
  { id: 'more', label: 'More', Icon: MoreHorizontal },
];

export const AppPageNav: React.FC<AppPageNavProps> = ({ active, onChange, variant }) => {
  if (variant === 'header') {
    return (
      <nav className="hidden md:flex cassette-bank items-center gap-1.5 shrink-0" aria-label="Pages">
        {ITEMS.map(({ id, label, Icon }) => {
          const on = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`cassette-btn px-3 py-1.5 text-xs font-mono ${on ? 'cassette-btn-engaged' : 'text-[#9fa396]'}`}
            >
              <span className={`cassette-led ${on ? 'cassette-led-on' : ''}`} />
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-[#2b3326] bg-[#121510]/97 backdrop-blur-md ogm-page-nav"
      aria-label="Pages"
    >
      <div className="grid grid-cols-5 gap-0.5 px-1 pt-1">
        {ITEMS.map(({ id, label, Icon }) => {
          const on = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 min-h-[3.1rem] rounded-xl ${
                on ? 'text-[#b8d99e]' : 'text-[#9fa396]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-mono leading-none">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
