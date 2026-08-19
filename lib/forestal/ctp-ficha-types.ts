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

/** Cómo se nombra cada campo en pantalla y en los avisos. Single source: el
 *  editor, la vista de lectura y los avisos leen de acá (si no, el mismo campo
 *  se llama distinto en cada lugar y el operador no sabe qué tiene que llenar). */
export const CTP_FICHA_LABELS: Record<keyof CtpFicha, string> = {
  nombreCtp: "Nombre del CTP", codigoCtp: "Código de CTP", ruc: "RUC", razonSocial: "Razón social",
  arffs: "ARFFS competente", registroArffs: "N° de registro ARFFS", registroArffsFecha: "Fecha de registro",
  titulos: "Títulos habilitantes", citesPermisos: "Permisos CITES",
  representante: "Representante legal", representanteDni: "DNI / CE del representante",
  direccion: "Dirección", region: "Región", provincia: "Provincia", distrito: "Distrito", ubigeo: "Ubigeo",
  telefono: "Teléfono", email: "Email", gtfSerie: "Serie GTF autorizada", logo: "Logo del CTP",
};

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
 * Si el código elegido NO está en la Ficha —se tipeó a mano en el campo libre—
 * se imprime igual, con los casilleros (8) y (9) vacíos: el papel tiene que
 * declarar lo que el operador eligió, y un casillero en blanco se ve; imprimir
 * los datos de OTRO título sería declarar un origen falso.
 */
export function tituloDeGuia(
  f: { titulos?: CtpTituloHabilitante[] } | null | undefined,
  codigoElegido?: string | null,
): CtpTituloHabilitante | null {
  const titulos = f?.titulos ?? [];
  const cod = s(codigoElegido).toLowerCase();
  if (!cod) return titulos[0] ?? null;
  const enFicha = titulos.find((t) => s(t.codigo).toLowerCase() === cod);
  if (enFicha) return enFicha;
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
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
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
  { clave: "certificado", nombre: "Certificado de trazabilidad", campos: ["nombreCtp", "codigoCtp", "ruc", "razonSocial", "direccion"] },
  { clave: "libro", nombre: "Libro de Operaciones (export)", campos: ["nombreCtp", "codigoCtp", "ruc", "razonSocial", "arffs"] },
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
        detalle: `Venció el ${fechaCortaUTC(t.vencimiento)} (hace ${Math.abs(dias)} días). El origen de la madera que ampara ya no está vigente: renová el título o sacalo de la Ficha antes de emitir una guía que lo declare.`,
      });
    } else if (dias <= 30) {
      out.push({
        clave: `titulo-por-vencer:${nombreTitulo(t)}`,
        nivel: "aviso",
        titulo: `Título ${nombreTitulo(t)} vence en ${dias} ${dias === 1 ? "día" : "días"}`,
        detalle: `Vence el ${fechaCortaUTC(t.vencimiento)}. La renovación ante la ARFFS no es inmediata: empezá el trámite ahora.`,
      });
    }
  }

  for (const t of f.titulos) {
    if (s(t.vencimiento)) continue;
    out.push({
      clave: `titulo-sin-vencimiento:${nombreTitulo(t)}`,
      nivel: "aviso",
      titulo: `El título ${nombreTitulo(t)} no tiene fecha de vencimiento`,
      detalle: "Sin esa fecha nadie te va a avisar cuando caduque, y un título vencido invalida el origen de la madera que ampara. Cargala desde la resolución que lo aprobó.",
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

  if (s(f.ruc) && !rucValido(f.ruc)) {
    out.push({
      clave: "ruc-invalido",
      nivel: "aviso",
      titulo: "El RUC no pasa la verificación de SUNAT",
      detalle: `${f.ruc} no cumple el dígito verificador. Sale impreso en el certificado y en el Libro: revisalo antes de emitir.`,
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
      detalle: faltan.length === 1
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
export function estadoVencimiento(vencimiento: string, ahora: number = Date.now()): EstadoVencimiento | null {
  const dias = diasParaVencer(vencimiento, ahora);
  if (dias == null) return null;
  if (dias < 0) return "vencido";
  if (dias <= 30) return "por_vencer";
  return "vigente";
}
