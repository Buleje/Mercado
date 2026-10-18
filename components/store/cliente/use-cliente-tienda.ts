"use client";

/**
 * useClienteTienda — «Continuar con Google» en las tiendas individuales
 * (/t/<negocio>/tienda). Contrato en `lib/tienda-cliente/contrato.ts`.
 *
 * Entrar: Supabase Auth con Google (el mismo cliente que
 * `components/auth/OAuthButton.tsx`). Vuelta:
 * `/api/auth/oauth/callback?next=<ruta>&origen=tienda` intercambia el código y
 * redirige a la misma tienda.
 *
 * Saber quién es: `GET /api/tienda-cliente/yo`. La cookie de Supabase es
 * httpOnly (SECURITY 2026-06-13), así que el navegador NO puede leerla con
 * `getSession()`; el servidor la valida y devuelve sólo nombre, correo y foto.
 *
 * Recuerda la cuenta (17-10): cada vez que sabe quién entró, la guarda en
 * `lib/tienda-cliente/cuenta-recordada.ts` (nombre, correo enmascarado, foto y
 * el `sub` de Google para `login_hint`) para «Continuar como…» la próxima vez.
 * «No soy yo» (`salir`) la olvida. El globito de Google entra por
 * `entrarConCredencialGoogle` (POST /api/tienda-cliente/google).
 *
 * Qué NO hace (regla de la casa): esta identidad SÓLO rellena el nombre. No da
 * descuentos, historial, puntos ni privilegios; la cookie de cliente de la casa
 * se lee únicamente vía `getCustomerPayload` en el servidor. Nada de lo que
 * devuelve este hook debe viajar como prueba de identidad en un pedido.
 */

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { getSupabaseBrowserPerezoso, isSupabaseAuthConfigured } from "@/lib/supabase/cliente-perezoso";
import { logger } from "@/lib/logger";
import { csrfHeaders } from "@/lib/csrf-client";
import type { ClienteTienda } from "@/lib/tienda-cliente/contrato";
import { marcarSinSesion, olvidarCuenta, recordarCuenta } from "@/lib/tienda-cliente/cuenta-recordada";
import { RUTA_UN_TOQUE, desactivarEntradaAutomatica } from "@/lib/tienda-cliente/google-un-toque";

export interface OpcionesEntrarGoogle {
  /** `sub` de Google de la cuenta recordada: Google no pide elegir la cuenta (`login_hint`). */
  pista?: string | null;
}

export interface UsoClienteTienda {
  cliente: ClienteTienda | null;
  /** true mientras se pregunta quién es (primer render). */
  cargando: boolean;
  /** false si el sitio no tiene Supabase configurado: esconder el botón. */
  disponible: boolean;
  /** Abre Google; al volver, la página es `volverA` (por defecto, la actual). Con `pista`, entra con esa cuenta sin elegir. */
  entrarConGoogle: (volverA?: string, opciones?: OpcionesEntrarGoogle) => Promise<void>;
  /** «No soy yo»: cierra la sesión de Google sólo en este navegador y olvida la cuenta recordada. */
  salir: () => Promise<void>;
}

export const RUTA_YO = "/api/tienda-cliente/yo";

const respuestaYo = z.object({
  cliente: z
    .object({
      nombre: z.string(),
      email: z.string().nullable(),
      avatar: z.string().nullable(),
      proveedor: z.literal("google"),
    })
    .nullable(),
  pista: z.string().max(255).nullish(),
});

/** `/api/auth/oauth/callback?next=...&origen=tienda` sobre el origen actual
 *  (`origen=tienda` hace que el callback respete `next` también en subdominios). */
export function urlDeVuelta(origin: string, volverA: string): string {
  return `${origin}/api/auth/oauth/callback?next=${encodeURIComponent(volverA)}&origen=tienda`;
}

/* Una sola consulta por página, compartida por todos los que usan el hook
 * (checkout + datos de Musa + …): antes cada uno preguntaba a `/yo` por su
 * cuenta. `entrarConGoogle` y `salir` la invalidan. */
interface EstadoCompartido {
  cliente: ClienteTienda | null;
  cargando: boolean;
}
const ESTADO_INICIAL: EstadoCompartido = { cliente: null, cargando: true };
let compartido: EstadoCompartido = ESTADO_INICIAL;
let consulta: Promise<void> | null = null;
const oyentes = new Set<(e: EstadoCompartido) => void>();

