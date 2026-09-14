/**
 * estado-cuenta-unificado — el estado de cuenta de UNA persona, juntando
 * Adelantos y la cuenta corriente forestal en una sola línea de tiempo
 * (ADR-412 §5, la vista de detalle de "Cuenta por persona").
 *
 * ## Por qué existe
 *
 * `cuenta-unificada.ts` resuelve el RESUMEN (cuánto debe hoy). Esto resuelve
 * el CAMINO: las líneas una por una, en orden cronológico, con el saldo
 * corrido — lo que hace falta para mandarle a alguien su estado de cuenta por
 * WhatsApp o en PDF, y lo que convence cuando discute el número
 * (`corridaDeSaldos` ya hace esto mismo para la cuenta forestal sola).
 *
 * ## Mismo criterio de signo que el resto del módulo
 *
 * `+` = le sube la deuda (un adelanto entregado, un aserrío cobrado, una venta
 * de madera). `−` = la persona entregó o pagó. Es EXACTAMENTE la convención de
 * `estado-cuenta.ts` (Adelantos) y `cuenta-corriente.ts` (forestal) — acá sólo
 * se intercalan las dos listas.
 *
 * ## Multi-moneda sin mezclar
 *
 * El acumulado corre POR MONEDA (un acumulador por cada una), igual que
 * `movimientosDePersona`: un adelanto en dólares al lado de un cargo forestal
 * en soles no puede sumarse en el mismo número — es la misma plata mezclada
 * que ya se corrigió una vez (auditoría 2026-08-04). Lo que no es PEN, venga
 * de Adelantos o de la cuenta forestal, va a `otrasMonedas` y se escribe con
 * su código: nunca «S/» delante de dólares.
 *
 * ## Fechas: Lima para lo que tiene hora, UTC para el día sin hora
 *
 * Adelantos y entregas guardan la hora; la cuenta forestal guarda el día a
 * medianoche UTC. Ver `formatearDia`.
 *
 * ## Los totales tienen que coincidir con el resumen
 *
 * `totalesDeEstadoCuenta(...).neto` sale de reproducir la MISMA plata que
 * `unificarCuentas` ya resume (montoAdelantado/saldoPendiente por un lado,
 * ForestCuentaMov por el otro) — si un día contaran distinto, la fila y el
 * detalle se contradirían sobre la misma deuda.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import { CONCEPTO_LABEL, type MovimientoCuenta } from "@/lib/forestal/cuenta-corriente";
import { leerNeto, montoEnMoneda } from "@/lib/adelantos/cuenta-unificada";
import { STORE_TIMEZONE } from "@/lib/utils";

const r2 = (n: number) => Math.round(n * 100) / 100;
const casiCero = (n: number) => Math.abs(n) < 0.005;

// ── Fechas ───────────────────────────────────────────────────────────────────

/**
 * Medianoche UTC exacta = un día sin hora: así guarda la cuenta forestal, y
 * así queda también un adelanto cargado desde un campo de fecha.
 */
function esDiaSinHora(d: Date): boolean {
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
}

/**
 * El día de una fecha, como lo vivió el negocio.
 *
 * Lo que trae hora (adelantos y entregas: `new Date()` al registrar) se lee en
 * hora de Lima. Formateado en UTC, lo registrado de las 19:00 en adelante salía
 * con el día siguiente — medido en el tenant real: 12 de 47 adelantos y 6 de 11
 * entregas. Un día sin hora (00:00Z) se lee en UTC: en Lima retrocedería uno.
 */
export function formatearDia(iso: string, formato: Intl.DateTimeFormatOptions): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PE", { ...formato, timeZone: esDiaSinHora(d) ? "UTC" : STORE_TIMEZONE });
}

/** "2026-09-05", con el mismo criterio que `formatearDia` — la clave para ordenar. */
function claveDia(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-CA", { timeZone: esDiaSinHora(d) ? "UTC" : STORE_TIMEZONE });
}

// ── Entradas ─────────────────────────────────────────────────────────────────

export interface EntregaParaEstadoCuenta {
  fecha: string;
  descripcion: string | null;
  valor: number;
}

export interface AdelantoParaEstadoCuenta {
  status: string;
  codigoOperacion: string | null;
  fechaAdelanto: string;
  montoAdelantado: number;
  moneda: string | null;
  entregas: EntregaParaEstadoCuenta[];
}

// ── Salida ───────────────────────────────────────────────────────────────────

export interface LineaEstadoCuenta {
  fecha: string;
  origen: "adelanto" | "entrega" | "forestal";
  concepto: string;
  /** "ADL-2026-0007", "Corrida N° 18" — lo que ancla la línea a su origen. */
  referencia: string | null;
  /** `+` sube la deuda, `−` la persona entregó o pagó. */
  monto: number;
  moneda: string;
  /** Saldo corrido DESPUÉS de esta línea — un acumulador POR MONEDA. */
  acumulado: number;
}

