/**
 * loth-guia-despacho — la GTF completa del Libro TH, armada con lo que el libro
 * ya sabe (Brandon 28-09-2026: «en sección despacho quiero que se integre
 * despacho completo para hacer la guía ahí, igual como CTP»).
 *
 * La guía del bosque la emite el TITULAR del título habilitante (D.S.
 * 018-2015-MINAGRI art. 172). Casi nada de ella se tipea:
 *
 *   · (2)–(12) el título, su autoridad y su ubicación → el plan de manejo de
 *     las trozas, la carátula del libro y el permiso cargado;
 *   · (13)–(21) el propietario → el titular, salvo que se diga otro;
 *   · (37) el detalle por especie y la LISTA DE TROZAS → las trozas del
 *     Trozado que se eligen para el camión, con sus medidas y su volumen.
 *
 * Regla de todo el libro: lo que no se sabe queda VACÍO y se dice que falta.
 * Un casillero rellenado «para que no quede en blanco» en una declaración
 * jurada es peor que uno en blanco.
 *
 * PURO: sin React, sin fetch, sin Prisma. Lo usan el modal, el endpoint (que
 * vuelve a armar el detalle con las trozas de la BASE, no con las del cliente)
 * y la impresión.
 */

import { claveEspecie } from "./loth-constants";
import { componerPunto, conPunto, faltantesGtf, gtfDatosVacio, llegadaDelDestinatario, mismaUbicacion, type FaltanteGtf, type GtfDatos, type UbicacionTraslado } from "./ctp-gtf-datos";

/* Viven en `ctp-gtf-datos` (las usa también la guía del CTP); se re-exportan para no mover a nadie. */
export { conPunto, llegadaDelDestinatario, mismaUbicacion };
import { tituloDesdePermiso } from "./ctp-ficha-types";
import { tipoDesdeCodigo, type TipoContrato } from "./contratos";
import { tipoPermisoDesdePlan } from "./permisos-de-parte";
import { TIPOS_PLAN, TIPOS_PLAN_META, type TipoPlan } from "./loth-tipos-plan";
import { esPlanDePlantacion } from "./loth-poa";
import { rellenarGuia, type FuentesDeRelleno } from "./gtf-autocompletar";
import { ubigeoDelPadron } from "./gtf-serie-region";
import { mismoTitular } from "./loth-talonario";

// ── Qué sale en el camión ────────────────────────────────────────────────────

/** El producto, la presentación y la unidad del (37) cuando lo que viaja son trozas. */
export const PRODUCTO_TROZA = "Madera en rollo";
export const EMBALAJE_TROZA = "Trozas";
export const UNIDAD_TROZA = "Metros cúbicos";

/** Una troza que va en la guía: lo que declara su línea de Trozado. */
export interface PiezaGuia {
  /** Codificación de la troza (T3: única en el libro). */
  codigo: string;
  /** Árbol del que sale — agrupa la lista y la ordena como se trozó. */
  arbol: string | null;
  comun: string | null;
  cientifico: string | null;
  cites: boolean;
  /** Diámetros en METROS, como los guarda el libro. La lista los imprime en cm. */
  diamMayorM: number | null;
  diamMenorM: number | null;
  lengthM: number | null;
  volumeM3: number | null;
}

/** Una troza del Trozado que todavía no salió (la ofrece el modal). */
export interface TrozaDelLibro extends PiezaGuia {
  /** id de la línea de Trozado. */
  id: string;
  lineNo: number;
  planId: string | null;
  /** `YYYY-MM-DD` del trozado. */
  fecha: string | null;
}

/** Una fila de la lista de trozas, con las unidades del papel (cm y m). */
export interface FilaListaTrozas {
  codificacion: string;
  especieComun: string | null;
  especieCientifica: string | null;
  producto: string;
  d1Cm: number | null;
  d2Cm: number | null;
  largoM: number | null;
  cantidad: number;
  volumenM3: number | null;
}

