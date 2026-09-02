'use client';

import { useReducedMotion } from 'framer-motion';

/** Max ~280ms; keep motion snappy for form UI */
export const UI_MS = 220;
export const UI_MS_SHORT = 160;

export function useUiMotion() {
  const reduced = useReducedMotion() ?? false;

  return {
    reduced,
    /** Transitions for opacity / cross-fade */
    fade: reduced ? { duration: 0 } : { duration: UI_MS / 1000, ease: [0.25, 0.1, 0.25, 1] as const },
    /** Width / progress - spring tracks smoothly when the target updates often (scroll-linked steps on mobile). */
    bar: reduced
      ? { duration: 0 }
      : {
          type: 'spring' as const,
          stiffness: 42,
          damping: 22,
          mass: 0.95,
          restDelta: 0.01,
        },
    /** Micro-interactions */
    micro: reduced ? { duration: 0 } : { duration: 0.12, ease: 'easeOut' as const },
  };
}