export interface TotalesPata {
  cargos: number;
  abonos: number;
  /** cargos − abonos, sólo en PEN. */
  saldo: number;
}

export interface TotalesEstadoCuenta {
  adelantos: TotalesPata;
  forestal: TotalesPata;
  /** adelantos.saldo + forestal.saldo, en PEN — misma cifra que `unificarCuentas`. */
  neto: number;
  /** Saldo en monedas != PEN (de Adelantos y de la cuenta forestal), fuera del neto. */
  otrasMonedas: Record<string, number>;
}

/**
 * Las líneas de la persona, en orden cronológico, con el saldo corrido.
 *
 * Un adelanto CANCELADO no se cobra: no ensucia una cuenta que se le puede
 * mandar a la persona (mismo criterio que `movimientosDePersona`).
 */
export function estadoCuentaUnificado(
  adelantos: AdelantoParaEstadoCuenta[],
  movimientosForestales: MovimientoCuenta[],
): LineaEstadoCuenta[] {
  type Suelto = Omit<LineaEstadoCuenta, "acumulado">;
  const sueltos: Suelto[] = [];

  for (const a of adelantos) {
    if (a.status === "CANCELADO") continue;
    const moneda = a.moneda || "PEN";
    sueltos.push({
      fecha: a.fechaAdelanto,
      origen: "adelanto",
      concepto: "Adelanto",
      referencia: a.codigoOperacion,
      monto: a.montoAdelantado,
      moneda,
    });
    for (const e of a.entregas) {
      sueltos.push({
        fecha: e.fecha,
        origen: "entrega",
        concepto: e.descripcion?.trim() || "Entrega",
        referencia: a.codigoOperacion,
        monto: -e.valor,
        moneda,
      });
    }
  }

  for (const m of movimientosForestales) {
    sueltos.push({
      fecha: m.fecha,
      origen: "forestal",
      concepto: CONCEPTO_LABEL[m.concepto] ?? m.concepto,
      referencia: m.referencia,
      monto: m.tipo === "cargo" ? m.monto : -m.monto,
      moneda: m.moneda || "PEN",
    });
  }

  // Por el DÍA que se lee en la línea y, dentro del día, por instante. Sólo por
  // instante, un adelanto de las 20:00 del 5 (01:00Z del 6) quedaba después de
  // un cargo forestal del 6 (00:00Z) y el saldo corrido saltaba de orden.
  const ordenados = sueltos
    .map((s) => ({ s, dia: claveDia(s.fecha), t: new Date(s.fecha).getTime() }))
    .sort((x, y) => x.dia.localeCompare(y.dia) || x.t - y.t);

  const acumulados: Record<string, number> = {};
  return ordenados.map(({ s }) => {
    const nuevo = r2((acumulados[s.moneda] ?? 0) + s.monto);
    acumulados[s.moneda] = nuevo;
    return { ...s, acumulado: nuevo };
  });
}

function agregarPata(lineas: LineaEstadoCuenta[]): TotalesPata {
  let cargos = 0;
  let abonos = 0;
  for (const l of lineas) {
    if (l.moneda !== "PEN") continue; // las otras monedas van aparte (otrasMonedas)
    if (l.monto >= 0) cargos += l.monto;
    else abonos += -l.monto;
  }
  return { cargos: r2(cargos), abonos: r2(abonos), saldo: r2(cargos - abonos) };
}

/** Totales por pata, en PEN, + lo que queda fuera del neto (otras monedas). */
export function totalesDeEstadoCuenta(lineas: LineaEstadoCuenta[]): TotalesEstadoCuenta {
  const adelantos = agregarPata(lineas.filter((l) => l.origen !== "forestal"));
  const forestal = agregarPata(lineas.filter((l) => l.origen === "forestal"));

  // De las DOS patas: antes sólo se juntaba lo de Adelantos, y un movimiento
  // forestal en otra moneda no entraba ni al neto ni acá — desaparecía.
  const otras: Record<string, number> = {};
  for (const l of lineas) {
    if (l.moneda === "PEN") continue;
    otras[l.moneda] = r2((otras[l.moneda] ?? 0) + l.monto);
  }

  return { adelantos, forestal, neto: r2(adelantos.saldo + forestal.saldo), otrasMonedas: otras };
}

// ── Cómo pagar ───────────────────────────────────────────────────────────────

/**
 * A dónde se le paga AL NEGOCIO. Sale de la configuración del tenant
 * (`datosPagoDelNegocio`), nunca de la ficha de la persona: el banco y la
 * cuenta de su ficha son para transferirLE a ella, y ponerlos bajo «Cómo
 * pagar» hacía que el deudor terminara pagándose a sí mismo.
 */
export interface DatosPago {
  banco?: string | null;
  cuentaBancaria?: string | null;
  /** A nombre de quién está la cuenta. */
  titular?: string | null;
  /** "987654321 (Bodega San Martín)". */
  yape?: string | null;
  plin?: string | null;
}