/** Una línea del (37): una por especie. Mismo shape que `LineaProducto` del formato. */
export interface LineaDetalle {
  cientifico: string;
  comun: string;
  tipoProducto: string;
  presentacion: string;
  cantidad: number;
  unidad: string;
  total: number;
}

/** 4 decimales: la precisión del libro (m³). Evita que 0,1 + 0,2 imprima 0,30000000000000004. */
export const r4 = (n: number): number => Math.round(n * 10000) / 10000;

const txt = (v: string | null | undefined): string => (v ?? "").trim();

/** Orden humano de códigos: `85-TOR-B` antes que `85-TOR-AA`, `9` antes que `10`. */
const porCodigo = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });

/** Las piezas en el orden en que se leen en el patio: por árbol, y dentro, por código. */
export function ordenarPiezas<T extends PiezaGuia>(piezas: readonly T[]): T[] {
  return [...piezas].sort((a, b) => porCodigo(a.arbol ?? a.codigo, b.arbol ?? b.codigo) || porCodigo(a.codigo, b.codigo));
}

/** Volumen total de lo que viaja, a 4 decimales. */
export function totalM3(piezas: readonly PiezaGuia[]): number {
  return r4(piezas.reduce((a, p) => a + (Number(p.volumeM3) || 0), 0));
}

/**
 * El detalle (37): una línea por especie, con cuántas trozas y cuántos m³.
 *
 * Se agrupa con `claveEspecie` —la misma vara del balance del plan y de la
 * barrera del POA—: «Tornillo» y «TORNILLO (Cedrelinga cateniformis)» son una
 * especie, y partirla en dos renglones hacía que el (37) no cerrara con la
 * lista. El volumen es la SUMA de las trozas (no se recalcula): si el detalle y
 * la lista dijeran números distintos de la misma madera, es lo primero que
 * marca un puesto de control.
 *
 * `cientificoDe` completa el binomio que la troza no trae (el catálogo de
 * especies). Si tampoco lo sabe, el casillero queda vacío.
 */
export function detallePorEspecie(
  piezas: readonly PiezaGuia[],
  cientificoDe?: (comun: string) => string | null | undefined,
): LineaDetalle[] {
  const grupos = new Map<string, { comun: string; cientifico: string; n: number; m3: number }>();
  for (const p of piezas) {
    const comun = txt(p.comun) || txt(p.cientifico);
    const clave = claveEspecie(comun) || "(sin especie)";
    const g = grupos.get(clave) ?? { comun, cientifico: "", n: 0, m3: 0 };
    g.n += 1;
    g.m3 += Number(p.volumeM3) || 0;
    if (!g.cientifico) g.cientifico = txt(p.cientifico) || txt(comun ? cientificoDe?.(comun) : "");
    grupos.set(clave, g);
  }
  return [...grupos.values()]
    .sort((a, b) => b.m3 - a.m3 || porCodigo(a.comun, b.comun))
    .map((g) => ({
      cientifico: g.cientifico,
      comun: g.comun,
      tipoProducto: PRODUCTO_TROZA,
      presentacion: EMBALAJE_TROZA,
      cantidad: g.n,
      unidad: UNIDAD_TROZA,
      total: r4(g.m3),
    }));
}

/** Metros → centímetros a 1 decimal (el libro guarda el Ø en m; la lista lo pide en cm). */
const aCm = (m: number | null): number | null => (m == null || !Number.isFinite(m) ? null : Math.round(m * 1000) / 10);

/**
 * La LISTA DE TROZAS O CUARTONES A MOVILIZAR: una fila por troza, con su
 * codificación y sus tres medidas. D1 y D2 son los dos diámetros que el libro
 * midió al trozar (mayor y menor); el volumen es el del Trozado, sin
 * recalcular — la lista y el libro tienen que decir lo mismo de la misma pieza.
 */
