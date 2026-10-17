'use client';

import { RefObject, useEffect, useRef } from 'react';
import type { Miss, SeverityLevel } from '@/types/inspection';

const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  low: '#FACC15',
  medium: '#F97316',
  high: '#EF4444',
  critical: '#7F1D1D'
};

function formatMissLabel(missType: string) {
  switch (missType) {
    case 'mask_gap':
      return 'マスクずれ';
    case 'zip_open':
      return 'チャック開き';
    case 'hair_out':
      return '髪のはみ出し';
    case 'eyebrow_out':
      return '眉毛露出';
    case 'neck_gap':
      return '首元露出';
    case 'glove_gap':
      return '手袋すき間';
    case 'hood_missing':
      return 'フード未着用';
    case 'hood_untucked':
      return 'フード外出し';
    default:
      return missType;
  }
}

export function InspectionOverlay({
  imageRef,
  misses
}: {
  imageRef: RefObject<HTMLImageElement | HTMLVideoElement>;
  misses: Miss[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = imageRef.current;
    const canvas = canvasRef.current;
    if (!element || !canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const draw = () => {
      const rect = element.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      context.clearRect(0, 0, rect.width, rect.height);

      misses.forEach((miss) => {
        const color = SEVERITY_COLORS[miss.severity_level];
        const x = miss.bbox.x * rect.width;
        const y = miss.bbox.y * rect.height;
        const width = miss.bbox.width * rect.width;
        const height = miss.bbox.height * rect.height;

        context.strokeStyle = color;
        context.lineWidth = 3;
        context.fillStyle = `${color}33`;
        context.fillRect(x, y, width, height);
        context.strokeRect(x, y, width, height);

        const label = formatMissLabel(miss.miss_type);
        context.font = 'bold 14px sans-serif';
        const textWidth = context.measureText(label).width;
        const labelHeight = 24;
        const labelY = Math.max(0, y - labelHeight);

        context.fillStyle = color;
        context.fillRect(x, labelY, textWidth + 16, labelHeight);
        context.fillStyle = '#ffffff';
        context.fillText(label, x + 8, labelY + 16);
      });
    };

    draw();

    const observer = new ResizeObserver(() => {
      draw();
    });

    observer.observe(element);
    window.addEventListener('resize', draw);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', draw);
    };
  }, [imageRef, misses]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 25
      }}
    />
  );
}
