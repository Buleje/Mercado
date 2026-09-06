/**
 * lib/agents/domains/forestal.agent.ts
 *
 * El asistente, hablando el idioma del aserradero.
 *
 * El módulo forestal es el más grande del sistema (Libro de Operaciones CTP,
 * guías GTF, trozas pieza por pieza, títulos habilitantes) y hasta hoy el chat
 * no lo veía: preguntar «¿cuánta madera tengo en el patio?» daba una respuesta
 * inventada a partir del snapshot de la bodega. Estas acciones leen el libro de
 * verdad, con las mismas DB classes que las pantallas.
 *
 * Todo es de LECTURA. Escribir en el libro (crear un ingreso, declarar una
 * corrida, emitir una guía) es un acto con efectos legales ante SERFOR: se hace
 * desde su pantalla, con sus invariantes y su auditoría, no por chat.
 */

import type { DomainAgent, AgentTask, AgentResult, AgentContext } from "@/lib/agents/types";
import { scopedLogger, scopedCache } from "@/lib/agents/context";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { ForestCtpFichaDB } from "@/lib/db/forest-ctp-ficha.db";
import { avisosDeFicha } from "@/lib/forestal/ctp-ficha-types";

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Fecha `YYYY-MM-DD` → Date, o undefined. El período vacío = todo el libro. */
function fecha(v: unknown): Date | undefined {
  const s = texto(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// ── Existencias del libro ────────────────────────────────────────────────────

/**
 * Cuánta madera hay: materia prima (trozas sin aserrar) y producto terminado.
 *
 * Es el mismo `saldos()` que dibuja la pestaña Existencias, así que el chat no
 * puede contradecir a la pantalla. Se recorta a los primeros renglones porque
 * el resultado viaja al LLM: 200 especies no le sirven a nadie y queman
 * contexto que se necesita para razonar.
 */
async function existencias(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const cache = scopedCache(ctx);
  const fromDate = fecha(task.payload.desde);
  const toDate = fecha(task.payload.hasta);
  log.info("Leyendo saldos del libro CTP", { fromDate, toDate });

  const clave = `forestal:saldos:${fromDate?.toISOString() ?? "-"}:${toDate?.toISOString() ?? "-"}`;
  const s = await cache.getOrSet(clave, 120, () => ForestCtpDB.saldos(task.tenantId, { fromDate, toDate }));

  return {
    success: true,
    data: {
      materiaPrima: s.materiaPrima,
      // Las especies con más saldo primero: lo que hay en el patio se mira por
      // volumen, no alfabéticamente.
      especies: [...s.porEspecie]
        .sort((a, b) => b.saldoM3 - a.saldoM3)
        .slice(0, 15)
        .map((e) => ({ especie: e.especie, cites: e.cites, ingresoM3: e.ingresoM3, saldoM3: e.saldoM3 })),
      productos: [...s.productos].sort((a, b) => b.stock - a.stock).slice(0, 15),
      // El negativo es un error contable del libro, no un dato más: se despachó
      // o consumió más de lo que entró. Va aparte para que el LLM lo destaque.
      alertaEspeciesEnNegativo: s.materiaPrima.especiesEnNegativo,
      unidad: "m3",
    },
    metadata: { periodo: { desde: task.payload.desde ?? null, hasta: task.payload.hasta ?? null } },
  };
}

// ── Guías de ingreso (GTF) ───────────────────────────────────────────────────

/**
 * Busca ingresos por N° de guía, proveedor o especie. La GTF es el documento
 * que acredita el origen legal: es como el aserradero identifica una compra.
 */
async function buscarGuia(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const q = texto(task.payload.texto) || texto(task.payload.gtf);
  if (!q) return { success: false, error: "Decime el N° de guía, el proveedor o la especie a buscar." };
  log.info("Buscando ingresos", { q });

  const { entries, total } = await WoodEntriesDB.list(task.tenantId, { search: q, limit: 12 });

  return {
    success: true,
    data: {
      total,
      mostrados: entries.length,
      ingresos: entries.map((e) => ({
        id: e.id,
        fecha: e.entryDate?.toISOString().slice(0, 10) ?? null,
        gtf: [e.gtfSeries, e.gtfNumber].filter(Boolean).join("-") || null,
        proveedor: e.providerName,
        especie: e.speciesCommonName,
        cites: e.speciesCites,
        producto: e.productType,
        volumenM3: e.volumeM3 != null ? Number(e.volumeM3) : null,
        estado: e.status,
        origen: e.originCode,
      })),
    },
  };
}

// ── Una troza puntual ────────────────────────────────────────────────────────

/**
 * «Este palo, ¿de dónde salió y adónde fue?» — la pregunta que se hace parado
 * frente al tronco, con el código pintado a la vista.
 */
async function buscarTroza(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const codigo = texto(task.payload.codigo);
  if (!codigo) return { success: false, error: "Decime el código de la troza (el pintado en la testa)." };
  log.info("Buscando troza", { codigo });

  const troza = await WoodEntriesDB.buscarTrozaPorCodigo(task.tenantId, codigo);
  if (!troza) {
    return {
      success: true,
      data: { encontrada: false, codigo, mensaje: "Ninguna troza del patio tiene ese código." },
    };
  }

  const ficha = await WoodEntriesDB.fichaDeTroza(task.tenantId, troza.id).catch(() => null);
  return {
    success: true,
    data: {
      encontrada: true,
      codigo: troza.codigoPlanta ?? troza.codificacion,
      codificacionGuia: troza.codificacion,
      volumenM3: troza.volumenM3 != null ? Number(troza.volumenM3) : null,
      // El estado se dice en castellano de patio, no con el nombre del campo.
      estado: troza.noRecepcionada
        ? "declarada en la guía pero NO llegó al patio"
        : troza.consumidaEnId
          ? "ya consumida en una corrida de producción"
          : troza.retrozos.length > 0
            ? `retrozada en ${troza.retrozos.length} pedazos`
            : "en el patio, libre",
      pedazos: troza.retrozos.map((r) => r.codificacion),
      ficha: ficha ?? null,
    },
  };
}

// ── Qué falta / qué traba el cierre ──────────────────────────────────────────

/**
 * El estado de cumplimiento del libro en una respuesta: ingresos sin validar,
 * fuera de plazo, CITES del período y los avisos de la Ficha legal (títulos
 * vencidos, casilleros de la guía en blanco).
 */
async function pendientes(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  log.info("Resumiendo pendientes del libro");

  const [stats, ficha] = await Promise.all([
    WoodEntriesDB.stats(task.tenantId),
    ForestCtpFichaDB.get(task.tenantId).catch(() => null),
  ]);

  const avisos = ficha ? avisosDeFicha(ficha) : [];
  return {
    success: true,
    data: {
      ingresos: {
        total: stats.totalCount,
        volumenM3: stats.totalVolumeM3,
        sinValidar: stats.byStatus?.pendiente ?? 0,
        fueraDePlazo: stats.lateCount,
        cites: stats.citesCount,
        sinCodigoDeOrigen: stats.sinOrigenCount,
        sinCostoCargado: stats.sinCostoCount,
      },
      // Un título habilitante vencido invalida el origen de la madera que
      // ampara: va primero, con su nivel, para que el LLM no lo mezcle con
      // avisos menores.
      fichaLegal: avisos.map((a) => ({ nivel: a.nivel, titulo: a.titulo, detalle: a.detalle })),
      criticos: avisos.filter((a) => a.nivel === "critico").length,
    },
  };
}

// ── Agent ────────────────────────────────────────────────────────────────────

export const forestalAgent: DomainAgent = {
  domain: "forestal",
  actions: ["existencias", "buscar-guia", "buscar-troza", "pendientes"],
  description:
    "Libro de Operaciones CTP (SERFOR): existencias de madera, guías GTF de ingreso, trozas del patio y estado de cumplimiento. Solo lectura.",

  async execute(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    switch (task.action) {
      case "existencias":
        return existencias(task, ctx);
      case "buscar-guia":
        return buscarGuia(task, ctx);
      case "buscar-troza":
        return buscarTroza(task, ctx);
      case "pendientes":
        return pendientes(task, ctx);
      default:
        return { success: false, error: `Acción desconocida del libro forestal: ${task.action}` };
    }
  },
};
