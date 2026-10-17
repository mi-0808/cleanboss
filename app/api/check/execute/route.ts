import { NextRequest, NextResponse } from 'next/server';

import {
  executeCheck,
  isInputValidationError,
  isMockEnabled,
  normalizeInferenceMode
} from '@/lib/inference/execute-check';

export const runtime = 'nodejs';

function nowMs(): number {
  try {
    return globalThis.performance?.now() ?? Date.now();
  } catch {
    return Date.now();
  }
}

function elapsedMs(startedAt: number, finishedAt: number): number {
  return Math.max(0, Math.round(finishedAt - startedAt));
}

export async function POST(req: NextRequest) {
  const requestStartedAt = nowMs();

  try {
    const body = await req.json().catch(() => ({}));
    const inferenceMode = normalizeInferenceMode(body?.inferenceMode);

    if (inferenceMode === 'mock' && !isMockEnabled()) {
      return NextResponse.json(
        {
          ok: false,
          message: 'モックモードは無効です。NEXT_PUBLIC_USE_MOCK または USE_MOCK_INFERENCE を有効化してください。'
        },
        { status: 410 }
      );
    }

    const inferenceStartedAt = nowMs();
    const result = await executeCheck({
      imageDataUrl: typeof body?.imageDataUrl === 'string' ? body.imageDataUrl : undefined,
      inferenceMode
    });
    const inferenceFinishedAt = nowMs();
    const responseFinishedAt = nowMs();

    return NextResponse.json({
      ok: true,
      mode: inferenceMode,
      ...result,
      _latency_ms: {
        preprocess: elapsedMs(requestStartedAt, inferenceStartedAt),
        inference: elapsedMs(inferenceStartedAt, inferenceFinishedAt),
        total: elapsedMs(requestStartedAt, responseFinishedAt)
      }
    });
  } catch (error) {
    if (isInputValidationError(error)) {
      return NextResponse.json(
        {
          ok: false,
          message: error.message
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : '判定処理でエラーが発生しました';
    const status = /not configured/i.test(message) ? 500 : 502;

    return NextResponse.json(
      {
        ok: false,
        message
      },
      { status }
    );
  }
}
