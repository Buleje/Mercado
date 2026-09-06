/**
 * reparto-revision — el repaso ANTES de registrar en el Libro de Operaciones.
 *
 * Brandon, 2026-09-02: «cuando se registre, revisar o dar un aviso: cuál de
 * los registros puestos no cuadra, o qué problema tiene».
 *
 * Los gates estáticos (tsc, lint) nunca van a ver estos problemas: son de
 * SEMÁNTICA de datos —un bloque sin GTF, dos bloques declarando la misma guía,
 * aserrada que ningún bloque respalda—. Todos pasan el compilador y todos
 * terminan en un papel que se presenta ante SERFOR.
 *
 * Dos reglas de diseño que se ganaron con bugs anteriores:
 *
 *  1. **Agregado, no fila por fila.** Que a los bloques les sobre capacidad es
 *     lo normal (siempre entra más rolliza de la que hay aserrada cubicada).
 *     Un aviso por bloque llenaría la lista de ruido y enseñaría a ignorarla
 *     entera — la lección de los «siete rojos falsos». Los problemas que son
 *     del conjunto se reportan UNA vez, por especie.
 *
 *  2. **Tolerancia del negocio, no del float.** Diez litros. El aserradero mide
 *     con cinta, y el reparto asigna piezas enteras: un bloque «lleno» cierra
 *     con unos mililitros de arrastre que no son madera esperando.
 */

import {
  esAserradaDirecta, juzgarRendimiento,
  type BloqueRolliza, type Distribucion,
} from "./cubicacion-reparto";

/**
 * Diez litros. Debajo de esto, una diferencia de volumen es el redondeo del
 * reparto (asigna piezas ENTERAS), no madera. Sale de cómo se mide en el
 * aserradero, no del epsilon del float.
 */
export const TOL_REVISION_M3 = 0.01;

export type SeveridadRevision = "error" | "aviso";

export interface HallazgoRevision {
  /** Clave estable — sirve de `key` en React y para no repetir el mismo aviso. */
  id: string;
  severidad: SeveridadRevision;
  /** El bloque al que apunta, o `null` si el problema es del conjunto. */
  bloqueId: string | null;
  /** Dónde mirar: la etiqueta del bloque, o la especie. */
  donde: string;
  /** Qué pasa, en una línea. */
  que: string;
  /** Qué hacer para resolverlo. */
  comoArreglar: string;
}

const rotulo = (b: BloqueRolliza) => b.etiqueta.trim() || "Bloque sin etiqueta";
const vacio = (v: string | null | undefined) => (v ?? "").trim() === "";

/**
 * Repasa la distribución y devuelve lo que no cuadra, lo más grave primero.
 *
 * `error` = no debería declararse así (falta un dato obligatorio, o hay madera
 * sin respaldo). `aviso` = se puede declarar, pero conviene mirarlo.
 */