export function listaDeTrozas(
  piezas: readonly PiezaGuia[],
  cientificoDe?: (comun: string) => string | null | undefined,
): FilaListaTrozas[] {
  return ordenarPiezas(piezas).map((p) => {
    const comun = txt(p.comun) || null;
    return {
      codificacion: p.codigo,
      especieComun: comun,
      especieCientifica: txt(p.cientifico) || txt(comun ? cientificoDe?.(comun) : "") || null,
      producto: PRODUCTO_TROZA,
      d1Cm: aCm(p.diamMayorM),
      d2Cm: aCm(p.diamMenorM),
      largoM: p.lengthM,
      cantidad: 1,
      volumenM3: p.volumeM3 == null ? null : r4(Number(p.volumeM3)),
    };
  });
}

/**
 * ¿Pueden ir juntas en UNA guía? Una guía ampara UN título habilitante: trozas
 * de dos planes distintos son dos guías. Devuelve los planes distintos.
 */
export function planesDeLasTrozas(trozas: readonly Pick<TrozaDelLibro, "planId">[]): (string | null)[] {
  return [...new Set(trozas.map((t) => t.planId ?? null))];
}

// ── Cómo se llama el papel que ampara la madera ──────────────────────────────

/** El rótulo del casillero-resumen: «Registro de plantación» o «Título habilitante». */
export const rotuloDelTitulo = (plantacion: boolean): string => (plantacion ? "Registro de plantación" : "Título habilitante");

/**
 * ¿La guía ya armada ampara madera de una plantación? Se lee de lo que la
 * guía GUARDÓ — la casilla (5) cruzada o el código del (6) —, nunca de la
 * carátula de hoy: reimprimir una guía vieja debe decir lo mismo que decía.
 */
export function guiaEsDePlantacion(d: { titulos?: readonly string[] | null; guia?: { origenRecurso?: string | null } | null }): boolean {
  if (txt(d.guia?.origenRecurso).toLowerCase() === "plantacion") return true;
  const codigo = txt(d.titulos?.[0]);
  return codigo !== "" && tipoDesdeCodigo(codigo) === "REG-PLT";
}

/** «Registro de plantación N° 19-SEC/REG-PLT-2025-096» / «Título habilitante N° PO 12»; vacío sin código. */
export function leyendaDelTitulo(codigo: string | null | undefined, plantacion: boolean): string {
  const c = txt(codigo);
  return c ? `${rotuloDelTitulo(plantacion)} N° ${c}` : "";
}

/** «Constancia N° 096-2025»; si quien la cargó ya escribió «Constancia N° …», se respeta tal cual. */
export function leyendaDeConstancia(resolucion: string | null | undefined): string {
  const c = txt(resolucion);
  if (!c) return "";
  return /^constancia\b/i.test(c) ? c : `Constancia N° ${c}`;
}

// ── De dónde sale la identidad del título ─────────────────────────────────────

export interface CaratulaParaGuia {
  titularName?: string | null;
  representanteLegal?: string | null;
  tituloHabilitante?: string | null;
  ruc?: string | null;
  dni?: string | null;
  domicilio?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  docGestionType?: string | null;
  resolucionNumber?: string | null;
}

export interface PlanParaGuia {
  id?: string;
  planType?: string | null;
  planNumber?: string | null;
  tituloHabilitante?: string | null;
  resolucionNumber?: string | null;
  titularName?: string | null;
  arffs?: string | null;
  region?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  parcelaCorta?: string | null;
  sector?: string | null;
  representanteLegal?: string | null;
}

export interface PermisoParaGuia {
  codigo: string;
  tipo?: TipoContrato | null;
  resolucionNumero?: string | null;
  arffs?: string | null;
  region?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  vigenciaHasta?: string | null;
}

