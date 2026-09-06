/**
 * lib/agents/domains/plata/escrituras.ts
 *
 * Lo que MUEVE plata. Cada función respeta el mismo contrato:
 *   ensayo (`__validar`) → resumen legible → escritura por la DB class que usa
 *   la pantalla equivalente.
 *
 * Ver ADR-387 para el porqué de cada paso.
 */

import type { AgentTask, AgentResult, AgentContext } from "@/lib/agents/types";
import { scopedLogger } from "@/lib/agents/context";
import { AssetsDB } from "@/lib/db/assets.db";
import { ExpensesDB } from "@/lib/db/finance.db";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { FiadosDB } from "@/lib/db/fiados.db";
import { CashRegistersDB } from "@/lib/db/sales.db";
import { SuppliersDB, PurchasesDB } from "@/lib/db/purchases.db";
import { ProductsDB } from "@/lib/db/products.db";
import { TreasuryDB } from "@/lib/db/treasury.db";
import { ForestFleteDB } from "@/lib/db/forest-flete.db";
import {
  soles, fmt, num, texto, esEnsayo, fechaValida, metodoPago,
  METODOS_CAJA, CATEGORIAS_MAQUINA, CATEGORIAS_GASTO, clave,
} from "./comun";

// ── Escrituras ───────────────────────────────────────────────────────────────

/**
 * Resuelve el monto de un gasto de combustible.
 *
 * Lo que se dicta es «25 galones a 27» — el total es DERIVADO. Presentarlo como
 * si viniera del dictado es el error de la regla 2 de `verificacion-de-verdad`:
 * el `resumen` dice la multiplicación entera para que se pueda auditar de un
 * vistazo. Y si además dictaron el total y no cuadra con galones × precio, se
 * frena: uno de los dos números está mal y adivinar cuál es inventar plata.
 */
export function resolverMonto(
  montoDicho: number | null,
  cantidad: number | null,
  precioUnitario: number | null,
): { ok: true; monto: number; derivado: string | null } | { ok: false; error: string } {
  const calculado =
    cantidad != null && precioUnitario != null && cantidad > 0 && precioUnitario > 0
      ? soles(cantidad * precioUnitario)
      : null;

  if (montoDicho == null && calculado == null) {
    return { ok: false, error: "Falta el monto. Decime el total, o la cantidad y el precio por unidad." };
  }
  if (montoDicho == null && calculado != null) {
    return {
      ok: true,
      monto: calculado,
      derivado: `${cantidad} × ${fmt(precioUnitario!)} = ${fmt(calculado)}`,
    };
  }
  if (montoDicho != null && calculado == null) {
    return { ok: true, monto: soles(montoDicho), derivado: null };
  }
  // Los dos: tienen que cerrar. Tolerancia del negocio (un céntimo de redondeo
  // al multiplicar), no epsilon de float — regla 4 de `verificacion-de-verdad`.
  const diff = Math.abs(soles(montoDicho!) - calculado!);
  if (diff > 0.05) {
    return {
      ok: false,
      error:
        `No cuadra: dijiste ${fmt(montoDicho!)} de total, pero ${cantidad} × ${fmt(precioUnitario!)} = ` +
        `${fmt(calculado!)} (diferencia ${fmt(diff)}). Preguntale cuál de los dos números va.`,
    };
  }
  return { ok: true, monto: calculado!, derivado: `${cantidad} × ${fmt(precioUnitario!)} = ${fmt(calculado!)}` };
}

/**
 * Anota un gasto. Dos destinos posibles, elegidos por si nombraron una máquina.
 *
 * Con `maquinaId` → `AssetsDB.addExpense`, igual que el formulario de Activos:
 * el combustible del camión pertenece al costo de ESE camión (es lo que hace
 * que «cuánto me cuesta el viaje» signifique algo).
 * Sin máquina → `ExpensesDB.add`, igual que el formulario de Gastos.
 */
