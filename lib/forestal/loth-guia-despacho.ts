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
import { faltantesGtf, gtfDatosVacio, type FaltanteGtf, type GtfDatos } from "./ctp-gtf-datos";
import { tituloDesdePermiso } from "./ctp-ficha-types";
import { tipoDesdeCodigo, type TipoContrato } from "./contratos";
import { tipoPermisoDesdePlan } from "./permisos-de-parte";
import { TIPOS_PLAN, TIPOS_PLAN_META, type TipoPlan } from "./loth-tipos-plan";
import { correlativoEnSerie, proponerGtf, type GtfUsada, type PropuestaGtf } from "./gtf-talonario";
import { rellenarGuia, type FuentesDeRelleno } from "./gtf-autocompletar";

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
function mismoNombre(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (s: string | null | undefined) =>
    txt(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
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
  const tituloHabilitante = txt(plan?.tituloHabilitante) || txt(caratula?.tituloHabilitante) || txt(permiso?.codigo);

  /* El tipo de título: el permiso cargado manda; si no hay, el propio código
     lo dice (`PER-FMC` = permiso en comunidad); si tampoco, el documento de
     gestión del plan (un PO es de una concesión). */
  const tipoDelCodigo = tituloHabilitante ? tipoDesdeCodigo(tituloHabilitante) : null;
  const planTipo = (TIPOS_PLAN.find((p) => p === txt(plan?.planType ?? caratula?.docGestionType).toUpperCase()) ?? null) as TipoPlan | null;
  const tipo: TipoContrato | null =
    permiso?.tipo ?? (tipoDelCodigo && tipoDelCodigo !== "otro" ? tipoDelCodigo : null) ?? tipoPermisoDesdePlan(planTipo);
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
    resolucion: txt(plan?.resolucionNumber) || txt(caratula?.resolucionNumber) || txt(permiso?.resolucionNumero),
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

/** De dónde sale la madera: la parcela de corta y dónde queda el bosque. */
export function partidaDelBosque(id: IdentidadDelTitulo): string {
  return [id.parcelaCorta, id.sector, id.distrito, id.provincia, id.departamento].filter(Boolean).join(", ");
}

/**
 * La guía arrancada con lo que el libro sabe. Lo que no se sabe queda en
 * blanco para que el formulario lo marque como falta.
 */
export function datosInicialesLoth(id: IdentidadDelTitulo, emision: string): GtfDatos {
  const base = gtfDatosVacio();
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
    traslado: { ...base.traslado, puntoPartida: partidaDelBosque(id), fechaInicio: emision },
    titulos: id.tituloHabilitante ? [id.tituloHabilitante] : [],
    guia: {
      ...base.guia,
      autoridad: id.autoridad,
      planManejoTipo: id.planManejoTipo,
      origenRecurso: id.origenRecurso,
      resolucion: id.resolucion,
      representanteLegal: id.representanteLegal,
      departamento: id.departamento,
      provincia: id.provincia,
      distrito: id.distrito,
      // Madera que sale del bosque: no hay guía anterior que la ampare.
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
        traslado: f.ultimaGuia.traslado ? { ...f.ultimaGuia.traslado, puntoPartida: "" } : undefined,
      }
    : null;
  const r = rellenarGuia(
    { ...datos, propietario: { ...datos.propietario, esElCtp: false } },
    { ...f, ficha: null, ultimaGuia: previa },
  ).datos;
  return { ...r, propietario: datos.propietario };
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
  const traslado = { ...datos.traslado, fechaInicio: datos.traslado.fechaInicio || x.emision };
  return [...falta, ...faltantesGtf({ ...datos, traslado })];
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
  if (!txt(g.resolucion)) huecos.push("(8) N° de resolución");
  if (!txt(g.planManejoTipo)) huecos.push("(9) Plan de manejo");
  if (!txt(g.departamento)) huecos.push("(10) Departamento");
  if (!txt(g.provincia)) huecos.push("(11) Provincia");
  if (!txt(g.distrito)) huecos.push("(12) Distrito");
  return huecos;
}

// ── El talonario del titular ─────────────────────────────────────────────────

/**
 * El siguiente N° del talonario de guías del bosque.
 *
 * El talonario es del TITULAR (no del CTP): la serie sale del último número
 * que se anotó en este libro, y el correlativo es el máximo + 1 de TODO lo
 * usado en esa serie —anuladas incluidas, un número que se usó no vuelve—,
 * con la regla de tramos de `gtf-talonario` (`019-0000001` ≡ `19-0000001`).
 * Sin ninguna guía anterior no hay de dónde sacar la serie: se devuelve
 * `null` y el operador escribe el primer número de su talonario.
 */
export function proponerGtfLoth(usadas: readonly GtfUsada[]): PropuestaGtf | null {
  const ultima = usadas.find((u) => /\d\s*-\s*\d+\s*$/.test(u.numero.trim()));
  if (!ultima) return null;
  const tramos = ultima.numero.trim().split(/\s*-\s*/);
  const serie = tramos.slice(0, -1).join("-");
  if (!serie || !correlativoEnSerie(ultima.numero, serie)) return null;
  return proponerGtf(serie, null, usadas);
}
