/**
 * lib/superadmin/adopcion-modulos.ts — reglas PURAS de la pantalla «Adopción de
 * funciones» (Brandon 2026-11-04, noche autónoma, Tramo 2). Sin base, sin caché
 * y sin "server-only": las usan `lib/db/feature-adoption.db.ts` (cuenta) y la
 * consola del superadmin (etiquetas), y se prueban sin mocks.
 *
 * Qué resuelve:
 *  - alias de `ActivityLog.entity` → clave de módulo (el dato crudo trae
 *    mayúsculas, minúsculas y el prefijo «[L29733] » mezclados);
 *  - rubro del negocio (Aserradero / Bodega) a partir de lo que USA;
 *  - consejos «le falta X» solo de SU rubro: a Blas no se le sugiere Cupones o
 *    Marketplace, y a una bodega no se le sugieren módulos forestales.
 */

/** Días hacia atrás que cuentan como «lo usa» (Brandon: ventana de 30 días). */
export const VENTANA_DIAS = 30;

export type Rubro = "aserradero" | "bodega";

export const RUBRO_LABEL: Record<Rubro, string> = { aserradero: "Aserradero", bodega: "Bodega" };

export interface ModuloDef {
  key: string;
  label: string;
  /** Entidades de ActivityLog (en minúscula, sin el prefijo «[L29733] ») que lo cuentan. */
  aliases: string[];
  /** Función de crecimiento: si el negocio no la usa, es una oportunidad de coaching. */
  growth: boolean;
  /** Módulo propio del aserradero: usar uno de estos vuelve «Aserradero» al negocio. */
  forestal: boolean;
  /** A qué rubros se les sugiere (y contra cuántos negocios se mide su adopción). */
  para: readonly Rubro[];
}

const AMBOS: readonly Rubro[] = ["aserradero", "bodega"];
const SOLO_BODEGA: readonly Rubro[] = ["bodega"];
const SOLO_ASERRADERO: readonly Rubro[] = ["aserradero"];

// Solo funciones que podemos mapear con confianza. El ruido de sistema
// (admin/security/superadmin/NotificationLog/System) queda fuera a propósito.
export const MODULOS: readonly ModuloDef[] = [
  { key: "productos", label: "Productos", aliases: ["producto", "product"], growth: false, forestal: false, para: AMBOS },
  { key: "pedidos", label: "Pedidos", aliases: ["pedido", "order"], growth: false, forestal: false, para: AMBOS },
  { key: "ventas", label: "Ventas / POS", aliases: ["sale", "venta"], growth: false, forestal: false, para: AMBOS },
  { key: "clientes", label: "Clientes", aliases: ["customer"], growth: false, forestal: false, para: AMBOS },
  { key: "turnos", label: "Turnos / Caja", aliases: ["turno"], growth: false, forestal: false, para: AMBOS },
  { key: "reportes", label: "Reportes", aliases: ["report", "monthly_report"], growth: false, forestal: false, para: AMBOS },
  { key: "fiado", label: "Fiado", aliases: ["fiado"], growth: true, forestal: false, para: SOLO_BODEGA },
  { key: "adelantos", label: "Adelantos", aliases: ["adelanto"], growth: true, forestal: false, para: AMBOS },
  { key: "combos", label: "Combos / Bundles", aliases: ["bundle"], growth: true, forestal: false, para: SOLO_BODEGA },
  { key: "cupones", label: "Cupones", aliases: ["cupon", "cupón"], growth: true, forestal: false, para: SOLO_BODEGA },
  { key: "marketplace", label: "Marketplace", aliases: ["marketplace_store", "marketplace"], growth: true, forestal: false, para: SOLO_BODEGA },
  { key: "whatsapp", label: "WhatsApp", aliases: ["whatsappconversation"], growth: true, forestal: false, para: AMBOS },
  { key: "delivery", label: "Delivery", aliases: ["driverapplication", "delivery"], growth: true, forestal: false, para: SOLO_BODEGA },
  // ── Aserradero (Tramo 2) ──
  { key: "libro-ctp", label: "Libro CTP", aliases: ["forestctpentry", "woodentry", "forestloteaserrio", "forestctpimport"], growth: true, forestal: true, para: SOLO_ASERRADERO },
  { key: "lo-th", label: "Libro LO-TH", aliases: ["forestlothentry"], growth: true, forestal: true, para: SOLO_ASERRADERO },
  { key: "guias", label: "Guías (GTF)", aliases: ["forestgtf", "forestguiaguardada"], growth: true, forestal: true, para: SOLO_ASERRADERO },
  // ── Módulos de cualquier rubro que el aserradero también usa ──
  { key: "rrhh", label: "Personal y asistencia", aliases: ["asistencia", "colaborador"], growth: true, forestal: false, para: AMBOS },
  { key: "camaras", label: "Cámaras", aliases: ["camara"], growth: true, forestal: false, para: AMBOS },
  { key: "agenda", label: "Agenda", aliases: ["agendaactividad"], growth: true, forestal: false, para: AMBOS },
];

const ALIAS_A_CLAVE = new Map<string, string>();
for (const m of MODULOS) for (const a of m.aliases) ALIAS_A_CLAVE.set(a, m.key);

const POR_CLAVE = new Map(MODULOS.map((m) => [m.key, m]));

/** Prefijo con que la auditoría Ley 29733 marca una entidad: «[L29733] Sale». */
const PREFIJO_L29733 = /^\[l29733\]\s*/;

/**
 * Entidad cruda de ActivityLog → clave de módulo, o `null` si no es un módulo
 * que rastreamos. Ej.: «ForestCtpEntry» → «libro-ctp»; «[L29733] Sale» → «ventas».
 */
export function claveDeEntidad(entity: string | null | undefined): string | null {
  if (!entity) return null;
  const limpia = entity.trim().toLowerCase().replace(PREFIJO_L29733, "");
  return ALIAS_A_CLAVE.get(limpia) ?? null;
}

export function moduloDe(key: string): ModuloDef | undefined {
  return POR_CLAVE.get(key);
}

/**
 * Rubro del negocio. Es «Aserradero» si usa algún módulo forestal en la
 * ventana, o si su ficha dice `madereria`; todo lo demás es «Bodega». El campo
 * `industry` solo no alcanza: Blas figura como `bodega` en la base.
 */
export function rubroDeNegocio(usados: Iterable<string>, industry?: string | null): Rubro {
  if (industry === "madereria") return "aserradero";
  for (const k of usados) if (POR_CLAVE.get(k)?.forestal) return "aserradero";
  return "bodega";
}

/** Funciones de crecimiento de SU rubro que todavía no usa («le falta X»). */
export function consejosDeRubro(rubro: Rubro, usados: ReadonlySet<string>): ModuloDef[] {
  return MODULOS.filter((m) => m.growth && m.para.includes(rubro) && !usados.has(m.key));
}
