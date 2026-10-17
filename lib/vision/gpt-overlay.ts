import type { VisionCheckResult } from '@/lib/vision/schema';
import type { Miss } from '@/types/inspection';

const GPT_CHECK_REGION: Record<string, Miss> = {
  C01: {
    miss_type: '頭巾',
    body_part: 'head',
    severity_level: 'high',
    bbox_source: 'fallback',
    bbox: { x: 0.2, y: 0, width: 0.6, height: 0.28 }
  },
  C02: {
    miss_type: 'フード',
    body_part: 'head',
    severity_level: 'high',
    bbox_source: 'fallback',
    bbox: { x: 0.15, y: 0, width: 0.7, height: 0.35 }
  },
  C03: {
    miss_type: 'マスク',
    body_part: 'face',
    severity_level: 'critical',
    bbox_source: 'fallback',
    bbox: { x: 0.28, y: 0.12, width: 0.44, height: 0.22 }
  },
  C05: {
    miss_type: 'ファスナー',
    body_part: 'torso',
    severity_level: 'high',
    bbox_source: 'fallback',
    bbox: { x: 0.38, y: 0.3, width: 0.24, height: 0.38 }
  },
  C06: {
    miss_type: '袖口',
    body_part: 'wrist',
    severity_level: 'high',
    bbox_source: 'fallback',
    bbox: { x: 0, y: 0.55, width: 0.35, height: 0.25 }
  },
  C07: {
    miss_type: '手袋',
    body_part: 'hands',
    severity_level: 'high',
    bbox_source: 'fallback',
    bbox: { x: 0.62, y: 0.55, width: 0.38, height: 0.3 }
  },
  C08: {
    miss_type: 'ブーツ',
    body_part: 'boots',
    severity_level: 'high',
    bbox_source: 'fallback',
    bbox: { x: 0.28, y: 0.78, width: 0.44, height: 0.18 }
  },
  C09: {
    miss_type: 'ヘアネット',
    body_part: 'head',
    severity_level: 'high',
    bbox_source: 'fallback',
    bbox: { x: 0.32, y: 0.04, width: 0.36, height: 0.16 }
  }
};

function regionCodeFor(check: VisionCheckResult['checks'][number]): string | null {
  const description = `${check.item} ${check.reason}`;

  // 過去プロンプトのC04/C05/C06ずれも、理由文の部位名から正しい現行コードへ戻す。
  if (description.includes('ヘアネット')) return 'C09';
  if (description.includes('頭巾')) return 'C01';
  if (description.includes('フード')) return 'C02';
  if (description.includes('マスク')) return 'C03';
  if (description.includes('ファスナー')) return 'C05';
  if (description.includes('袖口') || description.includes('手首')) return 'C06';
  if (description.includes('手袋')) return 'C07';
  if (description.includes('ブーツ') || description.includes('足元')) return 'C08';

  if (GPT_CHECK_REGION[check.item]) return check.item;
  if (check.item === 'C04') return 'C05';
  return null;
}

export function buildGptFallbackMisses(checks: VisionCheckResult['checks']): Miss[] {
  return checks
    .filter((check) => check.result === 'ng')
    .flatMap((check) => {
      const code = regionCodeFor(check);
      const region = code ? GPT_CHECK_REGION[code] : undefined;
      return region ? [{ ...region, bbox: { ...region.bbox } }] : [];
    });
}
