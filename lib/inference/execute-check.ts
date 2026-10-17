import { runMockInference } from '@/lib/inference/mock-inference';
import type { ItemResult } from '@/lib/rules/types';
import { visionCheckResultSchema, visionResponseJsonSchema, type VisionCheckResult } from '@/lib/vision/schema';
import type { InspectionResult } from '@/types/inspection';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export type InferenceMode = 'gpt' | 'mock';
export type ExecuteCheckResult = VisionCheckResult & {
  result?: InspectionResult;
  inferenceMs?: number;
};

type ExecuteParams = {
  imageDataUrl?: string;
  inferenceMode?: string;
};

class InputValidationError extends Error {}

function extractJsonText(response: any): string | null {
  if (typeof response?.output_text === 'string' && response.output_text.length > 0) {
    return response.output_text;
  }

  const output = response?.output;
  if (!Array.isArray(output)) return null;

  for (const chunk of output) {
    const content = chunk?.content;
    if (!Array.isArray(content)) continue;

    for (const item of content) {
      if (item?.type === 'output_text' && typeof item?.text === 'string') {
        return item.text;
      }
    }
  }

  return null;
}

export function isMockEnabled() {
  return process.env.NEXT_PUBLIC_USE_MOCK === '1' || process.env.USE_MOCK_INFERENCE === '1';
}

export function normalizeInferenceMode(mode?: string): InferenceMode {
  return mode === 'mock' ? 'mock' : 'gpt';
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\n\r]+)$/);
  if (!match) {
    throw new InputValidationError('画像形式が不正です（jpeg/png/webp の dataURL を指定してください）');
  }

  const mimeType = match[1];
  const base64 = match[2].replace(/\s/g, '');

  if (!ALLOWED_MIME.has(mimeType)) {
    throw new InputValidationError('許可されていない画像形式です');
  }

  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) {
    throw new InputValidationError('画像データが空です');
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new InputValidationError('画像サイズが大きすぎます（最大4MB）');
  }

  return { mimeType, base64 };
}

/** JSONとして読めなければ null。呼び出し側が「形が違う」として扱えるようにする。 */
function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readJsonResponse(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;

  return safeJsonParse(text);
}

function buildPrompt(): { system: string; user: string } {
  const system = [
    'あなたはクリーンルーム入室前の着用検査官です。',
    'クリーンウェアの着用状態を検査し、不備があれば具体的に指摘してください。',
    '',
    '## 判定方針',
    '- 異物混入リスクを防ぐため、安全側に倒して判定する',
    '- 明らかな不備がある場合のみ NG とする',
    '- 確信が低い場合は過剰判定せず、根拠のある内容だけを返す',
    '',
    '## 撮影条件',
    '- iPad前面カメラ（壁掛け設置、床から約150cm）',
    '- 上半身中心（頭部〜手首が映る。足首は通常映らない）',
    '- クリーンルーム前室の蛍光灯照明下',
    '',
    '## エッジケース',
    '- 複数人が映っている場合: 最も大きく映っている1名のみ判定',
    '- 画像が不鮮明で判定困難な場合: overall を "ok" とし summary に理由を記載',
    '- 人物が映っていない場合: overall を "ok"、issues 空、summary に「人物が検出できませんでした」と記載',
    '- 身体の一部がフレーム外の場合: その部位は OK 扱い',
    '',
    '## 出力ルール',
    '- NG 箇所がある場合は misses に部位ごとの矩形領域を返す',
    '- bbox は画像全体に対する 0〜1 の正規化座標（x, y は左上、width, height は矩形サイズ）',
    '- 不備箇所が特定できない場合は misses を空配列にする',
    '- 必ずJSONのみで返答する'
  ].join('\n');

  const user = [
    '## チェック項目と判定基準',
    '',
    'C01 頭巾（head）: 髪が頭巾の中に完全に収納されているか',
    '  - OK: 髪が一切見えない',
    '  - NG: 前髪や横髪が明確にはみ出している、または頭巾を被っていない',
    '',
    'C02 フード（face）: フードが顔周りに密着しているか',
    '  - OK: フードの縁が顔の輪郭に沿って密着',
    '  - NG: フードが大きく浮いて首や耳が露出、またはフード未装着',
    '',
    'C03 マスク（nose_mouth）: 鼻と口が完全に覆われているか',
    '  - OK: マスクが鼻の付け根まで覆い口から顎まで密着',
    '  - NG: マスク未着用、顎にかけている、鼻全体が露出',
    '',
    'C05 ファスナー（torso）: ウェアのファスナーが完全に閉じているか',
    '  - OK: ファスナーが首元まで完全に閉じている',
    '  - NG: ファスナーが胸元以下まで大きく開きインナーが見えている',
    '',
    'C06 袖口（wrist）: 袖口と手袋の間に隙間がないか',
    '  - OK: 袖口が手袋の上に被さり肌が見えない',
    '  - NG: 袖口が開いて手首の肌が露出',
    '',
    'C07 手袋（hands）: 両手に正しく着用されているか',
    '  - OK: 両手に着用し破れや明らかな緩みがない',
    '  - NG: 片手または両手が未着用、穴や破れがある',
    '',
    '## 判定ルール',
    '- 各項目を確認し、1つでも明確な不備があれば overall は "ng"',
    '- 全て問題なければ overall は "ok"',
    '- issues は不備項目のみ列挙（重複なし）',
    '- overall が "ok" のとき issues は空配列',
    '',
    '## 判定例（NGあり）',
    '{',
    '  "overall": "ng",',
    '  "summary": "マスクが顎まで下がり鼻と口が露出しています。マスクを鼻の付け根まで引き上げてください。",',
    '  "issues": [',
    '    { "code": "MASK_GAP", "message": "マスクが顎まで下がり鼻と口が露出しています", "suggestion": "マスクを鼻の付け根まで引き上げてください" }',
    '  ],',
    '  "confidence": 0.92,',
    '  "misses": [',
    '    { "miss_type": "mask_gap", "body_part": "nose_mouth", "severity_level": "critical", "bbox": { "x": 0.35, "y": 0.25, "width": 0.3, "height": 0.15 } }',
    '  ]',
    '}',
    '',
    '必ずJSONのみを返し、json_schemaに完全準拠してください。'
  ].join('\n');

  return { system, user };
}

