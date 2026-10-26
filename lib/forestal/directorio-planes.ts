/**
 * Los planes de manejo de un titular del Directorio (Brandon 26-10-2026, ADR-518).
 *
 * ## La regla
 *
 * «En directorio se pone información del ente (SAC, comunidad, etc.), sólo la
 * información como RUC y todo eso, mas no se puede poner a qué plan de manejo,
 * sus permisos… porque entidad sólo hay 1 pero de esa entidad se pueden saber
 * muchos planes de manejo distintos.»
 *
 * La ficha (`ForestParty`) es la ENTIDAD: una por comunidad o empresa. El plan
 * de manejo (`ForestPlan`) y su permiso (`ForestContrato`) son N por entidad, y
 * se cargan en «Nuevo plan de manejo» del Libro TH. La ficha sólo los LISTA, de
 * sólo lectura, y ofrece crear uno nuevo con el titular ya puesto.
 *
 * ## Cómo se sabe que un plan es de este titular
 *
 * 1. **Atado**: el permiso tiene `titularId` = la ficha, y el plan cuelga de
 *    ese permiso (`ForestContrato.planId` o `ForestPlan.contratoId`). Es el
 *    vínculo que deja el alta del plan desde ahora.
 * 2. **Por nombre**: planes y permisos viejos que nadie ató, con el titular
 *    escrito parecido (la misma vara que avisa duplicados, `partesParecidas`).
 *    Se listan marcados: dos comunidades pueden llamarse parecido y ser dos.
 *
 * ## Lo que la ficha guardaba antes (nada se borra)
 *
 * `tituloHabilitante`, `resolucion`, `planManejo`, `arffs` y
 * `tituloVigenciaHasta` siguen en la ficha y los siguen leyendo sus lectores
 * de siempre (alta de ingreso, libreta, búsqueda, Excel). La ficha ya no los
 * EDITA: los muestra como «Anotado antes en la ficha» con la acción de pasarlos
 * a un plan (`planDesdeLaFicha`).
 *
 * Puro: sin React ni fetch, para probarlo sin navegador.
 */

import { normalizarCodigoContrato, tipoDesdeCodigo, type Contrato, type ContratoInput, type EstadoContrato } from "./contratos";
import { claveBusqueda, partesParecidas, type DocTipo } from "./directorio";
import { TIPOS_PLAN_LISTA, type TipoPlan } from "./loth-tipos-plan";
import {
  completarPlanDesdeDirectorio,
  tipoPermisoDesdePlan,
  tipoPlanDesdePermiso,
  type FormularioDePlan,
} from "./permisos-de-parte";

/** Lo que la lista necesita de un plan del Libro TH (subconjunto de su fila). */
export interface PlanParaDirectorio {
  id: string;
  planType: string;
  planNumber: string | null;
  tituloHabilitante: string | null;
  titularName: string;
  areaHa: string | null;
  vigenciaHasta: string | null;
  estado: string;
  contratoId?: string | null;
}

/** Una fila de «Planes de manejo y permisos de este titular». */
export interface FilaPlanDelTitular {
  /** Estable para React: el plan, o el permiso si todavía no tiene plan. */
  clave: string;
  planId: string | null;
  contratoId: string | null;
  /** El código del papel: el título habilitante, el código del permiso o el N° del plan. */
  codigo: string;
  /** Qué documento es: la sigla del plan («DEMA», «Plantación») o el tipo del permiso. */
  documento: string | null;
  areaHa: number | null;
  vigenciaHasta: string | null;
  estado: EstadoContrato | null;
  /** Cómo se sabe que es suyo: atado a la ficha, o sólo porque el nombre se parece. */
  atado: "ficha" | "nombre";
}

/** La ficha, en lo que esta cuenta mira. */
export interface TitularParaPlanes {
  id: string | null;
  nombre: string;
}

const ESTADOS: readonly EstadoContrato[] = ["vigente", "vencido", "cerrado", "suspendido"];
const estadoDe = (v: string | null | undefined): EstadoContrato | null =>
  ESTADOS.includes(v as EstadoContrato) ? (v as EstadoContrato) : null;

