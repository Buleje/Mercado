/**
 * Movimientos de una carpeta (Esenciales, Brandon 24-10): lo que pasó con los
 * papeles de la carpeta y sus subcarpetas, escrito como se dice —«Karla abrió
 * "Acta…" · ayer 18:20», «Subiste "DNI.jpg"», «Moviste … a …».
 *
 * Puro (servidor y navegador): el servidor lee el registro de auditoría y arma
 * `MovimientoCarpeta` sin datos de más (ni el usuario, ni la IP, ni la
 * metadata cruda); el panel lo convierte en frase y fecha.
 */
import type { DocAction } from "@/lib/types/documents";

/** Las acciones que se cuentan como movimiento. Etiquetar, leer con OCR o
 *  clasificar con IA son trabajo de fondo: llenarían la lista de ruido. */
export const ACCIONES_DEL_HISTORIAL = [
  "upload",
  "view",
  "download",
  "rename",
  "move",
  "delete",
  "restore",
  "share",
  "share_revoke",
  "sign",
  "version",
  "merge",
  "whatsapp_send",
  "stamp",
  "ai_expiry",
] as const satisfies readonly DocAction[];
export type AccionDelHistorial = (typeof ACCIONES_DEL_HISTORIAL)[number];

export function esAccionDelHistorial(a: string): a is AccionDelHistorial {
  return (ACCIONES_DEL_HISTORIAL as readonly string[]).includes(a);
}

/** Quién lo hizo, ya resuelto para quien mira. */
export type QuienMovio =
  | { tipo: "tu" }
  | { tipo: "persona"; nombre: string }
  | { tipo: "equipo" }
  | { tipo: "whatsapp" }
  | { tipo: "sistema"; etiqueta: string };

/** Adónde fue un papel movido. `otra` = una carpeta que quien mira no ve. */
export type DestinoMovimiento = { tipo: "carpeta"; nombre: string } | { tipo: "raiz" } | { tipo: "otra" };

export interface MovimientoCarpeta {
  id: string;
  accion: AccionDelHistorial;
  /** ISO del más nuevo del grupo. */
  cuando: string;
  /** Cuántas veces seguidas (mismo papel, misma persona, misma acción, en una hora). */
  veces: number;
  quien: QuienMovio;
  papel: { id: string; nombre: string; borrado: boolean };
  destino?: DestinoMovimiento;
  renombre?: { de: string; a: string };
}

// ── Leer la metadata del registro ─────────────────────────────────────────────

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
/** «CCNN/19-SEC/GTF 3.pdf» → «GTF 3.pdf» (la ruta la escribe «Ordenar» o la PC). */
const ultimoTramo = (ruta: string): string => ruta.split(/\s*[/›]\s*/).filter(Boolean).at(-1) ?? ruta;

/**
 * Adónde se movió, según quién escribió el registro:
 *  · el movimiento en lote y «Ordenar»: `{ folderId }` (null = la raíz);
 *  · el PATCH del papel: `{ from, to }` con el papel entero (se usa `to.folderId`);
 *  · el WhatsApp: `{ hacia }` (id de carpeta);
 *  · los papeles viejos de la guía: `{ destino: "a › b" }`; la PC: `{ a: "ruta" }`.
 */
export function destinoDeMetadata(m: unknown): { id: string | null } | { ruta: string } | null {
  if (!esObjeto(m)) return null;
  if ("folderId" in m && (m.folderId === null || typeof m.folderId === "string")) return { id: m.folderId || null };
  if (esObjeto(m.to) && "folderId" in m.to) return { id: texto(m.to.folderId) };
  const hacia = texto(m.hacia);
  if (hacia) return { id: hacia };
  const ruta = texto(m.destino) ?? texto(m.a);
  return ruta ? { ruta: ultimoTramo(ruta) } : null;
}

