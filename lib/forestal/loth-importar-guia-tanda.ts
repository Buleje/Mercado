/**
 * T6 y T9 de una TANDA de guías en la vista previa del importador (ADR-461,
 * 04-10). Las dos sumas dependen de qué guías ANTERIORES de la tanda entran:
 * la 2.ª guía de Azúcar huayo pasa lo autorizado sólo si la 1.ª también se
 * importa. Por eso no se calculan una vez: se REHACEN desde la revisión base
 * (`GuiaVistaPrevia.base`) con las guías marcadas y el interruptor de la tala
 * de cada una.
 *
 * Una sola función para las dos puntas: el servidor la corre con todas
 * marcadas y el interruptor por defecto (`ForestLothImportarDB.vistaPrevia`);
 * la pantalla, cada vez que se marca/desmarca o se cambia el interruptor, con
 * lo que ya devolvió el servidor (`RespuestaVistaPrevia.tanda`). Las reglas
 * son las del servidor: `cupoDeLaGuia` (T9), `despachoT6DeLaGuia` (T6) y
 * `resolverTalaContraCenso` (la especie del censo).
 *
 * Una guía YA importada no se mide: sus trozas ya cuentan en lo leído.
 *
 * El mismo árbol en dos guías (el 173 con 173-A en la guía 7 y 173-D en la 8):
 * la revisión arma la tala de la 8 contando las trozas de la 7. Si la 7 no va
 * marcada, a la tala de la 8 se le resta lo que aportaba la 7 (la tala es Σ de
 * sus trozas: la resta es exacta) y, si sin ella no había tala, pasa a «nueva».
 *
 * PURO y client-safe.
 */
import { estadoDeLaRevision, mensajeDelEstado, ordenDeImportacion, talasAEscribir } from "./loth-importar-guia";
import { cupoDeLaGuia } from "./loth-importar-guia-cupo";
import { avisoT6DeLaGuia, avisoT6SinExcepcion, avisoT6SoloDueno, despachoT6DeLaGuia, type EstadoT6DelPlan } from "./loth-t6";
import { resolverTalaContraCenso } from "./loth-tala-del-censo";
import type { EntradaCupo } from "./loth-cupo-especie";
import type { AvisoImportacion, ContextoTanda, EstadoVistaPrevia, GuiaVistaPrevia, TalaReferencial } from "./loth-importar-guia-tipos";

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** m³ de las trozas NUEVAS de la guía, por árbol (`planId:árbol`): lo que su paso deja en la tala del árbol. */
function aportesPorArbol(g: GuiaVistaPrevia, planId: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of g.trozas) {
    if (t.estado !== "nueva" || !t.treeCode || t.volumeM3 == null) continue;
    const k = `${planId}:${t.treeCode}`;
    out.set(k, (out.get(k) ?? 0) + t.volumeM3);
  }
  return out;
}

const sumar = (a: Map<string, number>, b: ReadonlyMap<string, number>) => {
  for (const [k, v] of b) a.set(k, (a.get(k) ?? 0) + v);
};

/**
 * Las talas de la guía sin lo que aportaban las guías anteriores que NO van:
 * la revisión las armó contando a todas las que daba por «listas»
 * (`aporteRevision`); entran sólo las marcadas e importables (`aporteMarcado`).
 */
function talasDeLaTanda(
  talas: readonly TalaReferencial[],
  planId: string,
  aporteRevision: ReadonlyMap<string, number>,
  aporteMarcado: ReadonlyMap<string, number>,
): TalaReferencial[] {
  return talas.map((t) => {
    const k = `${planId}:${t.treeCode}`;
    const sobra = r4((aporteRevision.get(k) ?? 0) - (aporteMarcado.get(k) ?? 0));
    if (!(sobra > 0)) return t;
    const volumeM3 = t.volumeM3 == null ? null : r4(t.volumeM3 - sobra);
    const antes = t.talaExistente?.volumeM3 == null ? null : r4(t.talaExistente.volumeM3 - sobra);
    if (t.estado === "ampliar" && (antes == null || antes <= 0)) return { ...t, volumeM3, estado: "nueva", talaExistente: null };
    return { ...t, volumeM3, talaExistente: t.talaExistente ? { ...t.talaExistente, volumeM3: antes } : null };
  });
}