/** «12.5» o «12,5» → 12.5; vacío o basura → null. */
export function numeroDeArea(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : null;
  const t = v.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** La sigla que se lee: «PO», «DEMA», «Plantación». */
export function siglaDelPlan(tipo: string | null | undefined): string | null {
  return TIPOS_PLAN_LISTA.find((t) => t.key === tipo)?.sigla ?? null;
}

const seParece = (a: string, b: string): boolean => {
  const ka = claveBusqueda(a);
  const kb = claveBusqueda(b);
  if (!ka || !kb) return false;
  return ka === kb || partesParecidas(a, [{ nombre: b }]).length > 0;
};

function documentoDelPlan(plan: PlanParaDirectorio, codigo: string): string | null {
  const sigla = siglaDelPlan(plan.planType);
  const numero = plan.planNumber?.trim();
  if (!numero || numero === codigo) return sigla;
  return sigla ? `${sigla} ${numero}` : numero;
}

function filaDe(plan: PlanParaDirectorio | null, c: Contrato | null, atado: FilaPlanDelTitular["atado"]): FilaPlanDelTitular {
  // El plan manda cuando existe: es el documento que se está trabajando.
  const codigo = (plan?.tituloHabilitante || c?.codigo || plan?.planNumber || "").trim();
  return {
    clave: plan ? `plan:${plan.id}` : `permiso:${c?.id ?? codigo}`,
    planId: plan?.id ?? null,
    contratoId: c?.id ?? plan?.contratoId ?? null,
    codigo: codigo || "Sin código",
    // Con su N° si no es el código de la fila: dos planes del mismo permiso
    // («PO 1» y «PO 2») se distinguen sin abrirlos.
    documento: plan ? documentoDelPlan(plan, codigo) : (c?.tipo ?? null),
    areaHa: numeroDeArea(plan?.areaHa) ?? c?.areaHa ?? null,
    vigenciaHasta: (plan?.vigenciaHasta || c?.vigenciaHasta || null)?.slice(0, 10) ?? null,
    estado: estadoDe(plan?.estado) ?? c?.estado ?? null,
    atado,
  };
}

/**
 * Los planes y permisos de este titular, atados primero y por nombre después;
 * dentro de cada grupo, el que vence más tarde arriba.
 *
 * Un permiso de OTRO titular nunca entra por nombre, ni un plan colgado de él:
 * el vínculo explícito gana sobre el parecido.
 */
export function planesDelTitular(
  titular: TitularParaPlanes,
  contratos: readonly Contrato[],
  planes: readonly PlanParaDirectorio[],
): FilaPlanDelTitular[] {
  const vivos = contratos.filter((c) => c.isActive !== false);
  const planPorId = new Map(planes.map((p) => [p.id, p]));
  const planDelPermiso = (c: Contrato) =>
    (c.planId ? planPorId.get(c.planId) : undefined) ?? planes.find((p) => p.contratoId === c.id) ?? null;
  const permisoDelPlan = (p: PlanParaDirectorio) =>
    vivos.find((c) => c.id === p.contratoId) ?? vivos.find((c) => c.planId === p.id) ?? null;

  const filas: FilaPlanDelTitular[] = [];
  const planesUsados = new Set<string>();
  const permisosUsados = new Set<string>();
  const anotar = (p: PlanParaDirectorio | null, c: Contrato | null, atado: FilaPlanDelTitular["atado"]) => {
    if (p) planesUsados.add(p.id);
    if (c) permisosUsados.add(c.id);
    filas.push(filaDe(p, c, atado));
  };

  // 1. Atados a la ficha.
  if (titular.id) {
    for (const c of vivos) {
      if (c.titularId !== titular.id) continue;
      const p = planDelPermiso(c);
      if (p && planesUsados.has(p.id)) continue;
      anotar(p, c, "ficha");
    }
  }

  // 2. Por nombre: planes sin permiso ajeno, y permisos sin dueño.
  const nombre = titular.nombre.trim();
  if (nombre) {
    for (const p of planes) {
      if (planesUsados.has(p.id) || !seParece(nombre, p.titularName)) continue;
      const c = permisoDelPlan(p);
      if (c?.titularId && c.titularId !== titular.id) continue;
      anotar(p, c && !permisosUsados.has(c.id) ? c : null, "nombre");
    }
    for (const c of vivos) {
      if (permisosUsados.has(c.id) || c.titularId || !seParece(nombre, c.titularNombre)) continue;
      const p = planDelPermiso(c);
      if (p && planesUsados.has(p.id)) continue;
      anotar(p, c, "nombre");
    }
  }

  const peso = (f: FilaPlanDelTitular) => (f.atado === "ficha" ? 0 : 1);
  return filas.sort((a, b) => peso(a) - peso(b) || (b.vigenciaHasta ?? "").localeCompare(a.vigenciaHasta ?? ""));
}

// ── Lo que la ficha guardaba antes ──────────────────────────────────────────

/** Los campos del permiso que la ficha guardó hasta el 26-10 (siguen en la base). */
export interface DatosViejosDeLaFicha {
  tituloHabilitante?: string | null;
  resolucion?: string | null;
  planManejo?: string | null;
  arffs?: string | null;
  tituloVigenciaHasta?: string | null;
}

export interface AnotadoEnLaFicha {
  partes: { rotulo: string; valor: string }[];
  /** El título anotado ya es el código de uno de sus planes: no hace falta pasarlo. */
  yaEnUnPlan: boolean;
}

const fechaCorta = (iso: string): string => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
};

