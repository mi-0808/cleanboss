'use client';

import { useEffect, useRef } from 'react';

export type GuideRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type CameraGuideOverlayProps = {
  onGuideRect?: (rect: GuideRect) => void;
  detectionMode?: 'single' | 'multi';
  status?: 'idle' | 'checking' | 'ok' | 'ng';
};

// ガイド座標はオーバーレイ全体に対するパーセント指定。
const GUIDE_FRAME = {
  left: 4,
  top: 4,
  width: 92,
  height: 94
} as const;

const HAND_GUIDES = [
  {
    x: 18,
    y: 72,
    scale: 0.32,
    rotation: -12
  },
  {
    x: 82,
    y: 72,
    scale: 0.32,
    rotation: 12
  }
] as const;

const GUIDE_STROKE: Record<NonNullable<CameraGuideOverlayProps['status']>, string> = {
  idle: 'rgba(255,255,255,0.58)',
  checking: 'rgba(250,204,21,0.95)',
  ok: 'rgba(34,197,94,0.95)',
  ng: 'rgba(239,68,68,0.95)'
};

const GUIDE_GLOW: Record<NonNullable<CameraGuideOverlayProps['status']>, string> = {
  idle: '0 0 18px rgba(255,255,255,0.10)',
  checking: '0 0 22px rgba(250,204,21,0.25)',
  ok: '0 0 22px rgba(34,197,94,0.25)',
  ng: '0 0 22px rgba(239,68,68,0.28)'
};

export function CameraGuideOverlay({
  onGuideRect,
  detectionMode = 'single',
  status = 'idle'
}: CameraGuideOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const strokeColor = GUIDE_STROKE[status];
  const glowShadow = GUIDE_GLOW[status];

  useEffect(() => {
    if (!onGuideRect) return;

    const node = containerRef.current;
    if (!node) return;

    const emitGuideRect = () => {
      const { width, height } = node.getBoundingClientRect();
      if (!width || !height) return;

      onGuideRect(
        detectionMode === 'multi'
          ? { left: 0, top: 0, width, height }
          : {
              left: (GUIDE_FRAME.left / 100) * width,
              top: (GUIDE_FRAME.top / 100) * height,
              width: (GUIDE_FRAME.width / 100) * width,
              height: (GUIDE_FRAME.height / 100) * height
            }
      );
    };

    emitGuideRect();

    const observer = new ResizeObserver(() => {
      emitGuideRect();
    });

    observer.observe(node);
    window.addEventListener('resize', emitGuideRect);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', emitGuideRect);
    };
  }, [detectionMode, onGuideRect]);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0">
      {detectionMode === 'multi' ? (
        <div className="absolute inset-x-0 top-4 flex justify-center">
          <div className="rounded-full border border-white/30 bg-black/45 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm">
            全体検出中
          </div>
        </div>
      ) : (
        <>
          <svg
            viewBox="0 0 100 100"
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
          >
            <path
              d="M50 5
                 C34 5, 22 18, 22 35
                 C22 47, 29 57, 38 63
                 C29 70, 21 82, 16 99
                 M84 99
                 C79 82, 71 70, 62 63
                 C71 57, 78 47, 78 35
                 C78 18, 66 5, 50 5"
              fill="rgba(255,255,255,0.04)"
              stroke={strokeColor}
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="3.4 2.8"
              style={{ filter: `drop-shadow(${glowShadow})` }}
            />

            {HAND_GUIDES.map((guide, index) => (
              <path
                key={index}
                d="M0 -18
                   C-2 -24, 2 -28, 6 -25
                   C8 -23, 8 -17, 8 -10
                   L10 -22
                   C11 -28, 16 -31, 20 -28
                   C23 -25, 22 -19, 21 -11
                   L24 -24
                   C25 -30, 30 -33, 34 -30
                   C37 -27, 36 -20, 34 -11
                   L38 -20
                   C41 -24, 46 -24, 49 -21
                   C52 -18, 50 -13, 46 -8
                   L38 2
                   C40 10, 38 19, 31 24
                   C21 31, 4 30, -7 22
                   C-16 15, -20 2, -18 -10
                   L-18 -17
                   C-18 -23, -13 -26, -9 -23
                   C-6 -21, -4 -16, -2 -10
                   Z"
                fill="rgba(255,255,255,0.035)"
                stroke={status === 'ng' ? 'rgba(239,68,68,0.35)' : strokeColor}
                strokeWidth="3.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="4.5 3.2"
                transform={`translate(${guide.x} ${guide.y}) rotate(${guide.rotation}) scale(${guide.scale})`}
                style={{ filter: `drop-shadow(${glowShadow})` }}
              />
            ))}
          </svg>
        </>
      )}
    </div>
  );
}