function mockVisionResultFromItems(itemResults: ItemResult[]): VisionCheckResult {
  const issues = itemResults
    .filter((item) => item.result === 'NG')
    .map((item) => {
      if (item.itemCode === 'hair') {
        return {
          code: 'HAIR_EXPOSED' as const,
          message: item.reasonCode ?? '髪の毛が頭巾の外に出ています',
          suggestion: '髪の毛を頭巾の中へ完全に入れてください'
        };
      }

      if (item.itemCode === 'neck_gap') {
        return {
          code: 'NECK_EXPOSED' as const,
          message: item.reasonCode ?? '首元に隙間があります',
          suggestion: '首元の隙間がなくなるように着衣を整えてください'
        };
      }

      return {
        code: 'GLOVE_GAP_EXPOSED' as const,
        message: item.reasonCode ?? '手袋と袖口の間に隙間があります',
        suggestion: '袖口と手袋の隙間が見えないように調整してください'
      };
    });

  return {
    checks: [],
    overall: issues.length > 0 ? 'ng' : 'ok',
    summary: issues.length > 0 ? 'モック判定で違反候補を検出しました' : 'モック判定で違反は検出されませんでした',
    issues,
    confidence: issues.length > 0 ? 0.8 : 0.99,
    misses: []
  };
}

async function executeGptCheck(imageDataUrl: string): Promise<ExecuteCheckResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  parseDataUrl(imageDataUrl);
  const prompt = buildPrompt();

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL ?? 'gpt-4.1-mini',
      temperature: 0.1,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: prompt.system }] },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt.user },
            { type: 'input_image', image_url: imageDataUrl }
          ]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'vision_check_result',
          schema: visionResponseJsonSchema,
          strict: true
        }
      }
    })
  });

  // 502 の HTML が返ることがあるので、JSONとして読めない応答も想定する。
  const responseJson = await readJsonResponse(response);

  if (!response.ok) {
    const errorMessage =
      typeof responseJson?.error?.message === 'string'
        ? responseJson.error.message
        : `判定APIエラー (${response.status})`;
    throw new Error(errorMessage);
  }

  const text = extractJsonText(responseJson);
  if (!text) {
    throw new Error('モデル応答からJSONを取得できませんでした');
  }

  const parsed = visionCheckResultSchema.safeParse(safeJsonParse(text));
  if (!parsed.success) {
    throw new Error('モデル応答のJSON形式が不正です');
  }

  return parsed.data;
}

export async function executeCheck({ imageDataUrl, inferenceMode }: ExecuteParams): Promise<ExecuteCheckResult> {
  const mode = normalizeInferenceMode(inferenceMode);

  if (mode === 'mock') {
    return mockVisionResultFromItems(runMockInference());
  }

  if (!imageDataUrl) {
    throw new InputValidationError('imageDataUrl は必須です');
  }

  return executeGptCheck(imageDataUrl);
}

export function isInputValidationError(error: unknown): error is InputValidationError {
  return error instanceof InputValidationError;
}
