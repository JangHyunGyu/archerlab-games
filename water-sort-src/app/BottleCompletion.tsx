'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { WATER_COLORS } from '../lib/glass-renderer';
import { copy as c } from './copy';

/** Only confirmed, settled liquid earns a burst; prefilled and resumed bottles get a steady seal. */
export function BottleCompletion({ ready, color, hideLabel }: { ready: boolean; color: number; hideLabel: boolean }) {
  const previous = useRef(ready);
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    const celebrate = ready && !previous.current;
    previous.current = ready;
    setBurst(celebrate);
    if (celebrate) {
      const timer = setTimeout(() => setBurst(false), 1100);
      return () => clearTimeout(timer);
    }
  }, [ready]);
  if (!ready) return null;
  return <span className={'bottle-completion' + (burst ? ' completion-burst' : '')} style={{ '--liquid-color': WATER_COLORS[color] } as CSSProperties} aria-hidden="true">
    <span className="completion-aura"/><span className="completion-ring"/>
    {burst && <span className="completion-particles">{Array.from({ length: 8 }, (_, i) => <i key={i} style={{ '--particle-x': `${Math.cos(i * Math.PI / 4) * 35}px`, '--particle-y': `${Math.sin(i * Math.PI / 4) * 60}px`, '--particle-delay': `${i % 3 * 35}ms` } as CSSProperties}/>)}</span>}
    {!hideLabel && <span className="completion-seal"><svg viewBox="0 0 16 16"><path d="m3 8 3 3 7-7"/></svg>{c.filled}</span>}
  </span>;
}
