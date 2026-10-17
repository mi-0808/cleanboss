import { describe, expect, it, vi } from 'vitest';

import { POST as executePost } from '../../app/api/check/execute/route';
import { POST as inspectPost } from '../../app/api/inspect/route';
import * as inference from '../../lib/inference/mock-inference';
import * as executeCheckModule from '../../lib/inference/execute-check';

const validPayload = {
  deviceCode: 'iphone16-fixed-01',
  overallResult: 'OK',
  retryCount: 0,
  itemResults: [
    { itemCode: 'hair', score: 1, threshold: 0.7, result: 'OK' },
    { itemCode: 'neck_gap', score: 1, threshold: 0.7, result: 'OK' },
    { itemCode: 'glove_gap', score: 1, threshold: 0.7, result: 'OK' }
  ]
};

describe('check APIs', () => {
  it('APP-FE-002/003/004: execute API returns 410 when mock is disabled', async () => {
    delete process.env.NEXT_PUBLIC_USE_MOCK;
    delete process.env.USE_MOCK_INFERENCE;

    const req = new Request('http://localhost/api/check/execute', {
      method: 'POST',
      body: JSON.stringify({ inferenceMode: 'mock' }),
      headers: { 'Content-Type': 'application/json' }
    });

    const res = await executePost(req as any);
    const body = await res.json();

    expect(res.status).toBe(410);
    expect(body.ok).toBe(false);
  });

  it('APP-FE-002/003/004: execute API returns mocked result only when flag is enabled', async () => {
    process.env.USE_MOCK_INFERENCE = '1';
    vi.spyOn(inference, 'runMockInference').mockReturnValueOnce([
      { itemCode: 'hair', score: 0.95, threshold: 0.7, result: 'OK' },
      { itemCode: 'neck_gap', score: 0.2, threshold: 0.7, result: 'NG', reasonCode: '首元に隙間（肌の露出）があります' },
      { itemCode: 'glove_gap', score: 0.91, threshold: 0.7, result: 'OK' }
    ] as any);

    const req = new Request('http://localhost/api/check/execute', {
      method: 'POST',
      body: JSON.stringify({ inferenceMode: 'mock' }),
      headers: { 'Content-Type': 'application/json' }
    });

    const res = await executePost(req as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.mode).toBe('mock');
    expect(body.overall).toBe('ng');
    expect(body.issues).toHaveLength(1);
    expect(body.issues[0].message).toContain('首元');
    delete process.env.USE_MOCK_INFERENCE;
  });

  it('APP-FE-002: execute API forwards GPT mode when selected', async () => {
    vi.spyOn(executeCheckModule, 'executeCheck').mockResolvedValueOnce({
      overall: 'ok',
      summary: 'GPT 判定で違反は検出されませんでした',
      issues: [],
      confidence: 0.93,
      checks: [],
      misses: []
    });

    const req = new Request('http://localhost/api/check/execute', {
      method: 'POST',
      body: JSON.stringify({
        inferenceMode: 'gpt',
        imageDataUrl: 'data:image/jpeg;base64,ZmFrZQ=='
      }),
      headers: { 'Content-Type': 'application/json' }
    });

    const res = await executePost(req as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('gpt');
    expect(executeCheckModule.executeCheck).toHaveBeenCalledWith({
      imageDataUrl: 'data:image/jpeg;base64,ZmFrZQ==',
      inferenceMode: 'gpt',
      detectionMode: undefined
    });
  });

  it('APP-FE-011: inspect API returns a clear error when key is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.NEXT_PUBLIC_USE_MOCK;
    delete process.env.USE_MOCK_INFERENCE;

    const formData = new FormData();
    formData.append('image', new File([new Uint8Array([1, 2, 3])], 'sample.png', { type: 'image/png' }));

    const req = new Request('http://localhost/api/inspect', {
      method: 'POST',
      body: formData
    });

    const res = await inspectPost(req as any);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toContain('OPENAI_API_KEY');
  });
});
