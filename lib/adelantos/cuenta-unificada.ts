/**
 * cuenta-unificada — Adelantos y la cuenta corriente forestal, una fila por
 * persona (ADR-412 §5).
 *
 * ## Por qué existe
 *
 * Hoy son dos libretas que no se hablan: Adelantos (`AdelantoBeneficiario`) y
 * la cuenta corriente del directorio forestal (`ForestCuentaMov`/`ForestParty`).
 * Medido en el tenant real: 3 personas de un lado, 4 partes del otro, **0 en
 * común** — un dueño de madera que además saca adelantos aparece dos veces,
 * cada mitad de su deuda invisible desde la otra pantalla.
 *
 * ## La unión NUNCA es por nombre
 *
 * «MAMA DE ALEX» no es un documento. Se une por vínculo EXPLÍCITO
 * (`AdelantoBeneficiario.forestPartyId`, elegido a mano una vez) o por el MISMO
 * documento normalizado cuando NINGUNO de los dos lados ya está vinculado a
 * otra cosa. Dos personas con el mismo nombre y distinto DNI quedan como dos
 * filas — es lo correcto, aunque parezca redundante en la pantalla.
 *
 * ## Las dos patas se muestran separadas, el neto es la síntesis
 *
 * `neto = teDebe − aFavorSuyo (Adelantos) + saldo (madera)`. Sumar sin mostrar
 * las partes esconde, por ejemplo, que le adelantaste S/ 500 Y le debés
 * S/ 200 por una guía que te vendió — dos deudas en direcciones opuestas
 * (mismo error que ya se corrigió una vez en `saldo-persona.ts`).
 *
 * ## Redondeo a céntimos EN CADA PASO
 *
 * `0.1 + 0.2` en punto flotante da `0.30000000000000004`. Cada agregado
 * (adelantos, madera, neto) se redondea apenas se calcula — nunca al final de
 * una cadena larga — porque ese resto terminó una vez escrito en un WhatsApp.
 *
 * ## Sin tope de filas
 *
 * `adelantos` no es "un adelanto por fila": viene YA agregado por
 * (beneficiario, status, moneda) — es lo que produce `AdelantosDB.saldosPorPersona`
 * con un `groupBy` en la base. Antes se armaba con `list()` (tope 500): un
 * tenant con más adelantos que eso perdía plata de la cuenta sin que nada lo
 * avisara — la peor clase de bug, porque el número que queda parece real.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import { calcularSaldo, type Concepto, type MovimientoCuenta } from "@/lib/forestal/cuenta-corriente";
// `formatCurrency` es puro (sin React/fetch/Prisma) — mismo helper que usa
// `fmtMon` en la UI, para que el neto y el chip de al lado no muestren dos
// formatos de la misma cifra (revisión en el navegador: "S/ 17000.00" vs
// "S/ 17,000.00").
import { formatCurrency } from "@/lib/currency";

// ── Entradas ─────────────────────────────────────────────────────────────────

export interface BeneficiarioParaUnificar {
  id: string;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  /** Vínculo explícito con `ForestParty.id`, elegido a mano (ADR-412 §5). */
  forestPartyId: string | null;
}

/**
 * Un GRUPO (beneficiario, status, moneda) — no un adelanto individual. Sale de
 * un `groupBy` (`AdelantosDB.saldosPorPersona`), así que `saldoPendiente` ya es
 * la suma del grupo entero y `cantidad` es cuántos adelantos la componen.
 */
export interface AdelantoParaUnificar {
  beneficiarioId: string;
  status: string;
  /** SUMA de saldoPendiente del grupo — no de un solo adelanto. */
  saldoPendiente: number;
  moneda: string | null;
  /** Cuántos adelantos individuales hay en este grupo. */
  cantidad: number;
}

export interface ParteParaUnificar {
  id: string;
  nombre: string;
  docNumero: string | null;
  telefono: string | null;
}

// ── Salida ───────────────────────────────────────────────────────────────────

