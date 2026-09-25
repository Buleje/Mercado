/**
 * ctp-ficha-types — tipos y helpers PUROS de la Ficha legal del CTP.
 *
 * Vive acá (no en `lib/db/forest-ctp-ficha.db.ts`, que es `server-only`) para
 * que tanto el editor cliente (`CtpFichaEditor.tsx`) como el export client-only
 * (`ctp-export.ts`) puedan importar la forma y los helpers sin arrastrar el
 * módulo de DB al bundle del navegador. La DB class re-exporta desde acá.
 */

import { normalizarCodigoContrato, type Contrato, type TipoContrato } from "./contratos";
import { fromUtm, parseUtmZone, zoneLabel } from "./loth-utm";
import { TIPOS_PLAN, TIPOS_PLAN_META } from "./loth-tipos-plan";
import { tipoPermisoDesdePlan, tipoPlanDesdePermiso } from "./permisos-de-parte";

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
  /**
   * «N° Registro del libro de operaciones» — primer campo de la carátula
   * (Anexo 1 de la RDE D000025-2023): *"consignar el número de registro
   * otorgado por la ARFFS"*. Es el número que la ARFFS le da AL LIBRO, y es
   * OTRO que `registroArffs` (la autorización del establecimiento): en el
   * ejemplo oficial conviven "001" y "RD-SD-549".
   */
  registroLibro: string;
  /**
   * «N° del establecimiento anexo» — correlativo del local dentro del RUC.
   * *"Si la empresa tiene solo un local o establecimiento, el número será
   * siempre 001"* (Anexo 1).
   */
  establecimientoAnexo: string;
  /**
   * «Tipo de establecimiento» — la identificación **registrada en SUNAT**, una
   * de las siete de `CTP_TIPOS_ESTABLECIMIENTO`. No es el rubro del centro
   * (aserradero / laminadora): eso la carátula no lo pide.
   */
  tipoEstablecimiento: string;
  /**
   * «Coordenadas UTM» de la carátula: *"consignar el número de coordenadas UTM
   * (E, N) y zona latitudinal"*. Tres campos y no un texto libre para poder
   * avisar cuando el punto cae fuera del Perú — un Este y un Norte cambiados
   * de lugar ubican la planta en el mar y nadie lo nota leyendo la línea.
   */
  utmEste: string;
  utmNorte: string;
  utmZona: string;
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
  /**
   * A qué GRUPO de operaciones pertenece este libro (ADR-395). Dos libros
   * hermanos —dos operaciones de la misma planta— comparten `grupoId`; el
   * `nombre` es cómo se llama ESTA operación en el switch de la cabina.
   * Ausente = libro único, como siempre.
   */
  operacion?: { grupoId: string; nombre: string };
}

/** Ficha vacía — un CTP recién habilitado todavía no cargó sus datos. */
export function emptyCtpFicha(): CtpFicha {
  return {
    nombreCtp: "",
    codigoCtp: "",
    ruc: "",
    razonSocial: "",
    arffs: "",
    registroArffs: "",
    registroArffsFecha: "",
    registroLibro: "",
    establecimientoAnexo: "",
    tipoEstablecimiento: "",
    utmEste: "",
    utmNorte: "",
    utmZona: "",
    titulos: [],
    citesPermisos: [],
    representante: "",
    representanteDni: "",
    direccion: "",
    region: "",
    provincia: "",
    distrito: "",
    ubigeo: "",
    telefono: "",
    email: "",
    gtfSerie: "",
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
          return {
            tipo: s(o.tipo),
            codigo: s(o.codigo),
            resolucion: s(o.resolucion),
            planManejo: s(o.planManejo),
            vencimiento: s(o.vencimiento),
          };
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
    nombreCtp: s(r.nombreCtp),
    codigoCtp: s(r.codigoCtp),
    ruc: s(r.ruc),
    razonSocial: s(r.razonSocial),
    arffs: s(r.arffs),
    registroArffs: s(r.registroArffs),
    registroArffsFecha: s(r.registroArffsFecha),
    registroLibro: s(r.registroLibro),
    establecimientoAnexo: s(r.establecimientoAnexo),
    tipoEstablecimiento: s(r.tipoEstablecimiento),
    utmEste: s(r.utmEste),
    utmNorte: s(r.utmNorte),
    utmZona: s(r.utmZona),
    titulos,
    citesPermisos,
    representante: s(r.representante),
    representanteDni: s(r.representanteDni),
    direccion: s(r.direccion),
    region: s(r.region),
    provincia: s(r.provincia),
    distrito: s(r.distrito),
    ubigeo: s(r.ubigeo),
    telefono: s(r.telefono),
    email: s(r.email),
    gtfSerie: s(r.gtfSerie),
    logo: s(r.logo),
    operacion:
      r.operacion &&
      typeof r.operacion === "object" &&
      s((r.operacion as Record<string, unknown>).grupoId)
        ? {
            grupoId: s((r.operacion as Record<string, unknown>).grupoId),
            nombre: s((r.operacion as Record<string, unknown>).nombre),
          }
        : undefined,
  };
}

/** Campos que un documento SERFOR necesita sí o sí (para el aviso "ficha incompleta"). */
export const CTP_FICHA_REQUIRED: (keyof CtpFicha)[] = [
  "nombreCtp",
  "codigoCtp",
  "ruc",
  "razonSocial",
];