/** Lo anotado en la ficha vieja, para mostrarlo de sólo lectura. `null` = nada. */
export function anotadoEnLaFicha(ficha: DatosViejosDeLaFicha, filas: readonly FilaPlanDelTitular[]): AnotadoEnLaFicha | null {
  const t = (v: string | null | undefined) => (v ?? "").trim();
  const partes = [
    { rotulo: "Título habilitante", valor: t(ficha.tituloHabilitante) },
    { rotulo: "Resolución", valor: t(ficha.resolucion) },
    { rotulo: "Documento", valor: t(ficha.planManejo) },
    { rotulo: "ARFFS", valor: t(ficha.arffs) },
    { rotulo: "Vence", valor: t(ficha.tituloVigenciaHasta) ? fechaCorta(t(ficha.tituloVigenciaHasta)) : "" },
  ].filter((p) => p.valor);
  if (partes.length === 0) return null;
  const titulo = normalizarCodigoContrato(t(ficha.tituloHabilitante));
  const yaEnUnPlan = Boolean(titulo) && filas.some((f) => normalizarCodigoContrato(f.codigo) === titulo);
  return { partes, yaEnUnPlan };
}

/** El documento que la ficha anotó («Plantación», «DEMA») o, si no, el que pide su título. */
export function tipoPlanDeLaFicha(ficha: DatosViejosDeLaFicha): TipoPlan | null {
  const escrito = claveBusqueda(ficha.planManejo ?? "");
  if (escrito) {
    const t = TIPOS_PLAN_LISTA.find((x) => claveBusqueda(x.sigla) === escrito || claveBusqueda(x.key) === escrito);
    if (t) return t.key;
  }
  const titulo = (ficha.tituloHabilitante ?? "").trim();
  return titulo ? tipoPlanDesdePermiso(tipoDesdeCodigo(titulo)) : null;
}

/** La ficha entera, como la ve el alta del plan. */
export interface FichaParaElPlan extends DatosViejosDeLaFicha {
  nombre: string;
  representante?: string | null;
  region?: string | null;
}

/**
 * El alta del plan con lo que la ficha sabe: el titular, el representante y
 * —si la ficha vieja lo anotó— el título, la resolución, el documento y la
 * vigencia. Nunca pisa lo escrito; el permiso, si viene, gana sobre la ficha.
 */