/** El cambio de nombre: `{ from, to }` como texto («Ordenar») o como el papel entero (PATCH). */
export function renombreDeMetadata(m: unknown): { de: string; a: string } | null {
  if (!esObjeto(m)) return null;
  const nombre = (v: unknown) => texto(v) ?? (esObjeto(v) ? texto(v.name) : null);
  const de = nombre(m.from);
  const a = nombre(m.to);
  if (!de || !a) return null;
  if (de === a) return null;
  const r = { de: ultimoTramo(de), a: ultimoTramo(a) };
  // «Ordenar» sacó la ruta del nombre («CCNN/GTF 3.pdf» → «GTF 3.pdf»): ahí la ruta ES el cambio.
  return r.de === r.a ? { de, a } : r;
}

// ── Quién ─────────────────────────────────────────────────────────────────────

/** Los que escriben solos en el registro (medido 24-10 en main y Blas). */
const SISTEMAS: [RegExp, string][] = [
  [/^sync-escritorio/i, "La sincronización con tu PC"],
  [/^kiosko/i, "El kiosko de asistencia"],
  [/^claude:/i, "El asistente"],
];

/**
 * Resuelve el actor del registro para quien mira. `usuarios` = nombre de cada
 * usuario del panel que aparece (vacío si no existe); `verNombres` = si quien
 * mira puede leer quién hizo qué (dueño, admin, encargado).
 */
export function quienMovio(
  actorId: string,
  yo: string,
  usuarios: ReadonlyMap<string, string>,
  verNombres: boolean,
): QuienMovio {
  if (actorId === yo) return { tipo: "tu" };
  if (actorId.startsWith("whatsapp:")) return { tipo: "whatsapp" };
  const nombre = usuarios.get(actorId);
  if (nombre !== undefined) return verNombres ? { tipo: "persona", nombre: nombreCorto(nombre, actorId) } : { tipo: "equipo" };
  for (const [re, etiqueta] of SISTEMAS) if (re.test(actorId)) return { tipo: "sistema", etiqueta };
  // Un procedimiento («cron-…», «origen:…») o una cuenta que ya se borró.
  if (/[:\s]|^cron|^system|^sistema/i.test(actorId)) return { tipo: "sistema", etiqueta: "El sistema" };
  return { tipo: "equipo" };
}

/** «Karla Mendoza Ríos» → «Karla Mendoza»; sin nombre, el usuario. */
export function nombreCorto(nombre: string, usuario: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return partes.length > 0 ? partes.slice(0, 2).join(" ") : usuario;
}

// ── Agrupar y paginar ─────────────────────────────────────────────────────────

export interface FilaMovimiento {
  id: string;
  accion: AccionDelHistorial;
  cuando: string;
  actor: string;
  papelId: string;
}

const UNA_HORA = 60 * 60 * 1000;

/**
 * Junta lo seguido: el mismo papel, la misma persona y la misma acción dentro
 * de una hora del primero («abrió "Acta" 4 veces»). Las filas llegan de la más
 * nueva a la más vieja; `hasta` = la más vieja del grupo (el cursor de «Ver más»).
 */
export function agruparMovimientos<T extends FilaMovimiento>(filas: readonly T[]): (T & { veces: number; hasta: string })[] {
  const grupos: (T & { veces: number; hasta: string })[] = [];
  for (const f of filas) {
    const g = grupos.at(-1);
    if (
      g &&
      g.actor === f.actor &&
      g.accion === f.accion &&
      g.papelId === f.papelId &&
      Date.parse(g.cuando) - Date.parse(f.cuando) <= UNA_HORA
    ) {
      g.veces += 1;
      g.hasta = f.cuando;
      continue;
    }
    grupos.push({ ...f, veces: 1, hasta: f.cuando });
  }
  return grupos;
}

/**
 * La página: los primeros `limite` grupos y el cursor para seguir. Hay más si
 * sobraron grupos o si la consulta vino llena (`quedanEnLaBase`).
 */
export function cortarPagina<T extends { hasta: string }>(
  grupos: readonly T[],
  limite: number,
  quedanEnLaBase: boolean,
): { pagina: T[]; siguiente: string | null } {
  const pagina = grupos.slice(0, limite);
  const ultimo = pagina.at(-1);
  const hayMas = grupos.length > limite || quedanEnLaBase;
  return { pagina, siguiente: hayMas && ultimo ? ultimo.hasta : null };
}