export async function registrarGasto(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const p = task.payload;

  const descripcion = texto(p.descripcion);
  if (!descripcion) {
    return { success: false, error: "Todo gasto necesita una descripción: es lo que se lee en el libro tres meses después." };
  }

  const cantidad = num(p.cantidad) ?? num(p.galones);
  const precioUnitario = num(p.precioUnitario);
  const monto = resolverMonto(num(p.monto), cantidad, precioUnitario);
  if (!monto.ok) return { success: false, error: monto.error };
  if (monto.monto <= 0) return { success: false, error: "El monto tiene que ser mayor a cero." };
  if (monto.monto > 5_000_000) {
    return { success: false, error: `${fmt(monto.monto)} es un monto fuera de escala. Confirmá la cifra antes de anotarla.` };
  }

  const f = fechaValida(p.fecha);
  if (!f.ok) return { success: false, error: f.error };

  const maquinaId = texto(p.maquinaId);
  const notas = texto(p.notas) || null;

  // ── Camino A: el gasto es de una máquina ──────────────────────────────────
  if (maquinaId) {
    const maquina = await AssetsDB.getOne(task.tenantId, maquinaId);
    if (!maquina) {
      return {
        success: false,
        error:
          `No existe una máquina con id "${maquinaId}" en este negocio. ` +
          `Buscala con plata_buscar_maquina y usá el id que devuelve — no lo inventes.`,
      };
    }
    const catCruda = clave(texto(p.categoria));
    const categoria =
      (CATEGORIAS_MAQUINA.find((c) => clave(c) === catCruda) ??
        (catCruda.includes("petroleo") || catCruda.includes("diesel") || catCruda.includes("gasolina")
          ? "combustible"
          : null)) ?? "otro";

    const conPlaca = maquina.plate ? ` (placa ${maquina.plate})` : "";
    const detalle = [
      monto.derivado ? `${cantidad} ${categoria === "combustible" ? "gal" : "u"} · ${monto.derivado}` : null,
      descripcion,
    ]
      .filter(Boolean)
      .join(" · ");

    if (esEnsayo(task)) {
      return {
        success: true,
        data: {
          resumen:
            `Gasto de ${fmt(monto.monto)} · ${categoria} · ${maquina.name}${conPlaca}` +
            `${monto.derivado ? ` · ${monto.derivado}` : ""}. ` +
            `Se anota en el libro de la máquina (Mi Plata › Reportes › Activos), no en Gastos.`,
          destino: "activos",
          maquina: maquina.name,
          placa: maquina.plate,
          categoria,
          monto: monto.monto,
          cantidad,
          precioUnitario,
          calculo: monto.derivado,
        },
      };
    }

    log.info("Anotando gasto de máquina desde el asistente", { maquinaId, categoria, monto: monto.monto });
    const row = await AssetsDB.addExpense(task.tenantId, {
      assetId: maquina.id,
      category: categoria,
      gallons: categoria === "combustible" ? cantidad : null,
      unitPrice: precioUnitario,
      amount: monto.monto,
      notes: [`Asistente IA: ${detalle}`, notas].filter(Boolean).join(" · "),
    });

    return {
      success: true,
      data: {
        registrado: true,
        destino: "activos",
        gastoId: row.id,
        maquina: maquina.name,
        placa: maquina.plate,
        categoria,
        monto: monto.monto,
        cantidad,
        precioUnitario,
        confirmacion:
          `Anotado: ${fmt(monto.monto)} de ${categoria} para ${maquina.name}${conPlaca}` +
          `${monto.derivado ? ` (${monto.derivado})` : ""}.`,
        dondeVerlo: { pantalla: "Mi Plata › Reportes › Activos", tab: "plata", vista: "activos" },
      },
    };
  }

  // ── Camino B: gasto del negocio ───────────────────────────────────────────
  const catCruda = clave(texto(p.categoria));
  const categoria = CATEGORIAS_GASTO.find((c) => clave(c) === catCruda) ?? "otros";
  const metodo = metodoPago(p.metodoPago);
  const proveedor = texto(p.proveedor) || null;
  const centroCosto = texto(p.centroCosto) || null;

  if (esEnsayo(task)) {
    return {
      success: true,
      data: {
        resumen:
          `Gasto de ${fmt(monto.monto)} · ${categoria} · "${descripcion}"` +
          `${proveedor ? ` · ${proveedor}` : ""}${metodo ? ` · ${metodo}` : ""} · ` +
          `${f.fecha.toISOString().slice(0, 10)}. Se anota en Mi Plata › Gastos.` +
          `${monto.derivado ? ` Total calculado: ${monto.derivado}.` : ""}`,
        destino: "gastos",
        categoria,
        monto: monto.monto,
        descripcion,
        metodoPago: metodo,
        proveedor,
        fecha: f.fecha.toISOString().slice(0, 10),
        calculo: monto.derivado,
      },
    };
  }

  log.info("Anotando gasto desde el asistente", { categoria, monto: monto.monto });
  const row = await ExpensesDB.add(task.tenantId, {
    category: categoria,
    description: descripcion,
    amount: monto.monto,
    date: f.fecha.toISOString(),
    // Un gasto dictado es plata que salió, nunca la PLANTILLA de un gasto fijo
    // (ADR-374): `recurring: true` acá inflaría el P&L con un acuerdo, no un pago.
    recurring: false,
    paymentMethod: metodo,
    supplierName: proveedor,
    costCenter: centroCosto,
    createdBy: "asistente-ia",
    notes: [notas, monto.derivado ? `Calculado: ${monto.derivado}` : null]
      .filter(Boolean)
      .join(" · ") || null,
    paidAt: f.fecha.toISOString(),
  });

  return {
    success: true,
    data: {
      registrado: true,
      destino: "gastos",
      gastoId: row.id,
      categoria,
      monto: monto.monto,
      descripcion,
      fecha: f.fecha.toISOString().slice(0, 10),
      confirmacion: `Anotado: ${fmt(monto.monto)} en ${categoria} — "${descripcion}".`,
      dondeVerlo: { pantalla: "Mi Plata › Gastos", tab: "plata", vista: "gastos" },
    },
  };
}

