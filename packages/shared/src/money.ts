/**
 * Money is always stored as an integer number of minor units (e.g. cents)
 * together with an explicit ISO-4217 currency code. All arithmetic is
 * deterministic and refuses to mix currencies silently.
 */
export interface Money {
  readonly amountMinor: number;
  readonly currency: string;
}

export class CurrencyMismatchError extends Error {
  constructor(a: string, b: string) {
    super(`Currency mismatch: ${a} vs ${b}. Currency conversion is not supported in V1.`);
    this.name = 'CurrencyMismatchError';
  }
}

const CURRENCY_RE = /^[A-Z]{3}$/;

export function money(amountMinor: number, currency: string): Money {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError(`Money amount must be an integer number of minor units, got ${amountMinor}`);
  }
  if (!CURRENCY_RE.test(currency)) {
    throw new RangeError(`Invalid currency code: ${currency}`);
  }
  return { amountMinor, currency };
}

/** Convenience constructor from a major-unit amount (e.g. euros). Rounds half away from zero to cents. */
export function fromMajor(amount: number, currency: string): Money {
  return money(roundHalfAwayFromZero(amount * 100), currency);
}

export const eur = (euros: number): Money => fromMajor(euros, 'EUR');

export function zero(currency: string): Money {
  return money(0, currency);
}

export function toMajor(m: Money): number {
  return m.amountMinor / 100;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function sumMoney(items: readonly Money[], currency: string): Money {
  return items.reduce<Money>((acc, m) => addMoney(acc, m), zero(currency));
}

export function multiplyMoney(m: Money, factor: number): Money {
  if (!Number.isFinite(factor)) throw new RangeError(`Invalid factor: ${factor}`);
  return money(roundHalfAwayFromZero(m.amountMinor * factor), m.currency);
}

export function compareMoney(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.amountMinor - b.amountMinor;
}

export function maxMoney(a: Money, b: Money): Money {
  return compareMoney(a, b) >= 0 ? a : b;
}

export function isNegative(m: Money): boolean {
  return m.amountMinor < 0;
}

export function formatMoney(m: Money, locale = 'en-IE'): string {
  const whole = m.amountMinor % 100 === 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: m.currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(toMajor(m));
}

export function roundHalfAwayFromZero(value: number): number {
  // Guard against binary floating point artefacts such as 1.005 * 100 = 100.49999...
  const corrected = Math.round(value * 1e6) / 1e6;
  return Math.sign(corrected) * Math.round(Math.abs(corrected));
}
