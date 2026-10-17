# クリーン番長（cleanboss）

カメラでクリーンウェアの着用状態を撮影し、GPT の画像判定で異物混入リスク（髪のはみ出し・マスクずれ・ファスナー開き・袖口の隙間など）を確認するアプリです。

## 使い方

```bash
cp .env.example .env.local   # OPENAI_API_KEY を設定
npm install
npm run dev                  # http://localhost:3000
npm test
```

## 構成

- `app/page.tsx` 検査画面（カメラ／画像アップロード）
- `app/api/check/execute` 判定 API（画面が使うのはこれ）
- `app/api/inspect`・`app/api/vision-check` 単体で使える判定 API
- `lib/inference` GPT 呼び出しとモック
- `lib/vision` 判定結果のスキーマ・NG 箇所の表示位置
- `components/worker` 検査パネル・ガイド枠・NG 箇所のオーバーレイ
