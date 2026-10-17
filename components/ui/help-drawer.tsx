'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from 'lucide-react';
import { useDialogFocus } from '@/components/ui/use-dialog-a11y';

export type HelpDrawerProps = {
  title: string;
  /** 'floating' は画面左下の丸ボタン、'inline' はヘッダーに置くアイコン＋文字ボタン。 */
  trigger?: 'floating' | 'inline';
  steps: {
    number: number;
    title: string;
    description: string;
    icon?: string;
  }[];
};

export function HelpDrawer({ title, steps, trigger = 'floating' }: HelpDrawerProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();

  useDialogFocus(open, dialogRef);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const drawer = (
    <div
      // 閉じている間は inert で中の要素へ Tab やスクリーンリーダーが入らないようにする。
      className={`fixed inset-0 z-50 transition ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!open}
      inert={!open}
    >
      {/* マウス専用の閉じる手段（キーボードは Esc と閉じるボタンがある）。Tab 順からは外す。 */}
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setOpen(false)}
        className={`absolute inset-0 bg-slate-950/35 transition ${open ? 'opacity-100' : 'opacity-0'}`}
        aria-label="ヘルプを閉じる"
      />

      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col rounded-l-[28px] bg-white shadow-2xl transition-transform duration-300 md:max-w-lg ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex min-h-16 items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">Guide</p>
            <h2 id={titleId} className="mt-1 text-lg font-bold text-slate-900">{title}</h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="focus-ring inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            aria-label="閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {steps.map((step) => (
            <section
              key={`${step.number}-${step.title}`}
              className="rounded-3xl border border-slate-100 bg-slate-50 px-4 py-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-base font-bold text-emerald-700">
                  {step.number}
                </div>
                <div className="min-w-0">
                  <p className="text-base font-semibold text-slate-900">
                    {step.icon ? `${step.icon} ` : ''}
                    {step.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{step.description}</p>
                </div>
              </div>
            </section>
          ))}
        </div>
      </aside>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          trigger === 'inline'
            ? 'focus-ring inline-flex h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700 md:text-sm'
            : 'focus-ring fixed bottom-4 left-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-lg shadow-slate-200/70 backdrop-blur transition hover:border-cyan-300 hover:text-cyan-700 md:bottom-6 md:left-6'
        }
        aria-label="ヘルプを開く"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="ヘルプ"
      >
        <HelpCircle className={trigger === 'inline' ? 'h-4 w-4 shrink-0' : 'h-4 w-4'} />
        {trigger === 'inline' && <span>説明</span>}
      </button>

      {mounted && createPortal(drawer, document.body)}
    </>
  );
}
