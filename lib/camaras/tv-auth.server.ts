import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { PantallasTvDB } from "@/lib/db/pantallas-tv.db";
import { logger } from "@/lib/logger";
import { registrarMirada, type DetalleMirada } from "@/lib/camaras/registro-miradas";
import { firmarTokenTv, verificarTokenTv } from "@/lib/camaras/tv-token.server";
import { TV_COOKIE, type PantallaTv } from "@/lib/camaras/pantallas-tv";

/**
 * La guardia del Modo TV (ADR-473): de la cookie `buleje-tv` al negocio y la
 * pantalla. Toda ruta `/api/tv/camaras/**` empieza por `exigirPantallaTv`.
 *
 *  · El negocio sale SÓLO del token (claim `tid`): nunca del header, del slug
 *    ni del host. Un TV no puede pedir cámaras de otro negocio cambiando la URL.
 *  · El token NO es una sesión del panel: otra cookie, otra clave de firma
 *    (`tv-token.server.ts`) y ninguna ruta `/api/admin/**` lo lee.
 *  · Además de la firma, la pantalla tiene que seguir en la lista del negocio:
 *    revocarla desde el panel corta al TV en su próximo pedido (a lo sumo
 *    `MICROCACHE_MS` si cae en otra instancia). Revocada o vencida → 401 y se
 *    borra la cookie.
 */

export interface SesionTv {
  tenantId: string;
  pantalla: PantallaTv;
}

/** Como mucho una escritura de `ultimaVez` por minuto y pantalla. */
const TOQUE_CADA_MS = 60_000;
const ultimoToque = new Map<string, number>();

const esProduccion = () => process.env.NODE_ENV === "production";

export function ponerCookieTv(res: NextResponse, token: string, expiraEn: string): NextResponse {
  res.cookies.set(TV_COOKIE, token, {
    httpOnly: true,
    secure: esProduccion(),
    sameSite: "lax",
    path: "/",
    expires: new Date(expiraEn),
  });
  return res;
}

export function borrarCookieTv(res: NextResponse): NextResponse {
  res.cookies.set(TV_COOKIE, "", { httpOnly: true, secure: esProduccion(), sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}

export function emitirCookieTv(res: NextResponse, datos: { tid: string; pid: string; expiraEn: string }): NextResponse {
  return ponerCookieTv(res, firmarTokenTv(datos), datos.expiraEn);
}

function noAutorizado(): NextResponse {
  return borrarCookieTv(
    NextResponse.json(
      { error: "unauthorized", message: "Esta pantalla ya no está conectada. Vuelve a vincularla desde el panel." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    ),
  );
}

export async function exigirPantallaTv(req: NextRequest, ahora = Date.now()): Promise<SesionTv | NextResponse> {
  const claims = verificarTokenTv(req.cookies.get(TV_COOKIE)?.value, ahora);
  if (!claims) return noAutorizado();
  const pantalla = await PantallasTvDB.buscarParaTv(claims.tid, claims.pid, ahora);
  if (!pantalla) return noAutorizado();

  const clave = `${claims.tid}:${pantalla.id}`;
  const previa = Math.max(ultimoToque.get(clave) ?? 0, pantalla.ultimaVez ? new Date(pantalla.ultimaVez).getTime() : 0);
  if (ahora - previa >= TOQUE_CADA_MS) {
    ultimoToque.set(clave, ahora);
    void PantallasTvDB.tocar(claims.tid, pantalla.id, ahora).catch((err) =>
      logger.warn("[tv] no se pudo anotar la última vez", { error: String(err), tenantId: claims.tid }),
    );
  }
  return { tenantId: claims.tid, pantalla };
}

export function camaraNoPermitida(): NextResponse {
  return NextResponse.json({ error: "no_encontrada", message: "Esa cámara no existe." }, { status: 404 });
}

/** Quién figura en el registro de miradas (Ley 29733) cuando mira un TV. */
export const quienEsTv = (pantalla: PantallaTv) => ({ usuario: `Pantalla ${pantalla.nombre}`, rol: "tv" });

/**
 * Las miradas de lo que se sondea (cuadro, foto, segmentos) se anotan como
 * mucho una vez cada 5 min por pantalla y cámara: este filtro de proceso evita
 * el SELECT de `registrarMirada` en cada cuadro.
 */
const VENTANA_LOCAL_MS = 5 * 60_000;
const miradasLocales = new Map<string, number>();

export function anotarMiradaTv(
  sesion: SesionTv,
  camara: { id: string; nombre: string },
  que: Omit<DetalleMirada, "rol" | "camara"> = { tipo: "vivo", calidad: "sd" },
  ahora = Date.now(),
): void {
  const clave = `${sesion.tenantId}:${sesion.pantalla.id}:${camara.id}`;
  if (ahora - (miradasLocales.get(clave) ?? 0) < VENTANA_LOCAL_MS) return;
  miradasLocales.set(clave, ahora);
  void registrarMirada(sesion.tenantId, quienEsTv(sesion.pantalla), camara, que, new Date(ahora)).catch((err) =>
    logger.warn("[tv] mirada sin anotar", { error: String(err) }),
  );
}

/** Sólo tests. */
export function __olvidarTvAuth(): void {
  ultimoToque.clear();
  miradasLocales.clear();
}
