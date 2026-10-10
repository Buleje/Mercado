/**
 * Los permisos de un titular del Directorio: qué papeles maneja y con cuál se
 * está trabajando.
 *
 * ## Por qué existe
 *
 * Una comunidad nativa no tiene *un* permiso: tiene los que le fueron
 * aprobando. «COMUNIDAD NATIVA SANTA ROSA DE CHIVIS» puede manejar un
 * `REG-PLT` de 2021 y mañana un `PER-FMC` nuevo, cada uno con **su área de
 * manejo, su resolución y su vigencia**. La ficha del Directorio
 * (`ForestParty`) guarda UN `tituloHabilitante` y UNA `resolucion` — el último
 * que alguien escribió —, así que al segundo permiso el primero se perdía.
 *
 * La entidad que sí modela un permiso ya existe: `ForestContrato` (ADR-421),
 * con código, tipo, resolución, ARFFS, región, **áreaHa**, vigencia y el enlace
 * al plan del LO-TH. Lo que faltaba era **atarla al titular**: medido en el
 * tenant de Blas, los 6 permisos cargados tenían `titularId` en `null` — la
 * columna existía y nadie la llenaba. Este módulo es el puente.
 *
 * ## El titular se reconoce por nombre cuando el vínculo todavía no está
 *
 * El contrato guarda `titularNombre` como texto (sacado de las guías) y el
 * Directorio guarda la ficha. Los dos escriben al mismo titular distinto: la
 * ficha dice «COMUNIDAD SANTA ROSA DE CHIVIS» y el contrato «COMUNIDAD
 * **NATIVA** SANTA ROSA DE CHIVIS». Por eso los candidatos se buscan con la
 * misma vara con la que el Directorio avisa duplicados (`partesParecidas`:
 * núcleo sin forma societaria, uno contenido en el otro) y se ofrecen para
 * *atar en un clic*, nunca se atan solos: dos comunidades pueden llamarse
 * parecido y ser dos.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import { nucleoDelNombre, partesParecidas } from "./directorio";
import type { Contrato, TipoContrato } from "./contratos";
import type { TipoPlan } from "./loth-tipos-plan";

/** Lo que una parte del Directorio necesita para que se le busquen permisos. */
export interface TitularParaPermisos {
  id?: string;
  nombre: string;
}

export interface PermisosDeParte {
  /** Atados a esta ficha por `titularId`: no hay duda de que son suyos. */
  suyos: Contrato[];
  /**
   * Escritos a nombre de alguien que se llama igual o parecido, sin vínculo.
   * Son *candidatos*: se ofrecen para atar, no se dan por suyos.
   */
  candidatos: Contrato[];
}

/**
 * Los permisos de un titular, separados por cuán seguro es que sean suyos.
 *
 * Sólo mira contratos activos: un permiso dado de baja no se ofrece para
 * declarar un plan nuevo.
 */
export function permisosDeParte(
  titular: TitularParaPermisos,
  contratos: readonly Contrato[],
): PermisosDeParte {
  const vivos = contratos.filter((c) => c.isActive);
  const suyos = titular.id ? vivos.filter((c) => c.titularId === titular.id) : [];
  const yaSuyos = new Set(suyos.map((c) => c.id));

  const sinDueno = vivos.filter((c) => !yaSuyos.has(c.id) && !c.titularId);
  const nucleo = nucleoDelNombre(titular.nombre);
  /* `partesParecidas` compara por nombre, así que se le pasan los contratos
     disfrazados de partes y se vuelve al contrato por id. Se conserva el orden
     de la lista original, que es el que ya ordenó el servidor. */
  const parecidos = nucleo
    ? new Set(
        partesParecidas(
          titular.nombre,
          sinDueno.map((c) => ({ id: c.id, nombre: c.titularNombre })),
        ).map((x) => x.id),
      )
    : new Set<string | undefined>();
  const candidatos = sinDueno.filter((c) => parecidos.has(c.id));

  return { suyos, candidatos };
}

/** Todos los permisos que se le pueden ofrecer a un titular, suyos primero. */
export function permisosOfrecibles(p: PermisosDeParte): Contrato[] {
  return [...p.suyos, ...p.candidatos];
}

// ── Cómo se lee un permiso en un selector ───────────────────────────────────

/**
 * El área de manejo, con su unidad. `null` no es «0 ha»: es que nadie la cargó
 * — y medido en el tenant real, eso es lo que pasa en 6 de 6 permisos.
 */
export function areaDelPermiso(c: Contrato): string | null {
  return c.areaHa == null ? null : `${c.areaHa.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`;
}