/** El título habilitante como sale en la guía, más de dónde salió cada parte. */
export interface IdentidadDelTitulo {
  titular: string;
  representanteLegal: string;
  docTipo: "RUC" | "DNI";
  docNumero: string;
  /** Domicilio del titular (propietario del producto). */
  domicilio: string;
  domDepartamento: string;
  domProvincia: string;
  domDistrito: string;
  tituloHabilitante: string;
  /**
   * ¿La madera es de una plantación registrada (ADR-459)? Entonces
   * `tituloHabilitante` es el CÓDIGO DEL REGISTRO (19-SEC/REG-PLT-2025-096) y
   * `resolucion` la constancia de inscripción: una plantación no tiene título
   * habilitante ni resolución de plan de manejo, y la carátula del libro (que
   * es de OTRO papel) no los presta.
   */
  esPlantacion: boolean;
  resolucion: string;
  autoridad: string;
  /** (9) escrito como se lee: «Plan Operativo (PO)». */
  planManejoTipo: string;
  /** (5) la casilla a cruzar. */
  origenRecurso: string;
  /** (10)(11)(12) dónde está el título. */
  departamento: string;
  provincia: string;
  distrito: string;
  parcelaCorta: string;
  sector: string;
  fuentes: { caratula: boolean; plan: boolean; permiso: boolean };
}

