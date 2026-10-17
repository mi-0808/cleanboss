import { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'overlay';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
};

const variants: Record<ButtonVariant, string> = {
  // 白文字とのコントラスト比 4.5:1（WCAG 1.4.3 AA）を満たすため 700 系（rose は 600）を基準色にする。
  primary:
    'bg-cyan-700 text-white shadow-sm hover:bg-cyan-800 active:bg-cyan-900 focus-ring disabled:bg-cyan-300',
  secondary:
    'bg-emerald-700 text-white shadow-sm hover:bg-emerald-800 active:bg-emerald-900 focus-ring disabled:bg-emerald-300',
  ghost:
    'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 focus-ring disabled:text-slate-400',
  destructive:
    'bg-rose-600 text-white shadow-sm hover:bg-rose-700 active:bg-rose-800 focus-ring disabled:bg-rose-300',
  // カメラ映像の上に重ねるボタン。背景が何色でも読めるよう、白地に濃色文字で固定する。
  overlay:
    'bg-white text-slate-950 shadow-sm hover:bg-slate-100 active:bg-slate-200 focus-ring disabled:bg-slate-200 disabled:text-slate-600'
};

export function Button({
  variant = 'primary',
  className,
  loading = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed',
        variants[variant],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? '送信中...' : children}
    </button>
  );
}
