'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { WATER_COLORS } from '../lib/glass-renderer';
import { copy as c } from './copy';

/** Only confirmed, settled liquid earns a burst; prefilled and resumed bottles get a steady seal. */
export function BottleCompletion({ ready, color, hideLabel, onCelebrate }: { ready: boolean; color: number; hideLabel: boolean; onCelebrate?: (node: HTMLElement, color: number) => void }) {
  const node = useRef<HTMLSpanElement>(null);
  const previous = useRef(ready);
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    const celebrate = ready && !previous.current;
    previous.current = ready;
    setBurst(celebrate);
    if (celebrate) {
      if (node.current) onCelebrate?.(node.current.parentElement!, color);
      const timer = setTimeout(() => setBurst(false), 1100);
      return () => clearTimeout(timer);
    }
  }, [ready, color, onCelebrate]);
  if (!ready) return null;
  return <span ref={node} className={'bottle-completion' + (burst ? ' completion-burst' : '')} style={{ '--liquid-color': WATER_COLORS[color] } as CSSProperties} aria-hidden="true">
    <span className="completion-aura"/><span className="completion-ring"/>
    {burst && <span className="completion-sheen"/>}
    {!hideLabel && <span className="completion-seal"><svg viewBox="0 0 16 16"><path d="m3 8 3 3 7-7"/></svg>{c.filled}</span>}
  </span>;
}
