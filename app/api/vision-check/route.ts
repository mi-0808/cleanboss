import { NextRequest, NextResponse } from 'next/server';

import { DEFAULT_CHECK_ITEMS } from '@/lib/vision/check-items';
import { visionCheckResultSchema, visionResponseJsonSchema } from '@/lib/vision/schema';

export const runtime = 'nodejs';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

class InputValidationError extends Error {}

function jsonError(error: string, init?: { status?: number; requestId?: string }) {
  const { status = 200, requestId } = init ?? {};

  return NextResponse.json(
    {
      error,
      requestId
    },
    { status }
  );
}

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

function parseDataUrl(dataUrl: string): void {
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
}

function buildPrompt(checkItems: readonly { code: string; label: string; violation: string }[]): { system: string; user: string } {
  // 問題1修正: system全体を##に統一。ロール・文脈・定義のみ記載
  // 問題2修正: JSON出力指示はsystemから削除しuserへ移動
  // 問題3修正: 判定方針はsystemから削除しuserの##判定ルールに一本化
  const system = [
    'あなたはISO Class 100（ISO 14644-1 クラス5）クリーンルーム入室前の着用検査官です。',
    '',
    '## 用語定義',
    '- 頭巾: 頭を覆うインナーパーツ。クリーンスーツとは別体。着用時はスーツの内側に入れる。',
    '- フード: クリーンスーツに一体化した外側の頭部カバー。頭巾の上から被さる。',
    '- マスク: 鼻・口を覆う白色の不織布マスク。',
    '- ファスナー: クリーンスーツ前面中央のファスナー。',
    '- 袖口: クリーンスーツの袖先端部分。手袋と重なって肌を完全に覆う。',
    '- 手袋: 両手に着用する薄手のラテックスまたはニトリル製グローブ。',
    '',
    '## ウェアの外観',
    '- クリーンスーツは白または水色の全身スーツ（つなぎ型）',
    '- 頭巾・フードも同色系。背景や壁と同化しやすいため注意して観察すること',
    '',
    '## 撮影条件',
    '- 撮影機材: iPad前面カメラ（壁掛け設置、床から約150cm）',
    '- 撮影範囲: 上半身（頭部〜手首）。被写体は両腕を上げた姿勢で正面を向いている',
    '- 照明環境: クリーンルーム前室の蛍光灯照明',
    '- 被写体: クリーンウェアを着用した作業員1名',
    '',
    '## エッジケースの処理',
    '- 複数人が映っている場合: カメラに最も近い1名のみを判定する',
    '- 画像がぶれている・極端に暗い等で判定が困難な場合: overall を "error" とし summary に理由を記載する',
    '- 人物が映っていない場合: overall を "error" とし summary に「人物が検出できませんでした」と記載する',
    '- 身体の一部がフレーム外で確認できない場合: overall を "error" とし summary に「○○がフレーム外のため確認できません。位置を調整してください」と記載する。フレーム外部位を ok として通過させない',
    '',
    '## ブーツ判定の補足（C08）',
    '- ブーツのふくらはぎ部分が垂れていたり折れている場合は ng',
    '- ブーツの形状・サイズは作業者によって異なるため、正しく装着されていれば体格差は ok とする',
    '- 足元が影になっていて判定困難な場合、または足元がフレーム外の場合は overall を "error" とし summary に「足元が確認できません。位置を調整してください」と記載する',
    '',
    '## ヘアネット判定の補足（C09）',
    '- 前髪・もみあげ・後れ毛が1本でも露出している場合は ng',
    '- ヘアネットのずれ・めくれは ng',
    '- 頭頂部がフレーム外の場合は overall を "error" とし summary に「頭頂部が確認できません。位置を調整してください」と記載する'
  ].join('\n');

  const itemLines = checkItems.map((item, i) =>
    `${i + 1}. ${item.label}: ${item.violation}`
  );

  const codeList = checkItems.map(item => `"${item.code}"`).join(' | ');

  const user = [
    // 問題5修正: Chain-of-Thoughtで思考手順を明示
    '画像を見て、以下の手順で各チェック項目を評価してください。',
    '',
    '**評価手順（各項目ごとに繰り返す）:**',
    '1. 画像内で該当部位を視覚的に特定する',
    '2. 違反条件と照合し、明らかに該当するか判断する',
    '3. 明らかに違反が確認できる場合のみ ng、迷う・見えない場合は ok とする',
    '4. reason に判断の根拠を具体的に記載する',
    '',
    '全項目を評価し終えてから overall を決定してください。',
    '',
    '## 検知する違反条件',
    '',
    ...itemLines,
    '',
    // 問題3修正: 判定方針をuserに一本化
    '## 判定ルール',
    '- 各項目: 違反が画像から明らかに確認できる場合のみ ng、それ以外は ok',
    '- overall: ng 項目が1つでもあれば "ng"、全て ok なら "ok"',
    '',
    // 問題4修正: 出力形式をfew-shot例より先に記載
    '## 出力形式',
    '純粋なJSONのみを出力してください。```やマークダウン記法は使わないでください。',
    '{',
    '  "checks": [',
    `    { "item": ${codeList}, "result": "ok" | "ng", "reason": "判断根拠を具体的に記載（日本語）" },`,
    '    ...',
    '  ],',
    '  "overall": "ok" | "ng" | "error",',
    '  "summary": "全体の判定結果を作業員向けに説明（日本語、2文以内）",',
    '  "confidence": 0.0〜1.0',
    '}',
    '',
    '## 判定例',
    '',
    '例1（全項目OK）:',
    '{',
    '  "checks": [',
    '    {"item": "C01", "result": "ok", "reason": "頭巾が頭部全体を覆い、髪は見えない。裾もスーツ内に収まっている"},',
    '    {"item": "C02", "result": "ok", "reason": "フードが顔周りに密着している"},',
    '    {"item": "C03", "result": "ok", "reason": "マスクが鼻から顎まで覆われている"},',
    '    {"item": "C05", "result": "ok", "reason": "ファスナーが首元まで閉じている"},',
    '    {"item": "C06", "result": "ok", "reason": "袖口が手袋の上に被さり肌は見えない"},',
    '    {"item": "C07", "result": "ok", "reason": "両手に手袋を正しく着用している"},',
    '    {"item": "C08", "result": "ok", "reason": "両足ともブーツが垂れ・折れなく正しく装着されている"},',
    '    {"item": "C09", "result": "ok", "reason": "ヘアネットが頭全体を覆い、前髪・もみあげの露出はない"}',
    '  ],',
    '  "overall": "ok",',
    '  "summary": "全項目問題ありません。入室可能です。",',
    '  "confidence": 0.95',
    '}',
    '',
    '例2（違反あり）:',
    '{',
    '  "checks": [',
    '    {"item": "C01", "result": "ok", "reason": "頭巾が頭部全体を覆い、髪は見えない"},',
    '    {"item": "C02", "result": "ok", "reason": "フードが顔周りに密着している"},',
    '    {"item": "C03", "result": "ok", "reason": "マスクが鼻から顎まで覆われている"},',
    '    {"item": "C05", "result": "ng", "reason": "ファスナーが胸元あたりまでしか閉じていない"},',
    '    {"item": "C06", "result": "ok", "reason": "袖口が手袋の上に被さり肌は見えない"},',
    '    {"item": "C07", "result": "ok", "reason": "両手に手袋を正しく着用している"},',
    '    {"item": "C08", "result": "ng", "reason": "右足のブーツのふくらはぎ部分が折れて垂れ下がっている"},',
    '    {"item": "C09", "result": "ok", "reason": "ヘアネットが頭全体を覆い、露出はない"}',
    '  ],',
    '  "overall": "ng",',
    '  "summary": "ファスナーを首元まで閉じてください。右足のブーツを正しく装着し直してください。",',
    '  "confidence": 0.92',
    '}',
    '}'
  ].join('\n');

  return { system, user };
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return jsonError('OPENAI_API_KEY is not configured');
    }

    const body = await req.json();
    const imageDataUrl = typeof body?.imageDataUrl === 'string' ? body.imageDataUrl : '';

    if (!imageDataUrl) {
      return NextResponse.json({ error: 'imageDataUrl は必須です' }, { status: 400 });
    }

    parseDataUrl(imageDataUrl);
    const prompt = buildPrompt(DEFAULT_CHECK_ITEMS);

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL ?? 'gpt-4.1-mini',
        temperature: 0,
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

    const responseJson = await response.json();

    if (!response.ok) {
      const requestId =
        typeof responseJson?.error?.request_id === 'string'
          ? responseJson.error.request_id
          : typeof response.headers.get('x-request-id') === 'string'
            ? response.headers.get('x-request-id')
            : undefined;
      const errorMessage =
        typeof responseJson?.error?.message === 'string' ? responseJson.error.message : `判定APIエラー (${response.status})`;
      console.error('vision-check openai error', {
        status: response.status,
        requestId,
        errorMessage
      });

      if (response.status === 401) {
        return jsonError('OpenAI API キーが無効です。Vercel の環境変数 OPENAI_API_KEY を確認して再デプロイしてください。');
      }

      if (response.status === 403) {
        return jsonError('OpenAI API へのアクセスが拒否されました。API キーの権限、利用可能なモデル、組織設定を確認してください。', {
          requestId
        });
      }

      if (response.status === 429) {
        return jsonError('OpenAI API の利用上限に達しました。プラン/請求情報を確認してから再試行してください。', {
          requestId
        });
      }

      if (response.status >= 500) {
        return jsonError('OpenAI 側で一時的なエラーが発生しました。少し待ってから再試行してください。', {
          requestId
        });
      }

      return jsonError(errorMessage, { status: response.status, requestId });
    }

    const text = extractJsonText(responseJson);
    if (!text) {
      return NextResponse.json({ error: 'モデル応答からJSONを取得できませんでした' }, { status: 502 });
    }

    const parsed = visionCheckResultSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      console.error('vision-check parse error', parsed.error.flatten());
      return jsonError('モデル応答のJSON形式が不正です', { status: 502 });
    }

    return NextResponse.json(parsed.data);
  } catch (error) {
    if (error instanceof InputValidationError) {
      return jsonError(error.message, { status: 400 });
    }

    const message = error instanceof Error ? error.message : '判定中にエラーが発生しました';
    console.error('vision-check unexpected error', { message });
    return jsonError('判定処理でエラーが発生しました');
  }
}