/**
 * Anota un ingreso.
 *
 * Con máquina → alquiler/viaje de esa máquina (`AssetsDB.addIncome`), que es el
 * único libro de ingresos que no es una venta del mostrador.
 * Sin máquina → movimiento de caja tipo `ingreso`, que es donde el POS pone la
 * plata que entra sin ser una venta. Necesita caja abierta: sin ella no hay
 * dónde ponerlo, y crear una caja desde el chat es abrir el turno de otro.
 *
 * Lo que NO hace: inventar una venta. Una venta lleva productos, stock y
 * comprobante — fabricarla desde una frase descuadra el inventario.
 */
export async function registrarIngreso(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const p = task.payload;

  const cantidad = num(p.cantidad);
  const tarifa = num(p.tarifa) ?? num(p.precioUnitario);
  const monto = resolverMonto(num(p.monto), cantidad, tarifa);
  if (!monto.ok) return { success: false, error: monto.error };
  if (monto.monto <= 0) return { success: false, error: "El monto tiene que ser mayor a cero." };

  const descripcion = texto(p.descripcion);
  const cliente = texto(p.cliente) || null;
  const maquinaId = texto(p.maquinaId);
  const cobrado = p.cobrado !== false; // por defecto se cobró

  // ── Camino A: alquiler o viaje de una máquina ─────────────────────────────
  if (maquinaId) {
    const maquina = await AssetsDB.getOne(task.tenantId, maquinaId);
    if (!maquina) {
      return {
        success: false,
        error: `No existe una máquina con id "${maquinaId}". Buscala con plata_buscar_maquina y usá el id que devuelve.`,
      };
    }
    const unidad = texto(p.unidad) || maquina.rateUnit || "hora";
    const tarifaFinal = tarifa ?? (cantidad && cantidad > 0 ? soles(monto.monto / cantidad) : monto.monto);
    const conPlaca = maquina.plate ? ` (placa ${maquina.plate})` : "";

    if (esEnsayo(task)) {
      return {
        success: true,
        data: {
          resumen:
            `Ingreso de ${fmt(monto.monto)} · ${maquina.name}${conPlaca}` +
            `${cliente ? ` · cliente ${cliente}` : ""}` +
            `${cantidad ? ` · ${cantidad} ${unidad} × ${fmt(tarifaFinal)}` : ""} · ` +
            `${cobrado ? "cobrado" : "PENDIENTE de cobro"}. Se anota en el libro de la máquina.`,
          destino: "activos",
          maquina: maquina.name,
          monto: monto.monto,
          cantidad,
          unidad,
          tarifa: tarifaFinal,
          cobrado,
        },
      };
    }

    log.info("Anotando ingreso de máquina desde el asistente", { maquinaId, monto: monto.monto });
    const row = await AssetsDB.addIncome(task.tenantId, {
      assetId: maquina.id,
      client: cliente,
      quantity: cantidad,
      unit: unidad,
      rate: tarifaFinal,
      amount: monto.monto,
      paid: cobrado,
      notes: [`Asistente IA`, descripcion || null].filter(Boolean).join(": ") || null,
    });

    return {
      success: true,
      data: {
        registrado: true,
        destino: "activos",
        ingresoId: row.id,
        maquina: maquina.name,
        monto: monto.monto,
        cobrado,
        confirmacion:
          `Anotado: ${fmt(monto.monto)} de ${maquina.name}${conPlaca}` +
          `${cliente ? ` (${cliente})` : ""} — ${cobrado ? "cobrado" : "queda por cobrar"}.`,
        dondeVerlo: { pantalla: "Mi Plata › Reportes › Activos", tab: "plata", vista: "activos" },
      },
    };
  }

  // ── Camino B: entra plata al cajón ────────────────────────────────────────
  if (!descripcion) {
    return { success: false, error: "Decime de qué es el ingreso: sin concepto, en el cierre de caja es un monto sin dueño." };
  }
  const caja = await CashRegistersDB.getOpen(task.tenantId);
  if (!caja) {
    return {
      success: false,
      error:
        "No hay caja abierta, así que un ingreso suelto no tiene dónde entrar. " +
        "Abrí la caja en Ventas & Caja, o decime a qué máquina corresponde el ingreso.",
    };
  }
  const metodo = metodoPago(p.metodoPago) ?? "efectivo";
  if (!METODOS_CAJA.has(metodo)) {
    return { success: false, error: `"${metodo}" no es una forma de cobro que entre a la caja.` };
  }

  if (esEnsayo(task)) {
    return {
      success: true,
      data: {
        resumen:
          `Ingreso a caja de ${fmt(monto.monto)} · ${metodo} · "${descripcion}". ` +
          `Entra en la caja abierta desde ${caja.openedAt ? String(caja.openedAt).slice(0, 16).replace("T", " ") : "hoy"}.`,
        destino: "caja",
        monto: monto.monto,
        metodoPago: metodo,
        descripcion,
      },
    };
  }

  log.info("Anotando ingreso a caja desde el asistente", { monto: monto.monto, metodo });
  const mov = await CashRegistersDB.addMovement(
    caja.id,
    { type: "ingreso", amount: monto.monto, method: metodo, description: `Asistente IA: ${descripcion}` },
    task.tenantId,
  );

  return {
    success: true,
    data: {
      registrado: true,
      destino: "caja",
      movimientoId: mov.id,
      monto: monto.monto,
      metodoPago: metodo,
      confirmacion: `Anotado: ${fmt(monto.monto)} entró a la caja por ${metodo} — "${descripcion}".`,
      dondeVerlo: { pantalla: "Ventas & Caja", tab: "ventas-caja", vista: "caja" },
    },
  };
}

