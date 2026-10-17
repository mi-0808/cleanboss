import Link from 'next/link';
import { ShieldCheck, Sparkles } from 'lucide-react';
import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

type AppShellProps = {
  title?: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  hideAction?: boolean;
  fullBleed?: boolean;
  action?: ReactNode;
  children: ReactNode;
};

export function AppShell({
  title = 'クリーン番長',
  description = '清潔・安全・信頼を、キビキビ確認。',
  actionHref,
  actionLabel,
  hideAction = false,
  fullBleed = false,
  action,
  children
}: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* キーボード利用者向け。フォーカスしたときだけ左上に現れる。 */}
      <a
        href="#main-content"
        className="skip-link focus-ring fixed left-4 top-4 z-50 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg"
      >
        本文へスキップ
      </a>
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div
          className={`mx-auto flex h-16 w-full items-center justify-between px-4 ${
            fullBleed ? 'max-w-none md:px-6' : 'max-w-6xl md:px-8'
          }`}
        >
          <Link href="/" className="focus-ring inline-flex items-center gap-2 rounded-lg px-1 py-1">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-500 text-white shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <span>
              <strong className="block text-sm font-bold text-slate-900">{title}</strong>
              {description && <span className="block text-xs text-slate-500">{description}</span>}
            </span>
          </Link>
          {action}
          {!action && !hideAction && actionHref && (
            <Link href={actionHref}>
              <Button variant="primary" className="h-10 rounded-lg px-3 text-xs md:text-sm">
                <Sparkles className="mr-1 h-4 w-4" />
                {actionLabel}
              </Button>
            </Link>
          )}
        </div>
      </header>
      <main id="main-content" className={fullBleed ? 'w-full flex-1' : 'mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8'}>
        {children}
      </main>
    </div>
  );
}
