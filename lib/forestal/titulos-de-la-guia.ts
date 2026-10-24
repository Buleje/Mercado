/**
 * titulos-de-la-guia — con qué papel sale la madera en la GTF.
 *
 * ## Por qué existe
 *
 * El título habilitante que ampara un despacho vive hoy en DOS lugares y la
 * guía sólo miraba uno:
 *
 * · `ForestCtpFicha.titulos[]` — el KV de la Ficha del CTP (código, resolución,
 *   plan de manejo, vencimiento). Es lo que alimentaba el `<select>`.
 * · `ForestContrato` (ADR-421/425) — el permiso como entidad: código, tipo,
 *   titular, área, vigencia, ARFFS, región. Es lo que usan el balance y el
 *   Directorio.
 *
 * Medido en el tenant de QA (`main`, 2026-09-21): la Ficha tenía **1** título
 * (`CONC-25-001`) y los permisos cargados eran **6**. Los otros cinco no
 * aparecían en la guía, así que la única forma de declararlos era tipear el
 * código a mano — y un código tipeado en un papel que pasa por un puesto de
 * control es exactamente lo que no queremos.
 *
 * Este módulo cruza las dos listas: qué se ofrece, en qué grupo, y qué puede
 * completar cada opción. **PURO**: sin React, sin fetch, sin Prisma.
 *
 * ## Lo que NO hace
 *
 * No inventa códigos ni los normaliza para el papel: el código se ofrece tal
 * cual lo escribió quien lo cargó. La normalización (`normalizarCodigoContrato`)
 * se usa SÓLO para comparar — «conc-25-001» y «CONC-25-001» son el mismo
 * permiso, y ofrecerlo dos veces haría elegir al azar entre dos papeles iguales.
 */

import { normalizarCodigoContrato, type Contrato, type EstadoContrato } from "./contratos";
import { areaDelPermiso, tipoPlanDesdePermiso } from "./permisos-de-parte";
import { TIPOS_PLAN_META } from "./loth-tipos-plan";
import type { GtfDatos } from "./ctp-gtf-datos";

/** Lo que la Ficha del CTP guarda de un título (subconjunto de `CtpTituloHabilitante`). */
export interface TituloDeFicha {
  codigo: string;
  tipo?: string;
  resolucion?: string;
  planManejo?: string;
  vencimiento?: string;
}

/** De dónde salió la opción: cambia lo que sabe y cómo se la muestra. */
export type FuenteTitulo = "ficha" | "permiso";

/** Un título que la guía puede declarar. */
export interface TituloElegible {
  /** El código tal cual se escribe en el papel. */
  codigo: string;
  /** El mismo, en forma canónica: sólo para comparar. */
  codigoNorm: string;
  fuente: FuenteTitulo;
  /** Lo que lo distingue en la lista (código + lo que lo identifica). */
  etiqueta: string;
  /** (8) N° de resolución que lo aprueba. `""` = nadie la cargó. */
  resolucion: string;
  /** (9) Tipo de plan de manejo. `""` = no se sabe. */
  planManejo: string;
  /** (2) ARFFS que lo ampara. */
  arffs: string;
  titular: string;
  /** «1 250,50 ha» o `null`: nadie la cargó — que no es «0 ha». */
  area: string | null;
  estado: EstadoContrato | null;
  /** Id del permiso del que sale, cuando hay uno. */
  contratoId: string | null;
}

const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * El documento de gestión que le corresponde al permiso, escrito como se lee en
 * el casillero (9).
 *
 * No es adivinanza: la correspondencia título → documento es la de
 * `tipoPlanDesdePermiso` (verificada contra la RJ 001-2018-OSINFOR y el D.S.
 * 018-2015-MINAGRI). Se reusa esa tabla y no una copia: la misma que ya usa el
 * alta de plan del LO-TH.
 */
function planDelPermiso(c: Contrato | null | undefined): string {
  const tipo = tipoPlanDesdePermiso(c?.tipo);
  if (!tipo) return "";
  const meta = TIPOS_PLAN_META[tipo];
  // «Plantación» no es un acrónimo: repetirla entre paréntesis se lee raro.
  return meta.sigla === meta.sigla.toUpperCase() ? `${meta.nombre} (${meta.sigla})` : meta.nombre;
}

/** Cómo se lee una opción de la Ficha: como hasta hoy, código + plan de manejo. */
function deLaFicha(t: TituloDeFicha, permiso: Contrato | null): TituloElegible {
  const codigo = txt(t.codigo);
  /* El permiso completa lo que la Ficha no tiene — es EL MISMO papel (mismo
     código normalizado), así que no es traer datos de otro título. La Ficha
     manda donde las dos escribieron: es la que se imprime. */
  const planManejo = txt(t.planManejo) || planDelPermiso(permiso);
  return {
    codigo,
    codigoNorm: normalizarCodigoContrato(codigo),
    fuente: "ficha",
    etiqueta: planManejo ? `${codigo} · ${planManejo}` : codigo,
    resolucion: txt(t.resolucion) || txt(permiso?.resolucionNumero),
    planManejo,
    arffs: txt(permiso?.arffs),
    titular: txt(permiso?.titularNombre),
    area: permiso ? areaDelPermiso(permiso) : null,
    estado: permiso?.estado ?? null,
    contratoId: permiso?.id ?? null,
  };
}