/** Cómo va cada guía en la pantalla. */
export interface EleccionDeGuia {
  marcada: boolean;
  crearTala: boolean;
}

const importable = (e: EstadoVistaPrevia) => e === "lista" || e === "elegir_permiso";

/**
 * La tala NUEVA con otra especie que la del censo de su árbol: el importador la
 * rechaza (`especieDelCensoEnTx` → `TALA_ESPECIE_DISTINTA_AL_CENSO`), así que
 * se avisa antes, con el mismo texto. Sólo cuenta si se arman las talas.
 */
function avisosDeEspecie(talas: readonly TalaReferencial[], planId: string, entrada: EntradaCupo | undefined): AvisoImportacion[] {
  if (!entrada) return [];
  const out: AvisoImportacion[] = [];
  for (const t of talas) {
    if (t.estado !== "nueva") continue;
    const code = t.treeCode.trim();
    const arboles = entrada.censo
      .filter((c) => c.treeCode.trim() === code)
      .map((c) => ({ planId, speciesCommon: c.speciesCommon, speciesScientific: null }));
    const r = resolverTalaContraCenso({ treeCode: code, planId, speciesCommon: t.speciesCommon, speciesScientific: t.speciesScientific }, arboles);
    if (!r.ok) out.push({ nivel: "bloquea", codigo: "especie_distinta_al_censo", mensaje: r.mensaje, soloConTala: true });
  }
  return out;
}

/** El contexto del servidor, con Map para medir (por plan). */
function contexto(tanda: ContextoTanda | null | undefined) {
  return {
    cupos: new Map((tanda?.cupos ?? []).map((c) => [c.planId, c.entrada])),
    t6: new Map<string, EstadoT6DelPlan>(
      (tanda?.t6 ?? []).map((p) => [
        p.planId,
        { delPlan: p.delPlan, medidas: new Map(p.medidas.map((m) => [m.clave, { autorizado: m.autorizado, movilizado: m.movilizado }])) },
      ]),
    ),
  };
}

/**
 * Rehace T6, T9 y la especie del censo de cada guía, en el orden en que se
 * importan, sumando sólo lo de las guías anteriores MARCADAS e importables.
 * Las guías salen en el mismo orden en que entraron.
 */