export interface CuentaPersona {
  /** Clave estable de React — `benef:<id>` o `parte:<id>` según de dónde vino la fila. */
  clave: string;
  nombre: string;
  documento: string | null;
  /** El de Adelantos y, si no tiene, el de la parte forestal vinculada — para WhatsApp. */
  telefono: string | null;
  beneficiarioId: string | null;
  parteId: string | null;
  /** Cómo se unieron las dos libretas — `null` si no hay parte vinculada. */
  vinculo: "id" | "documento" | null;
  /** `null` = esta fila no tiene ficha en Adelantos (vino sólo del directorio forestal). */
  adelantos: { teDebe: number; aFavorSuyo: number; abiertos: number } | null;
  /** `null` = esta fila no tiene parte forestal vinculada. */
  madera: {
    cargos: number;
    abonos: number;
    saldo: number;
    porConcepto: Partial<Record<Concepto, number>>;
    /** Movimientos crudos de ESTA parte — para pasarle a `corridaDeSaldos()` en la UI. */
    movimientos: MovimientoCuenta[];
    ultimo: string | null;
  } | null;
  /** teDebe − aFavorSuyo + madera.saldo. Positivo = te debe. */
  neto: number;
  /** Adelantos en monedas != PEN — fuera del neto (la cuenta forestal es en soles). */
  otrasMonedas: Record<string, number>;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Sólo dígitos/letras, en minúscula. "" → `null`: un documento vacío no une nada. */
function normalizarDocumento(v: string | null | undefined): string | null {
  const t = (v ?? "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return t || null;
}

function agregarAdelantos(rows: AdelantoParaUnificar[]): {
  teDebe: number;
  aFavorSuyo: number;
  abiertos: number;
  otrasMonedas: Record<string, number>;
} {
  let teDebe = 0;
  let aFavorSuyo = 0;
  let abiertos = 0;
  const otras: Record<string, number> = {};
  for (const a of rows) {
    const moneda = a.moneda || "PEN";
    if (a.status === "ABIERTO") {
      // `cantidad` es el `_count` del grupo — se cuenta en TODAS las monedas
      // porque es un contador de operaciones, no plata.
      abiertos += a.cantidad;
      if (a.saldoPendiente > 0) {
        if (moneda === "PEN") teDebe += a.saldoPendiente;
        else otras[moneda] = (otras[moneda] ?? 0) + a.saldoPendiente;
      }
    } else if (a.status === "EXCEDIDO") {
      // Saldo negativo = entregó de más: es plata a favor SUYO, va aparte del
      // neto que le debe (misma regla que saldo-persona.ts).
      const aFavor = Math.max(0, -a.saldoPendiente);
      if (moneda === "PEN") aFavorSuyo += aFavor;
      else otras[moneda] = (otras[moneda] ?? 0) - aFavor;
    }
    // LIQUIDADO / CANCELADO no suman: ya no se cobran (mismo bug que tapó saldo-persona.ts).
  }
  return {
    teDebe: r2(teDebe),
    aFavorSuyo: r2(aFavorSuyo),
    abiertos,
    otrasMonedas: Object.fromEntries(Object.entries(otras).map(([k, v]) => [k, r2(v)])),
  };
}

function agregarMadera(movs: MovimientoCuenta[]): NonNullable<CuentaPersona["madera"]> {
  const { cargos, abonos, saldo } = calcularSaldo(movs);
  const porConcepto: Partial<Record<Concepto, number>> = {};
  let ultimo: string | null = null;
  for (const m of movs) {
    // Magnitud por concepto (no neto): "Aserrío: S/ y" y "Pagos: S/ w" son dos
    // chips en direcciones distintas, no un saldo — mismo criterio que `cargos`/
    // `abonos` de `calcularSaldo`.
    porConcepto[m.concepto] = r2((porConcepto[m.concepto] ?? 0) + m.monto);
    if (!ultimo || m.fecha > ultimo) ultimo = m.fecha;
  }
  return { cargos, abonos, saldo, porConcepto, movimientos: movs, ultimo };
}

function nombreDeParteHuerfana(parteId: string, movs: MovimientoCuenta[]): ParteParaUnificar {
  // La parte se dio de baja pero su plata sigue existiendo: se arma un nombre
  // con el último movimiento en vez de perder la fila.
  const masReciente = [...movs].sort((a, b) => a.fecha.localeCompare(b.fecha)).at(-1);
  return { id: parteId, nombre: masReciente?.parteNombre ?? "—", docNumero: null, telefono: null };
}

/**
 * Une Adelantos con la cuenta corriente forestal, una fila por persona real.
 *
 * Orden de las filas: por `|neto|` descendente (lo más urgente arriba), con
 * empate por nombre — sin desempate estable la grilla parpadea entre renders.
 */
export function unificarCuentas(input: {
  beneficiarios: BeneficiarioParaUnificar[];
  adelantos: AdelantoParaUnificar[];
  partes: ParteParaUnificar[];
  movimientos: MovimientoCuenta[];
}): CuentaPersona[] {
  const { beneficiarios, adelantos, partes, movimientos } = input;

  const adelantosPorBenef = new Map<string, AdelantoParaUnificar[]>();
  for (const a of adelantos) {
    const lista = adelantosPorBenef.get(a.beneficiarioId) ?? [];
    lista.push(a);
    adelantosPorBenef.set(a.beneficiarioId, lista);
  }

  const movsPorParte = new Map<string, MovimientoCuenta[]>();
  for (const m of movimientos) {
    const lista = movsPorParte.get(m.parteId) ?? [];
    lista.push(m);
    movsPorParte.set(m.parteId, lista);
  }

  const partesPorId = new Map(partes.map((p) => [p.id, p]));
  // El universo de partes incluye cualquier id que sólo viva en un movimiento
  // (parte dada de baja en el directorio): su deuda no desaparece por eso.
  const todasLasPartes = new Set<string>([...partesPorId.keys(), ...movsPorParte.keys()]);
  const infoDeParte = (parteId: string): ParteParaUnificar =>
    partesPorId.get(parteId) ?? nombreDeParteHuerfana(parteId, movsPorParte.get(parteId) ?? []);

  // 1) Vínculo EXPLÍCITO por forestPartyId — sólo si la parte existe de verdad
  //    (un puntero a una parte borrada/inexistente se trata como "sin vincular").
  //
  //    `!parteUsada.has(...)`: el índice único parcial en la base (ADR-412 §5,
  //    revisión de código) impide que esto pase escribiendo, pero esta función
  //    es PURA y puede recibir datos de antes de esa migración, o de una
  //    carrera que se coló. Si dos beneficiarios traen la MISMA parte, sólo el
  //    primero (orden de `beneficiarios`) se queda con la madera — el segundo
  //    se cuenta SIN ella. Sumar el mismo saldo dos veces sería plata inventada.
  const parteDeBenef = new Map<string, string>();
  const vinculoDeBenef = new Map<string, "id" | "documento">();
  const parteUsada = new Set<string>();
  for (const b of beneficiarios) {
    if (b.forestPartyId && todasLasPartes.has(b.forestPartyId) && !parteUsada.has(b.forestPartyId)) {
      parteDeBenef.set(b.id, b.forestPartyId);
      vinculoDeBenef.set(b.id, "id");
      parteUsada.add(b.forestPartyId);
    }
  }

  // 2) Vínculo por DOCUMENTO — sólo entre los dos lados que TODAVÍA no están
  //    vinculados a nada. Nunca por nombre (ADR-412 §5).
  for (const b of beneficiarios) {
    if (parteDeBenef.has(b.id)) continue;
    const docB = normalizarDocumento(b.documento);
    if (!docB) continue;
    for (const parteId of todasLasPartes) {
      if (parteUsada.has(parteId)) continue;
      const docP = normalizarDocumento(infoDeParte(parteId).docNumero);
      if (docP && docP === docB) {
        parteDeBenef.set(b.id, parteId);
        vinculoDeBenef.set(b.id, "documento");
        parteUsada.add(parteId);
        break;
      }
    }
  }

  const filas: CuentaPersona[] = [];

  // 3) Una fila por beneficiario (con o sin parte unida).
  for (const b of beneficiarios) {
    const parteId = parteDeBenef.get(b.id) ?? null;
    const resAdel = agregarAdelantos(adelantosPorBenef.get(b.id) ?? []);
    const madera = parteId ? agregarMadera(movsPorParte.get(parteId) ?? []) : null;
    const neto = r2(r2(resAdel.teDebe - resAdel.aFavorSuyo) + (madera?.saldo ?? 0));
    // El de la persona manda; si no tiene, el de la parte forestal vinculada
    // (a veces sólo el directorio tiene el celular cargado).
    const telefono = b.telefono?.trim() || (parteId ? infoDeParte(parteId).telefono : null) || null;
    filas.push({
      clave: `benef:${b.id}`,
      nombre: b.nombre,
      documento: b.documento,
      telefono,
      beneficiarioId: b.id,
      parteId,
      vinculo: vinculoDeBenef.get(b.id) ?? null,
      adelantos: { teDebe: resAdel.teDebe, aFavorSuyo: resAdel.aFavorSuyo, abiertos: resAdel.abiertos },
      madera,
      neto,
      otrasMonedas: resAdel.otrasMonedas,
    });
  }

  // 4) Partes sueltas con actividad forestal y ninguna persona de Adelantos
  //    unida — la deuda existe igual, no se puede esconder por falta de ficha.
  for (const parteId of todasLasPartes) {
    if (parteUsada.has(parteId)) continue;
    const movs = movsPorParte.get(parteId) ?? [];
    if (movs.length === 0) continue;
    const info = infoDeParte(parteId);
    const madera = agregarMadera(movs);
    filas.push({
      clave: `parte:${parteId}`,
      nombre: info.nombre,
      documento: info.docNumero,
      telefono: info.telefono,
      beneficiarioId: null,
      parteId,
      vinculo: null,
      adelantos: null,
      madera,
      neto: madera.saldo,
      otrasMonedas: {},
    });
  }

  return filas
    .filter((f) => Math.abs(f.neto) > 0.005 || (f.madera?.movimientos.length ?? 0) > 0 || (f.adelantos?.abiertos ?? 0) > 0)
    .sort((a, b) => Math.abs(b.neto) - Math.abs(a.neto) || a.nombre.localeCompare(b.nombre, "es"));
}

/** "S/ 1,234.50" en soles; "USD 1,234.50" en otra moneda — nunca «S/» delante de dólares. */
export function montoEnMoneda(monto: number, moneda: string | null | undefined): string {
  const m = moneda || "PEN";
  return m === "PEN" ? formatCurrency(monto) : `${m} ${formatCurrency(monto, { withSymbol: false })}`;
}

/** Cómo se lee el neto, en el mismo idioma que `leerSaldo` de la cuenta forestal. */
export function leerNeto(neto: number, nombre: string, moneda = "PEN"): string {
  const monto = Math.abs(neto);
  if (monto < 0.005) return `${nombre} está al día.`;
  const cifra = montoEnMoneda(monto, moneda);
  return neto > 0 ? `${nombre} te debe ${cifra}.` : `Le debes ${cifra} a ${nombre}.`;
}

/**
 * ¿Esta persona de Adelantos y esta parte forestal son la MISMA cuenta? El
 * criterio de `unificarCuentas`, para quien recibe los dos ids sueltos (el
 * estado de cuenta): con una lista desactualizada, `beneficiario=B1&parte=P2`
 * juntaba dos cuentas y la deuda de P2 salía por el WhatsApp de B1.
 *
 * 1) El vínculo explícito manda: si la persona apunta a ESTA parte, sí; si
 *    apunta a otra que sigue existiendo, no (la unión nunca la cruza por documento).
 * 2) Si la parte ya es de otra persona por vínculo explícito, no.
 * 3) Si no, el mismo documento normalizado — nunca el nombre.
 */
export function sonLaMismaCuenta(input: {
  beneficiario: { id: string; documento: string | null; forestPartyId: string | null };
  /** `docNumero: null` si la parte está dada de baja: la unión tampoco lo ve. */
  parte: { id: string; docNumero: string | null };
  /** La persona que tiene esta parte vinculada a mano, si hay alguna. */
  parteVinculadaA: string | null;
  /** ¿La parte a la que apunta `beneficiario.forestPartyId` sigue existiendo? */
  vinculoPropioVigente: boolean;
}): boolean {
  const { beneficiario: b, parte: p } = input;
  if (b.forestPartyId === p.id) return true;
  if (b.forestPartyId && input.vinculoPropioVigente) return false;
  if (input.parteVinculadaA && input.parteVinculadaA !== b.id) return false;
  const docB = normalizarDocumento(b.documento);
  return docB !== null && docB === normalizarDocumento(p.docNumero);
}
