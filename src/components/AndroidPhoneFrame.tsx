import React, { useState, useEffect } from 'react';
import { Wifi, BatteryMedium, Signal, Smartphone, Monitor } from 'lucide-react';

interface AndroidPhoneFrameProps {
  children: React.ReactNode;
  isPhoneView: boolean;
  onToggleView: () => void;
}

export const AndroidPhoneFrame: React.FC<AndroidPhoneFrameProps> = ({
  children,
  isPhoneView,
  onToggleView,
}) => {
  const [currentTime, setCurrentTime] = useState('10:20');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const h = now.getHours().toString().padStart(2, '0');
      const m = now.getMinutes().toString().padStart(2, '0');
      setCurrentTime(`${h}:${m}`);
    };
    updateClock();
    const interval = setInterval(updateClock, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!isPhoneView) {
    return <div className="w-full min-h-screen bg-[#111411]">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-[#0A0D0A] flex flex-col items-center justify-start py-4 sm:py-6 px-2 selection:bg-[#B8D99E] selection:text-[#0F150C]">
      {/* Top Floating Viewport Switcher Toolbar */}
      <div className="mb-4 flex items-center gap-2 bg-[#181C18] border border-[#282E27] p-1.5 rounded-full shadow-lg">
        <button
          onClick={onToggleView}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#B8D99E] text-[#0F150C] shadow-sm transition-all"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Android Phone (Pixel Preview)</span>
        </button>
        <button
          onClick={onToggleView}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-[#A2ACA0] hover:text-[#F1F5EC] transition-all"
        >
          <Monitor className="w-3.5 h-3.5" />
          <span>Fullscreen Studio</span>
        </button>
      </div>

      {/* Android Phone Chassis */}
      <div className="relative w-full max-w-[430px] h-[890px] max-h-[92vh] bg-[#111411] rounded-[48px] border-[10px] border-[#222822] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden ring-1 ring-[#323D31]">
        {/* Android Punch-hole Camera & Speaker */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 flex items-center gap-2 z-50 pointer-events-none">
          <div className="w-3.5 h-3.5 rounded-full bg-black border border-[#222822] shadow-inner" />
        </div>

        {/* Android Native Status Bar */}
        <div className="w-full bg-[#141814] px-6 pt-3 pb-1 flex items-center justify-between text-xs text-[#F1F5EC] select-none shrink-0 z-40 border-b border-[#20261E]">
          <span className="font-semibold text-[13px] tracking-tight">{currentTime}</span>
          <div className="flex items-center gap-2 text-[#A2ACA0]">
            <Signal className="w-3.5 h-3.5" />
            <Wifi className="w-3.5 h-3.5" />
            <div className="flex items-center gap-0.5">
              <span className="text-[10px] font-mono">94%</span>
              <BatteryMedium className="w-4 h-4 text-[#86EFAC]" />
            </div>
          </div>
        </div>

        {/* Scrollable Mobile App Body */}
        <div className="flex-1 overflow-y-auto relative flex flex-col scrollbar-none">
          {children}
        </div>

        {/* Android Gesture Bar */}
        <div className="w-full bg-[#141814] py-1.5 flex justify-center shrink-0 z-40 border-t border-[#1C211C]">
          <div className="w-32 h-1 rounded-full bg-white/30" />
        </div>
      </div>
    </div>
  );
};
