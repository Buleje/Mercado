/**
 * lib/forestal/loth-plan-papeles.ts — «Papeles del permiso»: qué te pueden
 * pedir según el TIPO de plan, qué ya está en su carpeta del Archivo y qué
 * falta o venció.
 *
 * Brandon (24-10): «abres el plan 096 y ves "Resolución ✓ · Acta de la
 * comunidad: falta · Regente: falta"». La lista sale de la norma, no de la
 * costumbre: cada papel dice de dónde sale (`fuente`). Lo que la norma pide
 * sólo en algunos casos va como «según el caso» y NO entra en la cuenta
 * «4 de 7»: una cuenta que exige lo que no corresponde enseña a ignorarla.
 *
 * Dónde vive cada papel: en las carpetas del plan (ADR-467, etiqueta
 * `plan:<id>`). Un papel cuenta como presente si hay un archivo
 *   · con su etiqueta `papel:<clave>` (lo pone «Subir» de esta lista), o
 *   · en uno de los casilleros de la plantilla que ya lo representan
 *     (la «Resolución o constancia de registro» de la carpeta Resolución).
 * El vencimiento es `Document.expiresAt`: el MISMO dato del filtro «Por
 * vencer», del aviso del inicio y del cron `documentos-vencimiento`. Esta
 * lista no avisa por su cuenta: lo que se anota acá avisa por el camino de
 * siempre.
 *
 * PURO: sin React, sin fetch, sin Prisma. Lo usan la pestaña, la ruta y el
 * semáforo del plan (`resumenParaSemaforo`).
 */
import { metaDe, plazoInformeEjecucion, type TipoPlan } from "@/lib/forestal/loth-tipos-plan";
import { DIAS_VENCE_PRONTO, type ArchivoConCandado, type PlanDocumentosVista } from "@/lib/forestal/plan-documentos-tipos";

// ── Las fuentes (una vez, citadas igual en todas las filas) ─────────────────
const LEY = "Ley 29763, Ley Forestal y de Fauna Silvestre";
const RGF = "D.S. 018-2015-MINAGRI, Reglamento para la Gestión Forestal";
const RPL = "D.S. 020-2015-MINAGRI, Reglamento para la Gestión de las Plantaciones Forestales y los Sistemas Agroforestales";
const RCC = "D.S. 021-2015-MINAGRI, Reglamento para la Gestión Forestal y de Fauna Silvestre en Comunidades Nativas y Comunidades Campesinas";
const RNPF = "Lineamientos del Registro Nacional de Plantaciones Forestales (SERFOR), documentación sustentatoria";
const OSINFOR = "RJ 001-2018-OSINFOR, directiva de supervisión: informe de ejecución en 45 días";
const GTF = "Ley 29763, art. 124: la guía de transporte forestal ampara cada traslado";

/** Claves estables: van a la etiqueta `papel:<clave>` del documento. */
export const CLAVES_PAPEL = [
  "titulo",
  "resolucion",
  "plan-aprobado",
  "comunidad",
  "representante",
  "mapa",
  "autorizacion-uso",
  "regente",
  "informe",
  "gtf",
] as const;
export type ClavePapel = (typeof CLAVES_PAPEL)[number];

export const PREFIJO_TAG_PAPEL = "papel:";
export const tagPapel = (clave: ClavePapel): string => `${PREFIJO_TAG_PAPEL}${clave}`;
/** La clave de papel de un documento, leída de sus etiquetas, o null. */
export function papelDeEtiquetas(tags: readonly string[] | null | undefined): ClavePapel | null {
  for (const t of tags ?? []) {
    if (!t.startsWith(PREFIJO_TAG_PAPEL)) continue;
    const c = t.slice(PREFIJO_TAG_PAPEL.length).trim();
    if ((CLAVES_PAPEL as readonly string[]).includes(c)) return c as ClavePapel;
  }
  return null;
}

/* Casilleros de la plantilla sugerida (`SEMILLA_CARPETAS_PLAN`): su clave sale
   del nombre (`claveDesdeNombre`) y no cambia aunque el negocio lo renombre. */
const CAS_RESOLUCION = "resolucion-o-constancia-de-registro";
const CAS_TITULO = "titulo-de-propiedad-o-constancia-de-pose";
const CAS_REPRESENTANTE = ["dni-del-jefe-o-representante", "vigencia-de-poder", "acta-de-eleccion-o-asamblea"] as const;

export type Exigencia = "siempre" | "segun_caso";