/** ¿Faltan datos mínimos para emitir documentos con identidad legal? */
export function ctpFichaFaltantes(f: CtpFicha): (keyof CtpFicha)[] {
  return CTP_FICHA_REQUIRED.filter((k) => !s(f[k]));
}

/**
 * Los tipos de título habilitante — son exactamente las casillas del
 * **casillero (5)** de la GTF ("Origen del Recurso"). Single source: el select
 * del editor y la etiqueta de la vista de lectura leen de acá.
 */
export const CTP_TITULO_TIPOS: { value: string; label: string }[] = [
  { value: "concesion", label: "Concesión forestal" },
  { value: "permiso", label: "Permiso forestal" },
  { value: "autorizacion", label: "Autorización" },
  { value: "plantacion", label: "Plantación registrada" },
  { value: "dema", label: "DEMA (declaración de manejo)" },
  { value: "predio", label: "Predio privado" },
  { value: "otro", label: "Otro" },
];

/** Etiqueta legible de un tipo de título; devuelve el crudo si es uno viejo. */
export function tituloTipoLabel(tipo: string): string {
  return CTP_TITULO_TIPOS.find((x) => x.value === tipo)?.label ?? (tipo || "—");
}

/**
 * «Tipo de establecimiento» de la carátula (Anexo 1). Lista CERRADA a
 * propósito: la instrucción oficial dice *"consignar la identificación del
 * tipo de establecimiento registrada en SUNAT, según se detalla a
 * continuación"* y enumera exactamente estas siete. Un valor fuera de la lista
 * no lo acepta la ARFFS, así que acá el `select` es correcto (a diferencia del
 * plan de manejo, donde la nomenclatura varía por región y va como texto).
 */
export const CTP_TIPOS_ESTABLECIMIENTO = [
  "Casa Matriz",
  "Sucursal",
  "Agencia",
  "Local Comercial o de Servicio",
  "Sede Productiva",
  "Depósito o Almacén",
  "Oficina Administrativa",
] as const;

/** Uno de los siete tipos de establecimiento de SUNAT que acepta la carátula. */
export type TipoEstablecimientoCtp = (typeof CTP_TIPOS_ESTABLECIMIENTO)[number];

/**
 * ¿Parece un DNI? Ocho dígitos. El documento del representante legal va en la
 * carátula y en el pie de la GTF; con siete dígitos (un cero comido al pegar
 * de Excel) el fiscalizador no puede cruzarlo contra RENIEC.
 *
 * Devuelve `true` para un **carné de extranjería** (alfanumérico, 9-12): no se
 * puede verificar, y marcarlo en rojo enseñaría a ignorar el aviso. Sólo se
 * cuestiona lo que dice ser un DNI —puros dígitos— y no tiene ocho.
 */
export function dniValido(doc: string): boolean {
  const d = s(doc);
  if (!d) return true; // vacío no es inválido: es un campo que falta, y eso ya se avisa aparte
  if (!/^\d+$/.test(d)) return true; // CE / pasaporte: no hay regla que verificar
  return d.length === 8;
}

/** Las tres piezas de la coordenada UTM ya numéricas, o `null` si falta alguna. */
export interface CoordenadaUtm {
  este: number;
  norte: number;
  zona: number;
  /** Hemisferio sur (en Perú, siempre). */
  sur: boolean;
}

/** Lee `utmEste`/`utmNorte`/`utmZona` de la Ficha. `null` = incompleta, no cero. */
export function coordenadaUtmDeFicha(
  f: { utmEste?: string; utmNorte?: string; utmZona?: string } | null | undefined,
): CoordenadaUtm | null {
  const este = Number(s(f?.utmEste).replace(/[^\d.]/g, ""));
  const norte = Number(s(f?.utmNorte).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(este) || !Number.isFinite(norte) || este <= 0 || norte <= 0) return null;
  const { zone, south } = parseUtmZone(s(f?.utmZona) || "18S");
  return { este, norte, zona: zone, sur: south };
}

/** Caja que contiene al Perú continental con holgura (lat, lng en WGS84). */
const PERU_BBOX = { latMin: -18.6, latMax: 0.5, lngMin: -82.0, lngMax: -68.3 };

/**
 * La coordenada de la carátula convertida a lat/lng, o `null` si cae fuera del
 * Perú. No es un capricho geográfico: si el Este y el Norte se escriben
 * cambiados de lugar —el error más común al copiar de un GPS— la carátula
 * declara un establecimiento en medio del Atlántico y la línea se lee igual de
 * bien. Reusa la conversión del plano del LO-TH (`loth-utm`), no una propia.
 */
export function utmAGeograficas(c: CoordenadaUtm | null): { lat: number; lng: number } | null {
  if (!c) return null;
  if (c.zona < 17 || c.zona > 19) return null; // el Perú entra en las zonas 17, 18 y 19
  const [lat, lng] = fromUtm(c.este, c.norte, c.zona, c.sur);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < PERU_BBOX.latMin || lat > PERU_BBOX.latMax) return null;
  if (lng < PERU_BBOX.lngMin || lng > PERU_BBOX.lngMax) return null;
  return { lat, lng };
}

/**
 * La línea «Coordenadas UTM» tal como va en la carátula: `E 435126 N 8756846 ·
 * Zona 18S`. Vacío si falta alguna de las tres — media coordenada no se
 * imprime, se deja el casillero en blanco.
 */