/**
 * Anota un adelanto a una persona del padrón.
 *
 * Va por `AdelantosDB.create`, que es lo mismo que usa la pantalla: valida que
 * la persona sea de ESTE negocio, numera el código de operación (ADR-329) y
 * frena si supera el límite de crédito. Ese freno NO se puede saltear desde el
 * chat: `forzarLimite` es una decisión que se toma mirando el número, y la
 * pantalla es donde se muestra.
 */
export async function registrarAdelanto(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const p = task.payload;

  const personaId = texto(p.personaId);
  if (!personaId) {
    return { success: false, error: "Falta la persona. Buscala con plata_buscar_persona y usá el personaId que devuelve." };
  }
  const monto = num(p.monto);
  if (monto == null || monto <= 0) return { success: false, error: "El adelanto tiene que tener un monto mayor a cero." };

  const personas = await AdelantosDB.listBeneficiarios(task.tenantId);
  const persona = personas.find((x) => x.id === personaId);
  if (!persona) {
    return {
      success: false,
      error: `No existe esa persona en el padrón de este negocio. Buscala con plata_buscar_persona — no inventes el id.`,
    };
  }

  const f = fechaValida(p.fecha);
  if (!f.ok) return { success: false, error: f.error };
  const metodo = metodoPago(p.metodoPago);
  // `credito` no aplica: un adelanto es plata que sale. Si no fue por caja
  // (transferencia del banco, por ejemplo), no se mueve el cajón.
  const metodoCaja = metodo && METODOS_CAJA.has(metodo) ? (metodo as "efectivo" | "yape" | "plin" | "tarjeta" | "transferencia") : null;
  const notas = texto(p.notas) || null;

  if (esEnsayo(task)) {
    const abiertos = (await AdelantosDB.list(task.tenantId, { status: "ABIERTO" }))
      .filter((a) => a.beneficiarioId === personaId)
      .reduce((s, a) => s + Number(a.saldoPendiente ?? 0), 0);
    return {
      success: true,
      data: {
        resumen:
          `Adelanto de ${fmt(monto)} a ${persona.nombre}` +
          `${metodoCaja ? ` por ${metodoCaja} (sale de la caja)` : " (no mueve la caja)"} · ` +
          `${f.fecha.toISOString().slice(0, 10)}.` +
          (abiertos > 0 ? ` Ya tiene ${fmt(abiertos)} sin liquidar.` : "") +
          (persona.limiteCredito != null ? ` Límite: ${fmt(persona.limiteCredito)}.` : ""),
        destino: "adelantos",
        persona: persona.nombre,
        monto: soles(monto),
        saldoPrevio: soles(abiertos),
        limiteCredito: persona.limiteCredito ?? null,
        metodoCaja,
      },
    };
  }

  log.info("Anotando adelanto desde el asistente", { personaId, monto });
  const row = await AdelantosDB.create(task.tenantId, {
    beneficiarioId: personaId,
    montoAdelantado: soles(monto),
    fechaAdelanto: f.fecha.toISOString(),
    notas: [notas, "Registrado por el asistente IA"].filter(Boolean).join(" · "),
    metodoCaja,
  });

  return {
    success: true,
    data: {
      registrado: true,
      destino: "adelantos",
      adelantoId: row.id,
      codigo: row.codigoOperacion ?? null,
      persona: persona.nombre,
      monto: soles(monto),
      confirmacion:
        `Anotado: adelanto de ${fmt(monto)} a ${persona.nombre}` +
        `${row.codigoOperacion ? ` (${row.codigoOperacion})` : ""}.`,
      dondeVerlo: { pantalla: "Mi Plata › Por cobrar › Adelantos", tab: "plata", vista: "adelantos" },
    },
  };
}

/**
 * Cobra contra un fiado abierto.
 *
 * `FiadosDB.registerPago` hace el decremento atómico y frena el sobrepago; se
 * usa tal cual para que un cobro dictado y uno tipeado dejen exactamente el
 * mismo rastro (cuota + saldo + estado).
 */
