import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('framer-motion', () => ({
  useReducedMotion: vi.fn(),
}));

import { useReducedMotion } from 'framer-motion';

import { UI_MS, UI_MS_SHORT, useUiMotion } from '@/lib/ui-motion';

function renderMotionJson() {
  function Probe() {
    return createElement('span', {
      'data-motion': JSON.stringify(useUiMotion()),
    });
  }
  const html = renderToStaticMarkup(createElement(Probe));
  const match = /data-motion="([^"]+)"/.exec(html);
  return JSON.parse(match![1]!.replace(/&quot;/g, '"')) as ReturnType<typeof useUiMotion>;
}

describe('useUiMotion', () => {
  it('returns zero-duration transitions when reduced motion is preferred', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    expect(renderMotionJson()).toEqual({
      reduced: true,
      fade: { duration: 0 },
      bar: { duration: 0 },
      micro: { duration: 0 },
    });
  });

  it('returns snappy motion presets when animation is allowed', () => {
    vi.mocked(useReducedMotion).mockReturnValue(false);
    const motion = renderMotionJson();
    expect(motion.reduced).toBe(false);
    expect(motion.fade.duration).toBe(UI_MS / 1000);
    expect(motion.micro.duration).toBe(0.12);
    expect(motion.bar).toMatchObject({ type: 'spring', stiffness: 42 });
  });

  it('treats null reduced-motion preference as animation allowed', () => {
    vi.mocked(useReducedMotion).mockReturnValue(null);
    expect(renderMotionJson().reduced).toBe(false);
    expect(UI_MS_SHORT).toBe(160);
  });
});