/** Cómo se lee un permiso: lo que lo distingue de los otros cinco. */
function delPermiso(c: Contrato): TituloElegible {
  const codigo = txt(c.codigo);
  const area = areaDelPermiso(c);
  return {
    codigo,
    codigoNorm: normalizarCodigoContrato(codigo),
    fuente: "permiso",
    // Dos concesiones del mismo titular sólo se distinguen por el código; dos
    // códigos parecidos, por el titular. Van los dos, y el área cuando existe.
    etiqueta: [codigo, txt(c.titularNombre) || null, area].filter(Boolean).join(" · "),
    resolucion: txt(c.resolucionNumero),
    planManejo: planDelPermiso(c),
    arffs: txt(c.arffs),
    titular: txt(c.titularNombre),
    area,
    estado: c.estado,
    contratoId: c.id,
  };
}

export interface TitulosElegibles {
  /** Los de la Ficha del CTP, en su orden (el primero es el predeterminado). */
  ficha: TituloElegible[];
  /** Los permisos cargados que NO están ya en la Ficha. */
  permisos: TituloElegible[];
  /** Las dos listas juntas, para buscar por código. */
  todos: TituloElegible[];
}

/**
 * Qué títulos se le pueden ofrecer a esta guía.
 *
 * Reglas:
 * · Un permiso dado de baja (`isActive: false`) no se ofrece — el papel salió
 *   de circulación, declararlo sería declarar algo que la operación ya retiró.
 * · Se deduplica por código NORMALIZADO, dentro de cada lista y entre las dos.
 *   Si la Ficha y el permiso escriben el mismo código distinto, gana la grafía
 *   de la Ficha (es la que se imprime) y el permiso queda de aporte de datos.
 */
export function titulosElegibles(
  titulosFicha: readonly TituloDeFicha[] | null | undefined,
  contratos: readonly Contrato[] | null | undefined,
): TitulosElegibles {
  const porCodigo = new Map<string, Contrato>();
  for (const c of contratos ?? []) {
    if (!c?.isActive) continue;
    const k = normalizarCodigoContrato(txt(c.codigo));
    if (!k || porCodigo.has(k)) continue;
    porCodigo.set(k, c);
  }

  const vistos = new Set<string>();
  const ficha: TituloElegible[] = [];
  for (const t of titulosFicha ?? []) {
    const k = normalizarCodigoContrato(txt(t?.codigo));
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    ficha.push(deLaFicha(t, porCodigo.get(k) ?? null));
  }

  const permisos: TituloElegible[] = [];
  for (const [k, c] of porCodigo) {
    if (vistos.has(k)) continue;
    vistos.add(k);
    permisos.push(delPermiso(c));
  }

  return { ficha, permisos, todos: [...ficha, ...permisos] };
}

/** El título elegido, por código normalizado. `null` = ese código no está cargado. */
export function buscarTitulo(
  opciones: readonly TituloElegible[],
  codigo: string | null | undefined,
): TituloElegible | null {
  const k = normalizarCodigoContrato(txt(codigo));
  if (!k) return null;
  return opciones.find((o) => o.codigoNorm === k) ?? null;
}

/** Sólo los casilleros de `guia` que un título puede completar. */
export type GuiaDelTitulo = Pick<GtfDatos["guia"], "autoridad" | "planManejoTipo">;

export interface CompletadoDeGuia {
  /** Parche con lo que estaba vacío. Vacío = no había nada que completar. */
  guia: Partial<GuiaDelTitulo>;
  /** Cómo se llama cada casillero completado, para decirlo en una línea. */
  completados: string[];
}

/**
 * Lo que el título sabe y la guía pide, **sin pisar lo que alguien escribió**.
 *
 * Pura y fuera del componente a propósito (misma lección que
 * `completarPlanDesdeDirectorio`): juntar los rótulos dentro del updater de
 * `setState` los duplica, porque en desarrollo React invoca los updaters dos
 * veces para delatar efectos secundarios.
 *
 * Sólo completa casilleros VACÍOS: traer datos es una ayuda de carga, no una
 * corrección. Y nunca inventa: si el permiso no tiene ARFFS cargada, el
 * casillero (2) se queda como estaba.
 */
export function completarGuiaConTitulo(
  actual: GuiaDelTitulo,
  titulo: TituloElegible | null,
): CompletadoDeGuia {
  const guia: Partial<GuiaDelTitulo> = {};
  const completados: string[] = [];
  if (!titulo) return { guia, completados };

  if (!txt(actual.autoridad) && titulo.arffs) {
    guia.autoridad = titulo.arffs;
    completados.push("la autoridad (2)");
  }
  if (!txt(actual.planManejoTipo) && titulo.planManejo) {
    guia.planManejoTipo = titulo.planManejo;
    completados.push("el plan de manejo (9)");
  }
  return { guia, completados };
}

/** «la autoridad (2) y el plan de manejo (9)» — enumeración en castellano. */
export function enumerar(partes: readonly string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}