function publicar(e: EstadoCompartido): void {
  compartido = e;
  for (const oyente of oyentes) oyente(e);
}

function consultarYo(): Promise<void> {
  if (!consulta) {
    consulta = fetch(RUTA_YO, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: unknown) => {
        const r = respuestaYo.safeParse(json);
        const cliente = r.success ? r.data.cliente : null;
        if (cliente && r.success) recordarCuenta(cliente, r.data.pista);
        // El servidor dijo «sin sesión» (venció): el globito vuelve a ofrecerse.
        else if (r.success) marcarSinSesion();
        publicar({ cliente, cargando: false });
      })
      .catch((err: unknown) => {
        logger.warn("[tienda-cliente] no se pudo leer la cuenta de Google", { error: String(err) });
        publicar({ cliente: null, cargando: false });
      });
  }
  return consulta;
}

/** La próxima lectura vuelve a preguntar al servidor (tests y cambios de cuenta). */
export function reiniciarConsultaClienteTienda(): void {
  consulta = null;
  compartido = ESTADO_INICIAL;
}

const respuestaUnToque = z.object({ cliente: respuestaYo.shape.cliente, pista: z.string().max(255).nullish() });

/**
 * El globito de Google devolvió un ID token: el servidor lo revisa y abre la
 * sesión (la misma cookie que el botón). Avisa a todos los que usan el hook
 * sin volver a preguntar a `/yo`. Devuelve si entró.
 */
export async function entrarConCredencialGoogle(credential: string): Promise<boolean> {
  try {
    const res = await fetch(RUTA_UN_TOQUE, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ credential }),
    });
    if (!res.ok) {
      logger.warn("[tienda-cliente] el globito de Google no abrió sesión", { status: res.status });
      return false;
    }
    const r = respuestaUnToque.safeParse(await res.json());
    if (!r.success || !r.data.cliente) return false;
    recordarCuenta(r.data.cliente, r.data.pista);
    consulta = Promise.resolve();
    publicar({ cliente: r.data.cliente, cargando: false });
    return true;
  } catch (err) {
    logger.warn("[tienda-cliente] no se pudo canjear el token de Google", { error: String(err) });
    return false;
  }
}

export function useClienteTienda(): UsoClienteTienda {
  const disponible = isSupabaseAuthConfigured();
  const [estado, setEstado] = useState<EstadoCompartido>(() =>
    disponible ? compartido : { cliente: null, cargando: false },
  );

  useEffect(() => {
    if (!disponible) return;
    oyentes.add(setEstado);
    setEstado(compartido);
    void consultarYo();
    return () => {
      oyentes.delete(setEstado);
    };
  }, [disponible]);

  const entrarConGoogle = useCallback(
    async (volverA?: string, opciones?: OpcionesEntrarGoogle) => {
      if (!disponible || typeof window === "undefined") return;
      const destino = volverA ?? `${window.location.pathname}${window.location.search}`;
      // Al volver la página es otra carga, pero si Google no abre se vuelve a preguntar.
      consulta = null;
      const { error } = await (await getSupabaseBrowserPerezoso()).auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: urlDeVuelta(window.location.origin, destino),
          // Cuenta recordada: directo a esa cuenta. Si no, el selector de cuentas.
          queryParams: opciones?.pista ? { login_hint: opciones.pista } : { prompt: "select_account" },
        },
      });
      if (error) {
        logger.warn("[tienda-cliente] signInWithOAuth falló", { error: error.message });
        throw error;
      }
    },
    [disponible],
  );

  const salir = useCallback(async () => {
    publicar({ cliente: null, cargando: false });
    olvidarCuenta();
    desactivarEntradaAutomatica();
    if (!disponible) return;
    await fetch(RUTA_YO, { method: "DELETE", credentials: "same-origin", headers: csrfHeaders() }).catch((err: unknown) =>
      logger.warn("[tienda-cliente] no se pudo cerrar la sesión de Google", { error: String(err) }),
    );
    consulta = null;
  }, [disponible]);

  return { cliente: estado.cliente, cargando: estado.cargando, disponible, entrarConGoogle, salir };
}
