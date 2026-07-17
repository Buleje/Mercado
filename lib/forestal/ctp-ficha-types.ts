/**
 * ctp-ficha-types — tipos y helpers PUROS de la Ficha legal del CTP.
 *
 * Vive acá (no en `lib/db/forest-ctp-ficha.db.ts`, que es `server-only`) para
 * que tanto el editor cliente (`CtpFichaEditor.tsx`) como el export client-only
 * (`ctp-export.ts`) puedan importar la forma y los helpers sin arrastrar el
 * módulo de DB al bundle del navegador. La DB class re-exporta desde acá.
 */

/** Título habilitante que ampara el origen de la materia prima del CTP. */
export interface CtpTituloHabilitante {
  /** concesion | permiso | autorizacion | plantacion | dema | predio | otro */
  tipo: string;
  /** Número/código del título tal como lo emitió la ARFFS/SERFOR. */
  codigo: string;
  /** YYYY-MM-DD de vencimiento (opcional). Un título vencido invalida el origen. */
  vencimiento: string;
}

/** Permiso CITES de una especie protegida (caoba, cedro, shihuahuaco…). No es
 *  infracción tener CITES: es legal CON permiso archivado. Se guarda para tenerlo
 *  a mano ante un fiscalizador, no para restar puntos (ver ctp-compliance.ts). */
export interface CtpCitesPermiso {
  especie: string;
  numero: string;
  /** YYYY-MM-DD de vencimiento del permiso (opcional). */
  vencimiento: string;
}

/** Identidad legal del CTP ante SERFOR/ARFFS. Todos los campos son opcionales
 *  durante la carga inicial; el editor avisa cuáles faltan para documentos. */
export interface CtpFicha {
  // ── Identidad del centro ──
  nombreCtp: string; // nombre comercial del aserradero / planta
  codigoCtp: string; // "Código de CTP" asignado por la ARFFS (campo oficial LO-CTP)
  ruc: string; // RUC del titular (11 dígitos)
  razonSocial: string; // razón social / titular del CTP
  // ── Registro ante la autoridad forestal regional ──
  arffs: string; // ARFFS competente (ej. "GORE Ucayali · DRSAFFS")
  registroArffs: string; // N° de constancia/registro del CTP ante la ARFFS
  registroArffsFecha: string; // YYYY-MM-DD de la constancia
  // ── Títulos habilitantes vinculados (origen legal de la materia prima) ──
  titulos: CtpTituloHabilitante[];
  // ── Permisos CITES de especies protegidas que procesa el CTP ──
  citesPermisos: CtpCitesPermiso[];
  // ── Representante legal ──
  representante: string;
  representanteDni: string;
  // ── Ubicación de la planta ──
  direccion: string;
  region: string;
  provincia: string;
  distrito: string;
  ubigeo: string;
  // ── Contacto ──
  telefono: string;
  email: string;
  // ── GTF de salida: serie del talonario autorizado por la ARFFS ──
  gtfSerie: string;
}

/** Ficha vacía — un CTP recién habilitado todavía no cargó sus datos. */
export function emptyCtpFicha(): CtpFicha {
  return {
    nombreCtp: "", codigoCtp: "", ruc: "", razonSocial: "",
    arffs: "", registroArffs: "", registroArffsFecha: "",
    titulos: [],
    citesPermisos: [],
    representante: "", representanteDni: "",
    direccion: "", region: "", provincia: "", distrito: "", ubigeo: "",
    telefono: "", email: "", gtfSerie: "",
  };
}

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Normaliza cualquier blob almacenado a la forma canónica `CtpFicha`. Tolera
 *  claves faltantes (campo nuevo) y basura (nunca rompe el módulo entero). */
export function normalizeCtpFicha(raw: unknown): CtpFicha {
  const r = (raw ?? {}) as Record<string, unknown>;
  const titulos = Array.isArray(r.titulos)
    ? (r.titulos as unknown[])
        .map((t) => {
          const o = (t ?? {}) as Record<string, unknown>;
          return { tipo: s(o.tipo), codigo: s(o.codigo), vencimiento: s(o.vencimiento) };
        })
        .filter((t) => t.tipo || t.codigo)
    : [];
  const citesPermisos = Array.isArray(r.citesPermisos)
    ? (r.citesPermisos as unknown[])
        .map((p) => {
          const o = (p ?? {}) as Record<string, unknown>;
          return { especie: s(o.especie), numero: s(o.numero), vencimiento: s(o.vencimiento) };
        })
        .filter((p) => p.especie || p.numero)
    : [];
  return {
    nombreCtp: s(r.nombreCtp), codigoCtp: s(r.codigoCtp), ruc: s(r.ruc), razonSocial: s(r.razonSocial),
    arffs: s(r.arffs), registroArffs: s(r.registroArffs), registroArffsFecha: s(r.registroArffsFecha),
    titulos,
    citesPermisos,
    representante: s(r.representante), representanteDni: s(r.representanteDni),
    direccion: s(r.direccion), region: s(r.region), provincia: s(r.provincia), distrito: s(r.distrito), ubigeo: s(r.ubigeo),
    telefono: s(r.telefono), email: s(r.email), gtfSerie: s(r.gtfSerie),
  };
}

/** Campos que un documento SERFOR necesita sí o sí (para el aviso "ficha incompleta"). */
export const CTP_FICHA_REQUIRED: (keyof CtpFicha)[] = ["nombreCtp", "codigoCtp", "ruc", "razonSocial"];

/** ¿Faltan datos mínimos para emitir documentos con identidad legal? */
export function ctpFichaFaltantes(f: CtpFicha): (keyof CtpFicha)[] {
  return CTP_FICHA_REQUIRED.filter((k) => !s(f[k]));
}

export type EstadoVencimiento = "vencido" | "por_vencer" | "vigente";

/**
 * Estado de vigencia de una fecha `YYYY-MM-DD` respecto a HOY: `vencido`,
 * `por_vencer` (≤30 días) o `vigente`; null si no hay fecha. Usá sólo desde
 * cliente (llama a `Date.now()` — no en un render server cacheado). Single
 * source para permisos CITES y títulos habilitantes de la Ficha.
 */
export function estadoVencimiento(vencimiento: string): EstadoVencimiento | null {
  if (!vencimiento) return null;
  const v = new Date(`${vencimiento}T23:59:59`); // vence al final de ese día
  if (Number.isNaN(v.getTime())) return null;
  const dias = Math.floor((v.getTime() - Date.now()) / 86_400_000);
  if (dias < 0) return "vencido";
  if (dias <= 30) return "por_vencer";
  return "vigente";
}
