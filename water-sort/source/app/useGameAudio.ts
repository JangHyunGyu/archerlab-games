'use client';
import { useEffect, useRef, useState } from 'react';
import { GameAudio } from '../lib/game-audio';

export function useGameAudio() {
  const engine = useRef<GameAudio | null>(null);
  if (!engine.current) engine.current = new GameAudio();
  const audio = engine.current;
  const [soundOn, setSoundOn] = useState(true);
  useEffect(() => {
    try { const enabled = localStorage.getItem('water-sort-sound') !== 'off'; setSoundOn(enabled); audio.setEnabled(enabled); } catch {}
    const hidden = () => { if (document.hidden) audio.stop(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { document.removeEventListener('visibilitychange', hidden); audio.dispose(); };
  }, [audio]);
  function toggleSound() {
    const enabled = !soundOn;
    setSoundOn(enabled); audio.setEnabled(enabled);
    try { localStorage.setItem('water-sort-sound', enabled ? 'on' : 'off'); } catch {}
    if (enabled) { audio.unlock(); audio.play('select'); }
  }
  return { audio, soundOn, toggleSound };
}