export function coordenadasUtmLinea(
  f: { utmEste?: string; utmNorte?: string; utmZona?: string } | null | undefined,
): string {
  const c = coordenadaUtmDeFicha(f);
  if (!c || !s(f?.utmZona)) return "";
  return `E ${c.este} N ${c.norte} · Zona ${zoneLabel(c.zona, c.sur)}`;
}

/** Un dato que la Ficha necesita, agrupado por para qué sirve. */
export interface RequisitoFichaCtp {
  /** Etiqueta con la que lo pide el documento (la del Anexo 1, si es carátula). */
  label: string;
  /** Claves de la Ficha que lo llenan: todas tienen que estar para contarlo. */
  campos: (keyof CtpFicha)[];
  grupo: "caratula" | "documentos";
  /** La instrucción oficial de cómo se llena — se muestra como ayuda, textual. */
  comoSeLlena: string;
}

/**
 * **La carátula del Libro, campo por campo, en el orden del Anexo 1** de la
 * RDE N° D000025-2023-MIDAGRI-SERFOR-DE, más lo que necesitan los papeles que
 * el centro emite por su cuenta.
 *
 * Es la lista contra la que se mide "cuánto le falta a la Ficha": no una
 * selección nuestra de campos lindos. Lo que no está en el Anexo 1 no entra
 * acá (el logo está en el formato como *"en caso se cuente"*, así que no
 * cuenta como faltante).
 */
export const REQUISITOS_FICHA_CTP: RequisitoFichaCtp[] = [
  { grupo: "caratula", label: "N° Registro del libro de operaciones", campos: ["registroLibro"], comoSeLlena: "El número de registro que te dio la ARFFS para el libro. En el ejemplo oficial es «001»." },
  { grupo: "caratula", label: "Titular del centro de transformación primaria", campos: ["razonSocial"], comoSeLlena: "El nombre de la persona natural o jurídica según el registro de SUNAT." },
  { grupo: "caratula", label: "Representante legal", campos: ["representante"], comoSeLlena: "Si el titular es persona jurídica, van además los nombres y apellidos del representante legal." },
  { grupo: "caratula", label: "Documento del representante", campos: ["representanteDni"], comoSeLlena: "El número de documento de identidad del representante legal." },
  { grupo: "caratula", label: "N° de autorización o registro", campos: ["registroArffs"], comoSeLlena: "El número de autorización que dio la ARFFS para el establecimiento del centro." },
  { grupo: "caratula", label: "N° RUC", campos: ["ruc"], comoSeLlena: "El RUC del centro de transformación primaria." },
  { grupo: "caratula", label: "N° del establecimiento anexo", campos: ["establecimientoAnexo"], comoSeLlena: "El correlativo del local. Si tienes un solo establecimiento es siempre «001»." },
  { grupo: "caratula", label: "Tipo de establecimiento", campos: ["tipoEstablecimiento"], comoSeLlena: "El tipo con el que ese local figura en SUNAT (Sede Productiva, Casa Matriz, Sucursal…)." },
  { grupo: "caratula", label: "Domicilio", campos: ["direccion"], comoSeLlena: "La dirección física del establecimiento del centro." },
  { grupo: "caratula", label: "Departamento", campos: ["region"], comoSeLlena: "El departamento donde se ubica el establecimiento." },
  { grupo: "caratula", label: "Provincia", campos: ["provincia"], comoSeLlena: "La provincia donde se ubica el establecimiento." },
  { grupo: "caratula", label: "Distrito", campos: ["distrito"], comoSeLlena: "El distrito donde se ubica el establecimiento." },
  { grupo: "caratula", label: "Coordenadas UTM", campos: ["utmEste", "utmNorte", "utmZona"], comoSeLlena: "El Este, el Norte y la zona latitudinal del establecimiento (en el Perú, 17, 18 o 19 Sur)." },
  { grupo: "caratula", label: "Número de teléfono", campos: ["telefono"], comoSeLlena: "Teléfono fijo o móvil del establecimiento o del representante legal." },
  { grupo: "caratula", label: "Correo electrónico", campos: ["email"], comoSeLlena: "Correo del establecimiento o del representante legal." },
  { grupo: "documentos", label: "Nombre del CTP", campos: ["nombreCtp"], comoSeLlena: "Cómo se llama el centro. Encabeza el certificado de trazabilidad y el export del Libro." },
  { grupo: "documentos", label: "Código de CTP", campos: ["codigoCtp"], comoSeLlena: "El código que la ARFFS le asignó al centro." },
  { grupo: "documentos", label: "ARFFS competente", campos: ["arffs"], comoSeLlena: "La autoridad regional que te registró (ej. «GORE Ucayali · DRSAFFS»)." },
  { grupo: "documentos", label: "Serie GTF autorizada", campos: ["gtfSerie"], comoSeLlena: "La serie del talonario de guías de salida que autorizó la ARFFS." },
  { grupo: "documentos", label: "Título habilitante", campos: ["titulos"], comoSeLlena: "Al menos una concesión, permiso o autorización que ampare el origen de la materia prima." },
];