// ── Decirlo ───────────────────────────────────────────────────────────────────

const VERBO: Record<AccionDelHistorial, { tu: string; el: string; se: string }> = {
  upload: { tu: "Subiste", el: "subió", se: "se subió" },
  view: { tu: "Abriste", el: "abrió", se: "se abrió" },
  download: { tu: "Descargaste", el: "descargó", se: "se descargó" },
  rename: { tu: "Cambiaste el nombre de", el: "cambió el nombre de", se: "se cambió el nombre de" },
  move: { tu: "Moviste", el: "movió", se: "se movió" },
  delete: { tu: "Mandaste a la papelera", el: "mandó a la papelera", se: "se mandó a la papelera" },
  restore: { tu: "Sacaste de la papelera", el: "sacó de la papelera", se: "se sacó de la papelera" },
  share: { tu: "Compartiste", el: "compartió", se: "se compartió" },
  share_revoke: { tu: "Dejaste de compartir", el: "dejó de compartir", se: "se dejó de compartir" },
  sign: { tu: "Firmaste", el: "firmó", se: "se firmó" },
  version: { tu: "Subiste otra versión de", el: "subió otra versión de", se: "se subió otra versión de" },
  merge: { tu: "Armaste", el: "armó", se: "se armó" },
  whatsapp_send: { tu: "Enviaste por WhatsApp", el: "envió por WhatsApp", se: "se envió por WhatsApp" },
  stamp: { tu: "Sellaste", el: "selló", se: "se selló" },
  ai_expiry: { tu: "Anotaste cuándo vence", el: "anotó cuándo vence", se: "se anotó cuándo vence" },
};

/** «Karla Mendoza abrió «Acta.pdf»», «Moviste «DNI.jpg» a «Personal»». */
export function fraseDelMovimiento(m: Pick<MovimientoCarpeta, "accion" | "quien" | "papel" | "destino" | "renombre">): string {
  const v = VERBO[m.accion];
  const objeto = m.renombre ? `«${m.renombre.de}» a «${m.renombre.a}»` : `«${m.papel.nombre}»`;
  const sujetoYVerbo =
    m.quien.tipo === "tu" ? v.tu
    : m.quien.tipo === "persona" ? `${m.quien.nombre} ${v.el}`
    : m.quien.tipo === "equipo" ? `Alguien del equipo ${v.el}`
    : m.quien.tipo === "whatsapp" ? `Por WhatsApp ${v.se}`
    : `${m.quien.etiqueta} ${v.el}`;
  const destino =
    m.accion !== "move" || !m.destino ? ""
    : m.destino.tipo === "carpeta" ? ` a «${m.destino.nombre}»`
    : m.destino.tipo === "raiz" ? " a la raíz del Archivo"
    : " a otra carpeta";
  return `${sujetoYVerbo} ${objeto}${destino}`;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
/** Perú no cambia de hora desde 1994: Lima = UTC−5 todo el año. */
const LIMA_MS = -5 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;
const dos = (n: number) => String(n).padStart(2, "0");

/** «hoy 18:20», «ayer 18:20», «jueves 10/09 · 18:20», «jueves 10/09/2025 · 18:20». */
export function cuandoCorto(iso: string, ahora: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const local = new Date(t + LIMA_MS);
  const hoyLocal = new Date(ahora + LIMA_MS);
  const hora = `${dos(local.getUTCHours())}:${dos(local.getUTCMinutes())}`;
  const dias = Math.floor((ahora + LIMA_MS) / DIA_MS) - Math.floor((t + LIMA_MS) / DIA_MS);
  if (dias === 0) return `hoy ${hora}`;
  if (dias === 1) return `ayer ${hora}`;
  const fecha = `${DIAS[local.getUTCDay()]} ${dos(local.getUTCDate())}/${dos(local.getUTCMonth() + 1)}`;
  const anio = local.getUTCFullYear() === hoyLocal.getUTCFullYear() ? "" : `/${local.getUTCFullYear()}`;
  return `${fecha}${anio} · ${hora}`;
}