/** Los medios de pago de la configuración del negocio — un recorte de `DbSettings`. */
export interface MediosDePagoDelNegocio {
  transferEnabled?: boolean;
  transferBankName?: string | null;
  transferAccountNum?: string | null;
  transferAccountHolder?: string | null;
  yapeEnabled?: boolean;
  yapeName?: string | null;
  yapePhone?: string | null;
  plinEnabled?: boolean;
  plinName?: string | null;
  plinPhone?: string | null;
}

/**
 * Los datos de pago del negocio, o `null` si no tiene ninguno — y entonces el
 * WhatsApp no lleva «Cómo pagar».
 *
 * Sólo los medios HABILITADOS: son los que el dueño publicó como forma de
 * pagarle; un número apagado en la configuración puede ser uno que ya no usa.
 * Un banco sin número de cuenta no es a dónde transferir.
 */
export function datosPagoDelNegocio(s: MediosDePagoDelNegocio): DatosPago | null {
  const limpio = (v?: string | null) => v?.trim() || null;
  const conTitular = (numero: string | null, titular: string | null) =>
    numero ? (titular ? `${numero} (${titular})` : numero) : null;
  const cuenta = s.transferEnabled ? limpio(s.transferAccountNum) : null;
  const pago: DatosPago = {
    banco: cuenta ? limpio(s.transferBankName) : null,
    cuentaBancaria: cuenta,
    titular: cuenta ? limpio(s.transferAccountHolder) : null,
    yape: s.yapeEnabled ? conTitular(limpio(s.yapePhone), limpio(s.yapeName)) : null,
    plin: s.plinEnabled ? conTitular(limpio(s.plinPhone), limpio(s.plinName)) : null,
  };
  return pago.cuentaBancaria || pago.yape || pago.plin ? pago : null;
}

function comoPagarTexto(pago?: DatosPago | null): string | null {
  if (!pago) return null;
  const cuenta = pago.cuentaBancaria?.trim();
  const titular = pago.titular?.trim();
  const partes = [
    cuenta
      ? `${[pago.banco?.trim(), `cuenta ${cuenta}`].filter(Boolean).join(" ")}${titular ? ` (${titular})` : ""}`
      : null,
    pago.yape?.trim() ? `Yape ${pago.yape.trim()}` : null,
    pago.plin?.trim() ? `Plin ${pago.plin.trim()}` : null,
  ].filter((v): v is string => Boolean(v));
  return partes.length ? partes.join(" · ") : null;
}

// ── WhatsApp ─────────────────────────────────────────────────────────────────

const DIA_CORTO: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "2-digit" };

/**
 * El resumen corto para WhatsApp: nombre, el saldo en palabras (`leerNeto`,
 * mismo texto que ya se lee en la fila) — uno por moneda —, las últimas 5
 * líneas y cómo pagarle al negocio si la persona debe y hay un medio cargado.
 * No manda el historial entero — eso es lo que trae el PDF.
 */
export function resumenWhatsApp(
  nombre: string,
  lineas: LineaEstadoCuenta[],
  totales: TotalesEstadoCuenta,
  pago?: DatosPago | null,
): string {
  const raya = "━━━━━━━━━━━━━━━━━━━";
  const ultimas = lineas.slice(-5);
  const cuerpo =
    ultimas
      .map(
        (l) =>
          `${formatearDia(l.fecha, DIA_CORTO)} · ${l.concepto}${l.referencia ? ` (${l.referencia})` : ""}: ${
            l.monto >= 0 ? "+" : "−"
          }${montoEnMoneda(Math.abs(l.monto), l.moneda)}`,
      )
      .join("\n") || "Sin movimientos todavía.";

  // El neto es en soles; cada otra moneda va en su propia línea, con su código.
  // Con los soles en cero y dólares pendientes, «está al día» era mentira.
  const otras = Object.entries(totales.otrasMonedas).filter(([, v]) => !casiCero(v));
  const saldos = [
    ...(!casiCero(totales.neto) || otras.length === 0 ? [leerNeto(totales.neto, nombre)] : []),
    ...otras.map(([moneda, v]) => leerNeto(v, nombre, moneda)),
  ]
    .map((t) => `*${t}*`)
    .join("\n");

  // «Cómo pagar» sólo si la persona debe algo: si el que debe es el negocio,
  // mandarle la cuenta del negocio no tiene sentido.
  const debe = totales.neto >= 0.005 || otras.some(([, v]) => v >= 0.005);
  const comoPagar = debe ? comoPagarTexto(pago) : null;
  const seccionPago = comoPagar ? `\n${raya}\nCómo pagar: ${comoPagar}` : "";
  return `*Estado de cuenta*\n${nombre}\n${raya}\n${saldos}\n${raya}\n${cuerpo}${seccionPago}`;
}