/** Cuánto de la Ficha está cargado y qué falta exactamente. */
export interface CompletitudFichaCtp {
  total: number;
  completos: number;
  /** Los requisitos sin llenar, en el orden del formato. */
  faltan: RequisitoFichaCtp[];
  /** 0-100, redondeado hacia abajo: 99 % nunca se lee como "listo". */
  pct: number;
}

/** ¿Está cargado este requisito? Todas sus claves con algo adentro. */
function requisitoCompleto(f: CtpFicha, r: RequisitoFichaCtp): boolean {
  return r.campos.every((k) => {
    const v = f[k];
    return Array.isArray(v) ? v.length > 0 : !!s(v);
  });
}

/**
 * Cuánto le falta a la Ficha, medido contra `REQUISITOS_FICHA_CTP`. `grupo` acota
 * la cuenta a la carátula o a los papeles propios del centro.
 *
 * Es la MISMA lista que alimenta el aviso «la carátula sale con casilleros en
 * blanco» de `avisosDeFicha` — el indicador y el aviso no pueden discrepar.
 */
export function completitudFichaCtp(f: CtpFicha, grupo?: RequisitoFichaCtp["grupo"]): CompletitudFichaCtp {
  const lista = grupo ? REQUISITOS_FICHA_CTP.filter((r) => r.grupo === grupo) : REQUISITOS_FICHA_CTP;
  const faltan = lista.filter((r) => !requisitoCompleto(f, r));
  const completos = lista.length - faltan.length;
  return {
    total: lista.length,
    completos,
    faltan,
    pct: lista.length === 0 ? 100 : Math.floor((completos / lista.length) * 100),
  };
}

/** Cómo se nombra cada campo en pantalla y en los avisos. Single source: el
 *  editor, la vista de lectura y los avisos leen de acá (si no, el mismo campo
 *  se llama distinto en cada lugar y el operador no sabe qué tiene que llenar). */
export const CTP_FICHA_LABELS: Record<keyof CtpFicha, string> = {
  operacion: "Operación",
  nombreCtp: "Nombre del CTP",
  codigoCtp: "Código de CTP",
  ruc: "RUC",
  razonSocial: "Razón social",
  arffs: "ARFFS competente",
  // Los nombres de la carátula son los del Anexo 1 al pie de la letra: el
  // operador los va a buscar tal cual en el formato que le pide la ARFFS.
  registroArffs: "N° de autorización o registro",
  registroArffsFecha: "Fecha de registro",
  registroLibro: "N° Registro del libro de operaciones",
  establecimientoAnexo: "N° del establecimiento anexo",
  tipoEstablecimiento: "Tipo de establecimiento",
  utmEste: "Coordenada UTM Este (E)",
  utmNorte: "Coordenada UTM Norte (N)",
  utmZona: "Zona UTM",
  titulos: "Títulos habilitantes",
  citesPermisos: "Permisos CITES",
  representante: "Representante legal",
  representanteDni: "DNI / CE del representante",
  direccion: "Dirección",
  region: "Región",
  provincia: "Provincia",
  distrito: "Distrito",
  ubigeo: "Ubigeo",
  telefono: "Teléfono",
  email: "Email",
  gtfSerie: "Serie GTF autorizada",
  logo: "Logo del CTP",
};

/**
 * Lo que un PERMISO (`ForestContrato`, ADR-421/425) aporta al título de la guía.
 *
 * Estructural y no el `Contrato` entero: cualquier contrato lo satisface, y los
 * tests —y la vista previa— pueden armar el caso con cuatro campos.
 */
export type PermisoDeGuia = Pick<Contrato, "codigo" | "tipo" | "resolucionNumero" | "vigenciaHasta"> &
  Partial<Pick<Contrato, "isActive">>;

/**
 * Del tipo de permiso a la casilla del (5) «Origen del Recurso».
 *
 * Sólo las correspondencias que la norma fija: un permiso de aprovechamiento
 * —en comunidad (`PER-FMC`) o en predio privado (`PER-FMP`)— cruza «Permiso»,
 * una concesión cruza «Concesión» y un registro de plantación cruza
 * «Plantación». Lo que no está acá —«CONTRATO» (una compraventa no habilita a
 * nadie a talar), «otro», o el tipo sin cargar— **no cruza ninguna casilla**:
 * el (5) es una declaración de origen y marcarlo de más es inventarlo.
 */
const ORIGEN_POR_TIPO_DE_PERMISO: Partial<Record<TipoContrato, string>> = {
  CONCESION: "concesion",
  "PER-FMP": "permiso",
  "PER-FMC": "permiso",
  "REG-PLT": "plantacion",
};

function origenDelPermiso(tipo: TipoContrato | null | undefined): string {
  if (!tipo) return "";
  const directo = ORIGEN_POR_TIPO_DE_PERMISO[tipo];
  if (directo) return directo;
  /* Hay permisos cargados con el nombre del DOCUMENTO de gestión (DEMA, PMFI,
     PO) en vez del título que lo ampara. Se traduce con la tabla que ya existe
     y está probada (`tipoPermisoDesdePlan`), no adivinando de nuevo acá. */
  const comoPlan = TIPOS_PLAN.find((p) => p === tipo);
  const titulo = comoPlan ? tipoPermisoDesdePlan(comoPlan) : null;
  return (titulo && ORIGEN_POR_TIPO_DE_PERMISO[titulo]) || "";
}

