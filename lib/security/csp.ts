/**
 * #43 CSP tightening — lib/security/csp.ts
 *
 * Genera un Content-Security-Policy endurecido con nonce por request.
 * En dev: unsafe-eval permitido para HMR de Next.js / Turbopack.
 * En prod: unsafe-eval eliminado; se usa nonce para scripts inline.
 *
 * Uso en proxy.ts / middleware-utils.ts:
 *   import { buildCspHeader, generateNonce } from "@/lib/security/csp";
 *   const nonce = generateNonce();
 *   const csp   = buildCspHeader({ nonce, isDev: process.env.NODE_ENV !== "production" });
 *   response.headers.set("Content-Security-Policy", csp);
 *   response.headers.set("x-nonce", nonce); // para que layout.tsx lo lea
 */

import { randomBytes } from "node:crypto";

export interface CspOptions {
  nonce?: string;
  isDev: boolean;
}

/**
 * Genera un nonce criptográficamente seguro de 16 bytes en base64url.
 * Llamar una vez por request y reutilizar el mismo valor.
 */
export function generateNonce(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * Construye el header CSP completo.
 *
 * Directrices de endurecimiento aplicadas:
 * - script-src: nonce + strict-dynamic en prod; unsafe-eval solo en dev (HMR)
 * - style-src: unsafe-inline mantenido (Tailwind JIT no genera hashes estables)
 *              + nonce cuando se provee para estilos inline explícitos
 * - object-src: 'none' (bloquea Flash / plugins)
 * - base-uri: 'self' (previene redirección de base tag)
 * - frame-ancestors: 'none' (clickjacking)
 * - upgrade-insecure-requests en prod
 */
export function buildCspHeader(options: CspOptions): string {
  const { nonce, isDev } = options;

  const nonceAttr = nonce ? `'nonce-${nonce}'` : "";

  // script-src
  const scriptSrcParts: string[] = ["'self'"];
  if (nonceAttr) scriptSrcParts.push(nonceAttr);
  if (isDev) {
    // Turbopack / HMR requiere unsafe-eval y unsafe-inline en desarrollo
    scriptSrcParts.push("'unsafe-eval'", "'unsafe-inline'");
  } else {
    // strict-dynamic delega la confianza al script marcado con el nonce
    scriptSrcParts.push("'strict-dynamic'");
  }
  // CDNs usados por el proyecto (ajustar si cambia)
  scriptSrcParts.push(
    "https://js.stripe.com",
    "https://checkout.stripe.com",
    "https://sdk.mercadopago.com",
    "https://www.google-analytics.com",
    "https://www.googletagmanager.com",
  );

  // style-src — unsafe-inline requerido por Tailwind JIT
  const styleSrcParts: string[] = ["'self'", "'unsafe-inline'"];
  if (nonceAttr) styleSrcParts.push(nonceAttr);
  styleSrcParts.push(
    "https://fonts.googleapis.com",
  );

  // img-src — data: para inline images (ej. avatares base64)
  const imgSrcParts: string[] = [
    "'self'",
    "data:",
    "blob:",
    "https:",
  ];

  // connect-src — APIs propias + terceros
  const connectSrcParts: string[] = [
    "'self'",
    "https://api.mercadopago.com",
    "https://api.stripe.com",
    "https://vitals.vercel-insights.com",
    "https://www.google-analytics.com",
    "https://*.supabase.co",
  ];
  if (isDev) {
    connectSrcParts.push("ws://localhost:*", "http://localhost:*");
  }

  const directives: string[] = [
    `default-src 'self'`,
    `script-src ${scriptSrcParts.join(" ")}`,
    `style-src ${styleSrcParts.join(" ")}`,
    `img-src ${imgSrcParts.join(" ")}`,
    `font-src 'self' https://fonts.gstatic.com data:`,
    `connect-src ${connectSrcParts.join(" ")}`,
    `frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://sdk.mercadopago.com`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
  ];

  if (!isDev) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}
