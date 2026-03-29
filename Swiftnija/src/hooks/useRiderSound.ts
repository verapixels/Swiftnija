 
import { useState, useEffect, useRef, useCallback } from "react";
 
const STORAGE_KEY = "swiftnija_rider_sound";
 
export function useRiderSound() {
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === null ? true : stored === "true";
    } catch { return true; }
  });
 
  const audioCtxRef = useRef<AudioContext | null>(null);
  const unlockedRef = useRef(false);
 
  // Unlock AudioContext on first user gesture
  useEffect(() => {
    const unlock = () => {
      if (unlockedRef.current) return;
      try {
        audioCtxRef.current = new AudioContext();
        audioCtxRef.current.resume();
        unlockedRef.current = true;
      } catch {}
    };
    window.addEventListener("click",      unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    return () => {
      window.removeEventListener("click",      unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);
 
  const toggleSound = useCallback(() => {
    setSoundOn(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);
 
  // Play a deep "ding" notification sound
  const playNewOrderSound = useCallback(() => {
    if (!soundOn) return;
    try {
      const ctx = audioCtxRef.current ?? new AudioContext();
      if (!audioCtxRef.current) audioCtxRef.current = ctx;
      ctx.resume();
 
      // Deep ding — three descending tones
      const notes = [
        { freq: 523.25, start: 0,    dur: 0.6 },  // C5
        { freq: 392.00, start: 0.15, dur: 0.6 },  // G4
        { freq: 261.63, start: 0.3,  dur: 0.8 },  // C4 (deep)
      ];
 
      notes.forEach(({ freq, start, dur }) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
 
        osc.type = "sine";
        osc.frequency.value = freq;
 
        const t = ctx.currentTime + start;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.5, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
 
        osc.start(t);
        osc.stop(t + dur + 0.05);
      });
    } catch (e) {
      console.warn("[RiderSound] Could not play sound:", e);
    }
  }, [soundOn]);
 
  return { soundOn, toggleSound, playNewOrderSound };
}
 