'use client';
import { useEffect, useRef, useState } from 'react';
import { GameHaptics } from '../lib/game-haptics';

const preference = 'water-sort-vibration';
export function useGameHaptics() {
  const engine = useRef<GameHaptics | null>(null);
  if (!engine.current) engine.current = new GameHaptics();
  const haptics = engine.current;
  const [supported, setSupported] = useState(() => haptics.supported);
  const [vibrationOn, setVibrationOn] = useState(() => { try { return localStorage.getItem(preference) !== 'off'; } catch { return true; } });
  useEffect(() => {
    try { haptics.setEnabled(localStorage.getItem(preference) !== 'off'); } catch {}
    const motion = matchMedia('(prefers-reduced-motion: reduce)'), touch = matchMedia('(any-pointer: coarse)');
    const hidden = () => { if (document.hidden) haptics.stop(); };
    const changed = () => { setSupported(haptics.supported); if (motion.matches || !haptics.supported) haptics.stop(); };
    document.addEventListener('visibilitychange', hidden);
    motion.addEventListener('change', changed); touch.addEventListener('change', changed);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      motion.removeEventListener('change', changed); touch.removeEventListener('change', changed); haptics.dispose();
    };
  }, [haptics]);
  function toggleVibration() {
    const enabled = !vibrationOn;
    setVibrationOn(enabled); haptics.setEnabled(enabled); haptics.unlock();
    try { localStorage.setItem(preference, enabled ? 'on' : 'off'); } catch {}
  }
  return { haptics, supported, vibrationOn, toggleVibration };
}