/** Mismo titular escrito distinto («Maderera X SAC» / «MADERERA X S.A.C.»). */
export function mismoNombre(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (s: string | null | undefined) =>
    txt(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  return n(a) !== "" && n(a) === n(b);
}

/** (9) desde la sigla del plan: «PO» → «Plan Operativo (PO)». Vacío si no es un tipo conocido. */
export function planManejoLegible(tipo: string | null | undefined): string {
  const t = TIPOS_PLAN.find((p) => p === txt(tipo).toUpperCase()) as TipoPlan | undefined;
  if (!t) return "";
  const meta = TIPOS_PLAN_META[t];
  return meta.sigla === meta.sigla.toUpperCase() ? `${meta.nombre} (${meta.sigla})` : meta.nombre;
}

/**
 * Arma la identidad del título con tres fuentes, en este orden:
 *
 * 1. **El plan de manejo de las trozas** — es el papel bajo el que se taló ESA
 *    madera. Titular, N° de título, resolución, autoridad y ubicación.
 * 2. **La carátula del libro** — RUC/DNI y domicilio del titular. Sólo si es
 *    el MISMO titular del plan: un RUC de otro titular pegado al nombre del
 *    plan sería declarar a una persona con el documento de otra.
 * 3. **El permiso cargado** (`ForestContrato`) — tipo de título (5), y lo que
 *    los otros dos no tengan.
 *
 * Nada se deduce de más: sin tipo de título, la casilla (5) queda sin cruzar.
 */
export function identidadDelTitulo(f: {
  caratula?: CaratulaParaGuia | null;
  plan?: PlanParaGuia | null;
  permiso?: PermisoParaGuia | null;
}): IdentidadDelTitulo {
  const { plan, permiso } = f;
  const caratulaAjena = Boolean(plan && f.caratula && txt(plan.titularName) && !mismoNombre(plan.titularName, f.caratula.titularName));
  const caratula = caratulaAjena ? null : (f.caratula ?? null);

  const titular = txt(plan?.titularName) || txt(caratula?.titularName);
  const esPlantacion = esPlanDePlantacion(plan);
  /* Una plantación se identifica por su REGISTRO (`planNumber`); el formulario
     del plan le oculta el «título habilitante». Prestarle el de la carátula
     declararía el papel de OTRA madera (medido: la guía salía con el título de
     la carátula o en blanco). */
  /* Si uno de los dos códigos ES el del Registro Nacional de Plantaciones
     («REG-PLT»), ése: un plan cargado como PO con el registro en su título
     imprimía el «PO-…» del documento (revisión ADR-459). */
  const codigoRegistro = [plan?.planNumber, plan?.tituloHabilitante].map(txt).find((c) => c && tipoDesdeCodigo(c) === "REG-PLT");
  const tituloHabilitante = esPlantacion
    ? codigoRegistro || txt(plan?.planNumber) || txt(plan?.tituloHabilitante) || txt(permiso?.codigo)
    : txt(plan?.tituloHabilitante) || txt(caratula?.tituloHabilitante) || txt(permiso?.codigo);

  /* El tipo de título: el permiso cargado manda; si no hay, el propio código
     lo dice (`PER-FMC` = permiso en comunidad); si tampoco, el documento de
     gestión del plan (un PO es de una concesión). Una plantación es siempre
     «Plantación» aunque se haya cargado con el tipo por defecto. */
  const tipoDelCodigo = tituloHabilitante ? tipoDesdeCodigo(tituloHabilitante) : null;
  const planTipo = (esPlantacion
    ? "PLANTACION"
    : (TIPOS_PLAN.find((p) => p === txt(plan?.planType ?? caratula?.docGestionType).toUpperCase()) ?? null)) as TipoPlan | null;
  const tipo: TipoContrato | null = esPlantacion
    ? "REG-PLT"
    : (permiso?.tipo ?? (tipoDelCodigo && tipoDelCodigo !== "otro" ? tipoDelCodigo : null) ?? tipoPermisoDesdePlan(planTipo));
  const comoTitulo = tipo
    ? tituloDesdePermiso({ codigo: tituloHabilitante, tipo, resolucionNumero: permiso?.resolucionNumero ?? null, vigenciaHasta: permiso?.vigenciaHasta ?? null })
    : null;

  return {
    titular,
    representanteLegal: txt(plan?.representanteLegal) || txt(caratula?.representanteLegal),
    docTipo: txt(caratula?.ruc) ? "RUC" : txt(caratula?.dni) ? "DNI" : "RUC",
    docNumero: txt(caratula?.ruc) || txt(caratula?.dni),
    domicilio: txt(caratula?.domicilio),
    domDepartamento: txt(caratula?.departamento),
    domProvincia: txt(caratula?.provincia),
    domDistrito: txt(caratula?.distrito),
    tituloHabilitante,
    esPlantacion,
    resolucion: esPlantacion
      ? txt(plan?.resolucionNumber) || txt(permiso?.resolucionNumero)
      : txt(plan?.resolucionNumber) || txt(caratula?.resolucionNumber) || txt(permiso?.resolucionNumero),
    autoridad: txt(plan?.arffs) || txt(permiso?.arffs),
    planManejoTipo: planManejoLegible(planTipo) || txt(comoTitulo?.planManejo),
    origenRecurso: txt(comoTitulo?.tipo),
    departamento: txt(plan?.region) || txt(permiso?.region) || txt(caratula?.departamento),
    provincia: txt(plan?.provincia) || txt(permiso?.provincia) || txt(caratula?.provincia),
    distrito: txt(plan?.distrito) || txt(permiso?.distrito) || txt(caratula?.distrito),
    parcelaCorta: txt(plan?.parcelaCorta),
    sector: txt(plan?.sector),
    fuentes: { caratula: Boolean(caratula), plan: Boolean(plan), permiso: Boolean(permiso) },
  };
}

/**
 * De dónde sale la madera, DESARMADO (Brandon 29-09-2026: «ponle para poner la
 * dirección, departamento, provincia, distrito»): la dirección es la parcela
 * de corta y el sector; el ubigeo, el del plan pasado por el padrón del INEI
 * (el plan de Blas dice «Constitucion» donde va la región: es el distrito de
 * Oxapampa, Pasco, y así sale).
 */
export function ubicacionDePartida(id: IdentidadDelTitulo): UbicacionTraslado {
  const u = ubigeoDelPadron({ departamento: id.departamento, provincia: id.provincia, distrito: id.distrito });
  return {
    direccion: [id.parcelaCorta, id.sector].filter(Boolean).join(", "),
    departamento: u.departamento,
    provincia: u.provincia,
    distrito: u.distrito,
  };
}

/** De dónde sale la madera, en el texto que se imprime: «PC 12, Constitución, Oxapampa, Pasco». */
export function partidaDelBosque(id: IdentidadDelTitulo): string {
  return componerPunto(ubicacionDePartida(id));
}

/**
 * El titular que se GUARDA con la guía: el que el servidor sacó del plan de
 * las trozas (`identidadDelTitulo`), no el que manda el navegador (29-09-2026).
 * Si el del navegador dice otra cosa, se ignora y se devuelve para dejarlo en
 * el log: el titular decide de qué talonario es el N° y si choca con otro.
 */
export function titularParaGuardar(
  delServidor: string | null | undefined,
  delNavegador: string | null | undefined,
): { titular: string | null; ignorado: string | null } {
  const s = txt(delServidor);
  const n = txt(delNavegador);
  return { titular: s || null, ignorado: n && n !== s ? n : null };
}

/**
 * El texto impreso de la partida y la llegada, rearmado desde sus casilleros
 * cuando traen algo (`componerPunto`). El servidor lo usa antes de guardar:
 * el texto que manda el navegador no se cree. Sin casilleros (una guía vieja)
 * queda el texto que había.
 */
export function puntosCompuestos(tr: GtfDatos["traslado"]): GtfDatos["traslado"] {
  return {
    ...tr,
    puntoPartida: componerPunto(tr.partida) || tr.puntoPartida,
    puntoLlegada: componerPunto(tr.llegada) || tr.puntoLlegada,
  };
}

/**
 * La guía arrancada con lo que el libro sabe. Lo que no se sabe queda en
 * blanco para que el formulario lo marque como falta.
 */
export function datosInicialesLoth(id: IdentidadDelTitulo, emision: string): GtfDatos {
  const base = gtfDatosVacio();
  const partida = ubicacionDePartida(id);
  /* (10)(11)(12): como los dice el plan. Sólo si el plan no puso un
     departamento sino un lugar que el padrón ubica en uno solo, se escriben
     los del padrón (si no, la guía decía «Constitucion» como departamento). */
  const padron = ubigeoDelPadron({ departamento: id.departamento, provincia: id.provincia, distrito: id.distrito });
  const ubic = padron.deducidoDe ? padron : { departamento: id.departamento, provincia: id.provincia, distrito: id.distrito };
  return {
    ...base,
    propietario: {
      ...base.propietario,
      // `esElCtp` es «el propietario es el EMISOR». En el bosque el emisor es
      // el titular; el modal lo lee como «Es el titular».
      esElCtp: true,
      nombre: id.titular,
      docTipo: id.docTipo,
      docNumero: id.docNumero,
      direccion: id.domicilio,
      departamento: id.domDepartamento,
      provincia: id.domProvincia,
      distrito: id.domDistrito,
    },
    traslado: { ...base.traslado, partida, puntoPartida: componerPunto(partida), fechaInicio: emision },
    titulos: id.tituloHabilitante ? [id.tituloHabilitante] : [],
    guia: {
      ...base.guia,
      autoridad: id.autoridad,
      planManejoTipo: id.planManejoTipo,
      origenRecurso: id.origenRecurso,
      resolucion: id.resolucion,
      representanteLegal: id.representanteLegal,
      departamento: ubic.departamento,
      provincia: ubic.provincia,
      distrito: ubic.distrito,
      // Madera que sale del bosque: no hay guía anterior que la ampare (el
      // papel imprime «NO APLICA», `ORIGEN_NO_APLICA`; acá queda vacío).
      gtfOrigenNro: "",
    },
  };
}

/** El propietario vuelve a ser el titular (lo que hace «Es el titular»). */
export function propietarioTitular(id: IdentidadDelTitulo): Partial<GtfDatos["propietario"]> {
  return {
    esElCtp: true,
    nombre: id.titular,
    docTipo: id.docTipo,
    docNumero: id.docNumero,
    direccion: id.domicilio,
    departamento: id.domDepartamento,
    provincia: id.domProvincia,
    distrito: id.domDistrito,
  };
}

/**
 * Completa lo vacío con la guía anterior y la libreta (`rellenarGuia`, la
 * misma función del CTP) SIN tocar al propietario: la del CTP lo arma con la
 * Ficha de la planta y le fuerza el RUC, y el titular de un permiso puede
 * declarar DNI. Tampoco hereda el punto de partida — cada bosque sale de su
 * parcela — ni el título ni la autoridad: salen del plan de las trozas.
 */
export function rellenarGuiaLoth(datos: GtfDatos, f: Omit<FuentesDeRelleno, "ficha">): GtfDatos {
  const previa = f.ultimaGuia
    ? {
        destinatario: f.ultimaGuia.destinatario,
        transportista: f.ultimaGuia.transportista,
        vehiculo: f.ultimaGuia.vehiculo,
        comprobante: f.ultimaGuia.comprobante,
        /* Ni el texto ni los casilleros de la partida: cada bosque sale de su parcela. */
        traslado: f.ultimaGuia.traslado
          ? { ...f.ultimaGuia.traslado, puntoPartida: "", partida: { direccion: "", departamento: "", provincia: "", distrito: "" } }
          : undefined,
      }
    : null;
  const r = rellenarGuia(
    { ...datos, propietario: { ...datos.propietario, esElCtp: false } },
    { ...f, ficha: null, ultimaGuia: previa },
  ).datos;
  return { ...r, propietario: datos.propietario, traslado: sembrarLlegada(r) };
}

/**
 * La llegada desarmada, sembrada del destinatario cuando todavía no dice nada:
 * su dirección y su ubigeo. Si el destinatario no trae ninguno, queda el texto
 * que ya había (la guía anterior). La ruta armada sola se rehace con el texto
 * nuevo; una ruta escrita a mano no se toca.
 */
export function sembrarLlegada(d: GtfDatos): GtfDatos["traslado"] {
  const tr = d.traslado;
  if (componerPunto(tr.llegada)) return tr;
  const dest = llegadaDelDestinatario(d);
  const texto = componerPunto(dest);
  /* Sin destinatario, el texto que ya había (la guía anterior) pasa a la
     dirección: el formulario muestra lo mismo que se va a imprimir. */
  if (!texto) return txt(tr.puntoLlegada) ? { ...tr, llegada: { ...tr.llegada, direccion: txt(tr.puntoLlegada) } } : tr;
  return conPunto(tr, "llegada", dest);
}

/** Las trozas de una guía YA emitida (su foto en `ForestGtf.items`), para reimprimirla. */
export function piezasDeItems(items: unknown): PiezaGuia[] {
  if (!Array.isArray(items)) return [];
  const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return items
    .filter((it): it is Record<string, unknown> => Boolean(it) && typeof it === "object")
    .map((it) => ({
      codigo: str(it.code) ?? "",
      arbol: str(it.treeCode),
      comun: str(it.species),
      cientifico: str(it.scientific),
      cites: it.cites === true,
      diamMayorM: num(it.diamMayorM),
      diamMenorM: num(it.diamMenorM),
      lengthM: num(it.lengthM),
      volumeM3: num(it.volumeM3),
    }));
}

/**
 * Las líneas de despacho que son de ESTA guía, entre las vivas con su N° (las
 * que anular la guía anula, y las que cuenta el modal). Dos titulares pueden
 * tener el mismo N° (29-09-2026), así que el N° solo no alcanza:
 *
 *   1. si la guía trae la lista de trozas, sus trozas;
 *   2. si nadie más en el libro tiene ese N°, todas (una guía hecha a mano sin
 *      códigos de troza, como antes);
 *   3. si no, las del plan de la guía; y sin plan, las de planes del mismo
 *      titular. Lo que no se puede atribuir no se anula: es de otra guía.
 */
export function lineasDeLaGuia<L extends { trozaCode: string | null; planId: string | null }>(
  guia: { items: unknown; planId: string | null; titularName: string | null },
  lineas: readonly L[],
  x: { otrasConElNumero: number; titularDePlan?: (planId: string) => string | null | undefined },
): L[] {
  const codigos = new Set(piezasDeItems(guia.items).map((p) => p.codigo).filter(Boolean));
  if (codigos.size > 0) return lineas.filter((l) => codigos.has(txt(l.trozaCode)));
  if (x.otrasConElNumero === 0) return [...lineas];
  if (guia.planId) return lineas.filter((l) => l.planId === guia.planId);
  const titularDePlan = x.titularDePlan;
  if (!txt(guia.titularName) || !titularDePlan) return [];
  return lineas.filter((l) => l.planId != null && mismoTitular(titularDePlan(l.planId), guia.titularName));
}

// ── Qué le falta ────────────────────────────────────────────────────────────

export interface FaltanteLoth {
  seccion: FaltanteGtf["seccion"] | "documento" | "trozas";
  campo: string;
  motivo: string;
}

/**
 * Lo que impide REGISTRAR la guía. En el Libro TH el despacho y la guía son el
 * mismo acto —el camión sale con el papel— y la guía no se edita después (se
 * anula y se hace otra), así que se exige completa lo que un puesto de control
 * pide: la regla es `faltantesGtf`, la MISMA del CTP, más el número y las
 * trozas. La fecha de inicio del traslado sale de la emisión, como en el CTP.
 */
export function faltantesDespachoLoth(
  datos: GtfDatos,
  x: { gtfNumber: string; emision: string; trozas: number },
): FaltanteLoth[] {
  const falta: FaltanteLoth[] = [];
  if (!txt(x.gtfNumber)) falta.push({ seccion: "documento", campo: "N° de GTF", motivo: "El número del talonario identifica la guía en cada control" });
  if (!txt(x.emision)) falta.push({ seccion: "documento", campo: "Fecha de expedición", motivo: "Sin fecha no se sabe si la guía está vigente" });
  if (x.trozas <= 0) falta.push({ seccion: "trozas", campo: "Trozas que salen", motivo: "La guía ampara piezas concretas del Trozado" });
  /* La lista tiene su propio correlativo (las guías de SERFOR: 5, 6 → 7, 8):
     vacía, el (35) no apunta a ningún papel. */
  if (x.trozas > 0 && !txt(datos.guia.listaTrozasNro)) {
    falta.push({ seccion: "traslado", campo: "N° de la lista de trozas", motivo: "El casillero (35) apunta a la lista que viaja con la guía" });
  }
  /* La partida, casillero por casillero: un puesto de control coteja el
     distrito de salida contra el del título. */
  const p = datos.traslado.partida;
  for (const [valor, nombre] of [[p.departamento, "departamento"], [p.provincia, "provincia"], [p.distrito, "distrito"]] as const) {
    if (!txt(valor)) falta.push({ seccion: "traslado", campo: `Partida: ${nombre}`, motivo: "El punto de partida va con su ubigeo completo" });
  }
  const traslado = { ...datos.traslado, fechaInicio: datos.traslado.fechaInicio || x.emision };
  /* `faltantesGtf` también pide el ubigeo de la partida desarmada: no se dice dos veces. */
  const ya = new Set(falta.map((f) => f.campo));
  return [...falta, ...faltantesGtf({ ...datos, traslado }).filter((f) => !ya.has(f.campo))];
}

/**
 * Casilleros del título que el libro no tiene. NO bloquean (van en blanco para
 * llenar a mano sobre el talonario), pero se dicen, uno por uno.
 */
export function huecosDelTitulo(datos: GtfDatos): string[] {
  const g = datos.guia;
  const huecos: string[] = [];
  if (!txt(g.autoridad)) huecos.push("(2) Autoridad forestal");
  if (!txt(g.origenRecurso)) huecos.push("(5) Tipo de título");
  if (!txt(g.resolucion)) huecos.push(guiaEsDePlantacion(datos) ? "(8) N° de constancia del registro" : "(8) N° de resolución");
  if (!txt(g.planManejoTipo)) huecos.push("(9) Plan de manejo");
  if (!txt(g.departamento)) huecos.push("(10) Departamento");
  if (!txt(g.provincia)) huecos.push("(11) Provincia");
  if (!txt(g.distrito)) huecos.push("(12) Distrito");
  return huecos;
}

// ── El talonario del titular: vive en `loth-talonario.ts` (29-09-2026) ───────
export * from "./loth-talonario";
