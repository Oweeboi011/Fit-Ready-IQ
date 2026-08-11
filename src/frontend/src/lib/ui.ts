/**
 * Button vocabulary.
 *
 * There is exactly one primary treatment and it means "the single action we
 * most want you to take on this screen". If two primary buttons appear in one
 * viewport, one of them is wrong — demote it to secondary. Everything that is
 * navigation, settings or a tool goes to `buttonGhost`.
 */

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50';

export const buttonSize = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-[15px]',
} as const;

/** The one action we want. Solid blue, never more than one per viewport. */
export const buttonPrimary = `${base} bg-blue-600 text-white shadow-lg shadow-blue-900/30 hover:bg-blue-500 active:bg-blue-700`;

/** A real alternative to the primary action. Outlined, not solid. */
export const buttonSecondary = `${base} border border-white/15 bg-white/[0.03] text-slate-200 hover:border-white/25 hover:bg-white/[0.07] hover:text-white`;

/** Navigation, tools and settings. Recedes until hovered. */
export const buttonGhost = `${base} border border-transparent text-slate-400 hover:bg-white/[0.06] hover:text-white`;
