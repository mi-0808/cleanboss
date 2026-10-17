import { twMerge } from 'tailwind-merge';

/**
 * Tailwind クラスを結合する。
 * 単純結合だと後勝ちにならず、`className` で渡した上書きが CSS の生成順に負けて無視される
 * （例: variant の `text-white` が残って `text-slate-950` が効かない）。
 * twMerge で競合するユーティリティを解決し、あとから渡したものを必ず勝たせる。
 */
export function cn(...classes: Array<string | false | null | undefined>) {
  return twMerge(classes.filter(Boolean).join(' '));
}