/** La línea de abajo del selector: qué papel es, de qué área y hasta cuándo. */
export function resumenPermiso(c: Contrato, etiquetaTipo: (t: TipoContrato) => string): string {
  const partes = [
    c.tipo ? etiquetaTipo(c.tipo) : null,
    areaDelPermiso(c),
    c.vigenciaHasta ? `vence ${new Date(c.vigenciaHasta).toLocaleDateString("es-PE", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" })}` : null,
  ].filter(Boolean);
  return partes.join(" · ");
}

// ── Del permiso al plan de manejo ───────────────────────────────────────────

/**
 * Qué documento de gestión le corresponde a este tipo de permiso.
 *
 * No es adivinanza: cada título habilitante tiene su documento por norma
 * (`loth-tipos-plan`, verificado contra la RJ 001-2018-OSINFOR y el D.S.
 * 018-2015-MINAGRI) — permiso en comunidad nativa → DEMA, predio privado →
 * PMFI, plantación registrada → su registro, concesión → el Plan Operativo del
 * año. Devuelve `null` cuando el papel no decide el documento («contrato»,
 * «otro»): ahí elige la persona, que es lo correcto.
 */
export function tipoPlanDesdePermiso(tipo: TipoContrato | null | undefined): TipoPlan | null {
  switch (tipo) {
    case "PER-FMC":
      return "DEMA";
    case "PER-FMP":
      return "PMFI";
    case "REG-PLT":
      return "PLANTACION";
    case "CONCESION":
      return "PO";
    case "DEMA":
      return "DEMA";
    case "PMFI":
      return "PMFI";
    case "PO":
      return "PO";
    default:
      return null;
  }
}

/** El camino inverso: el permiso que le corresponde a un documento de gestión. */
export function tipoPermisoDesdePlan(tipo: TipoPlan | null | undefined): TipoContrato | null {
  switch (tipo) {
    case "DEMA":
      return "PER-FMC";
    case "PMFI":
      return "PER-FMP";
    case "PLANTACION":
      return "REG-PLT";
    case "PO":
    case "PGMF":
      return "CONCESION";
    default:
      return null;
  }
}

/** Los campos del alta de plan que este permiso puede llenar. */
export interface CamposDelPlan {
  planType: TipoPlan | null;
  tituloHabilitante: string;
  resolucionNumber: string;
  resolucionDate: string;
  arffs: string;
  region: string;
  areaHa: string;
  vigenciaDesde: string;
  vigenciaHasta: string;
  titularName: string;
}

/** `2026-03-04T00:00:00.000Z` → `2026-03-04`, que es lo que come un `input[type=date]`. */
const soloFecha = (iso: string | null | undefined): string => (iso ?? "").slice(0, 10);

/**
 * Lo que el permiso ya sabe, listo para volcarlo en el alta de plan.
 *
 * Devuelve strings vacíos —no `null`— porque del otro lado hay un formulario
 * controlado: quien lo aplica decide si pisa o completa, y esa regla vive en el
 * formulario (nunca se pisa lo que alguien ya escribió).
 */
export function camposDelPlanDesdePermiso(c: Contrato): CamposDelPlan {
  return {
    planType: tipoPlanDesdePermiso(c.tipo),
    // El código del permiso ES el título habilitante: es lo que se declara.
    tituloHabilitante: c.codigo,
    resolucionNumber: c.resolucionNumero ?? "",
    resolucionDate: soloFecha(c.resolucionFecha),
    arffs: c.arffs ?? "",
    region: c.region ?? "",
    areaHa: c.areaHa == null ? "" : String(c.areaHa),
    vigenciaDesde: soloFecha(c.vigenciaDesde),
    vigenciaHasta: soloFecha(c.vigenciaHasta),
    titularName: c.titularNombre,
  };
}

/**
 * ¿Este permiso habilita a aprovechar bosque, o es sólo un papel comercial?
 *
 * «CONTRATO» es una compraventa: no habilita a nadie a talar, así que declarar
 * un plan de manejo contra él sería inventar un origen. Se sigue mostrando —el
 * permiso existe— pero avisado. `null` (tipo sin cargar) se deja pasar: no
 * saber qué papel es no es lo mismo que saber que no sirve.
 */
export function habilitaPlanDeManejo(c: Contrato): boolean {
  return c.tipo !== "CONTRATO";
}

// ── Lo que ya se escribió, para no volver a escribirlo distinto ─────────────

/**
 * Las autoridades (ARFFS) que este tenant YA escribió, ordenadas por uso.
 *
 * No es un catálogo inventado: son los valores reales del negocio. Medido en el
 * tenant de Blas, la misma autoridad estaba escrita de tres formas —«GERFOR
 * Ucayali», «ATFFS SELVA CENTRAL», «ATFFS SELVA CENTRAL - SEDE PUERTO
 * BERMUDEZ»— porque cada pantalla la pedía como texto libre. Ofrecer lo ya
 * escrito hace que el segundo documento se escriba como el primero, sin
 * prohibir uno nuevo (siempre queda «Otra…»).
 *
 * La comparación ignora mayúsculas y tildes; se conserva la grafía más usada.
 */