/**
 * El (9) «Plan de Manejo (Tipo)» que le corresponde al permiso, escrito como se
 * lee en el `<select>` de la guía.
 *
 * Gemelo de `planDelPermiso` en `titulos-de-la-guia.ts` (lo que se ofrece en
 * pantalla) — el test «el papel escribe el (9) igual que el select» compara las
 * dos salidas para los nueve tipos, así que si una cambia la otra se entera.
 */
function planDelPermiso(tipo: TipoContrato | null | undefined): string {
  const plan = tipoPlanDesdePermiso(tipo);
  if (!plan) return "";
  const meta = TIPOS_PLAN_META[plan];
  // «Plantación» no es un acrónimo: repetirla entre paréntesis se lee raro.
  return meta.sigla === meta.sigla.toUpperCase() ? `${meta.nombre} (${meta.sigla})` : meta.nombre;
}

/**
 * El permiso, leído como el título habilitante que imprime la GTF.
 *
 * **No completa nada**: lo que el permiso no tiene cargado sale vacío y el
 * casillero queda en blanco para llenarlo a mano. Medido el 2026-09-21 en los
 * dos tenants, 6 de 6 permisos están sin `resolucionNumero` — ese (8) en blanco
 * es el resultado correcto, y rellenarlo con la resolución de otro papel sería
 * declarar un origen falso en un documento que es declaración jurada.
 */
export function tituloDesdePermiso(c: PermisoDeGuia): CtpTituloHabilitante {
  return {
    tipo: origenDelPermiso(c.tipo),
    // El código, tal cual lo escribió quien cargó el permiso.
    codigo: s(c.codigo),
    resolucion: s(c.resolucionNumero),
    planManejo: planDelPermiso(c.tipo),
    // `vigenciaHasta` viaja como ISO completo; el título lo guarda date-only.
    vencimiento: s(c.vigenciaHasta).slice(0, 10),
  };
}

/** El permiso cargado con ESE código. Se compara por código normalizado —la
 *  misma vara del selector— y, si el código se volvió a cargar después de una
 *  baja, gana el permiso vivo. */
function permisoDelCodigo(
  permisos: readonly PermisoDeGuia[] | null | undefined,
  codigo: string,
): PermisoDeGuia | null {
  const k = normalizarCodigoContrato(codigo);
  if (!k) return null;
  const iguales = (permisos ?? []).filter((p) => normalizarCodigoContrato(s(p?.codigo)) === k);
  return iguales.find((p) => p.isActive !== false) ?? iguales[0] ?? null;
}

/**
 * El título habilitante que se imprime en la GTF de salida — casilleros (5)
 * origen, (6) N° de título, (8) resolución y (9) plan de manejo.
 *
 * **Manda el que se eligió en la guía** (`GtfDatos.titulos[0]`, el select del
 * formulario): esa madera salió de ESE permiso. La Ficha sólo aporta el resto
 * de los datos del título — resolución y plan de manejo— buscándolo por código.
 *
 * Sin `codigoElegido` (la vista previa de la Ficha, una guía vieja sin el campo)
 * cae al primero de la lista, que es el que la Ficha marca como predeterminado.
 *
 * ── Dos fuentes, en este orden ───────────────────────────────────────────────
 * 1. **La Ficha del CTP** (`titulos[]`) — es la fuente declarada del libro y la
 *    que manda cuando el código está en las dos: se devuelve tal cual está
 *    cargada, sin completarle nada.
 * 2. **Los permisos** (`ForestContrato`, ADR-421/425), si se pasan. Desde que
 *    el select ofrece las dos listas, el operador puede elegir un permiso que
 *    la Ficha no tiene: medido el 2026-09-21 en el tenant de QA, la Ficha
 *    declaraba 1 título y los permisos eran 6, así que cinco elecciones válidas
 *    imprimían (5)(8)(9) en blanco teniendo el dato al lado.
 *
 * Si el código no está en ninguna de las dos —se tipeó a mano en el campo
 * libre— se imprime igual, con los casilleros (8) y (9) vacíos: el papel tiene
 * que declarar lo que el operador eligió, y un casillero en blanco se ve;
 * imprimir los datos de OTRO título sería declarar un origen falso.
 */
export function tituloDeGuia(
  f: { titulos?: CtpTituloHabilitante[] } | null | undefined,
  codigoElegido?: string | null,
  permisos?: readonly PermisoDeGuia[] | null,
): CtpTituloHabilitante | null {
  const titulos = f?.titulos ?? [];
  const cod = s(codigoElegido).toLowerCase();
  if (!cod) return titulos[0] ?? null;
  const enFicha = titulos.find((t) => s(t.codigo).toLowerCase() === cod);
  if (enFicha) return enFicha;
  const permiso = permisoDelCodigo(permisos, s(codigoElegido));
  if (permiso) return tituloDesdePermiso(permiso);
  return { tipo: "", codigo: s(codigoElegido), resolucion: "", planManejo: "", vencimiento: "" };
}

/**
 * ¿El RUC es un RUC? 11 dígitos, prefijo de tipo de contribuyente conocido y
 * **dígito verificador módulo 11** (el algoritmo de SUNAT). Un RUC con un dígito
 * cambiado pasa cualquier `length === 11` y sale impreso en la GTF; el
 * fiscalizador lo cruza contra SUNAT y el documento queda observado.
 */
