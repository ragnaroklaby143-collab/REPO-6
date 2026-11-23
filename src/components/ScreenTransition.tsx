import React, { useEffect, useState } from 'react';

interface ScreenTransitionProps {
  transitionKey: number;
  label: string;
  sublabel?: string;
  accentHex?: string;
}

export const ScreenTransition: React.FC<ScreenTransitionProps> = ({
  transitionKey,
  label,
  sublabel,
  accentHex = '#f59e0b',
}) => {
  const [visibleKey, setVisibleKey] = useState<number>(0);

  useEffect(() => {
    if (transitionKey <= 0) return;
    setVisibleKey(transitionKey);
    const t = setTimeout(() => {
      setVisibleKey((cur) => (cur === transitionKey ? 0 : cur));
    }, 480);
    return () => clearTimeout(t);
  }, [transitionKey]);

  if (!visibleKey) return null;

  return (
    <div
      key={visibleKey}
      data-testid="screen-transition"
      aria-hidden="true"
      className="fixed inset-0 z-50 pointer-events-none overflow-hidden flex items-center justify-center"
    >
      <div
        className="absolute inset-0 animate-transition-curtain"
        style={{
          background: `linear-gradient(115deg, rgba(15,23,42,0.94) 0%, rgba(15,23,42,0.92) 55%, ${accentHex}ee 100%)`,
        }}
      />
      <div className="relative z-10 animate-transition-banner px-6 py-3 rounded-2xl bg-white/95 border-2 border-slate-900 shadow-2xl text-center">
        <div
          className="text-[10px] font-display font-bold uppercase tracking-widest"
          style={{ color: accentHex === '#f59e0b' ? '#b45309' : accentHex }}
        >
          {sublabel || 'KOOPAL CLASH'}
        </div>
        <div className="font-display text-2xl sm:text-3xl font-bold tracking-wider text-slate-950 uppercase">
          {label}
        </div>
      </div>
    </div>
  );
};