export function rehacerTanda(
  guias: readonly GuiaVistaPrevia[],
  tanda: ContextoTanda | null | undefined,
  eleccion: (g: GuiaVistaPrevia) => EleccionDeGuia,
): GuiaVistaPrevia[] {
  const { cupos, t6 } = contexto(tanda);
  const despachado = new Map<string, Map<string, number>>();
  /* Árbol → m³ de las guías anteriores que la revisión contó / que de verdad entran. */
  const aporteRevision = new Map<string, number>();
  const aporteMarcado = new Map<string, number>();
  const out = [...guias];
  const orden = ordenDeImportacion(guias, (g) => g.guia?.fecha ?? null, (g) => g.guia?.gtfNumber ?? null);
  for (const i of orden) {
    const g = guias[i];
    const b = g.base;
    if (!b) continue;
    if (b.yaImportada || !b.planId) {
      out[i] = { ...g, talas: b.talas, avisos: b.avisos, sobreCupo: null, sobreAutorizado: null, t6ConMotivo: false };
      continue;
    }
    const planId = b.planId;
    const aportes = aportesPorArbol(g, planId);
    const talas = talasDeLaTanda(b.talas, planId, aporteRevision, aporteMarcado);
    if (b.avanzaLibro) sumar(aporteRevision, aportes);
    const entrada = cupos.get(planId);
    const medida = t6.get(planId);
    const previo = despachado.get(planId) ?? new Map<string, number>();
    const r6 = medida ? despachoT6DeLaGuia(b.despachoT6, medida, previo, b.plantacion) : null;
    const avisos = [...b.avisos, ...avisosDeEspecie(talas, planId, entrada)];
    /* T6 (ADR-468): la guía que SERFOR ya emitió pide motivo a admin/dueño, si
       es de ESTE permiso y el libro mide lo que la guía dice (`noAplicaT6ConMotivo`).
       Leída de una foto o PDF, con reparo o vista por otro rol: bloqueada. */
    const pasaT6 = !!r6 && r6.excesos.length > 0;
    const verificada = g.guia?.verificadaEnSerfor === true;
    const reparo = b.noAplicaT6ConMotivo ?? null;
    const t6ConMotivo = pasaT6 && verificada && !reparo && tanda?.puedePasarT6 === true;
    if (r6 && pasaT6 && !t6ConMotivo) {
      const mensaje = !verificada ? avisoT6DeLaGuia(r6.excesos) : reparo ? avisoT6SinExcepcion(r6.excesos, reparo) : avisoT6SoloDueno(r6.excesos);
      avisos.push({ nivel: "bloquea", codigo: "exceso_autorizado", mensaje });
    }
    const rev = { avisos, yaImportada: null };
    const estado = estadoDeLaRevision(rev, g.permiso, g.crearTalaPorDefecto, b.elegido);
    const estadoSinTala = estadoDeLaRevision(rev, g.permiso, false, b.elegido);
    const cupoCon = entrada ? cupoDeLaGuia(entrada, talasAEscribir(talas, true)) : null;
    const cupoSin = entrada ? cupoDeLaGuia(entrada, talasAEscribir(talas, false)) : null;
    out[i] = {
      ...g,
      talas,
      estado,
      estadoSinTala,
      avisos,
      mensaje: g.permiso ? mensajeDelEstado(estado, rev, g.permiso, g.crearTalaPorDefecto) : g.mensaje,
      sobreCupo: cupoCon && cupoSin ? { conTala: cupoCon.sobreCupo, sinTala: cupoSin.sobreCupo } : null,
      sobreAutorizado: r6 ? r6.excesos : null,
      t6ConMotivo,
    };
    /* Lo que deja para las siguientes: sólo si va marcada y entra así. */
    const { marcada, crearTala } = eleccion(g);
    if (!marcada || !importable(crearTala ? estado : estadoSinTala)) continue;
    sumar(aporteMarcado, aportes);
    const despues = crearTala ? cupoCon : cupoSin;
    if (despues) cupos.set(planId, despues.despues);
    if (r6) {
      const suma = new Map(previo);
      for (const [clave, m3] of r6.despacha) suma.set(clave, (suma.get(clave) ?? 0) + m3);
      despachado.set(planId, suma);
    }
  }
  return out;
}

/** Junta el contexto de una vista previa nueva (p. ej. un grupo recalculado contra otro plan) con el que había. */
export function mezclarTanda(antes: ContextoTanda | null | undefined, nuevo: ContextoTanda | null | undefined): ContextoTanda | null {
  if (!nuevo) return antes ?? null;
  if (!antes) return nuevo;
  const planes = (xs: { planId: string }[]) => new Set(xs.map((x) => x.planId));
  const nCupos = planes(nuevo.cupos);
  const nT6 = planes(nuevo.t6);
  return {
    cupos: [...antes.cupos.filter((c) => !nCupos.has(c.planId)), ...nuevo.cupos],
    t6: [...antes.t6.filter((c) => !nT6.has(c.planId)), ...nuevo.t6],
    puedePasarT6: nuevo.puedePasarT6 ?? antes.puedePasarT6,
  };
}
