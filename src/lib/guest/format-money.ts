/** Deterministic guest price text — avoids SSR/client Intl locale mismatches (e.g. GH₵ vs GHS). */
export function formatGuestMoney(amount: number, currency: string) {
  const n = Math.round(Number(amount) || 0).toLocaleString('en-US');
  return `${currency || 'GHS'} ${n}`;
}
