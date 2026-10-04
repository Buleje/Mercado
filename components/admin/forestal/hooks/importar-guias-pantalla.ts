/**
 * Lo puro de «Importar guías despachadas» (ADR-461): leer los N° de registro
 * pegados, agrupar la vista previa por permiso, la decisión inicial de cada
 * grupo, el estado con o sin tala y el orden de importación. Lo usan el hook
 * (`use-importar-guias`) y las partes del modal; los tests, sin montar nada.
 */

import { esNumeroRegistroValido, normalizarNumeroRegistro } from "@/lib/forestal/serfor-gtf";
import { hayQueCompletar } from "@/lib/forestal/loth-importar-guia-directorio";
import { motivoCupoValido } from "@/lib/forestal/loth-cupo-especie";
import { sobreCupoConMotivo } from "@/lib/forestal/loth-importar-guia-cupo";
import type {
  AccionDirectorio,
  DirectorioDeLaGuia,
  EstadoEnDirectorio,
  ExistenteEnDirectorio,
  PedidoDirectorio,
  EstadoVistaPrevia,
  GuiaVistaPrevia,
  PermisoDetectado,
  PlanDestino,
  PlanNuevoPropuesto,
  RespuestaImportar,
  ResultadoImportarGuia,
  SobreCupoDeLaGuia,
} from "@/lib/forestal/loth-importar-guia-tipos";

export type PestanaFuente = "recibidas" | "registro" | "foto";
export type FaseImportar = "elegir" | "vista" | "resultado";

/** Forma de un N° de GTF impreso (`019-001-0000004`, `019-0000001`): NO es un registro. */
const FORMA_GTF = /^\d{3}(-\d{3})?-\d{7}$/;

/**
 * Los N° de registro de lo pegado: uno por línea, o separados por coma, punto y
 * coma o espacios. Los rótulos («N° REGISTRO:») se ignoran; el número va tal
 * cual, con sus guiones (SERFOR no lo encuentra sin ellos).
 */
export function registrosDelTexto(texto: string): {
  validos: string[];
  invalidos: string[];
  gtf: string[];
} {
  const validos: string[] = [];
  const invalidos: string[] = [];
  const gtf: string[] = [];
  const vistos = new Set<string>();
  for (const crudo of texto.split(/[\s,;]+/)) {
    const t = crudo.replace(/^[^\d]+|[^\d]+$/g, "");
    if (!t || vistos.has(t)) continue;
    vistos.add(t);
    if (FORMA_GTF.test(t)) gtf.push(t);
    else if (esNumeroRegistroValido(t)) validos.push(normalizarNumeroRegistro(t));
    else invalidos.push(crudo.trim());
  }
  return { validos, invalidos, gtf };
}

/** El código de un título para comparar: mayúsculas y sin espacios. */
const claveTitulo = (t: string | null | undefined) => (t ?? "").toUpperCase().replace(/\s+/g, "");

/** Las guías de la vista previa con el mismo permiso: UNA decisión de permiso por grupo. */
export interface GrupoVista {
  clave: string;
  titulo: string | null;
  permiso: PermisoDetectado | null;
  guias: GuiaVistaPrevia[];
}

export function claveDeGrupo(g: GuiaVistaPrevia): string {
  if (!g.permiso) return "sin-permiso";
  if (g.permiso.estado === "existente") return `plan:${g.permiso.plan.planId}`;
  return `titulo:${claveTitulo(g.guia?.numeroTitulo)}`;
}

/** Agrupa por permiso en el orden en que llegaron; lo que no tiene permiso, al final. */
export function agruparPorPermiso(guias: readonly GuiaVistaPrevia[]): GrupoVista[] {
  const grupos = new Map<string, GrupoVista>();
  for (const g of guias) {
    const clave = claveDeGrupo(g);
    const grupo = grupos.get(clave) ?? {
      clave,
      titulo: g.guia?.numeroTitulo ?? null,
      permiso: g.permiso,
      guias: [],
    };
    grupo.guias.push(g);
    grupos.set(clave, grupo);
  }
  const lista = [...grupos.values()];
  return [
    ...lista.filter((x) => x.clave !== "sin-permiso"),
    ...lista.filter((x) => x.clave === "sin-permiso"),
  ];
}