export function planDesdeLaFicha<T extends FormularioDePlan>(
  prev: T,
  ficha: FichaParaElPlan,
  permiso: Contrato | null,
  opts: { tipoTocado: boolean; regionPorDefecto: string },
): { campos: T; completados: string[] } {
  const r = completarPlanDesdeDirectorio(prev, ficha, permiso, opts);
  if (permiso) return r;
  let campos = r.campos;
  const completados = [...r.completados];
  if (!prev.tituloHabilitante.trim() && campos.tituloHabilitante.trim()) completados.push("título habilitante");
  if (!prev.resolucionNumber.trim() && campos.resolucionNumber.trim()) completados.push("N° de resolución");
  const tipo = tipoPlanDeLaFicha(ficha);
  if (!opts.tipoTocado && tipo && tipo !== campos.planType) {
    campos = { ...campos, planType: tipo };
    completados.push("tipo de documento");
  }
  const vence = (ficha.tituloVigenciaHasta ?? "").trim().slice(0, 10);
  if (!campos.vigenciaHasta.trim() && /^\d{4}-\d{2}-\d{2}$/.test(vence)) {
    campos = { ...campos, vigenciaHasta: vence };
    completados.push("vigencia hasta");
  }
  return { campos, completados };
}

// ── Del plan guardado al permiso del titular ────────────────────────────────

/** Lo que el permiso necesita de la ficha para quedar atado a ella. */
export interface TitularDelPermisoNuevo {
  id: string;
  nombre: string;
  docTipo?: DocTipo | string | null;
  docNumero?: string | null;
}

/** Lo que el permiso toma del plan recién guardado. */
export interface PlanParaPermiso extends FormularioDePlan {
  planNumber?: string;
}

/**
 * El permiso que ata un plan nuevo a su ficha: el código es el título
 * habilitante o, si el documento no lo pide (plantación), el N° del registro.
 * Sin código no se inventa ninguno (`null`): el plan queda ligado sólo por el
 * nombre, como antes.
 */
export function permisoDesdePlan(f: PlanParaPermiso, titular: TitularDelPermisoNuevo, planId: string): ContratoInput | null {
  const codigo = (f.tituloHabilitante.trim() || (f.planNumber ?? "").trim()).replace(/\s+/g, " ");
  if (codigo.length < 3) return null;
  const leido = tipoDesdeCodigo(codigo);
  const nulo = (v: string) => (v.trim() ? v.trim() : null);
  return {
    codigo,
    titularNombre: titular.nombre.trim() || f.titularName.trim(),
    titularId: titular.id,
    titularDoc: titular.docNumero?.trim() || null,
    titularDocTipo: titular.docTipo ? String(titular.docTipo) : null,
    resolucionNumero: nulo(f.resolucionNumber),
    resolucionFecha: nulo(f.resolucionDate),
    tipo: leido !== "otro" ? leido : (tipoPermisoDesdePlan(f.planType) ?? "otro"),
    arffs: nulo(f.arffs),
    region: nulo(f.region),
    areaHa: numeroDeArea(f.areaHa),
    vigenciaDesde: nulo(f.vigenciaDesde),
    vigenciaHasta: nulo(f.vigenciaHasta),
    planId,
  };
}

/**
 * ¿El titular escrito en el plan sigue siendo la ficha que se trajo? Si alguien
 * lo cambió a mano después de traerlo, el plan NO se ata a esa ficha.
 *
 * Igualdad ESTRICTA de la clave (sin tildes, mayúsculas ni espacios de más),
 * no el «se parece» de los duplicados (revisión ADR-518): ése daba por iguales
 * «Comunidad Campesina San Juan» y «Comunidad Nativa San Juan», o «Juan Pérez»
 * y «Juan Pérez Rojas», y el plan se ataba a la ficha vieja. Para esos casos
 * está «Atar igual».
 */
export function sigueSiendoElTitular(nombreEscrito: string, titular: { nombre: string }): boolean {
  const k = claveBusqueda(nombreEscrito);
  return k !== "" && k === claveBusqueda(titular.nombre);
}
