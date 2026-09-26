import { NextResponse, type NextRequest } from "next/server";
import { esIdDeTroza, rutaFichaDeTroza } from "@/lib/forestal/ctp-troza-url";

/**
 * GET /admin/q/<id> — la ruta corta que lleva el QR de la etiqueta de una
 * troza (ADR-436). Sólo redirige a la ficha dentro del panel; la sesión la
 * exige el guard de `/admin/*` en `proxy.ts` ANTES de llegar acá (sin sesión →
 * login con `?from=`), así que escanear una etiqueta pegada en el patio no le
 * muestra nada a un extraño.
 *
 * Existe para que el QR sea chico en datos y grande en módulos: la URL larga
 * daba 41×41 módulos; ésta, 33×33.
 *
 * Es un route handler y no una `page.tsx` con `redirect()`: la página pasaba
 * por el layout del panel entero (providers, tenant, tokens) sólo para
 * redirigir, y con `cacheComponents` leer `params` fuera de un `<Suspense>`
 * daba error en consola. Así es un 307 limpio, que el celular sigue al toque.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const destino = esIdDeTroza(id) ? rutaFichaDeTroza(id) : "/admin";
  return NextResponse.redirect(new URL(destino, req.url), 307);
}