/** El estado con el interruptor de la tala como está: apagado, cuenta el de «sin tala». */
export const estadoEfectivo = (g: GuiaVistaPrevia, crearTala: boolean): EstadoVistaPrevia =>
  crearTala ? g.estado : (g.estadoSinTala ?? g.estado);

/** ¿La guía se puede importar (con el permiso decidido)? */
export const esImportable = (g: GuiaVistaPrevia, crearTala = true) => {
  const e = estadoEfectivo(g, crearTala);
  return e === "lista" || e === "elegir_permiso";
};

/** T9 con el interruptor de la tala como está: apagado, sólo cuentan las talas que se agrandan. */
export const sobreCupoEfectivo = (g: GuiaVistaPrevia, crearTala: boolean): SobreCupoDeLaGuia[] =>
  (crearTala ? g.sobreCupo?.conTala : g.sobreCupo?.sinTala) ?? [];

/**
 * ¿Le falta el motivo para entrar? Sólo si pasa lo AUTORIZADO (lo censado
 * avisa y entra igual) y el motivo no llega a 5 letras: el mismo criterio que
 * la ruta (`motivoCupoValido`), que la rechazaría con `T9_CUPO_ESPECIE`.
 */
export const faltaMotivoDeCupo = (g: GuiaVistaPrevia, crearTala: boolean, motivo: string | undefined): boolean =>
  sobreCupoConMotivo(sobreCupoEfectivo(g, crearTala)).length > 0 && !motivoCupoValido(motivo);

/** Por fecha y N° de guía, como las revisa y las importa el servidor (`ordenDeImportacion`). */
export function enOrdenDeImportacion<T extends { fecha: string | null; gtfNumber: string | null }>(
  xs: readonly T[],
): T[] {
  return [...xs].sort(
    (a, b) =>
      (a.fecha ?? "9999-99-99").localeCompare(b.fecha ?? "9999-99-99") ||
      (a.gtfNumber ?? "").localeCompare(b.gtfNumber ?? "", "es", { numeric: true }),
  );
}

/** Los conteos del resultado, de lo que ya volvió. */
export function respuestaDe(resultados: ResultadoImportarGuia[]): RespuestaImportar {
  return {
    resultados,
    importadas: resultados.filter((r) => r.estado === "importada").length,
    yaEstaban: resultados.filter((r) => r.estado === "ya_estaba").length,
    rechazadas: resultados.filter((r) => r.estado === "rechazada").length,
  };
}

/** Lo que el grupo decide: a qué plan va y si se arma la tala referencial. */
export interface DecisionGrupo {
  destino: PlanDestino | null;
  crearTala: boolean;
  /** La persona tocó el interruptor: cambiar el tipo de plan ya no lo mueve. */
  talaTocada: boolean;
}

export function decisionInicial(grupo: GrupoVista): DecisionGrupo {
  const p = grupo.permiso;
  const destino: PlanDestino | null =
    p?.estado === "existente"
      ? { tipo: "existente", planId: p.plan.planId }
      : p?.estado === "nuevo"
        ? { tipo: "nuevo", plan: p.propuesta }
        : null;
  const base = grupo.guias.find((g) => esImportable(g)) ?? grupo.guias[0];
  return { destino, crearTala: base?.crearTalaPorDefecto ?? false, talaTocada: false };
}

/** Un plan nuevo necesita titular y código para crearse. */
export function planNuevoCompleto(p: PlanNuevoPropuesto): boolean {
  const codigo = p.planType === "PLANTACION" ? p.planNumber : p.tituloHabilitante;
  return Boolean(p.titularName.trim() && codigo?.trim());
}

// ── El directorio de cada guía (02-10 noche) ────────────────────────────────

/** Lo que la persona decide de UNA ficha (parte, vehículo o permiso) de la guía. */
export interface DecisionFicha {
  /** Agregar (si es nueva) o completar (si ya está). */
  marcada: boolean;
  /** Lo corregido antes de agregar una parte. */
  nombre: string;
  docTipo: "RUC" | "DNI" | null;
  docNumero: string;
  /** Lo corregido antes de agregar el vehículo. */
  placa: string;
}

