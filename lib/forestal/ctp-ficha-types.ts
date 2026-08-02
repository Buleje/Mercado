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
  /**
   * concesion | permiso | autorizacion | plantacion | dema | predio | otro
   *
   * Es también el **casillero (5)** de la GTF ("Origen del Recurso"): las
   * casillas del formato son exactamente estas categorías.
   */
  tipo: string;
  /** Número/código del título tal como lo emitió la ARFFS/SERFOR. Casillero (6). */
  codigo: string;
  /**
   * N° de la resolución que aprobó el título — casillero **(8)** de la GTF.
   * Ej: "R.A N° D000485-2024-MIDAGRI-SERFOR-ATFFS SELVA CENTRAL".
   *
   * Es distinto de `tipo`: uno dice QUÉ es el título (permiso, concesión) y el
   * otro con qué acto administrativo se aprobó. Imprimir `tipo` en el (8)
   * llenaba ese casillero con la palabra "permiso".
   */
  resolucion: string;
  /**
   * Tipo de plan de manejo aprobado — casillero **(9)**. DEMA, PMFI, PGMF, POA…
   * Va como texto: la nomenclatura cambia por región y por tipo de título, y un
   * enum cerrado rechazaría un plan válido.
   */
  planManejo: string;
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
  /**
   * Logo del CTP como data URL — el membrete de la guía de salida y del resto
   * de los papeles que emite el centro. Vacío = va el monograma del libro.
   */
  logo?: string;
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
          return { tipo: s(o.tipo), codigo: s(o.codigo), resolucion: s(o.resolucion), planManejo: s(o.planManejo), vencimiento: s(o.vencimiento) };
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
    logo: s(r.logo),
  };
}

/** Campos que un documento SERFOR necesita sí o sí (para el aviso "ficha incompleta"). */
export const CTP_FICHA_REQUIRED: (keyof CtpFicha)[] = ["nombreCtp", "codigoCtp", "ruc", "razonSocial"];

/** ¿Faltan datos mínimos para emitir documentos con identidad legal? */
export function ctpFichaFaltantes(f: CtpFicha): (keyof CtpFicha)[] {
  return CTP_FICHA_REQUIRED.filter((k) => !s(f[k]));
}

/**
 * ¿Dos nombres de especie se refieren a la misma? El permiso CITES suele decir
 * "Caoba" y la línea "caoba (Swietenia macrophylla)", así que se compara sin
 * mayúsculas y por contención en cualquiera de los dos sentidos.
 *
 * Single source: lo usan el aviso "CITES sin permiso" del Excel y el autollenado
 * del N° de permiso en la guía de salida. Si el criterio cambia, cambia acá.
 */
export function especieCoincide(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? "").trim().toLowerCase();
  const y = (b ?? "").trim().toLowerCase();
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
}

/**
 * El permiso CITES archivado en la Ficha que corresponde a alguna de las especies
 * dadas (nombre común o científico), o `null`. Tener el permiso es lo que hace
 * legal a una especie protegida: se copia al documento en vez de tipearlo.
 */
export function permisoCitesDeEspecie(
  /** Ficha a medio llenar incluida: un CTP nuevo todavía no cargó sus permisos. */
  ficha: { citesPermisos?: CtpCitesPermiso[] } | null | undefined,
  ...especies: (string | null | undefined)[]
): CtpCitesPermiso | null {
  const permisos = ficha?.citesPermisos ?? [];
  return permisos.find((p) => especies.some((e) => especieCoincide(p.especie, e))) ?? null;
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