export function rucValido(ruc: string): boolean {
  const d = s(ruc);
  if (!/^\d{11}$/.test(d)) return false;
  if (!["10", "15", "16", "17", "20"].includes(d.slice(0, 2))) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(d[i]), 0);
  const resto = 11 - (suma % 11);
  const dv = resto === 10 ? 0 : resto === 11 ? 1 : resto;
  return dv === Number(d[10]);
}

/** `YYYY-MM-DD` → "12 ago 2026". `timeZone:"UTC"`: las fechas date-only no
 *  tienen hora, y con la de Lima (UTC−5) se leen un día antes. */
export function fechaCortaUTC(iso: string): string {
  const v = s(iso);
  if (!v) return "";
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Días que le quedan a una fecha `YYYY-MM-DD` (negativo = ya venció). */
export function diasParaVencer(iso: string, ahora: number = Date.now()): number | null {
  const v = s(iso);
  if (!v) return null;
  const d = new Date(`${v}T23:59:59`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((d.getTime() - ahora) / 86_400_000);
}

/** Un documento oficial del CTP y los campos de la Ficha que consume. */
export interface DocumentoCtp {
  clave: "gtf" | "certificado" | "libro";
  nombre: string;
  /** Campos de la Ficha que el generador lee. Verificado contra el código que
   *  arma cada documento — no es una lista de deseos. */
  campos: (keyof CtpFicha)[];
  /** ¿Necesita además un título habilitante cargado? (la GTF sí: casilleros 5/6/8/9) */
  necesitaTitulo?: boolean;
}

/**
 * Qué necesita cada papel. Salió de leer los generadores:
 * `ctp-gtf-formato.ts` (casilleros), `ctp-certificado.ts` (emisor) y
 * `ctp-informe.ts` / `ctp-export.ts` (encabezado del Libro).
 */
export const DOCUMENTOS_CTP: DocumentoCtp[] = [
  {
    clave: "gtf",
    nombre: "GTF de salida",
    campos: ["razonSocial", "representante", "gtfSerie", "region", "provincia", "distrito"],
    necesitaTitulo: true,
  },
  {
    clave: "certificado",
    nombre: "Certificado de trazabilidad",
    campos: ["nombreCtp", "codigoCtp", "ruc", "razonSocial", "direccion"],
  },
  {
    clave: "libro",
    nombre: "Libro de Operaciones (export)",
    campos: ["nombreCtp", "codigoCtp", "ruc", "razonSocial", "arffs"],
  },
];

/** Un documento y los campos que le faltan a la Ficha para salir completo. */
export interface FaltanteDeDocumento {
  documento: DocumentoCtp;
  /** Labels legibles de lo que falta (incluye "título habilitante" si aplica). */
  faltan: string[];
}

/** Por documento: qué le falta. Vacío = ese papel sale completo. */
export function requisitosFaltantes(f: CtpFicha): FaltanteDeDocumento[] {
  return DOCUMENTOS_CTP.map((documento) => {
    const faltan = documento.campos.filter((k) => !s(f[k])).map((k) => CTP_FICHA_LABELS[k]);
    if (documento.necesitaTitulo && !tituloDeGuia(f)) faltan.push("título habilitante");
    return { documento, faltan };
  }).filter((x) => x.faltan.length > 0);
}

export type NivelAviso = "critico" | "aviso";

/** Un problema de la Ficha, en el idioma del que va a tener que resolverlo. */
export interface AvisoFicha {
  clave: string;
  nivel: NivelAviso;
  titulo: string;
  /** Qué pasa si no se arregla — la consecuencia, no la regla. */
  detalle: string;
}

/**
 * Todo lo que está mal en la Ficha, ordenado por gravedad.
 *
 * Criterio de nivel: **crítico** = un documento saldría con un dato falso o
 * inválido (título vencido, identidad incompleta). **aviso** = sale, pero con
 * un hueco o con poco tiempo. CITES nunca es crítico: tener una especie CITES
 * es legal con permiso, y un score que castiga lo incorregible enseña a
 * ignorarlo (ver `ctp-compliance.ts`).
 */
export function avisosDeFicha(f: CtpFicha, ahora: number = Date.now()): AvisoFicha[] {
  const out: AvisoFicha[] = [];
  const nombreTitulo = (t: CtpTituloHabilitante) => t.codigo || t.tipo || "sin código";

  for (const t of f.titulos) {
    const dias = diasParaVencer(t.vencimiento, ahora);
    if (dias == null) continue;
    if (dias < 0) {
      out.push({
        clave: `titulo-vencido:${nombreTitulo(t)}`,
        nivel: "critico",
        titulo: `Título habilitante vencido: ${nombreTitulo(t)}`,
        detalle: `Venció el ${fechaCortaUTC(t.vencimiento)} (hace ${Math.abs(dias)} días). El origen de la madera que ampara ya no está vigente: renueva el título o sácalo de la Ficha antes de emitir una guía que lo declare.`,
      });
    } else if (dias <= 30) {
      out.push({
        clave: `titulo-por-vencer:${nombreTitulo(t)}`,
        nivel: "aviso",
        titulo: `Título ${nombreTitulo(t)} vence en ${dias} ${dias === 1 ? "día" : "días"}`,
        detalle: `Vence el ${fechaCortaUTC(t.vencimiento)}. La renovación ante la ARFFS no es inmediata: empieza el trámite ahora.`,
      });
    }
  }

  for (const t of f.titulos) {
    if (s(t.vencimiento)) continue;
    out.push({
      clave: `titulo-sin-vencimiento:${nombreTitulo(t)}`,
      nivel: "aviso",
      titulo: `El título ${nombreTitulo(t)} no tiene fecha de vencimiento`,
      detalle:
        "Sin esa fecha nadie te va a avisar cuando caduque, y un título vencido invalida el origen de la madera que ampara. Cárgala desde la resolución que lo aprobó.",
    });
  }

  const guia = tituloDeGuia(f);
  if (guia) {
    const huecos: string[] = [];
    if (!s(guia.resolucion)) huecos.push("(8) N° de resolución");
    if (!s(guia.planManejo)) huecos.push("(9) Plan de manejo");
    if (huecos.length > 0) {
      out.push({
        clave: "gtf-casilleros",
        nivel: "aviso",
        titulo: `La GTF sale con ${huecos.length === 1 ? "un casillero vacío" : "casilleros vacíos"}`,
        detalle: `El título ${nombreTitulo(guia)} es el que la guía de salida toma por defecto y no tiene ${huecos.join(" ni ")}. Esos casilleros salen en blanco en cada guía que lo declare.`,
      });
    }
  }

  for (const p of f.citesPermisos) {
    const dias = diasParaVencer(p.vencimiento, ahora);
    if (dias == null || dias >= 0) continue;
    out.push({
      clave: `cites-vencido:${p.especie || p.numero}`,
      nivel: "aviso",
      titulo: `Permiso CITES vencido: ${p.especie || p.numero || "—"}`,
      detalle: `Venció el ${fechaCortaUTC(p.vencimiento)}. Tener una especie CITES es legal con permiso vigente; con el permiso caído el respaldo queda débil ante un fiscalizador.`,
    });
  }

  if (s(f.representanteDni) && !dniValido(f.representanteDni)) {
    out.push({
      clave: "dni-invalido",
      nivel: "aviso",
      titulo: "El documento del representante no tiene 8 dígitos",
      detalle: `«${f.representanteDni}» va en la carátula del Libro y al pie de la guía de salida. Un DNI son 8 dígitos: si es un carné de extranjería, escríbelo con su letra para que no se lea como un DNI incompleto.`,
    });
  }

  const utm = coordenadaUtmDeFicha(f);
  if (utm && s(f.utmZona) && !utmAGeograficas(utm)) {
    out.push({
      clave: "utm-fuera-del-peru",
      nivel: "aviso",
      titulo: "Las coordenadas UTM caen fuera del Perú",
      detalle: `E ${utm.este} · N ${utm.norte} · zona ${zoneLabel(utm.zona, utm.sur)} no ubica el establecimiento en el país. Revisa que el Este y el Norte no estén cambiados de lugar y que la zona sea 17, 18 o 19.`,
    });
  }

  if (s(f.ruc) && !rucValido(f.ruc)) {
    out.push({
      clave: "ruc-invalido",
      nivel: "aviso",
      titulo: "El RUC no pasa la verificación de SUNAT",
      detalle: `${f.ruc} no cumple el dígito verificador. Sale impreso en el certificado y en el Libro: revísalo antes de emitir.`,
    });
  }

  const faltanBase = ctpFichaFaltantes(f);
  if (faltanBase.length > 0) {
    out.push({
      clave: "identidad-incompleta",
      nivel: "critico",
      titulo: "Identidad legal incompleta",
      detalle: `Falta ${faltanBase.map((k) => CTP_FICHA_LABELS[k]).join(", ")}. Sin eso, el certificado y el export del Libro salen sin identificar al centro.`,
    });
  }

  // La carátula del Libro (Anexo 1) es UNA cosa: un aviso con todo lo que le
  // falta, no quince. Se saca lo que ya nombró «identidad incompleta» para no
  // decir dos veces el mismo campo (mismo criterio que los avisos por documento).
  // Se cruza por CLAVE de la Ficha, no por etiqueta: la carátula llama "N° RUC"
  // a lo que el aviso de identidad llama "RUC", y comparar textos dejaba pasar
  // el duplicado.
  const yaNombrados = new Set<keyof CtpFicha>(faltanBase);
  const caratula = completitudFichaCtp(f, "caratula");
  const faltanCaratula = caratula.faltan
    .filter((r) => !r.campos.some((k) => yaNombrados.has(k)))
    .map((r) => r.label);
  if (faltanCaratula.length > 0) {
    out.push({
      clave: "caratula-incompleta",
      nivel: "aviso",
      titulo: `La carátula del Libro sale con ${faltanCaratula.length} ${faltanCaratula.length === 1 ? "campo" : "campos"} en blanco`,
      detalle: `El Anexo 1 de la RDE D000025-2023 pide ${caratula.total} datos y tienes ${caratula.completos}. Falta ${faltanCaratula.join(", ")}. La ARFFS recibe esa carátula al frente de los Cuadros Resumen todos los meses.`,
    });
  }

  for (const { documento, faltan } of requisitosFaltantes(f)) {
    if (documento.clave === "certificado" || documento.clave === "libro") {
      // Los mínimos ya los cubre "identidad incompleta"; acá sólo el resto.
      const extra = faltan.filter((x) => !faltanBase.map((k) => CTP_FICHA_LABELS[k]).includes(x));
      if (extra.length === 0) continue;
      out.push({
        clave: `doc:${documento.clave}`,
        nivel: "aviso",
        titulo: `${documento.nombre}: falta ${extra.join(", ")}`,
        detalle: "El documento se emite igual, pero con ese dato en blanco.",
      });
      continue;
    }
    out.push({
      clave: `doc:${documento.clave}`,
      nivel: "aviso",
      titulo: `${documento.nombre}: falta ${faltan.join(", ")}`,
      detalle:
        faltan.length === 1
          ? "Cada guía que emitas va a salir con ese casillero vacío."
          : "Cada guía que emitas va a salir con esos casilleros vacíos.",
    });
  }

  return out.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "critico" ? -1 : 1));
}

