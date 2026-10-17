'use client';

// NOTE: getUserMedia は HTTPS または localhost 環境でのみ動作します。

import { ChangeEvent, RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { CameraGuideOverlay, type GuideRect } from '@/components/worker/camera-guide-overlay';
import { InspectionOverlay } from '@/components/worker/inspection-overlay';
import { buildGptFallbackMisses } from '@/lib/vision/gpt-overlay';
import type { VisionCheckResult } from '@/lib/vision/schema';
import type { InspectionResult, Miss } from '@/types/inspection';

const INTERVAL_MS = Number(process.env.NEXT_PUBLIC_CAMERA_INTERVAL_MS ?? 3000);
const START_CAPTURE_DELAY_MS = 750;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const RESULT_HOLD_MS = 3000;
const MIN_CHECKING_MS = 700;
const MIN_CROP_SIZE = 32;

type Status = 'idle' | 'checking' | 'ok' | 'ng';
type PreviewState = 'live' | 'checking' | 'result';
type CropRegion = { x: number; y: number; width: number; height: number; frameWidth: number; frameHeight: number };
type ExecuteCheckResponse = VisionCheckResult & {
  result?: InspectionResult;
  misses?: Miss[];
};

const overlayBorder: Record<Status, string> = {
  idle: 'border-slate-400',
  checking: 'border-amber-400',
  ok: 'border-emerald-400',
  ng: 'border-rose-500'
};

const overlayBg: Record<Status, string> = {
  idle: 'bg-black/20',
  checking: 'bg-amber-400/10',
  ok: 'bg-emerald-400/10',
  ng: 'bg-rose-500/10'
};

function remapMissToFrame(miss: Miss, cropRegion: CropRegion | null): Miss {
  if (!cropRegion) return miss;

  const frameWidth = Math.max(1, cropRegion.frameWidth);
  const frameHeight = Math.max(1, cropRegion.frameHeight);

  return {
    ...miss,
    bbox: {
      x: (cropRegion.x + miss.bbox.x * cropRegion.width) / frameWidth,
      y: (cropRegion.y + miss.bbox.y * cropRegion.height) / frameHeight,
      width: (miss.bbox.width * cropRegion.width) / frameWidth,
      height: (miss.bbox.height * cropRegion.height) / frameHeight
    }
  };
}

function getStatusLabel(status: Status, isStreaming: boolean) {
  if (status === 'checking') return '判定中';
  if (status === 'ok') return 'OK';
  if (status === 'ng') return 'NG';
  return isStreaming ? 'ライブプレビュー中' : 'カメラ起動中';
}

// GPT が bbox を返さなかった NG のときは、項目ごとの既定領域で代用する。
function resolveMisses(data: ExecuteCheckResponse, cropRegion: CropRegion | null): Miss[] {
  const misses = (data.misses ?? []).map((miss) => remapMissToFrame(miss, cropRegion));
  if (misses.length > 0 || data.overall !== 'ng') return misses;
  return buildGptFallbackMisses(data.checks);
}

export function CheckPanel({ maximized = false }: { maximized?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frozenImageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const okAudioRef = useRef<HTMLAudioElement | null>(null);
  const ngAudioRef = useRef<HTMLAudioElement | null>(null);
  const checkingStartedAtRef = useRef<number | null>(null);
  const cropRegionRef = useRef<CropRegion | null>(null);

  const [isStreaming, setIsStreaming] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<VisionCheckResult | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [previewState, setPreviewState] = useState<PreviewState>('live');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [inferenceError, setInferenceError] = useState<string | null>(null);
  const [useFileMode, setUseFileMode] = useState(false);
  const [capturedImageUrl, setCapturedImageUrl] = useState<string | null>(null);
  const [displayFrameUrl, setDisplayFrameUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [guideRect, setGuideRect] = useState<GuideRect | null>(null);
  const [inspectionMisses, setInspectionMisses] = useState<Miss[]>([]);
  const [noPersonMessage, setNoPersonMessage] = useState<string | null>(null);

  const clearResultTimer = useCallback(() => {
    if (resultTimerRef.current) {
      clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsStreaming(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
      setIsStreaming(true);
      setUseFileMode(false);
      setPreviewState('live');
    } catch {
      setCameraError('カメラへのアクセスが許可されていません');
      setUseFileMode(true);
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      clearResultTimer();
      stopCamera();
    };
  }, [clearResultTimer, startCamera, stopCamera]);

  useEffect(() => {
    okAudioRef.current = new Audio('/sounds/ok-chime.mp3');
    okAudioRef.current.volume = 0.45;
    ngAudioRef.current = new Audio('/sounds/ng-alert.mp3');
    ngAudioRef.current.volume = 0.45;
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const resetResultView = useCallback(() => {
    clearResultTimer();
    checkingStartedAtRef.current = null;
    cropRegionRef.current = null;
    setPreviewState('live');
    setStatus('idle');
    setResult(null);
    setInspectionMisses([]);
    setNoPersonMessage(null);
    setInferenceError(null);
    setCapturedImageUrl(null);
    setDisplayFrameUrl(null);
  }, [clearResultTimer]);

  const playResultSound = useCallback((nextStatus: 'ok' | 'ng') => {
    const target = nextStatus === 'ok' ? okAudioRef.current : ngAudioRef.current;
    if (!target) return;

    target.currentTime = 0;
    target.play().catch(() => {
      // 自動再生制約時は無音で継続する。
    });
  }, []);

  const runCheck = useCallback(async (imageDataUrl: string) => {
    const res = await fetch('/api/check/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl, inferenceMode: 'gpt' })
    });
    const payload = await res.json();

    if (!res.ok || payload?.ok === false) {
      throw new Error(typeof payload?.message === 'string' ? payload.message : '判定に失敗しました。');
    }

    return payload as ExecuteCheckResponse;
  }, []);

  const finalizeAfterCheckingDelay = useCallback(
    async (nextResult: ExecuteCheckResponse) => {
      const startedAt = checkingStartedAtRef.current;
      const elapsed = startedAt ? Date.now() - startedAt : MIN_CHECKING_MS;
      const remaining = Math.max(0, MIN_CHECKING_MS - elapsed);

      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }

      checkingStartedAtRef.current = null;

      if (nextResult.result === 'no_person') {
        setStatus('idle');
        setPreviewState('live');
        setResult(null);
        setInspectionMisses([]);
        setNoPersonMessage('📷 カメラに近づいてください');
        return;
      }

      const nextStatus = nextResult.overall === 'ok' ? 'ok' : 'ng';
      clearResultTimer();
      setNoPersonMessage(null);
      setResult(nextResult);
      setInspectionMisses(nextStatus === 'ng' ? nextResult.misses ?? [] : []);
      setStatus(nextStatus);
      setPreviewState('result');
      playResultSound(nextStatus);

      // NG は修正を確認してから手動で次へ進める。
      if (nextStatus === 'ok') {
        resultTimerRef.current = setTimeout(resetResultView, RESULT_HOLD_MS);
      }
    },
    [clearResultTimer, playResultSound, resetResultView]
  );

  const captureAndCheck = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || previewState !== 'live') return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video.videoWidth || !video.videoHeight) return;

    const videoRect = video.getBoundingClientRect();
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = video.videoWidth;
    let sourceHeight = video.videoHeight;

    // 白枠の中だけを切り出して判定する。
    if (guideRect && videoRect.width > 0 && videoRect.height > 0 && guideRect.width > 0 && guideRect.height > 0) {
      const scaleX = video.videoWidth / videoRect.width;
      const scaleY = video.videoHeight / videoRect.height;

      sourceX = Math.max(0, Math.round(guideRect.left * scaleX));
      sourceY = Math.max(0, Math.round(guideRect.top * scaleY));
      sourceWidth = Math.min(video.videoWidth - sourceX, Math.max(MIN_CROP_SIZE, Math.round(guideRect.width * scaleX)));
      sourceHeight = Math.min(video.videoHeight - sourceY, Math.max(MIN_CROP_SIZE, Math.round(guideRect.height * scaleY)));
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const fullFrameContext = canvas.getContext('2d');
    if (!fullFrameContext) return;
    fullFrameContext.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
    setDisplayFrameUrl(canvas.toDataURL('image/jpeg', 0.85));

    cropRegionRef.current = {
      x: sourceX,
      y: sourceY,
      width: sourceWidth,
      height: sourceHeight,
      frameWidth: video.videoWidth,
      frameHeight: video.videoHeight
    };

    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);

    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImageUrl(imageDataUrl);
    setResult(null);
    setNoPersonMessage(null);
    setInferenceError(null);
    clearResultTimer();
    checkingStartedAtRef.current = Date.now();
    setStatus('checking');
    setPreviewState('checking');

    try {
      const data = await runCheck(imageDataUrl);
      await finalizeAfterCheckingDelay({ ...data, misses: resolveMisses(data, cropRegionRef.current) });
    } catch (error) {
      checkingStartedAtRef.current = null;
      setStatus('idle');
      setPreviewState('live');
      setInferenceError(error instanceof Error ? error.message : '通信エラーが発生しました。');
      setInspectionMisses([]);
      setNoPersonMessage(null);
    }
  }, [clearResultTimer, finalizeAfterCheckingDelay, guideRect, previewState, runCheck]);

  useEffect(() => {
    if (!isStreaming || !isRunning || previewState !== 'live') return;
    const initialTimer = setTimeout(() => {
      void captureAndCheck();
    }, START_CAPTURE_DELAY_MS);
    const intervalTimer = setInterval(captureAndCheck, INTERVAL_MS);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, [captureAndCheck, isRunning, isStreaming, previewState]);

  const displayImageUrl = useFileMode ? previewUrl ?? capturedImageUrl : displayFrameUrl;
  const shouldShowFrozenFrame = Boolean(displayImageUrl) && (useFileMode || previewState !== 'live');
  const requiresManualAdvance = status === 'ng' && previewState === 'result';
  const statusLabel = getStatusLabel(status, isStreaming);

  function onChangeFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setFileError(null);
    setInferenceError(null);
    setResult(null);
    setInspectionMisses([]);
    setNoPersonMessage(null);
    setStatus('idle');
    setPreviewState('live');
    setDisplayFrameUrl(null);
    cropRegionRef.current = null;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    if (!nextFile) {
      setFile(null);
      return;
    }

    if (!nextFile.type.startsWith('image/')) {
      setFile(null);
      setFileError('画像ファイルを選択してください。');
      return;
    }

    if (nextFile.size > MAX_FILE_SIZE) {
      setFile(null);
      setFileError('画像サイズは10MB以下にしてください。');
      return;
    }

    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
    setCapturedImageUrl(null);
  }

  async function onFileInspect() {
    if (!file) return;

    setFileLoading(true);
    setFileError(null);
    setInferenceError(null);
    setResult(null);
    setInspectionMisses([]);
    setNoPersonMessage(null);
    clearResultTimer();

    try {
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setCapturedImageUrl(imageDataUrl);
      checkingStartedAtRef.current = Date.now();
      setStatus('checking');
      setPreviewState('checking');

      const data = await runCheck(imageDataUrl);
      await finalizeAfterCheckingDelay({ ...data, misses: resolveMisses(data, null) });
    } catch (err) {
      checkingStartedAtRef.current = null;
      setStatus('idle');
      setPreviewState('live');
      setFileError(err instanceof Error ? err.message : '通信エラーが発生しました。');
      setInspectionMisses([]);
      setNoPersonMessage(null);
    } finally {
      setFileLoading(false);
    }
  }

  return (
    <div className={maximized ? 'space-y-0' : 'space-y-4'}>
      {!useFileMode ? (
        <div
          className={`relative overflow-hidden border-4 bg-slate-950 ${overlayBorder[status]} ${overlayBg[status]} transition-colors duration-300 ${
            maximized ? 'aspect-video rounded-none' : 'rounded-2xl'
          }`}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`${maximized ? 'h-full object-contain' : ''} w-full ${shouldShowFrozenFrame ? 'invisible' : 'visible'}`}
          />
          {shouldShowFrozenFrame && displayImageUrl && (
            <img
              ref={frozenImageRef}
              src={displayImageUrl}
              alt="判定時の撮影画像"
              className="absolute inset-0 h-full w-full bg-slate-950 object-contain"
            />
          )}
          {status === 'ng' && inspectionMisses.length > 0 && shouldShowFrozenFrame && displayImageUrl && (
            <InspectionOverlay
              imageRef={frozenImageRef as RefObject<HTMLImageElement | HTMLVideoElement>}
              misses={inspectionMisses}
            />
          )}
          <canvas ref={canvasRef} className="hidden" />
          <CameraGuideOverlay onGuideRect={setGuideRect} status={status} />

          <div className="absolute inset-0 z-20 flex flex-col justify-between p-4">
            <div className="min-h-16">
              <div className="max-w-fit rounded-xl bg-black/35 p-1 backdrop-blur-[1px]">
                {status === 'checking' && (
                  <span className="inline-block rounded-lg bg-yellow-400 px-4 py-2 text-xl font-bold text-white shadow-xl">
                    判定中
                  </span>
                )}
                {status === 'ok' && (
                  <span className="inline-block rounded-lg bg-green-500 px-4 py-2 text-xl font-bold text-white shadow-xl">
                    ✓ 衛生OK
                  </span>
                )}
                {status === 'ng' && (
                  <span className="inline-block rounded-lg bg-red-600 px-4 py-2 text-xl font-bold text-white shadow-xl">
                    ✗ NG 違反検出
                  </span>
                )}
                {status === 'idle' && !isStreaming && (
                  <span className="inline-block rounded-lg bg-slate-600 px-4 py-2 text-lg font-bold text-white shadow-xl">
                    カメラ起動中...
                  </span>
                )}
                {status === 'idle' && isStreaming && noPersonMessage && (
                  <span className="inline-block rounded-lg bg-slate-700/90 px-4 py-2 text-lg font-bold text-white shadow-xl">
                    {noPersonMessage}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {status === 'checking' && (
                <div className="max-w-md rounded-xl bg-black/60 p-3 text-sm text-white shadow-lg backdrop-blur-sm">
                  撮影した画像をもとに判定しています。
                </div>
              )}
              {status === 'ng' && result && result.issues.length > 0 && (
                <div className="max-w-sm rounded-xl bg-black/60 p-3 text-white shadow-lg backdrop-blur-sm">
                  <ul className="space-y-1 text-xs leading-5">
                    {result.issues.slice(0, 2).map((issue, idx) => (
                      <li key={`${idx}-${issue.code}`}>
                        <span className="font-semibold">・{issue.message}</span>
                        <span className="ml-2 text-slate-300">→ {issue.suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {status === 'ok' && result && (
                <div className="max-w-md rounded-xl bg-black/60 p-3 text-sm text-white shadow-lg backdrop-blur-sm">
                  {result.summary}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-slate-900">画像アップロード</h2>
              <p className="text-sm text-slate-600">対応形式: 画像ファイル / 上限10MB</p>
            </CardHeader>
            <CardContent>
              <input
                type="file"
                accept="image/*"
                aria-label="判定する画像ファイルを選ぶ"
                onChange={onChangeFile}
                disabled={fileLoading}
                className="focus-ring block w-full rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-700 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-cyan-800"
              />
              <Button type="button" onClick={onFileInspect} disabled={!file || fileLoading} loading={fileLoading} className="w-full">
                {fileLoading ? '判定中...' : '判定する'}
              </Button>
              {fileError && <Alert tone="error">{fileError}</Alert>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-slate-900">プレビュー</h2>
            </CardHeader>
            <CardContent>
              {displayImageUrl ? (
                <div className="space-y-3">
                  <img src={displayImageUrl} alt="判定対象画像のプレビュー" className="w-full rounded-xl border border-slate-200" />
                  <div className="rounded-xl bg-slate-900 px-4 py-3 text-sm text-white">
                    <div className="font-semibold">{statusLabel}</div>
                    <div className="mt-1 text-slate-200">
                      {status === 'checking' ? 'この画像で判定しています。' : result?.summary ?? '画像を選択して判定してください。'}
                    </div>
                    {result && result.issues.length > 0 && (
                      <div className="mt-2 space-y-1 text-slate-100">
                        {result.issues.slice(0, 2).map((issue, idx) => (
                          <div key={`${idx}-${issue.code}`}>
                            {issue.message} / 対処: {issue.suggestion}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid h-52 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                  画像を選択するとここに表示されます
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="sticky bottom-3 z-20 flex flex-wrap gap-3 rounded-2xl bg-white/90 p-3 shadow-lg backdrop-blur-sm">
        {!useFileMode && (
          <Button onClick={() => setIsRunning((running) => !running)}>{isRunning ? '判定を一時停止' : '判定を開始'}</Button>
        )}
        {useFileMode && <Button onClick={() => startCamera()}>カメラを再試行</Button>}
        {requiresManualAdvance && (
          <Button type="button" variant="ghost" onClick={resetResultView}>
            次の判定へ
          </Button>
        )}
      </div>

      {cameraError && <Alert tone="error">{cameraError}</Alert>}
      {inferenceError && <Alert tone="error">{inferenceError}</Alert>}
      {requiresManualAdvance && (
        <Alert tone="warn">NG のため自動で次の判定へは進みません。修正後に「次の判定へ」を押してください。</Alert>
      )}
    </div>
  );
}