/** Por ítem: la clave de la parte («titular», «destinatario»…), «vehiculo» o «permiso». */
export type DecisionesDirectorio = Record<string, DecisionFicha>;

/**
 * Qué se puede hacer con una ficha: agregarla (nueva), completarla (ya está y
 * la guía trae algo que le falta, reconocida por documento, placa o código) o
 * nada (es tu negocio, ya está completa, o se reconoció sólo por el nombre).
 */
export function accionPosible(estado: EstadoEnDirectorio, existente: ExistenteEnDirectorio | null): AccionDirectorio | null {
  if (estado === "nuevo") return "agregar";
  if (estado === "existe" && existente && existente.por !== "nombre" && hayQueCompletar(existente)) return "completar";
  return null;
}

const decision = (marcada: boolean, extra: Partial<DecisionFicha> = {}): DecisionFicha => ({
  marcada,
  nombre: "",
  docTipo: null,
  docNumero: "",
  placa: "",
  ...extra,
});

/**
 * Lo que va marcado al abrir la vista previa: lo nuevo, SÍ («agregar al
 * directorio» marcado por defecto); completar, sí si el nombre coincide (el
 * mismo RUC con otro nombre se mira antes); un parecido con otro documento, no.
 */
export function decisionesDirectorioIniciales(d: DirectorioDeLaGuia | null | undefined): DecisionesDirectorio {
  const out: DecisionesDirectorio = {};
  if (!d) return out;
  for (const p of d.partes) {
    const accion = accionPosible(p.estado, p.existente);
    if (!accion) continue;
    out[p.clave] =
      accion === "agregar"
        ? decision(!p.parecida, { nombre: p.nombre, docTipo: p.docTipo, docNumero: p.docNumero ?? "" })
        : decision(p.existente?.mismoNombre ?? false);
  }
  const v = d.vehiculo;
  const av = v ? accionPosible(v.estado, v.existente) : null;
  if (v && av) out.vehiculo = decision(true, { placa: v.placa });
  const pe = d.permiso;
  const ap = pe ? accionPosible(pe.estado, pe.existente) : null;
  if (pe && ap) out.permiso = decision(ap === "agregar" || (pe.existente?.mismoNombre ?? false));
  return out;
}

/** El pedido de directorio de UNA guía (lo marcado). `undefined` si no hay nada que guardar. */
export function pedidoDirectorio(d: DirectorioDeLaGuia | null | undefined, dec: DecisionesDirectorio): PedidoDirectorio | undefined {
  if (!d) return undefined;
  const partes: PedidoDirectorio["partes"] = [];
  for (const p of d.partes) {
    const x = dec[p.clave];
    const accion = accionPosible(p.estado, p.existente);
    if (!x?.marcada || !accion) continue;
    partes.push(
      accion === "agregar"
        ? { clave: p.clave, accion, nombre: x.nombre.trim() || p.nombre, docTipo: x.docTipo, docNumero: x.docNumero.trim() || null }
        : { clave: p.clave, accion },
    );
  }
  const v = d.vehiculo;
  const av = v ? accionPosible(v.estado, v.existente) : null;
  const vehiculo = v && av && dec.vehiculo?.marcada ? (av === "agregar" ? { accion: av, placa: dec.vehiculo.placa.trim() || v.placa } : { accion: av }) : null;
  const pe = d.permiso;
  const ap = pe ? accionPosible(pe.estado, pe.existente) : null;
  const permiso = pe && ap && dec.permiso?.marcada ? { accion: ap } : null;
  if (partes.length === 0 && !vehiculo && !permiso) return undefined;
  return { partes, ...(vehiculo ? { vehiculo } : {}), ...(permiso ? { permiso } : {}) };
}

/** Cuántas fichas van al directorio con lo marcado (para el pie). */
export function cuantasAlDirectorio(p: PedidoDirectorio | undefined): number {
  if (!p) return 0;
  return p.partes.length + (p.vehiculo ? 1 : 0) + (p.permiso ? 1 : 0);
}