/**
 * ¿Dos nombres de especie se refieren a la misma? El permiso CITES suele decir
 * "Caoba" y la línea "caoba (Swietenia macrophylla)", así que se compara sin
 * mayúsculas y por contención en cualquiera de los dos sentidos.
 *
 * Single source: lo usan el aviso "CITES sin permiso" del Excel y el autollenado
 * del N° de permiso en la guía de salida. Si el criterio cambia, cambia acá.
 */
export function especieCoincide(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
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
export function estadoVencimiento(
  vencimiento: string,
  ahora: number = Date.now(),
): EstadoVencimiento | null {
  const dias = diasParaVencer(vencimiento, ahora);
  if (dias == null) return null;
  if (dias < 0) return "vencido";
  if (dias <= 30) return "por_vencer";
  return "vigente";
}

/** Títulos habilitantes y permisos CITES vencidos o por vencer, con etiqueta legible. */
export interface DocumentosVencimiento {
  vencidosLabels: string[];
  porVencerLabels: string[];
}

/** Lo que la Ficha declara con fecha de caducidad, ya listo para proyectar. */
export interface DocumentoDeFicha {
  /** Cómo se lo nombra en pantalla: el código si lo tiene, si no el tipo. */
  label: string;
  /** `yyyy-mm-dd`, o `""` si no está cargada — no se inventa. */
  vencimiento: string;
}

/**
 * Los documentos de la Ficha en forma estructurada (título + CITES).
 *
 * `documentosVencimientoDeFicha` (abajo) devuelve etiquetas ya cocinadas para
 * mostrar; esto devuelve el dato, que es lo que necesita quien va a PROYECTAR
 * sobre él (`ctp-anticipa.ts`). Las dos comparten cómo se nombra un documento
 * para que la campana y el panel no lo llamen distinto.
 */
export function documentosDeFicha(
  ficha:
    | {
        citesPermisos?: { especie: string; vencimiento?: string }[];
        titulos?: { tipo: string; codigo: string; vencimiento?: string }[];
      }
    | null
    | undefined,
): DocumentoDeFicha[] {
  return [
    ...(ficha?.citesPermisos ?? []).map((p) => ({
      label: `CITES ${p.especie || "—"}`,
      vencimiento: (p.vencimiento ?? "").trim(),
    })),
    ...(ficha?.titulos ?? []).map((t) => ({
      label: t.codigo || t.tipo || "título",
      vencimiento: (t.vencimiento ?? "").trim(),
    })),
  ];
}

/**
 * Un título habilitante o permiso CITES vencido invalida el origen legal de
 * TODA la madera que ampara — no un caso puntual. Single source entre el
 * panel de Cumplimiento (`use-ctp-compliance.ts`, cliente) y el cron
 * `forestal-plazos` (servidor, pasa `ahora` explícito): antes esta cuenta
 * sólo vivía en el hook cliente, así que el vencido no disparaba WhatsApp ni
 * quedaba en la campana — sólo se veía si alguien entraba a mirar el panel.
 */
export function documentosVencimientoDeFicha(
  ficha:
    | {
        citesPermisos?: { especie: string; vencimiento?: string }[];
        titulos?: { tipo: string; codigo: string; vencimiento?: string }[];
      }
    | null
    | undefined,
  ahora: number = Date.now(),
): DocumentosVencimiento {
  const vencidosLabels: string[] = [];
  const porVencerLabels: string[] = [];

  for (const p of ficha?.citesPermisos ?? []) {
    const estado = estadoVencimiento(p.vencimiento ?? "", ahora);
    if (estado === "vencido") vencidosLabels.push(`CITES ${p.especie || "—"}`);
    else if (estado === "por_vencer") {
      const dias = diasParaVencer(p.vencimiento ?? "", ahora) ?? 0;
      porVencerLabels.push(`CITES ${p.especie || "—"} (${dias} ${dias === 1 ? "día" : "días"})`);
    }
  }
  for (const t of ficha?.titulos ?? []) {
    const estado = estadoVencimiento(t.vencimiento ?? "", ahora);
    if (estado === "vencido") vencidosLabels.push(t.codigo || t.tipo || "título");
    else if (estado === "por_vencer") {
      const dias = diasParaVencer(t.vencimiento ?? "", ahora) ?? 0;
      porVencerLabels.push(
        `${t.codigo || t.tipo || "título"} (${dias} ${dias === 1 ? "día" : "días"})`,
      );
    }
  }

  return { vencidosLabels, porVencerLabels };
}