export async function cobrarFiado(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const p = task.payload;

  const fiadoId = texto(p.fiadoId);
  if (!fiadoId) {
    return { success: false, error: "Falta la deuda. Buscala con plata_buscar_deuda y usá el fiadoId que devuelve." };
  }
  const monto = num(p.monto);
  if (monto == null || monto <= 0) return { success: false, error: "El cobro tiene que ser mayor a cero." };

  const fiado = await FiadosDB.getById(task.tenantId, fiadoId);
  if (!fiado) {
    return { success: false, error: `No existe esa deuda en este negocio. Buscala con plata_buscar_deuda — no inventes el id.` };
  }
  if (fiado.status === "CANCELADO") {
    return { success: false, error: "Ese fiado está cancelado: no se puede cobrar." };
  }
  const saldo = soles(Number(fiado.saldo ?? 0));
  if (soles(monto) > saldo + 0.01) {
    return {
      success: false,
      error: `El cobro (${fmt(monto)}) supera el saldo de ${fiado.customerName || fiado.customerId}, que es ${fmt(saldo)}. Preguntá cuánto entregó de verdad.`,
    };
  }

  const notas = texto(p.notas) || null;

  if (esEnsayo(task)) {
    const queda = soles(saldo - monto);
    return {
      success: true,
      data: {
        resumen:
          `Cobro de ${fmt(monto)} a ${fiado.customerName || fiado.customerId}. ` +
          `Debe ${fmt(saldo)} → queda ${fmt(queda)}${queda <= 0.01 ? " (queda PAGADO)" : ""}.`,
        destino: "fiados",
        cliente: fiado.customerName || fiado.customerId,
        saldoActual: saldo,
        monto: soles(monto),
        saldoResultante: queda,
      },
    };
  }

  log.info("Cobrando fiado desde el asistente", { fiadoId, monto });
  const row = await FiadosDB.registerPago(
    task.tenantId,
    fiadoId,
    soles(monto),
    [notas, "Cobrado por el asistente IA"].filter(Boolean).join(" · "),
  );
  if (!row) return { success: false, error: "No se pudo registrar el cobro: la deuda ya no existe." };

  const queda = soles(Number(row.saldo ?? 0));
  return {
    success: true,
    data: {
      registrado: true,
      destino: "fiados",
      fiadoId: row.id,
      cliente: row.customerName || row.customerId,
      monto: soles(monto),
      saldoResultante: queda,
      estado: row.status,
      confirmacion:
        `Anotado: ${fmt(monto)} cobrados a ${row.customerName || row.customerId}. ` +
        (queda <= 0.01 ? "Queda saldada." : `Le quedan ${fmt(queda)}.`),
      dondeVerlo: { pantalla: "Mi Plata › Por cobrar › Fiados", tab: "plata", vista: "fiados" },
    },
  };
}

/**
 * Liquida (total o parcialmente) un adelanto con una entrega en plata.
 *
 * Sólo entregas LIBRES: una entrega de PRODUCTO mueve stock y se valúa contra
 * el catálogo, y eso se hace en la pantalla, donde se elige el producto y se
 * decide si suma al inventario.
 */
export async function liquidarAdelanto(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const p = task.payload;

  const adelantoId = texto(p.adelantoId);
  if (!adelantoId) {
    return { success: false, error: "Falta el adelanto. Buscalo con plata_buscar_persona y usá el adelantoId que devuelve." };
  }
  const valor = num(p.monto) ?? num(p.valor);
  if (valor == null || valor <= 0) return { success: false, error: "La entrega tiene que valer más que cero." };

  const adelanto = await AdelantosDB.getById(task.tenantId, adelantoId);
  if (!adelanto) {
    return { success: false, error: "No existe ese adelanto en este negocio. Buscalo con plata_buscar_persona." };
  }
  if (String(adelanto.status).toUpperCase() === "CANCELADO") {
    return { success: false, error: "Ese adelanto está cancelado: no admite entregas." };
  }

  const descripcion = texto(p.descripcion) || "Entrega en efectivo";
  const metodo = metodoPago(p.metodoPago);
  const metodoCaja = metodo && METODOS_CAJA.has(metodo) ? (metodo as "efectivo" | "yape" | "plin" | "tarjeta" | "transferencia") : null;
  const saldo = soles(Number(adelanto.saldoPendiente ?? 0));
  const persona = adelanto.beneficiario?.nombre ?? "la persona";

  if (esEnsayo(task)) {
    const queda = soles(saldo - valor);
    return {
      success: true,
      data: {
        resumen:
          `Entrega de ${fmt(valor)} contra el adelanto ${adelanto.codigoOperacion ?? ""} de ${persona}. ` +
          `Saldo ${fmt(saldo)} → ${fmt(queda)}` +
          `${queda < -0.01 ? " (queda EXCEDIDO: el negocio le debería a la persona)" : queda <= 0.01 ? " (queda LIQUIDADO)" : ""}.` +
          `${metodoCaja ? ` Entra a la caja por ${metodoCaja}.` : ""}`,
        destino: "adelantos",
        persona,
        codigo: adelanto.codigoOperacion ?? null,
        saldoActual: saldo,
        valor: soles(valor),
        saldoResultante: queda,
      },
    };
  }

  log.info("Liquidando adelanto desde el asistente", { adelantoId, valor });
  const row = await AdelantosDB.registrarEntrega(task.tenantId, adelantoId, {
    tipo: "LIBRE",
    descripcion,
    valorManual: soles(valor),
    notas: "Registrado por el asistente IA",
    metodoCaja,
  });
  if (!row) return { success: false, error: "No se pudo registrar la entrega: el adelanto ya no existe." };

  const queda = soles(Number(row.saldoPendiente ?? 0));
  return {
    success: true,
    data: {
      registrado: true,
      destino: "adelantos",
      adelantoId: row.id,
      persona,
      valor: soles(valor),
      saldoResultante: queda,
      estado: row.status,
      confirmacion:
        `Anotado: ${fmt(valor)} contra el adelanto de ${persona}. ` +
        (queda <= 0.01 ? "Queda liquidado." : `Le quedan ${fmt(queda)} por devolver.`),
      dondeVerlo: { pantalla: "Mi Plata › Por cobrar › Adelantos", tab: "plata", vista: "adelantos" },
    },
  };
}


