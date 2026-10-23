import { NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { vigilarTodos } from "@/lib/camaras/vigia-movimientos.server";

/**
 * GET /api/cron/camaras-movimientos — el vigía de movimientos (2026-10-23).
 *
 * Vacía la cola de alarmas de Hik-Connect de cada negocio con cámaras (la
 * misma función que la cabecera del panel, que sigue leyendo lo guardado) y
 * avisa lo nuevo al celular (Web Push) y a la campana. Lo puro y los frenos:
 * `lib/camaras/vigia-movimientos.ts`.
 *
 * Quién lo dispara: cada 30 s `npm run camaras:vigia` con la PC prendida. En
 * Vercel NO está en `vercel.json`: el plan Hobby rechaza el deploy entero con
 * un cron de más de una vez al día (commit 3b5f193b). En producción hace falta
 * Pro (`* * * * *`) o un disparador de afuera con el mismo Bearer.
 *
 * Respuesta: lo que pasó por negocio. Todos fallaron = 502.
 */
export const GET = withCronAuth("camaras-movimientos", async () => {
  const negocios = await vigilarTodos();
  const suma = (k: "nuevos" | "enviados" | "destinos") => negocios.reduce((n, r) => n + r[k], 0);
  const cuerpo = {
    negocios: negocios.length,
    nuevos: suma("nuevos"),
    enviados: suma("enviados"),
    destinos: suma("destinos"),
    detalle: negocios,
  };
  const todosFallaron = negocios.length > 0 && negocios.every((r) => r.resultado === "error");
  return NextResponse.json(cuerpo, { status: todosFallaron ? 502 : 200, headers: { "Cache-Control": "no-store" } });
});
