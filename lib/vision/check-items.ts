// 用語定義（design-spec.md / requirements.md 準拠）:
//   頭巾（ずきん）   = 頭を覆うインナーパーツ。クリーンスーツとは別体。着用時はスーツの内側に入れる
//   フード           = クリーンスーツに一体化した外側の頭部カバー（頭巾の上から被さる）
//   袖口             = クリーンスーツの袖先端部分。手袋と重なって肌を完全に覆う

export const DEFAULT_CHECK_ITEMS = [
  {
    code: 'C01',
    label: '頭巾',
    violation: '髪がはみ出ている、頭巾を被っていない、または頭巾の裾がスーツの外に出ている'
  },
  {
    code: 'C02',
    label: 'フード',
    violation: 'フードが顔周りから浮いている、大きくずれている、またはフード未装着'
  },
  {
    code: 'C03',
    label: 'マスク',
    violation: '鼻が見えている、マスク未着用、または顎にかけている'
  },
  {
    code: 'C05',
    label: 'ファスナー',
    violation: 'ファスナーが開いている'
  },
  {
    code: 'C06',
    label: '袖口',
    violation: '袖口と手袋の間から肌が見えている'
  },
  {
    code: 'C07',
    label: '手袋',
    violation: '手袋が未着用、片手のみ着用している、または手袋に破損（穴・破れ）がある'
  },
  {
    code: 'C08',
    label: 'ブーツ',
    violation: 'ブーツが未装着、または垂れている・折れている（ふくらはぎ部分がクリーンスーツの外に正しく収まっていない）'
  },
  {
    code: 'C09',
    label: 'ヘアネット',
    violation: 'ヘアネット未着用、またはヘアネットから髪が露出している（前髪・もみあげ・後れ毛を含む）、もしくはヘアネットがずれている・めくれている'
  }
] as const;

export type CheckItem = typeof DEFAULT_CHECK_ITEMS[number];
