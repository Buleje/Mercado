/**
 * lib/email/escape-html.ts
 *
 * SECURITY 2026-05-06 (audit email #2 + #7): helper centralizado para
 * escapar campos de usuario antes de interpolarlos en plantillas HTML de
 * email. Antes `${customerName}` con valor `<script>alert(1)</script>` o
 * `<a href="https://phishing.com">` inyectaba HTML/links arbitrarios en
 * el inbox de la víctima.
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "/": "&#x2F;",
};

export function escapeHtml(input: unknown): string {
  if (input == null) return "";
  return String(input).replace(/[&<>"'/]/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}
