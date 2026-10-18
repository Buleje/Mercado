"use client";

/**
 * GoogleUnToque — el globito de Google en las tiendas (One Tap sobre FedCM,
 * 17-10). Al entrar a una tienda sin sesión, Chrome muestra las cuentas de
 * Google del equipo («Continuar como Brandon» si hay una sola); quien ya entró
 * antes y no salió entra solo (`auto_select`).
 *
 * Se monta en `MenuCuenta` (la cabecera de TODAS las tiendas) y abre una sola
 * vez por carga de página. No aparece:
 *   · sin `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (no se baja ni el script),
 *   · con sesión (de cliente, o de Google según lo recordado: sin preguntar a `/yo`),
 *   · en carrito/checkout/seguimiento, ni dentro de la vista previa del editor.
 * Si Google no carga (CSP, bloqueador, origen no autorizado) no pasa nada: la
 * tienda queda con el botón de siempre.
 */

import { useEffect, useState } from "react";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { leerCuentaRecordada, type CuentaRecordada } from "@/lib/tienda-cliente/cuenta-recordada";
import { RUTA_UN_TOQUE, cargarGis, gis, idClienteGoogle } from "@/lib/tienda-cliente/google-un-toque";
import { entrarConCredencialGoogle } from "./use-cliente-tienda";

/** Espera tras cargar la página: el globito no compite con lo primero que se dibuja. */
const ESPERA_MS = 1500;
const SALUDO_MS = 4000;
const RUTAS_SIN_GLOBITO = /\/(carrito|checkout|pedido|seguimiento|tracking|admin)(\/|$)/;

const respuestaNonce = z.object({ nonce: z.string().regex(/^[0-9a-f]{64}$/) });

/** Una vez por carga de página, aunque haya dos cabeceras montadas. */
let iniciado = false;

async function abrirGlobito(
  idCliente: string,
  recordada: CuentaRecordada | null,
  cancelado: () => boolean,
  alEntrar: (nombre: string | null) => void,
): Promise<void> {
  if (iniciado || cancelado()) return;
  iniciado = true;
  // Un fallo de red o un JSON roto sube al `.catch` del que llama (queda en el log).
  // 503 (sin client id) y 404 (negocio con Google apagado) = no hay globito.
  const res = await fetch(RUTA_UN_TOQUE, { credentials: "same-origin", cache: "no-store" });
  if (!res.ok || cancelado()) return;
  const r = respuestaNonce.safeParse(await res.json());
  if (!r.success) return;
  const id = await cargarGis();
  if (!id || cancelado()) return;
  id.initialize({
    client_id: idCliente,
    nonce: r.data.nonce,
    callback: (resp) => {
      if (!resp.credential) return;
      entrarConCredencialGoogle(resp.credential)
        .then((entro) => {
          if (entro) alEntrar(leerCuentaRecordada()?.nombre ?? null);
        })
        .catch((err: unknown) => logger.warn("[google-un-toque] no se pudo entrar", { error: String(err) }));
    },
    auto_select: recordada?.autoEntrar ?? false,
    ...(recordada?.pista ? { login_hint: recordada.pista } : {}),
    cancel_on_tap_outside: true,
    context: "signin",
    itp_support: true,
    use_fedcm_for_prompt: true,
  });
  id.prompt();
}

export function GoogleUnToque({ activo }: { activo: boolean }) {
  const [saludo, setSaludo] = useState<string | null>(null);

  useEffect(() => {
    const idCliente = idClienteGoogle();
    if (!activo || iniciado || !idCliente) return;
    if (window.self !== window.top) return; // vista previa del editor (iframe)
    if (RUTAS_SIN_GLOBITO.test(window.location.pathname)) return;
    const recordada = leerCuentaRecordada();
    if (recordada?.conectado) return;
    let cancelado = false;
    const espera = window.setTimeout(() => {
      abrirGlobito(idCliente, recordada, () => cancelado, (nombre) => setSaludo(nombre ?? "")).catch((err: unknown) =>
        logger.warn("[google-un-toque] el globito no abrió", { error: String(err) }),
      );
    }, ESPERA_MS);
    return () => {
      cancelado = true;
      window.clearTimeout(espera);
      gis()?.cancel();
    };
  }, [activo]);

  useEffect(() => {
    if (saludo === null) return;
    const t = window.setTimeout(() => setSaludo(null), SALUDO_MS);
    return () => window.clearTimeout(t);
  }, [saludo]);

  if (saludo === null) return null;
  const primerNombre = saludo.split(/\s+/)[0];
  return (
    <p
      role="status"
      className="pointer-events-none fixed inset-x-4 bottom-6 z-50 mx-auto max-w-sm rounded-xl bg-[var(--text-primary)] px-4 py-3 text-center text-base font-semibold text-[var(--surface-canvas)] shadow-[var(--shadow-lg)]"
    >
      {primerNombre ? `Hola, ${primerNombre}. Entraste con Google.` : "Entraste con Google."}
    </p>
  );
}

export default GoogleUnToque;