export function opcionesEscritas(valores: readonly (string | null | undefined)[]): string[] {
  const cuenta = new Map<string, { texto: string; n: number }>();
  for (const v of valores) {
    const t = (v ?? "").replace(/\s+/g, " ").trim();
    if (!t) continue;
    const k = t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const prev = cuenta.get(k);
    if (prev) prev.n += 1;
    else cuenta.set(k, { texto: t, n: 1 });
  }
  return [...cuenta.values()].sort((a, b) => b.n - a.n || a.texto.localeCompare(b.texto, "es")).map((x) => x.texto);
}

// ── Volcar la ficha y el permiso en el alta de plan ─────────────────────────

/** Los campos del alta de plan que la ficha o el permiso pueden completar. */
export interface FormularioDePlan {
  planType: TipoPlan;
  titularName: string;
  representanteLegal: string;
  tituloHabilitante: string;
  resolucionNumber: string;
  resolucionDate: string;
  arffs: string;
  region: string;
  areaHa: string;
  vigenciaDesde: string;
  vigenciaHasta: string;
}

/** Lo que el Directorio sabe del titular (subconjunto de `Parte`). */
export interface TitularDelDirectorio {
  nombre: string;
  representante?: string | null;
  arffs?: string | null;
  region?: string | null;
  tituloHabilitante?: string | null;
  resolucion?: string | null;
}

/**
 * Completa el formulario con la ficha y, si hay, con el permiso — y **dice qué
 * completó**.
 *
 * Pura y fuera del componente a propósito: la primera versión juntaba los
 * rótulos dentro del updater de `setState`, y en desarrollo React invoca esos
 * updaters **dos veces** para delatar efectos secundarios. Se delató solo: el
 * aviso salió «se completaron: título habilitante, título habilitante» en el
 * navegador. Un updater es puro o miente.
 *
 * Dos reglas que no se rompen:
 * · **Nunca pisa lo que alguien escribió.** Traer datos es una ayuda de carga.
 * · **El permiso gana sobre la ficha** cuando los dos tienen el dato: es EL
 *   papel de este plan, mientras que la ficha guarda el último que se cargó.
 */
export function completarPlanDesdeDirectorio<T extends FormularioDePlan>(
  prev: T,
  titular: TitularDelDirectorio,
  permiso: Contrato | null,
  opts: { tipoTocado: boolean; regionPorDefecto: string },
): { campos: T; completados: string[] } {
  const completados: string[] = [];
  const sinPisar = (actual: string, nuevo: string | null | undefined, rotulo?: string): string => {
    if (actual.trim()) return actual;
    const v = (nuevo ?? "").trim();
    if (v && rotulo) completados.push(rotulo);
    return nuevo ?? "";
  };
  /* La región arranca con un valor por defecto («Ucayali»): nadie lo eligió, así
     que cuenta como vacío y el dato del papel lo puede completar. */
  const regionActual = (v: string) => (v === opts.regionPorDefecto ? "" : v);

  const campos: T = {
    ...prev,
    titularName: titular.nombre || prev.titularName,
    representanteLegal: sinPisar(prev.representanteLegal, titular.representante),
    arffs: sinPisar(prev.arffs, titular.arffs),
    region: sinPisar(regionActual(prev.region), titular.region) || prev.region,
    tituloHabilitante: sinPisar(prev.tituloHabilitante, titular.tituloHabilitante),
    resolucionNumber: sinPisar(prev.resolucionNumber, titular.resolucion),
  };
  if (!permiso) return { campos, completados };

  const c = camposDelPlanDesdePermiso(permiso);
  return {
    campos: {
      ...campos,
      tituloHabilitante: sinPisar(campos.tituloHabilitante, c.tituloHabilitante, "título habilitante"),
      resolucionNumber: sinPisar(campos.resolucionNumber, c.resolucionNumber, "N° de resolución"),
      resolucionDate: sinPisar(campos.resolucionDate, c.resolucionDate, "fecha de la resolución"),
      arffs: sinPisar(campos.arffs, c.arffs, "ARFFS"),
      region: sinPisar(regionActual(campos.region), c.region, "región") || campos.region,
      areaHa: sinPisar(campos.areaHa, c.areaHa, "área de manejo"),
      vigenciaDesde: sinPisar(campos.vigenciaDesde, c.vigenciaDesde, "vigencia desde"),
      vigenciaHasta: sinPisar(campos.vigenciaHasta, c.vigenciaHasta, "vigencia hasta"),
      // El documento que le corresponde al papel, mientras nadie haya elegido otro.
      planType: !opts.tipoTocado && c.planType ? c.planType : campos.planType,
    },
    completados,
  };
}