export interface PapelRequerido {
  clave: ClavePapel;
  nombre: string;
  /** Qué es y cuándo se pide, para el ⓘ. */
  ayuda: string;
  /** La norma de donde sale el pedido. */
  fuente: string;
  exigencia: Exigencia;
  /** Carpeta del plan (clave de la plantilla) donde «Subir» lo deja. */
  carpeta: string;
  /** Casilleros de la plantilla que ya lo representan: un archivo ahí también cuenta. */
  casilleros: readonly string[];
  /** false = no se sube acá (las GTF se archivan solas por permiso). */
  subible: boolean;
  /** Último día para presentarlo (AAAA-MM-DD), si la norma pone plazo. */
  plazo: string | null;
}

/** Lo del plan que decide qué papeles corresponden. */
export interface PlanParaPapeles {
  planType: string;
  titularName?: string | null;
  propietarioNombre?: string | null;
  vigenciaHasta?: string | null;
}

/**
 * Tierra de una comunidad nativa o campesina, por el nombre del titular o del
 * propietario («COMUNIDAD NATIVA SAN LUIS…», «CC.NN. …», «C.N. …», «Comunidad
 * Campesina …»). Ahí el aprovechamiento pasa por el acuerdo de la asamblea.
 */
export function esTierraComunal(...nombres: (string | null | undefined)[]): boolean {
  return nombres.some((n) => {
    const t = (n ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
    return /\bCOMUNIDAD\s+(NATIVA|CAMPESINA)\b|\bCC\.?\s?NN\b|\bC\.\s?N\.(?=\s)|\bCC\.?\s?CC\b/.test(t);
  });
}

const normal = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toUpperCase();

const papel = (p: Omit<PapelRequerido, "subible" | "plazo"> & Partial<Pick<PapelRequerido, "subible" | "plazo">>): PapelRequerido => ({
  subible: true,
  plazo: null,
  ...p,
});

/**
 * Los papeles que pide ESTE plan, en el orden en que se piden. `hoy` =
 * `limaDateKey()` (decide si el informe de ejecución ya corre).
 */
export function papelesDeTipo(plan: PlanParaPapeles, hoy: string): PapelRequerido[] {
  const tipo = metaDe(plan.planType).key as TipoPlan;
  const comunal = esTierraComunal(plan.titularName, plan.propietarioNombre);

  if (tipo === "PLANTACION") {
    const otroDueno =
      Boolean(plan.propietarioNombre?.trim()) && Boolean(plan.titularName?.trim()) && normal(plan.propietarioNombre) !== normal(plan.titularName);
    const lista: PapelRequerido[] = [
      papel({
        clave: "resolucion",
        nombre: "Certificado de inscripción en el registro",
        ayuda: "El certificado o constancia de inscripción en el Registro Nacional de Plantaciones Forestales: es el papel que ampara la plantación.",
        fuente: RPL,
        exigencia: "siempre",
        carpeta: "resolucion",
        casilleros: [CAS_RESOLUCION],
      }),
      papel({
        clave: "titulo",
        nombre: "Título de propiedad o posesión del predio",
        ayuda: "El título, la partida registral o el documento que acredita la posesión del área plantada.",
        fuente: RNPF,
        exigencia: "siempre",
        carpeta: "titulos",
        casilleros: [CAS_TITULO],
      }),
      papel({
        clave: "mapa",
        nombre: "Mapa o croquis de ubicación",
        ayuda: "El mapa o croquis del predio y del área de la plantación, con sus coordenadas.",
        fuente: RNPF,
        exigencia: "siempre",
        carpeta: "otros",
        casilleros: [],
      }),
    ];
    if (comunal) {
      lista.push(
        papel({
          clave: "comunidad",
          nombre: "Acta de asamblea o contrato con la comunidad",
          ayuda: "En tierra comunal, el acta de la asamblea que acuerda la plantación o su aprovechamiento, o el contrato firmado con la comunidad.",
          fuente: `${RNPF}; ${RCC}`,
          exigencia: "siempre",
          carpeta: "jefe",
          casilleros: [],
        }),
      );
    }
    lista.push(
      papel({
        clave: "autorizacion-uso",
        nombre: "Autorización de uso del área",
        ayuda: "Cuando el titular de la plantación no es el dueño del predio: el documento con que el dueño autoriza el uso del área.",
        fuente: RNPF,
        exigencia: otroDueno ? "siempre" : "segun_caso",
        carpeta: "titulos",
        casilleros: [],
      }),
      papel({
        clave: "representante",
        nombre: "DNI y poder de quien firma",
        ayuda: "Si firma un jefe o un representante: su DNI y la carta poder, el acta de elección o la vigencia de poder.",
        fuente: RNPF,
        exigencia: "segun_caso",
        carpeta: "jefe",
        casilleros: CAS_REPRESENTANTE,
      }),
      papel({
        clave: "gtf",
        nombre: "Guías de transporte (GTF)",
        ayuda: "Las guías que emites para sacar madera de la plantación. Se archivan solas por permiso: no se suben acá.",
        fuente: GTF,
        exigencia: "segun_caso",
        carpeta: "otros",
        casilleros: [],
        subible: false,
      }),
    );
    return lista;
  }

  /* Bosque natural: PGMF y PO (concesión), PMFI (predio privado), DEMA (comunidad). */
  const reglamento = tipo === "DEMA" ? RCC : RGF;
  const lista: PapelRequerido[] = [];
  if (tipo === "PGMF" || tipo === "PO") {
    lista.push(
      papel({
        clave: "titulo",
        nombre: "Contrato de concesión",
        ayuda: "El título habilitante: el contrato de la concesión forestal con su adenda, si la tiene.",
        fuente: `${LEY}; ${RGF}`,
        exigencia: "siempre",
        carpeta: "titulos",
        casilleros: [],
      }),
    );
  } else {
    lista.push(
      papel({
        clave: "titulo",
        nombre: tipo === "DEMA" ? "Título de la comunidad" : "Título de propiedad del predio",
        ayuda:
          tipo === "DEMA"
            ? "El título de propiedad (o la cesión en uso) de la comunidad donde está el permiso."
            : "El título inscrito del predio privado donde está el permiso.",
        fuente: reglamento,
        exigencia: "siempre",
        carpeta: "titulos",
        casilleros: [CAS_TITULO],
      }),
    );
  }
  lista.push(
    papel({
      clave: "resolucion",
      nombre: "Resolución que aprueba el plan",
      ayuda: "La resolución de la autoridad forestal (ARFFS) que aprueba el plan: N°, fecha, vigencia y volumen autorizado.",
      fuente: reglamento,
      exigencia: "siempre",
      carpeta: "resolucion",
      casilleros: [CAS_RESOLUCION],
    }),
    papel({
      clave: "plan-aprobado",
      nombre: `${metaDe(tipo).sigla} aprobado`,
      ayuda: "El documento del plan tal como se aprobó, con el sello de la autoridad: es contra lo que se supervisa.",
      fuente: reglamento,
      exigencia: "siempre",
      carpeta: "resolucion",
      casilleros: [],
    }),
  );
  if (tipo === "DEMA" || comunal) {
    lista.push(
      papel({
        clave: "comunidad",
        nombre: "Acta de asamblea o contrato con la comunidad",
        ayuda: "El acta de la asamblea comunal que acuerda el aprovechamiento o, si trabaja un tercero, el contrato firmado con la comunidad.",
        fuente: RCC,
        exigencia: "siempre",
        carpeta: "jefe",
        casilleros: [],
      }),
    );
  }
  const regente = metaDe(tipo).regente;
  if (regente !== "no_aplica") {
    lista.push(
      papel({
        clave: "regente",
        nombre: "Regente forestal",
        ayuda: "La constancia de inscripción del regente en el registro de SERFOR y su contrato con el titular. Él firma el plan y los informes.",
        fuente: regente === "obligatorio" ? RGF : RCC,
        exigencia: regente === "obligatorio" ? "siempre" : "segun_caso",
        carpeta: "otros",
        casilleros: [],
      }),
    );
  }
  lista.push(
    papel({
      clave: "representante",
      nombre: "DNI y poder de quien firma",
      ayuda: "Si firma un jefe o un representante: su DNI y el acta de elección o la vigencia de poder.",
      fuente: reglamento,
      exigencia: "segun_caso",
      carpeta: "jefe",
      casilleros: CAS_REPRESENTANTE,
    }),
  );
  /* El informe de ejecución corre recién cuando termina el período: antes no
     hay nada que presentar y pedirlo sería un «falta» falso. */
  const plazo = plazoInformeEjecucion(plan.vigenciaHasta ?? null, new Date(`${hoy}T12:00:00Z`));
  lista.push(
    papel({
      clave: "informe",
      nombre: "Informe de ejecución",
      ayuda: plazo
        ? "El informe de lo ejecutado en el año operativo, firmado por el titular y el regente. Se presenta dentro de los 45 días de terminado."
        : "Se presenta dentro de los 45 días de terminado el año operativo; el período todavía no termina.",
      fuente: OSINFOR,
      exigencia: plazo ? "siempre" : "segun_caso",
      carpeta: "otros",
      casilleros: [],
      plazo: plazo ? plazo.vence.toISOString().slice(0, 10) : null,
    }),
    papel({
      clave: "gtf",
      nombre: "Guías de transporte (GTF)",
      ayuda: "Las guías que emites con este permiso. Se archivan solas por permiso: no se suben acá.",
      fuente: GTF,
      exigencia: "segun_caso",
      carpeta: "otros",
      casilleros: [],
      subible: false,
    }),
  );
  return lista;
}

// ── Qué hay en la carpeta ───────────────────────────────────────────────────

/** Un archivo de las carpetas del plan, aplanado. */
export interface ArchivoParaPapel {
  /** null = el rol que mira no lo puede abrir (`conCandado`): viaja sin id ni nombre. */
  documentId: string | null;
  nombre: string | null;
  mimeType: string | null;
  /** ISO o null (`Document.expiresAt`). */
  expiresAt: string | null;
  uploadedAt: string | null;
  papel: ClavePapel | null;
  /** Clave del casillero donde está, o null = suelto. */
  casillero: string | null;
  carpeta: string;
  /** El papel ESTÁ, pero con roles o candado que el rol que mira no tiene. */
  conCandado?: boolean;
}

/** Los archivos de la vista del servidor (ADR-467), en una lista plana. */
export function archivosDeVista(vista: Pick<PlanDocumentosVista, "carpetas"> | null | undefined): ArchivoParaPapel[] {
  const fuera: ArchivoParaPapel[] = [];
  for (const c of vista?.carpetas ?? []) {
    const de = (a: (typeof c.sueltos)[number], casillero: string | null): ArchivoParaPapel => ({
      documentId: a.documentId,
      nombre: a.nombre,
      mimeType: a.mimeType,
      expiresAt: a.expiresAt,
      uploadedAt: a.uploadedAt,
      papel: papelDeEtiquetas(a.papel ? [`${PREFIJO_TAG_PAPEL}${a.papel}`] : []),
      casillero,
      carpeta: c.clave,
    });
    const candado = (a: ArchivoConCandado, casillero: string | null): ArchivoParaPapel => ({
      documentId: null,
      nombre: null,
      mimeType: null,
      expiresAt: a.expiresAt,
      uploadedAt: a.uploadedAt,
      papel: papelDeEtiquetas(a.papel ? [`${PREFIJO_TAG_PAPEL}${a.papel}`] : []),
      casillero,
      carpeta: c.clave,
      conCandado: true,
    });
    for (const k of c.casilleros) {
      for (const a of k.archivos) fuera.push(de(a, k.campo.clave));
      for (const a of k.conCandado ?? []) fuera.push(candado(a, k.campo.clave));
    }
    for (const a of c.sueltos) fuera.push(de(a, null));
    for (const a of c.sueltosConCandado ?? []) fuera.push(candado(a, null));
  }
  return fuera;
}

export type EstadoPapel = "presente" | "vence_pronto" | "vencido" | "falta" | "segun_caso";

export interface PapelDelPlan extends PapelRequerido {
  estado: EstadoPapel;
  /**
   * El archivo que lo respalda (el de vencimiento más lejano), o null. Si ése
   * tiene candado y hay otro que el rol sí abre, va el que abre.
   */
  archivo: ArchivoParaPapel | null;
  /** Cuántos archivos hay de este papel (versiones viejas incluidas). */
  cuantos: number;
  /** De esos, cuántos tienen candado para el rol que mira (sin nombre). Opcional: lo agregó security 25-10. */
  conCandado?: number;
  /** AAAA-MM-DD: vencimiento del papel, o el plazo si todavía falta. */
  vence: string | null;
  /** true = la fecha no es del archivo sino de la vigencia del plan o del plazo. */
  venceDerivado: boolean;
}

export interface PapelesDelPlan {
  lista: PapelDelPlan[];
  /** Los que la norma pide siempre para este plan. */
  requeridos: number;
  /** De esos, los que están y no vencieron. */
  presentes: number;
  /** Vencidos entre los exigidos y los «si aplica» que se subieron. */
  vencidos: number;
  vencenPronto: number;
  /** Nombres de los que faltan (siempre), en orden. */
  faltan: string[];
}

const dia = (iso: string | null | undefined): string | null => (iso ? iso.slice(0, 10) : null);
const masDias = (hoy: string, n: number) => new Date(Date.parse(`${hoy}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function estadoPorFecha(vence: string | null, hoy: string): "presente" | "vence_pronto" | "vencido" {
  if (!vence) return "presente";
  if (vence < hoy) return "vencido";
  return vence <= masDias(hoy, DIAS_VENCE_PRONTO) ? "vence_pronto" : "presente";
}

/** El que más dura: sin vencimiento gana; si no, el de fecha más lejana; a igual, el más nuevo. */
function elMejor(archivos: readonly ArchivoParaPapel[]): ArchivoParaPapel | null {
  let mejor: ArchivoParaPapel | null = null;
  for (const a of archivos) {
    if (!mejor) {
      mejor = a;
      continue;
    }
    const va = dia(a.expiresAt) ?? "9999-12-31";
    const vm = dia(mejor.expiresAt) ?? "9999-12-31";
    if (va > vm || (va === vm && (a.uploadedAt ?? "") > (mejor.uploadedAt ?? ""))) mejor = a;
  }
  return mejor;
}

/**
 * El estado de cada papel del plan contra lo que hay en sus carpetas.
 * `hoy` = `limaDateKey()`.
 */
export function papelesDePlan(
  plan: PlanParaPapeles,
  archivos: readonly ArchivoParaPapel[],
  hoy: string,
): PapelesDelPlan {
  const lista: PapelDelPlan[] = papelesDeTipo(plan, hoy).map((p) => {
    const suyos = archivos.filter(
      (a) => a.papel === p.clave || (a.papel == null && a.casillero != null && p.casilleros.includes(a.casillero)),
    );
    const mejor = elMejor(suyos);
    if (mejor) {
      /* El estado y el vencimiento, del que más dura aunque el rol no lo abra;
         para «Ver», el mejor de los que sí abre. */
      const archivo = mejor.conCandado ? (elMejor(suyos.filter((a) => !a.conCandado)) ?? mejor) : mejor;
      const conCandado = suyos.filter((a) => a.conCandado).length;
      let vence = dia(mejor.expiresAt);
      let venceDerivado = false;
      /* La resolución y el plan aprobado valen lo que dura el plan: sin fecha
         propia, la que manda es la vigencia (y se muestra que es derivada). */
      if (!vence && (p.clave === "resolucion" || p.clave === "plan-aprobado") && plan.vigenciaHasta) {
        vence = dia(plan.vigenciaHasta);
        venceDerivado = true;
      }
      return {
        ...p,
        estado: estadoPorFecha(vence, hoy),
        archivo,
        cuantos: suyos.length,
        ...(conCandado ? { conCandado } : {}),
        vence,
        venceDerivado,
      };
    }
    if (p.exigencia === "segun_caso") return { ...p, estado: "segun_caso", archivo: null, cuantos: 0, vence: null, venceDerivado: false };
    /* Falta y la norma le pone plazo: pasado el plazo, está vencido. */
    const estado: EstadoPapel = p.plazo && p.plazo < hoy ? "vencido" : "falta";
    return { ...p, estado, archivo: null, cuantos: 0, vence: p.plazo, venceDerivado: p.plazo != null };
  });
  const exigidos = lista.filter((p) => p.exigencia === "siempre");
  /* Los vencimientos cuentan también los «si aplica» que SÍ se subieron: una
     vigencia de poder vencida pesa aunque el papel no sea de todos los planes. */
  const conFecha = lista.filter((p) => p.exigencia === "siempre" || p.archivo != null);
  return {
    lista,
    requeridos: exigidos.length,
    presentes: exigidos.filter((p) => p.estado === "presente" || p.estado === "vence_pronto").length,
    vencidos: conFecha.filter((p) => p.estado === "vencido").length,
    vencenPronto: conFecha.filter((p) => p.estado === "vence_pronto").length,
    faltan: exigidos.filter((p) => p.estado === "falta").map((p) => p.nombre),
  };
}

/**
 * Lo que lee el semáforo del plan (`loth-plan-semaforo`, entrada `papeles`):
 * cuántos papeles pide la norma, cuántos están vigentes y, por nombre, los
 * OBLIGATORIOS vencidos (rojo) y los que faltan (ámbar). Un «si aplica» no
 * pone ámbar: no está en `faltan` ni en `vencidos`.
 */
export function resumenParaSemaforo(p: Pick<PapelesDelPlan, "lista" | "requeridos" | "presentes">): {
  requeridos: number;
  presentes: number;
  vencidos: string[];
  faltan: string[];
} {
  const exigidos = p.lista.filter((x) => x.exigencia === "siempre");
  return {
    requeridos: p.requeridos,
    presentes: p.presentes,
    vencidos: exigidos.filter((x) => x.estado === "vencido").map((x) => x.nombre),
    faltan: exigidos.filter((x) => x.estado === "falta").map((x) => x.nombre),
  };
}

/** «4 de 7 papeles». */
export function textoCuenta(p: Pick<PapelesDelPlan, "requeridos" | "presentes">): string {
  return `${p.presentes} de ${p.requeridos} ${p.requeridos === 1 ? "papel" : "papeles"}`;
}