// ── Compra a proveedor (orden de compra) ─────────────────────────────────────

/**
 * Anota una compra a un proveedor como ORDEN DE COMPRA pendiente.
 *
 * ⚠️ Pendiente, no recibida, y eso es la decisión de diseño:
 *
 * Una OC en estado `pendiente` es un DOCUMENTO — el acuerdo de compra. Recién
 * al marcarla `recibido` la pantalla de Compras sube el stock y recalcula el
 * costo promedio. Dictar «compré 20 sacos de arroz» y que el inventario suba
 * solo sería declarar recibida mercadería que todavía está en el camión, y el
 * módulo ya arrastra la cicatriz de contar stock dos veces (ADR-377).
 *
 * Así que el dictado deja la orden armada y **recibirla se hace mirando lo que
 * llegó de verdad**, que es cuando se sabe si vinieron 20 sacos o 18.
 */
export async function registrarCompra(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const p = task.payload;

  const proveedorId = texto(p.proveedorId);
  if (!proveedorId) {
    return { success: false, error: "Falta el proveedor. Buscalo con plata_buscar_proveedor y usá el proveedorId que devuelve." };
  }
  const proveedor = await SuppliersDB.getById(task.tenantId, proveedorId);
  if (!proveedor) {
    return { success: false, error: "Ese proveedor no existe en este negocio. Buscalo con plata_buscar_proveedor — no inventes el id." };
  }

  const crudos = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : [];
  if (crudos.length === 0) {
    return { success: false, error: "Decime qué se compró: cada ítem necesita el producto, la cantidad y el costo unitario." };
  }
  if (crudos.length > 20) {
    return { success: false, error: "Son demasiados ítems para dictar de una. Cargá la orden en Compras." };
  }

  /**
   * Cada línea necesita un producto REAL: la tabla de ítems tiene FK a Product,
   * así que un nombre suelto no se puede guardar. Es también lo que hace que el
   * costo del producto se pueda recalcular al recibir.
   */
  const items: { productId: number; name: string; quantity: number; unitCost: number; unit: string }[] = [];
  for (const it of crudos) {
    const productId = Number(it.productId);
    const cantidad = num(it.cantidad);
    const costo = num(it.costoUnitario);
    if (!Number.isInteger(productId) || productId <= 0) {
      return { success: false, error: "Cada ítem necesita el productId exacto. Buscalo con inventory_buscar_producto — no lo inventes." };
    }
    if (cantidad == null || cantidad <= 0) return { success: false, error: "Cada ítem necesita una cantidad mayor a cero." };
    if (costo == null || costo < 0) return { success: false, error: "Cada ítem necesita su costo unitario." };

    const producto = await ProductsDB.getById(task.tenantId, productId);
    if (!producto) {
      return { success: false, error: `No existe un producto con id ${productId} en este negocio. Buscalo con inventory_buscar_producto.` };
    }
    items.push({
      productId,
      name: producto.name,
      // La cantidad de una OC es entera: la tabla la guarda como Int y media
      // unidad de un saco no significa nada en el mostrador.
      quantity: Math.round(cantidad),
      unitCost: soles(costo),
      unit: producto.unit ?? "und",
    });
  }

  const total = soles(items.reduce((s, i) => s + i.quantity * i.unitCost, 0));
  const metodo = metodoPago(p.metodoPago);
  const detalle = items.map((i) => `${i.quantity} ${i.unit} de ${i.name} a ${fmt(i.unitCost)}`).join(" · ");

  if (esEnsayo(task)) {
    return {
      success: true,
      data: {
        resumen:
          `Orden de compra a ${proveedor.name} por ${fmt(total)} — ${detalle}. ` +
          `Queda PENDIENTE: el stock sube cuando la marques recibida en Compras.`,
        destino: "compras",
        proveedor: proveedor.name,
        total,
        items: items.map((i) => ({ producto: i.name, cantidad: i.quantity, costoUnitario: i.unitCost })),
      },
    };
  }

  log.info("Anotando orden de compra desde el asistente", { proveedorId, total, items: items.length });
  const id = `po-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const orden = await PurchasesDB.add(
    {
      id,
      supplierId: proveedor.id,
      supplierName: proveedor.name,
      items,
      total,
      status: "pendiente",
      notes: [texto(p.notas), "Dictada al asistente IA"].filter(Boolean).join(" · "),
      paymentMethod: metodo ?? undefined,
      createdBy: "asistente-ia",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    task.tenantId,
  );

  return {
    success: true,
    data: {
      registrado: true,
      destino: "compras",
      ordenId: orden.id,
      proveedor: proveedor.name,
      total,
      confirmacion:
        `Anotado: orden de compra a ${proveedor.name} por ${fmt(total)} (${items.length} ${items.length === 1 ? "ítem" : "ítems"}). ` +
        `Queda pendiente hasta que la recibas.`,
      dondeVerlo: { pantalla: "Compras › Órdenes de compra", tab: "compras", vista: "ordenes" },
    },
  };
}

// ── Tesorería ────────────────────────────────────────────────────────────────

/**
 * Mueve plata entre cuentas, o la hace entrar/salir de una.
 *
 * Con `cuentaDestinoId` es una TRANSFERENCIA (`TreasuryDB.transferir`, que deja
 * los dos movimientos atados); sin ella es un movimiento suelto. Son cosas
 * distintas en el libro y confundirlas descuadra las dos cuentas a la vez.
 */
export async function moverTesoreria(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const p = task.payload;

  const origenId = texto(p.cuentaId ?? p.cuentaOrigenId);
  if (!origenId) {
    return { success: false, error: "Falta la cuenta. Buscala con plata_buscar_cuenta y usá el cuentaId que devuelve." };
  }
  const monto = num(p.monto);
  if (monto == null || monto <= 0) return { success: false, error: "El monto tiene que ser mayor a cero." };

  const cuentas = await TreasuryDB.listCuentas(task.tenantId, true);
  const origen = cuentas.find((c) => c.id === origenId);
  if (!origen) {
    return { success: false, error: "Esa cuenta no existe en este negocio. Buscala con plata_buscar_cuenta." };
  }

  const destinoId = texto(p.cuentaDestinoId);
  const descripcion = texto(p.descripcion);

  // ── Transferencia entre cuentas ────────────────────────────────────────
  if (destinoId) {
    const destino = cuentas.find((c) => c.id === destinoId);
    if (!destino) {
      return { success: false, error: "La cuenta de destino no existe en este negocio. Buscala con plata_buscar_cuenta." };
    }
    if (destino.id === origen.id) {
      return { success: false, error: "El origen y el destino son la misma cuenta." };
    }
    /**
     * Monedas distintas necesitan un tipo de cambio, y el tipo de cambio es una
     * decisión: inventarlo acá mete una diferencia que después nadie explica.
     */
    if (origen.moneda !== destino.moneda) {
      return {
        success: false,
        error: `"${origen.nombre}" está en ${origen.moneda} y "${destino.nombre}" en ${destino.moneda}. Un cambio de moneda necesita su tipo de cambio: hacelo en Tesorería.`,
      };
    }
    if (soles(monto) > soles(origen.saldo)) {
      return {
        success: false,
        error: `"${origen.nombre}" tiene ${fmt(origen.saldo)} y querés mover ${fmt(monto)}. No alcanza.`,
      };
    }

    if (esEnsayo(task)) {
      return {
        success: true,
        data: {
          resumen:
            `Transferir ${fmt(monto)} de "${origen.nombre}" (queda ${fmt(origen.saldo - monto)}) ` +
            `a "${destino.nombre}" (queda ${fmt(destino.saldo + monto)})` +
            `${descripcion ? ` · ${descripcion}` : ""}.`,
          destino: "tesoreria",
          origen: origen.nombre,
          hacia: destino.nombre,
          monto: soles(monto),
        },
      };
    }

    log.info("Transfiriendo entre cuentas desde el asistente", { origenId, destinoId, monto });
    await TreasuryDB.transferir({
      tenantId: task.tenantId,
      origenId: origen.id,
      destinoId: destino.id,
      monto: soles(monto),
      descripcion: descripcion || "Transferencia dictada al asistente IA",
    });
    return {
      success: true,
      data: {
        registrado: true,
        destino: "tesoreria",
        confirmacion: `Anotado: ${fmt(monto)} de "${origen.nombre}" a "${destino.nombre}".`,
        dondeVerlo: { pantalla: "Mi Plata › Caja › Tesorería", tab: "plata", vista: "tesoreria" },
      },
    };
  }

  // ── Movimiento suelto ──────────────────────────────────────────────────
  const entra = String(p.tipo ?? "").toLowerCase().startsWith("ingres");
  if (!descripcion) {
    return { success: false, error: "Decime de qué es el movimiento: en el libro de tesorería, un monto sin concepto no se puede explicar después." };
  }
  if (!entra && soles(monto) > soles(origen.saldo)) {
    return { success: false, error: `"${origen.nombre}" tiene ${fmt(origen.saldo)} y querés sacar ${fmt(monto)}. No alcanza.` };
  }

  if (esEnsayo(task)) {
    return {
      success: true,
      data: {
        resumen:
          `${entra ? "Entra" : "Sale"} ${fmt(monto)} ${entra ? "a" : "de"} "${origen.nombre}" · "${descripcion}". ` +
          `Saldo ${fmt(origen.saldo)} → ${fmt(entra ? origen.saldo + monto : origen.saldo - monto)}.`,
        destino: "tesoreria",
        cuenta: origen.nombre,
        monto: soles(monto),
        tipo: entra ? "INGRESO" : "EGRESO",
      },
    };
  }

  log.info("Registrando movimiento de tesorería desde el asistente", { origenId, monto, entra });
  await TreasuryDB.registrarMovimiento({
    tenantId: task.tenantId,
    cuentaId: origen.id,
    tipo: entra ? "INGRESO" : "EGRESO",
    origen: "MANUAL",
    monto: soles(monto),
    descripcion: `Asistente IA: ${descripcion}`,
  });
  return {
    success: true,
    data: {
      registrado: true,
      destino: "tesoreria",
      confirmacion: `Anotado: ${entra ? "entraron" : "salieron"} ${fmt(monto)} ${entra ? "a" : "de"} "${origen.nombre}" — "${descripcion}".`,
      dondeVerlo: { pantalla: "Mi Plata › Caja › Tesorería", tab: "plata", vista: "tesoreria" },
    },
  };
}

// ── Flete forestal ───────────────────────────────────────────────────────────

/**
 * Anota un viaje: el que trae la madera o el que se lleva el producto.
 *
 * Va por `ForestFleteDB.guardar`, que copia la placa y el nombre del
 * transportista dentro de la fila además del id. No es descuido: **un viaje
 * ocurrió**, y si mañana el camión se da de baja el viaje de marzo siguió
 * siendo el de esa placa (ADR-318).
 */
export async function registrarFlete(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const p = task.payload;

  const monto = num(p.monto);
  const volumen = num(p.volumenM3);
  if (monto == null || monto <= 0) {
    return { success: false, error: "El flete necesita su monto: sin él no entra en el costo por m³, que es para lo que sirve el registro." };
  }

  const f = fechaValida(p.fecha);
  if (!f.ok) return { success: false, error: f.error };

  /**
   * El libro tiene dos tipos: `ingreso` (el viaje que TRAE la madera) y
   * `despacho` (el que se la lleva). «salida» es como se dice, no como se
   * guarda, así que se traduce acá en vez de dejar que el modelo adivine.
   */
  const dicho = String(p.tipo ?? "ingreso").toLowerCase();
  const tipo: "ingreso" | "despacho" =
    dicho.startsWith("desp") || dicho.startsWith("sal") || dicho.startsWith("saca") ? "despacho" : "ingreso";
  const placa = texto(p.placa);
  const transportista = texto(p.transportista);
  if (!placa && !transportista) {
    return { success: false, error: "Decime la placa del camión o quién hizo el viaje: un flete sin ninguno de los dos no se le puede cobrar a nadie." };
  }

  const pagaQuien = ["ctp", "proveedor", "destinatario"].includes(String(p.pagaQuien ?? "").toLowerCase())
    ? (String(p.pagaQuien).toLowerCase() as "ctp" | "proveedor" | "destinatario")
    : "ctp";
  const pagado = p.pagado === true;
  const gtf = texto(p.gtfNumber);
  const costoM3 = volumen && volumen > 0 ? soles(monto / volumen) : null;

  const quien = [placa && `placa ${placa}`, transportista].filter(Boolean).join(" · ");

  if (esEnsayo(task)) {
    return {
      success: true,
      data: {
        resumen:
          `Flete de ${tipo === "ingreso" ? "entrada (trae madera)" : "despacho (se la lleva)"} · ${fmt(monto)} · ${quien}` +
          `${volumen ? ` · ${volumen} m³` : ""}${costoM3 ? ` (${fmt(costoM3)}/m³)` : ""}` +
          `${gtf ? ` · GTF ${gtf}` : ""} · lo paga ${pagaQuien}, ${pagado ? "ya pagado" : "PENDIENTE de pago"}.`,
        destino: "fletes",
        monto: soles(monto),
        volumenM3: volumen,
        costoPorM3: costoM3,
        pagaQuien,
      },
    };
  }

  log.info("Anotando flete desde el asistente", { tipo, monto, placa });
  const flete = await ForestFleteDB.guardar(
    task.tenantId,
    {
      fecha: f.fecha.toISOString().slice(0, 10),
      tipo,
      ...(gtf ? { gtfNumber: gtf } : {}),
      ...(placa ? { placa } : {}),
      ...(transportista ? { transportistaNombre: transportista } : {}),
      tipoTransporte: "privado",
      volumenM3: volumen,
      monto: soles(monto),
      moneda: "PEN",
      pagaQuien,
      estadoPago: pagado ? "pagado" : "pendiente",
      notas: [texto(p.notas), "Dictado al asistente IA"].filter(Boolean).join(" · "),
    },
    "asistente-ia",
  );

  return {
    success: true,
    data: {
      registrado: true,
      destino: "fletes",
      fleteId: flete.id,
      monto: soles(monto),
      costoPorM3: costoM3,
      confirmacion:
        `Anotado: flete de ${fmt(monto)} · ${quien}` +
        `${costoM3 ? ` (${fmt(costoM3)} por m³)` : ""} — ${pagado ? "pagado" : "queda pendiente de pago"}.`,
      dondeVerlo: { pantalla: "Forestal › Herramientas › Fletes", tab: "forestal-herramientas", vista: "fletes" },
    },
  };
}
