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
    /** Width / progress */
    bar: reduced ? { duration: 0 } : { duration: 0.26, ease: 'easeOut' as const },
    /** Micro-interactions */
    micro: reduced ? { duration: 0 } : { duration: 0.12, ease: 'easeOut' as const },
  };
}
