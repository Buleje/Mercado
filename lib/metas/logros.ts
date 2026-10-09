/**
 * lib/metas/logros.ts — los logros del negocio, derivados de los datos (ADR-488).
 *
 * Antes se calculaban en el navegador con lo que bajaban 7 endpoints y se
 * guardaban en el localStorage: la racha nunca se escribía (5 de los 20 logros
 * no se podían ganar), «Mejor día» pedía S/ 5.000 fijos y «Todo cobrado» se
 * ganaba con cualquier fiado pagado. Ahora cada logro se mide al leer, con las
 * clases `lib/db` de siempre, en el día de Lima. Se conservan los ids y los
 * nombres de los 20 de antes; se suman el del marketplace y tres del
 * aserradero (medidos con las mismas calculadoras que las metas, y sólo si el
 * negocio tiene el módulo forestal).
 *
 * Una fuente que falla deja SUS logros «sin dato» (nunca «por ganar» con 0) y
 * no tumba a los demás.
 */
import "server-only";
import { getOrSet, invalidate } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { AdminGoalsDB } from "@/lib/db/admin-goals.db";
import { CustomersDB } from "@/lib/db/customers.db";
import { AnalyticsFiadoDB } from "@/lib/db/analytics-fiado.db";
import { MetasSerieDB, TOPE_DIAS_SERIE, type CierreDeCaja } from "@/lib/db/metas-serie.db";
import { avanceDeMetas, avanceDePrueba } from "@/lib/metas/avance";
import { veredictoArqueo } from "@/lib/caja/arqueo-veredicto";
import { listEnabledSpecializations } from "@/lib/specializations";
import {
  fechaParaMostrar,
  sumarDiasAFecha,
  type CategoriaMeta,
  type PeriodoMeta,
} from "@/lib/admin/metas-tareas";
import { prefijoCacheAvance } from "@/lib/metas/avance/tipos";
import {
  calcularMejorDia,
  calcularRacha,
  horaLima,
  metaDeVentas,
  type LogroDTO,
  type Racha,
  type RespuestaLogros,
} from "@/lib/metas/logros-reglas";
import { formatCurrency } from "@/lib/format";
import { limaDateKey } from "@/lib/utils";

export type { AreaLogro, LogroDTO, RespuestaLogros } from "@/lib/metas/logros-reglas";

const TTL_LOGROS = 300;
const CANTIDADES_VENTAS = [1, 100, 1000] as const;
const CANTIDADES_CLIENTES = [50, 100, 500] as const;
const TICKET_GRANDE = 500;
const COBRADOR = 1000;
const CIERRES_PERFECTOS = 3;
const HORA_MADRUGADOR = 7;
const M3_INGRESADOS = 100;

/** La caja perfecta: cierres seguidos sin diferencia. Un cierre automático (nadie contó) corta la cuenta. */
function rachaDeCierres(cierres: readonly CierreDeCaja[]): {
  actual: number;
  alcanzada: string | null;
} {
  let actual = 0;
  let alcanzada: string | null = null;
  for (const c of cierres) {
    const estado = veredictoArqueo({
      expectedAmount: c.expectedAmount,
      countedAmount: c.closingAmount,
      difference: c.difference,
      notes: c.notes,
      closedAt: c.closedAt?.toISOString() ?? null,
    });
    if (estado === "pendiente") continue;
    actual = estado === "conforme" ? actual + 1 : 0;
    if (actual === CIERRES_PERFECTOS && !alcanzada && c.closedAt)
      alcanzada = limaDateKey(c.closedAt);
  }
  return { actual, alcanzada };
}

/** El primer día en que se abrió la caja entre las 4:00 y las 7:00 de Lima. */
function primeraApertura(cierres: readonly CierreDeCaja[]): string | null {
  const temprana = cierres.find((c) => {
    const h = horaLima(c.openedAt);
    return h >= 4 && h < HORA_MADRUGADOR;
  });
  return temprana ? limaDateKey(temprana.openedAt) : null;
}

type Leido<T> = { ok: true; v: T } | { ok: false };

