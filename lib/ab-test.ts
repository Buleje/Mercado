/**
 * Simple client-side A/B testing utility.
 * Assigns users to variants based on a random cookie.
 * Tracks impressions and conversions to localStorage for now.
 */

export type Variant = "A" | "B";

const COOKIE_KEY = "buleje-ab-variant";

/** Get or assign a variant for the current user */
export function getVariant(testId: string): Variant {
  if (typeof window === "undefined") return "A";

  const stored = localStorage.getItem(`${COOKIE_KEY}-${testId}`);
  if (stored === "A" || stored === "B") return stored;

  const variant: Variant = Math.random() < 0.5 ? "A" : "B";
  localStorage.setItem(`${COOKIE_KEY}-${testId}`, variant);
  return variant;
}

/** Track an impression for a variant */
export function trackImpression(testId: string, variant: Variant) {
  if (typeof window === "undefined") return;
  const key = `ab-impressions-${testId}-${variant}`;
  const count = Number(localStorage.getItem(key) ?? 0);
  localStorage.setItem(key, String(count + 1));
}

/** Track a conversion (e.g., click on CTA) */
export function trackConversion(testId: string, variant: Variant) {
  if (typeof window === "undefined") return;
  const key = `ab-conversions-${testId}-${variant}`;
  const count = Number(localStorage.getItem(key) ?? 0);
  localStorage.setItem(key, String(count + 1));
}

/** Get stats for a test */
export function getTestStats(testId: string) {
  if (typeof window === "undefined") return null;
  const impA = Number(localStorage.getItem(`ab-impressions-${testId}-A`) ?? 0);
  const impB = Number(localStorage.getItem(`ab-impressions-${testId}-B`) ?? 0);
  const convA = Number(localStorage.getItem(`ab-conversions-${testId}-A`) ?? 0);
  const convB = Number(localStorage.getItem(`ab-conversions-${testId}-B`) ?? 0);
  return {
    A: { impressions: impA, conversions: convA, rate: impA > 0 ? (convA / impA * 100) : 0 },
    B: { impressions: impB, conversions: convB, rate: impB > 0 ? (convB / impB * 100) : 0 },
  };
}
