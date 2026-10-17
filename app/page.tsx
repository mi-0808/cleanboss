import { AppShell } from '@/components/layout/app-shell';
import { HelpDrawer } from '@/components/ui/help-drawer';
import { CheckPanel } from '@/components/worker/check-panel';

const checkHelpSteps = [
  {
    number: 1,
    icon: '📍',
    title: '白枠の中に立つ',
    description: '白枠内の人だけが検査対象です。'
  },
  {
    number: 2,
    icon: '📸',
    title: '判定を開始',
    description: '画面下のボタンで判定を開始します。'
  },
  {
    number: 3,
    icon: '✅',
    title: '結果を確認',
    description: '緑=OK / 赤=NG。赤く染まった部分を直してください。'
  },
  {
    number: 4,
    icon: '🔄',
    title: '次の判定へ',
    description: 'OKは3秒後に自動で次へ。NGは直してから「次の判定へ」を押します。'
  }
] as const;

export default function CheckPage() {
  return (
    <AppShell title="AI検出" description="" fullBleed>
      <div>
        {/* 視覚上はヘッダーのロゴがタイトルを兼ねるので、見出しは SR 向けに置く。 */}
        <h1 className="sr-only">AI検出</h1>
        <HelpDrawer title="検査画面の使い方" steps={[...checkHelpSteps]} />
        <CheckPanel maximized />
      </div>
    </AppShell>
  );
}
