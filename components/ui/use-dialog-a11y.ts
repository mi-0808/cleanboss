'use client';

import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * ドロワー/シート共通のフォーカス管理（WCAG 2.1.2 / 2.4.3）。
 * - 開いたら中の最初のフォーカス可能要素（通常は閉じるボタン）へ移す
 * - Tab / Shift+Tab をダイアログ内で循環させる
 * - 閉じたら開く前にフォーカスしていた要素（トリガ）へ戻す
 *
 * 閉状態で中へ Tab が入るのを防ぐのは呼び出し側の役割：
 * 常時マウント型のドロワーはラッパに inert={!open} を付けること。
 */
export function useDialogFocus(open: boolean, dialogRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));

    (focusables()[0] ?? dialog).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      dialog.removeEventListener('keydown', onKeyDown);
      opener?.focus();
    };
  }, [open, dialogRef]);
}