async function leer<T>(fuente: string, tenantId: string, fn: () => Promise<T>): Promise<Leido<T>> {
  try {
    return { ok: true, v: await fn() };
  } catch (err) {
    logger.error("[metas/logros] lectura falló", {
      fuente,
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false };
  }
}

/** Lo que lleva una categoría en el año (las mismas calculadoras que las metas). */
async function delAnio(
  tenantId: string,
  category: CategoriaMeta,
  unit: string,
  hoy: string,
): Promise<number> {
  const periodo: PeriodoMeta = "anual";
  const r = await avanceDePrueba(tenantId, { category, period: periodo, unit }, hoy);
  if (r.avance === null) throw new Error(`sin dato de ${category}`);
  return r.avance;
}

const sinDato = (base: Omit<LogroDTO, "ganado">): LogroDTO => ({
  ...base,
  ganado: false,
  sinDato: true,
  detalle: "No se pudo leer el dato. Reintenta en un rato.",
});

/** Logro por cantidad: ganado al llegar a `meta`; `desde` = el día en que se llegó. */
function porCantidad(
  base: Omit<LogroDTO, "ganado">,
  valor: number,
  meta: number,
  unidad: string,
  fecha?: string | null,
): LogroDTO {
  const ganado = valor >= meta;
  return {
    ...base,
    ganado,
    ...(ganado && fecha ? { desde: fecha } : {}),
    progreso: { valor, meta, unidad },
  };
}

/**
 * Las rachas cuentan días seguidos CON VENTA: no dependen de la meta, así que
 * subirla nunca te quita una «Racha 30» ya ganada. «Vendedor estrella» sí se
 * mide contra la meta diaria — la de hoy, porque la base no guarda las de
 * antes — y lo dice en su ⓘ.
 */
function logrosDeRacha(
  conVenta: Racha,
  conMeta: Racha | null,
  metaDiaria: number | null,
): LogroDTO[] {
  const corte = "Hoy no corta la racha mientras el día siga abierto.";
  const deRacha = (
    racha: Racha,
    id: string,
    nombre: string,
    largo: number,
    queMide: string,
  ): LogroDTO => {
    const fecha = racha.alcanzada[largo];
    const ganado = racha.mejor >= largo;
    return {
      id,
      area: "constancia",
      nombre,
      queMide,
      ganado,
      ...(ganado && fecha ? { desde: fecha } : {}),
      progreso: { valor: Math.min(racha.actual, largo), meta: largo, unidad: "días" },
      detalle: `Racha actual: ${racha.actual} ${racha.actual === 1 ? "día" : "días"} · la mejor: ${racha.mejor}`,
    };
  };
  const porVenta = (id: string, nombre: string, largo: number) =>
    deRacha(conVenta, id, nombre, largo, `${largo} días seguidos con al menos una venta. ${corte}`);
  const estrella: LogroDTO =
    conMeta && metaDiaria !== null
      ? deRacha(
          conMeta,
          "vendedor-estrella",
          "Vendedor estrella",
          5,
          `Cumplir tu meta diaria de ventas (${formatCurrency(metaDiaria)}) 5 días seguidos. Se mide con tu meta de hoy: si la cambias, los días pasados se miden con la nueva. ${corte}`,
        )
      : {
          id: "vendedor-estrella",
          area: "constancia",
          nombre: "Vendedor estrella",
          queMide: "Cumplir tu meta diaria de ventas 5 días seguidos.",
          ganado: false,
          detalle: "Ponle una meta diaria de ventas para empezar a contar",
        };
  return [
    porVenta("racha-3", "Racha 3", 3),
    porVenta("racha-7", "Racha 7", 7),
    porVenta("racha-30", "Racha 30", 30),
    porVenta("racha-100", "Racha centenaria", 100),
    estrella,
  ];
}

/**
 * Lo del aserradero, sólo si el negocio tiene el módulo: una bodega sin
 * forestal no ve «100 m³ ingresados» por ganar. `null` = no aplica (no se lee
 * ni se muestra); `listEnabledSpecializations` falla cerrado (sin módulos).
 */
async function leerForestal(
  tenantId: string,
  hoy: string,
): Promise<Record<"cubicado" | "ingresado" | "despachado", Leido<number> | null>> {
  const specs = new Set(await listEnabledSpecializations(tenantId));
  const conCtp = specs.has("spec:forestal:ctp-libro");
  const [cubicado, ingresado, despachado] = await Promise.all([
    specs.has("spec:forestal:herramientas")
      ? leer("cubicacion", tenantId, () => delAnio(tenantId, "cubicacion", "m³", hoy))
      : null,
    conCtp ? leer("ingreso", tenantId, () => delAnio(tenantId, "madera_ingresada", "m³", hoy)) : null,
    conCtp ? leer("despacho", tenantId, () => delAnio(tenantId, "despacho", "m³", hoy)) : null,
  ]);
  return { cubicado, ingresado, despachado };
}

async function calcular(tenantId: string, hoy: string): Promise<LogroDTO[]> {
  const desdeSerie = sumarDiasAFecha(hoy, -(TOPE_DIAS_SERIE - 1));
  const [
    metas,
    dias,
    ventas,
    clientes,
    cinco,
    buenas,
    cierres,
    deuda,
    cobrado,
    mkt,
    forestal,
  ] = await Promise.all([
    leer("metas", tenantId, () => AdminGoalsDB.listar(tenantId)),
    leer("serie", tenantId, () => MetasSerieDB.porDia(tenantId, desdeSerie, hoy)),
    leer("ventas", tenantId, () =>
      MetasSerieDB.hitosDeVentas(tenantId, CANTIDADES_VENTAS, TICKET_GRANDE),
    ),
    leer("clientes", tenantId, () => MetasSerieDB.hitosDeClientes(tenantId, CANTIDADES_CLIENTES)),
    leer("resenas5", tenantId, () => MetasSerieDB.hitosDeResenas(tenantId, 5, 5)),
    leer("resenas4", tenantId, () => MetasSerieDB.hitosDeResenas(tenantId, 4, 25)),
    leer("cajas", tenantId, () => MetasSerieDB.cierresDeCaja(tenantId)),
    leer("deuda", tenantId, () => CustomersDB.deudaDeFiados(tenantId)),
    leer("cobrado", tenantId, async () =>
      Number(
        (await AnalyticsFiadoDB.aggregateCuotasPaidSince(tenantId, new Date(0)))._sum.monto ?? 0,
      ),
    ),
    leer("marketplace", tenantId, () => delAnio(tenantId, "marketplace_pedidos", "pedidos", hoy)),
    leerForestal(tenantId, hoy),
  ]);
  const { cubicado, ingresado, despachado } = forestal;
  const avances = metas.ok
    ? await leer("avance", tenantId, () => avanceDeMetas(tenantId, metas.v, hoy))
    : ({ ok: false } as const);

  const out: LogroDTO[] = [];

  // ── Ventas ──
  const vBase = (id: string, nombre: string, queMide: string) => ({
    id,
    area: "ventas" as const,
    nombre,
    queMide,
  });
  const deVentas: Array<[string, string, number, string]> = [
    [
      "primera-venta",
      "Primera venta",
      1,
      "Tu primera venta del POS o pedido que entró como ingreso.",
    ],
    [
      "100-ventas",
      "100 ventas",
      100,
      "Llegar a 100 ventas y pedidos sumados, desde que empezaste.",
    ],
    ["1000-ventas", "Mil ventas", 1000, "Mil ventas y pedidos sumados, desde que empezaste."],
  ];
  for (const [id, nombre, meta, queMide] of deVentas) {
    out.push(
      ventas.ok
        ? porCantidad(vBase(id, nombre, queMide), ventas.v.n, meta, "ventas", ventas.v.fechas[meta])
        : sinDato(vBase(id, nombre, queMide)),
    );
  }
  const mejorBase = vBase(
    "mejor-dia",
    "Mejor día",
    "Un día en que vendiste más que tu récord anterior (se mira el último año, día de Lima).",
  );
  if (dias.ok) {
    const m = calcularMejorDia(dias.v, hoy);
    out.push({
      ...mejorBase,
      ganado: m.superadoEn !== null,
      ...(m.superadoEn ? { desde: m.superadoEn } : {}),
      ...(m.previoAHoy > 0
        ? { progreso: { valor: m.hoyTotal, meta: m.previoAHoy, unidad: "S/" } }
        : {}),
      detalle: m.recordDia
        ? `Récord: ${formatCurrency(m.record)} el ${fechaParaMostrar(m.recordDia)} · hoy llevas ${formatCurrency(m.hoyTotal)}`
        : "Todavía no hay ventas para tener un récord.",
    });
  } else out.push(sinDato(mejorBase));
  const ticketBase = vBase(
    "ticket-grande",
    "Ticket grande",
    `Una sola venta o pedido de ${formatCurrency(TICKET_GRANDE)} o más.`,
  );
  out.push(
    ventas.ok
      ? porCantidad(ticketBase, ventas.v.ticketMax, TICKET_GRANDE, "S/", ventas.v.fechaTicket)
      : sinDato(ticketBase),
  );

  // ── Clientes ──
  const cBase = (id: string, nombre: string, queMide: string) => ({
    id,
    area: "clientes" as const,
    nombre,
    queMide,
  });
  const deClientes: Array<[string, string, number]> = [
    ["50-clientes", "50 clientes", 50],
    ["100-clientes", "100 clientes", 100],
    ["500-clientes", "Imperio vecinal", 500],
  ];
  for (const [id, nombre, meta] of deClientes) {
    const base = cBase(id, nombre, `Llegar a ${meta} clientes registrados.`);
    out.push(
      clientes.ok
        ? porCantidad(base, clientes.v.n, meta, "clientes", clientes.v.fechas[meta])
        : sinDato(base),
    );
  }
  const felizBase = cBase(
    "cliente-feliz",
    "Cliente feliz",
    "Recibir 5 reseñas de 5 estrellas en tu tienda.",
  );
  out.push(
    cinco.ok
      ? porCantidad(felizBase, cinco.v.n, 5, "reseñas", cinco.v.fechas[5])
      : sinDato(felizBase),
  );
  const buenasBase = cBase(
    "5-resenas-buenas",
    "Reseñas buenas",
    "Recibir 25 reseñas de 4 o 5 estrellas en tu tienda.",
  );
  out.push(
    buenas.ok
      ? porCantidad(buenasBase, buenas.v.n, 25, "reseñas", buenas.v.fechas[25])
      : sinDato(buenasBase),
  );

  // ── Caja y cobranza ──
  const kBase = (id: string, nombre: string, queMide: string) => ({
    id,
    area: "caja" as const,
    nombre,
    queMide,
  });
  const todoBase = kBase(
    "todo-cobrado",
    "Todo cobrado",
    "Ningún fiado con saldo pendiente, después de haber cobrado alguno.",
  );
  if (deuda.ok && cobrado.ok) {
    const conSaldo = deuda.v.size;
    out.push({
      ...todoBase,
      ganado: conSaldo === 0 && cobrado.v > 0,
      detalle:
        conSaldo === 0
          ? cobrado.v > 0
            ? "Nadie te debe"
            : "Todavía no cobraste ningún fiado"
          : `${conSaldo} ${conSaldo === 1 ? "cliente" : "clientes"} con saldo`,
    });
  } else out.push(sinDato(todoBase));
  const cobradorBase = kBase(
    "cobrador",
    "Cobrador",
    `Cobrar más de ${formatCurrency(COBRADOR)} en cuotas de fiados, desde que empezaste.`,
  );
  out.push(
    cobrado.ok
      ? porCantidad(cobradorBase, Math.round(cobrado.v * 100) / 100, COBRADOR, "S/")
      : sinDato(cobradorBase),
  );
  const perfectaBase = kBase(
    "caja-perfecta",
    "Caja perfecta",
    "3 cierres de caja seguidos sin diferencia. Un cierre automático (nadie contó) corta la cuenta.",
  );
  const madrugaBase = kBase(
    "madrugador",
    "Madrugador",
    "Abrir la caja entre las 4:00 y las 7:00 (hora de Lima).",
  );
  if (cierres.ok) {
    const r = rachaDeCierres(cierres.v);
    out.push({
      ...perfectaBase,
      ganado: r.alcanzada !== null,
      ...(r.alcanzada ? { desde: r.alcanzada } : {}),
      progreso: {
        valor: Math.min(r.actual, CIERRES_PERFECTOS),
        meta: CIERRES_PERFECTOS,
        unidad: "cierres",
      },
    });
    const temprano = primeraApertura(cierres.v);
    out.push({
      ...madrugaBase,
      ganado: temprano !== null,
      ...(temprano ? { desde: temprano } : {}),
    });
  } else out.push(sinDato(perfectaBase), sinDato(madrugaBase));

  // ── Constancia ──
  const metaDiaria = metas.ok ? (metaDeVentas(metas.v, "diario")?.target ?? null) : null;
  if (dias.ok) {
    const conMeta = metaDiaria !== null ? calcularRacha(dias.v, desdeSerie, hoy, metaDiaria) : null;
    out.push(...logrosDeRacha(calcularRacha(dias.v, desdeSerie, hoy, null), conMeta, metaDiaria));
  } else {
    for (const [id, nombre] of [
      ["racha-3", "Racha 3"],
      ["racha-7", "Racha 7"],
      ["racha-30", "Racha 30"],
      ["racha-100", "Racha centenaria"],
      ["vendedor-estrella", "Vendedor estrella"],
    ] as const) {
      out.push(sinDato({ id, area: "constancia", nombre, queMide: "Días seguidos vendiendo." }));
    }
  }
  const cumplidaBase = {
    id: "meta-cumplida",
    area: "constancia" as const,
    nombre: "Meta cumplida",
    queMide: "Que alguna de tus metas esté cumplida en su período (las de Metas y logros).",
  };
  if (avances.ok) {
    const cumplidas = avances.v.filter((a) => a.estado === "cumplida").length;
    out.push({
      ...cumplidaBase,
      ganado: cumplidas > 0,
      progreso: { valor: Math.min(cumplidas, 1), meta: 1, unidad: "metas" },
      detalle:
        avances.v.length === 0
          ? "Todavía no tienes metas."
          : `${cumplidas} de ${avances.v.length} metas cumplidas.`,
    });
  } else out.push(sinDato(cumplidaBase));

  // ── Marketplace ──
  const mktBase = {
    id: "primer-pedido-marketplace",
    area: "marketplace" as const,
    nombre: "Primer pedido del marketplace",
    queMide: "Un pedido del marketplace que entró como ingreso este año.",
  };
  out.push(mkt.ok ? porCantidad(mktBase, mkt.v, 1, "pedidos") : sinDato(mktBase));

  // ── Aserradero ──
  const fBase = (id: string, nombre: string, queMide: string) => ({
    id,
    area: "forestal" as const,
    nombre,
    queMide,
  });
  const cubBase = fBase(
    "primer-lote-cubicado",
    "Primer lote cubicado del año",
    "Un lote de trozas cubicado (aplicado) este año, en Herramientas forestales.",
  );
  if (cubicado) out.push(cubicado.ok ? { ...cubBase, ganado: cubicado.v > 0 } : sinDato(cubBase));
  const ingBase = fBase(
    "100-m3-ingresados",
    "100 m³ ingresados en el año",
    "100 m³ de madera que entró al aserradero este año (Libro CTP).",
  );
  if (ingresado)
    out.push(
      ingresado.ok ? porCantidad(ingBase, ingresado.v, M3_INGRESADOS, "m³") : sinDato(ingBase),
    );
  const despBase = fBase(
    "primer-despacho",
    "Primer despacho del año",
    "Un despacho de madera este año (Libro CTP).",
  );
  if (despachado)
    out.push(despachado.ok ? { ...despBase, ganado: despachado.v > 0 } : sinDato(despBase));

  return out;
}

/** Los logros del negocio al día de Lima `hoy`. Caché de 5 min; se borra con las metas (mismo prefijo). */
export async function evaluarLogros(
  tenantId: string,
  hoy: string,
  fresco = false,
): Promise<RespuestaLogros> {
  if (!tenantId) throw new Error("tenantId is required");
  const clave = `${prefijoCacheAvance(tenantId)}logros:${hoy}`;
  if (fresco) invalidate(clave);
  const logros = await getOrSet(clave, TTL_LOGROS, () => calcular(tenantId, hoy));
  return { hoy, logros };
}
