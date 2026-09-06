import "server-only";

/**
 * lib/n8n/flows.ts
 *
 * El puente con n8n, en los dos sentidos.
 *
 *   Buleje → n8n : `dispararFlujo()` hace POST al webhook de un flujo que el
 *                  dueño armó en n8n. El asistente puede elegirlo por su
 *                  descripción («avisá al contador», «subí esto a la planilla»).
 *   n8n → Buleje : `tokenEntrante()` da la credencial que n8n manda en el
 *                  header para poder anotar operaciones desde afuera
 *                  (WhatsApp, Telegram, un correo, un formulario).
 *
 * Los flujos viven en `Settings.featureFlagsJson` bajo la clave `n8nFlows`,
 * igual que los webhooks del tenant: es config del negocio, no schema.
 *
 * ⚠️ El token entrante NO se guarda: se DERIVA de `AUTH_SECRET` + tenantId +
 * un número de versión. Así no hay una credencial en texto plano en la base, y
 * rotarla es subir el número (todo lo emitido antes deja de valer al instante).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { safeFetch, SsrfBlockedError } from "@/lib/safe-fetch";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface N8nFlow {
  id: string;
  /** Cómo lo llama el dueño: «Avisar al contador». */
  nombre: string;
  /**
   * Cuándo usarlo, en criollo. Es lo ÚNICO que lee el modelo para elegir: una
   * descripción vaga («flujo 2») hace que dispare el flujo equivocado.
   */
  descripcion: string;
  /** URL del webhook de producción del flujo en n8n. */
  url: string;
  activo: boolean;
  createdAt: string;
  /** Última vez que se disparó y con qué resultado — para poder depurarlo. */
  ultimoDisparo?: { fecha: string; ok: boolean; detalle: string } | null;
}

export interface N8nConfig {
  flujos: N8nFlow[];
  /** Versión del token entrante. Subirla invalida el anterior. */
  tokenVersion: number;
}

const CLAVE = "n8nFlows";
const CLAVE_VERSION = "n8nTokenVersion";

// ── Lectura / escritura en Settings ──────────────────────────────────────────

async function leerFlags(tenantId: string): Promise<Record<string, unknown>> {
  const row = (await prisma.settings.findUnique({
    where: { tenantId },
    select: { featureFlagsJson: true },
  })) as { featureFlagsJson: string | null } | null;
  if (!row?.featureFlagsJson) return {};
  try {
    return JSON.parse(row.featureFlagsJson) as Record<string, unknown>;
  } catch {
    // JSON corrupto: se trata como vacío en vez de tumbar la pantalla. Escribir
    // encima lo repara; el resto de los flags ya se habían perdido igual.
    logger.warn("[n8n] featureFlagsJson ilegible", { tenantId });
    return {};
  }
}

export async function getN8nConfig(tenantId: string): Promise<N8nConfig> {
  const flags = await leerFlags(tenantId);
  const flujos = Array.isArray(flags[CLAVE]) ? (flags[CLAVE] as N8nFlow[]) : [];
  const v = Number(flags[CLAVE_VERSION]);
  return { flujos, tokenVersion: Number.isInteger(v) && v > 0 ? v : 1 };
}

/** Guarda flujos y/o versión de token SIN pisar los otros flags del tenant. */
export async function saveN8nConfig(
  tenantId: string,
  cambios: Partial<N8nConfig>,
): Promise<void> {
  const flags = await leerFlags(tenantId);
  const actualizado = {
    ...flags,
    ...(cambios.flujos !== undefined ? { [CLAVE]: cambios.flujos } : {}),
    ...(cambios.tokenVersion !== undefined ? { [CLAVE_VERSION]: cambios.tokenVersion } : {}),
  };
  await prisma.settings.upsert({
    where: { tenantId },
    update: { featureFlagsJson: JSON.stringify(actualizado) },
    create: { tenantId, featureFlagsJson: JSON.stringify(actualizado) },
  });
}

// ── Token entrante (n8n → Buleje) ────────────────────────────────────────────

/**
 * La credencial que n8n manda en `Authorization: Bearer …`.
 *
 * Derivada, no almacenada: sin `AUTH_SECRET` no se puede fabricar, y no queda
 * ningún secreto legible en la base si alguien se lleva un dump de Settings.
 */
export function tokenEntrante(tenantId: string, version: number): string {
  const secret = process.env.AUTH_SECRET ?? "";
  if (!secret) throw new Error("AUTH_SECRET no está configurado: no se puede emitir el token de n8n.");
  const firma = createHmac("sha256", secret)
    .update(`n8n-inbound:${tenantId}:v${version}`)
    .digest("hex");
  return `bul_n8n_${version}_${firma.slice(0, 40)}`;
}