export function revisarDistribucion(
  bloques: readonly BloqueRolliza[],
  dist: Distribucion,
): HallazgoRevision[] {
  const out: HallazgoRevision[] = [];

  // ── Por bloque: los datos que el papel necesita sí o sí ────────────────
  /* Una GTF declarada dos veces es la misma madera amparada dos veces: se
     detecta por etiqueta normalizada, no por id. */
  const porEtiqueta = new Map<string, BloqueRolliza[]>();
  for (const b of bloques) {
    const k = b.etiqueta.trim().toLowerCase();
    if (k === "") continue;
    const acc = porEtiqueta.get(k) ?? [];
    acc.push(b);
    porEtiqueta.set(k, acc);
  }

  for (const b of bloques) {
    const directa = esAserradaDirecta(b);

    if (vacio(b.etiqueta)) {
      out.push({
        id: `${b.id}:sin-etiqueta`,
        severidad: "error",
        bloqueId: b.id,
        donde: rotulo(b),
        que: "No tiene guía ni lote de origen.",
        comoArreglar: directa
          ? "Escribí de dónde vino esa madera aserrada (compra, inventario, N° de documento) en «Etiqueta»."
          : "Escribí el N° de GTF o el código del lote en «Etiqueta»: sin eso no se puede rastrear de dónde salió.",
      });
    }

    if (vacio(b.especie)) {
      out.push({
        id: `${b.id}:sin-especie`,
        severidad: "error",
        bloqueId: b.id,
        donde: rotulo(b),
        que: "No tiene especie.",
        comoArreglar: "Elegí la especie: el reparto agrupa por especie y el Anexo 04 la declara pieza por pieza.",
      });
    }

    if (!(Number(b.m3) > 0)) {
      out.push({
        id: `${b.id}:sin-volumen`,
        severidad: "error",
        bloqueId: b.id,
        donde: rotulo(b),
        que: `No tiene ${directa ? "m³ (A)" : "m³ (R)"} cargados.`,
        comoArreglar: "Poné el volumen que entró: sin eso el bloque no ampara nada.",
      });
    }

    if (vacio(b.permiso)) {
      out.push({
        id: `${b.id}:sin-permiso`,
        severidad: "aviso",
        bloqueId: b.id,
        donde: rotulo(b),
        que: "No tiene N° de permiso (título habilitante).",
        comoArreglar: "Cargalo para que el Anexo 04 no mezcle títulos habilitantes sin que se note.",
      });
    }

    if (vacio(b.fecha)) {
      out.push({
        id: `${b.id}:sin-fecha`,
        severidad: "aviso",
        bloqueId: b.id,
        donde: rotulo(b),
        que: "No tiene fecha de aserrío.",
        comoArreglar: "El Libro de Operaciones se registra día por día: poné el día en que se aserró.",
      });
    }
  }

  for (const [, iguales] of porEtiqueta) {
    if (iguales.length < 2) continue;
    out.push({
      id: `dup:${iguales[0].id}`,
      severidad: "error",
      bloqueId: iguales[0].id,
      donde: rotulo(iguales[0]),
      que: `${iguales.length} bloques declaran la misma guía «${iguales[0].etiqueta.trim()}».`,
      comoArreglar: "Una guía ampara una sola vez: uní los bloques, o corregí la etiqueta del que esté repetido.",
    });
  }

  // ── Por bloque, ya distribuido: el que no ampara nada ──────────────────
  for (const e of dist.especies) {
    for (const d of e.bloques) {
      if (d.capacidadM3 > TOL_REVISION_M3 && d.usadoM3 <= TOL_REVISION_M3) {
        out.push({
          id: `${d.bloque.id}:sin-amparar`,
          severidad: "aviso",
          bloqueId: d.bloque.id,
          donde: rotulo(d.bloque),
          que: "No le tocó nada: su Anexo 04 saldría vacío.",
          comoArreglar: "Los bloques se llenan en orden y los de arriba ya se llevaron toda la aserrada de esta especie. Subilo de posición, sacalo, o cubicá más madera.",
        });
      }
      const tope = d.bloque.piezasManual;
      const puestas = d.asignado.reduce((a, g) => a + g.piezas, 0);
      if (tope != null && tope > 0 && puestas < tope) {
        out.push({
          id: `${d.bloque.id}:piezas-cortas`,
          severidad: "aviso",
          bloqueId: d.bloque.id,
          donde: rotulo(d.bloque),
          que: `Pediste ${tope} piezas y el reparto sólo encontró ${puestas}.`,
          comoArreglar: "Bajá el tope a lo que hay, o cubicá las piezas que faltan de esa especie.",
        });
      }
    }
  }

  // ── Por especie: lo que es del conjunto, una sola vez ──────────────────
  for (const e of dist.especies) {
    const nombre = e.especie || "Sin especie";

    if (e.faltanteM3 > TOL_REVISION_M3) {
      const piezas = e.faltante.reduce((a, f) => a + f.piezas, 0);
      out.push({
        id: `esp:${nombre}:faltante`,
        severidad: "error",
        bloqueId: null,
        donde: nombre,
        que: `Quedan ${e.faltanteM3.toFixed(3)} m³ (${piezas} piezas) de aserrada sin respaldo de rolliza.`,
        comoArreglar: `Agregá un bloque con la rolliza que falta (harían falta ${e.rollizaFaltanteM3.toFixed(3)} m³ al aprovechamiento vigente), o declaralo como madera ya aserrada.`,
      });
    }

    if (e.libreM3 > TOL_REVISION_M3) {
      out.push({
        id: `esp:${nombre}:libre`,
        severidad: "aviso",
        bloqueId: null,
        donde: nombre,
        que: `Sobran ${e.libreM3.toFixed(3)} m³ de capacidad sin usar en sus bloques.`,
        comoArreglar: "Es normal si todavía falta cubicar. Si el lote ya está cerrado, revisá el % aprovechable o el m³ de rolliza cargado.",
      });
    }

    if (e.porPermiso.length > 1) {
      out.push({
        id: `esp:${nombre}:permisos`,
        severidad: "aviso",
        bloqueId: null,
        donde: nombre,
        que: `Combina bloques de ${e.porPermiso.length} permisos distintos.`,
        comoArreglar: "Emití un Anexo 04 por permiso: una hoja que mezcla títulos habilitantes no se puede presentar contra ninguno.",
      });
    }

    /*
     * El rendimiento se juzga con la MISMA función que pinta el KPI
     * (`juzgarRendimiento`): dos criterios para el mismo número serían dos
     * verdades distintas.
     *
     * Dos condiciones que se ganaron mirando la lista real:
     *
     *  - Sólo si hay aserrada cubicada de esa especie. Una especie con rolliza
     *    y sin ninguna tabla da 0 % y `juzgarRendimiento` lo llama «bajo para
     *    aserrío» — pero no es un rendimiento malo, es que todavía no se
     *    cubicó nada. El aviso útil ahí es otro (el bloque que no ampara).
     *
     *  - `error` SÓLO cuando salió más de lo que entró (>100 %), que es
     *    físicamente imposible y por eso no se puede declarar. Un rendimiento
     *    bajo o alto es para MIRAR: se declara igual, y marcarlo en rojo junto
     *    a los datos que de verdad faltan enseña a ignorar el rojo.
     */
    const j = juzgarRendimiento(e.rendimientoPct);
    const hayQueJuzgar = e.rollizaM3 > TOL_REVISION_M3 && e.aserradaM3 > TOL_REVISION_M3;
    if (hayQueJuzgar && (j.tono === "error" || j.tono === "warning")) {
      const imposible = (e.rendimientoPct ?? 0) > 100;
      out.push({
        id: `esp:${nombre}:rendimiento`,
        severidad: imposible ? "error" : "aviso",
        bloqueId: null,
        donde: nombre,
        que: `Rendimiento ${e.rendimientoPct == null ? "—" : `${e.rendimientoPct.toFixed(1)} %`} — ${j.label}.`,
        comoArreglar: imposible
          ? "De una troza no sale más madera aserrada que la troza misma: revisá el m³ de rolliza cargado o el «ampara» dicho a mano."
          : "Verificá el m³ de rolliza cargado y que esté cubicada toda la madera que salió de esa troza.",
      });
    }
  }

  // Errores primero: es el orden en que hay que resolverlos.
  return out.sort((a, b) => (a.severidad === b.severidad ? 0 : a.severidad === "error" ? -1 : 1));
}

/** Cuántos de cada clase — para el contador del botón «Revisar». */
export function contarRevision(hallazgos: readonly HallazgoRevision[]): { errores: number; avisos: number } {
  return {
    errores: hallazgos.filter((h) => h.severidad === "error").length,
    avisos: hallazgos.filter((h) => h.severidad === "aviso").length,
  };
}
