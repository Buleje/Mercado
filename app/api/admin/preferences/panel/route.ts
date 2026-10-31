import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { AdminPreferencesDB } from "@/lib/db/admin-preferences.db";
import { logger } from "@/lib/logger";
import { AvisoPantallaSchema } from "@/lib/agenda/aviso-pantalla";

/**
 * Lo que cada persona guarda para sí en el panel — «Abriste hace poco» (M06)
 * y las vistas guardadas de cada pantalla (M07) — en el SERVIDOR, para que la
 * siga a otra computadora o al celular. El navegador lo sigue teniendo de
 * caché (`localStorage`) para pintar al instante.
 *
 * Mismo lugar que el Acceso rápido del Drive: `admin_prefs` del negocio (sin
 * schema), una subclave por persona y lista, `panel:<usuario>:<clave>`. La
 * mezcla de `AdminPreferencesDB.write` es por subclave y en una sentencia: dos
 * pantallas guardando a la vez no se pisan. Negocio y persona salen de la
 * sesión, nunca del cuerpo.
 *
 * GET → { guardado: { [clave]: lista } }   (clave ausente = nunca guardó: el cliente sube lo suyo)
 * PUT → body { clave: "recientes" | "vistas:<pantalla>" | "uso-pestanas" | "aviso-agenda", valor: lista }
 *
 * `aviso-agenda` es la configuración del aviso en pantalla de la agenda
 * (`lib/agenda/aviso-pantalla.ts`): una lista de UNO, para viajar por el mismo
 * camino que las listas (`lib/admin/guardado-servidor`).
 */

const ROLES = ["admin", "cajero", "almacenero", "manager"] as const;
/** Más que lo que muestra el menú (10 recientes, 12 vistas): margen para versiones futuras. */
const TOPE_RECIENTES = 15;
const TOPE_VISTAS = 20;
/** «Menú en tu orden»: una fila por vista abierta (`plata:gastos`), igual que `TOPE_USO` del cliente. */
const TOPE_USO = 120;
/** Una lista entera, en texto: `featureFlagsJson` lo comparte todo el negocio. */
const TOPE_TEXTO = 32_000;

const CLAVE_VISTAS = /^vistas:[A-Za-z0-9._-]{1,48}$/;
/** `encodeURIComponent` no deja `:` en el usuario: el prefijo de uno nunca es el de otro. */
const prefijoDe = (username: string) => `panel:${encodeURIComponent(username)}:`;
const claveValida = (c: string) => c === "recientes" || c === "uso-pestanas" || c === "aviso-agenda" || CLAVE_VISTAS.test(c);

const RecienteSchema = z.object({
  href: z.string().startsWith("/admin?").max(600),
  titulo: z.string().max(200),
  camino: z.string().max(300),
  tipo: z.string().max(60).nullable(),
  en: z.number(),
});
const VistaSchema = z.object({
  id: z.string().min(1).max(80),
  nombre: z.string().trim().min(1).max(80),
  estado: z.unknown(),
  en: z.number(),
});
const UsoSchema = z.object({
  k: z.string().min(1).max(120),
  n: z.number().int().min(0).max(1_000_000),
  u: z.number(),
});
const PutSchema = z
  .union([
    z.object({ clave: z.literal("uso-pestanas"), valor: z.array(UsoSchema).max(TOPE_USO) }),
    z.object({ clave: z.literal("aviso-agenda"), valor: z.array(AvisoPantallaSchema).max(1) }),
    z.object({ clave: z.literal("recientes"), valor: z.array(RecienteSchema).max(TOPE_RECIENTES) }),
    z.object({ clave: z.string().regex(CLAVE_VISTAS), valor: z.array(VistaSchema).max(TOPE_VISTAS) }),
  ])
  .refine((b) => JSON.stringify(b.valor).length <= TOPE_TEXTO, { message: "Lo guardado es demasiado grande" });

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req, [...ROLES]);
    if (auth instanceof NextResponse) return auth;
    const prefs = await AdminPreferencesDB.read(auth.tenantId);
    const prefijo = prefijoDe(auth.username);
    const guardado: Record<string, unknown[]> = {};
    for (const [k, v] of Object.entries(prefs)) {
      if (!k.startsWith(prefijo)) continue;
      const clave = k.slice(prefijo.length);
      if (claveValida(clave) && Array.isArray(v)) guardado[clave] = v;
    }
    return NextResponse.json({ guardado }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[preferences/panel] get error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    /* Los recientes suben unos segundos después de cada cambio de pantalla: MODERATE (20 cada 5 min) se queda corto. */
    const rl = applyRateLimit(req, "GENEROUS", "admin-preferences-panel");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req, [...ROLES]);
    if (auth instanceof NextResponse) return auth;

    const body: unknown = await req.json().catch(() => ({}));
    const parsed = PutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
    }

    await AdminPreferencesDB.write(auth.tenantId, { [prefijoDe(auth.username) + parsed.data.clave]: parsed.data.valor });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[preferences/panel] put error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
