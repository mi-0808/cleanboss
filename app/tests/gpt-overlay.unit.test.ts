import { describe, expect, it } from 'vitest';

import { buildGptFallbackMisses } from '../../lib/vision/gpt-overlay';

describe('GPT fixed-region overlays', () => {
  it('現行コードのNG項目を固定ボックスへ変換する', () => {
    const misses = buildGptFallbackMisses([
      { item: 'C01', result: 'ng', reason: '頭巾を着用していない' },
      { item: 'C05', result: 'ng', reason: 'ファスナーが開いている' },
      { item: 'C07', result: 'ng', reason: '手袋を着用していない' }
    ]);

    expect(misses).toHaveLength(3);
    expect(misses.map((miss) => miss.body_part)).toEqual(['head', 'torso', 'hands']);
    expect(misses.every((miss) => miss.bbox_source === 'fallback')).toBe(true);
  });

  it('旧プロンプトのコードずれを理由文から補正する', () => {
    const misses = buildGptFallbackMisses([
      { item: 'C04', result: 'ng', reason: 'ファスナーが閉じていない' },
      { item: 'C05', result: 'ng', reason: '袖口から手首が露出している' },
      { item: 'C06', result: 'ng', reason: '手袋を着用していない' }
    ]);

    expect(misses.map((miss) => miss.body_part)).toEqual(['torso', 'wrist', 'hands']);
  });

  it('OK項目と未知の部位は枠を生成しない', () => {
    const misses = buildGptFallbackMisses([
      { item: 'C01', result: 'ok', reason: '頭巾は正常' },
      { item: 'UNKNOWN', result: 'ng', reason: '判定不能' }
    ]);

    expect(misses).toEqual([]);
  });
});