/**
 * ¿El token que llegó es el vigente de este tenant?
 *
 * Comparación en tiempo constante: un `===` sobre un token filtra, por el
 * tiempo que tarda, cuántos caracteres del principio acertó quien lo prueba.
 */
export function tokenValido(tenantId: string, version: number, recibido: string): boolean {
  let esperado: string;
  try {
    esperado = tokenEntrante(tenantId, version);
  } catch {
    return false;
  }
  const a = Buffer.from(esperado);
  const b = Buffer.from(recibido);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ── Disparo (Buleje → n8n) ───────────────────────────────────────────────────

/**
 * ¿Se permite pegarle a un n8n de la red local?
 *
 * `safeFetch` bloquea localhost y redes privadas a propósito (SSRF): con una
 * URL elegida por el usuario, un servidor en la nube podría ser usado para
 * escanear la red interna. Un n8n **self-hosted en la misma máquina** es el
 * caso legítimo que ese guard atrapa de rebote, así que se habilita sólo con
 * las DOS condiciones: fuera de producción y con la variable puesta a mano.
 */
function permiteRedLocal(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.N8N_ALLOW_LOCAL === "1";
}

const HOST_LOCAL = /^(localhost|127\.|0\.0\.0\.0|::1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i;

function esLocal(url: string): boolean {
  try {
    return HOST_LOCAL.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export interface DisparoResultado {
  ok: boolean;
  status?: number;
  /** Lo que contestó el flujo, recortado — n8n suele devolver un resumen útil. */
  respuesta?: string;
  error?: string;
}

/**
 * POST al webhook del flujo, firmado igual que los webhooks del tenant.
 *
 * El timeout es corto a propósito: un flujo de n8n que tarda más de 10 s no se
 * espera, se dispara y sigue. Si el usuario necesita el resultado, el flujo
 * tiene que contestar rápido y hacer lo lento después.
 */
export async function dispararFlujo(
  tenantId: string,
  flujo: N8nFlow,
  datos: Record<string, unknown>,
): Promise<DisparoResultado> {
  const cuerpo = JSON.stringify({
    origen: "buleje",
    tenantId,
    flujo: { id: flujo.id, nombre: flujo.nombre },
    timestamp: new Date().toISOString(),
    datos,
  });

  const secret = process.env.WEBHOOK_DISPATCH_SECRET ?? process.env.AUTH_SECRET ?? "";
  const firma = secret ? createHmac("sha256", secret).update(cuerpo).digest("hex") : "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(firma ? { "X-Buleje-Signature": `sha256=${firma}` } : {}),
    "X-Buleje-Timestamp": Math.floor(Date.now() / 1000).toString(),
  };

  try {
    const local = esLocal(flujo.url);
    if (local && !permiteRedLocal()) {
      return {
        ok: false,
        error:
          "Esa URL apunta a la red local y está bloqueada por seguridad. " +
          "Usá la URL pública de tu n8n (o poné N8N_ALLOW_LOCAL=1 en desarrollo).",
      };
    }

    const res = local
      ? // Ya se verificó que estamos fuera de producción Y con el permiso
        // explícito: el guard de SSRF no aplica al n8n de la propia máquina.
        await fetch(flujo.url, { method: "POST", headers, body: cuerpo, signal: AbortSignal.timeout(10_000) })
      : await safeFetch(flujo.url, {
          method: "POST",
          headers,
          body: cuerpo,
          timeoutMs: 10_000,
          allowInsecure: false,
        });

    const texto = (await res.text().catch(() => "")).slice(0, 500);
    logger.info("[n8n] flujo disparado", { tenantId, flujo: flujo.nombre, status: res.status });
    return { ok: res.ok, status: res.status, respuesta: texto || undefined };
  } catch (err) {
    if (err instanceof SsrfBlockedError) {
      return { ok: false, error: `La URL del flujo está bloqueada: ${err.message}` };
    }
    const error = err instanceof Error ? err.message : String(err);
    logger.warn("[n8n] disparo fallido", { tenantId, flujo: flujo.nombre, error });
    return { ok: false, error };
  }
}

/** Deja constancia del último disparo en la config, para poder depurarlo. */
export async function anotarDisparo(
  tenantId: string,
  flujoId: string,
  resultado: DisparoResultado,
): Promise<void> {
  const { flujos } = await getN8nConfig(tenantId);
  const actualizados = flujos.map((f) =>
    f.id === flujoId
      ? {
          ...f,
          ultimoDisparo: {
            fecha: new Date().toISOString(),
            ok: resultado.ok,
            detalle: resultado.ok
              ? `HTTP ${resultado.status ?? 200}`
              : (resultado.error ?? `HTTP ${resultado.status ?? "?"}`),
          },
        }
      : f,
  );
  await saveN8nConfig(tenantId, { flujos: actualizados });
}
