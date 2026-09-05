/**
 * lib/agents/domains/plata.agent.ts
 *
 * «Anotame la compra de combustible del camión N12» — el dominio que convierte
 * una frase en un asiento real.
 *
 * Es el PRIMER dominio del asistente cuyo objeto es escribir plata. Por eso
 * cada acción de escritura respeta el contrato que dejó `inventory.ajustar-stock`
 * (memoria `asistente-ia-eje-central`):
 *
 *   1. `requiresApproval: true` en `tool-definitions` → el chat pinta la tarjeta
 *      [Confirmar]/[Cancelar]. Un monto mal oído no entra a la contabilidad.
 *   2. Modo ensayo (`payload.__validar === true`): valida TODO y devuelve un
 *      `resumen` legible SIN tocar la base. Si el ensayo falla no hay tarjeta,
 *      hay un error que manda al modelo a buscar primero.
 *   3. La escritura va por la MISMA DB class que usa la pantalla equivalente,
 *      para que el registro quede idéntico al que haría una persona a mano.
 *   4. Siempre hay una búsqueda de lectura previa (`buscar-maquina`,
 *      `buscar-persona`, `buscar-deuda`) que con más de una coincidencia
 *      responde «preguntá cuál antes de anotar nada».
 *
 * ⚠️ DÓNDE ATERRIZA CADA GASTO (no es lo mismo y la respuesta lo dice):
 *
 *   | Lo que se dicta                    | Dónde se guarda      | Dónde se ve      |
 *   |------------------------------------|----------------------|------------------|
 *   | «combustible para el camión N12»   | AssetExpense         | Mi Plata › Activos |
 *   | «pagué la luz», «flete», «sueldo»  | Expense              | Mi Plata › Gastos  |
 *
 * Son dos libros distintos y ninguna pantalla los suma: es exactamente lo que
 * hacen hoy los formularios de Activos y de Gastos. Escribir en los dos sería
 * contar la misma plata dos veces. El `resumen` de la tarjeta dice en cuál cae,
 * porque «lo anoté» sin decir dónde manda a buscarlo al lugar equivocado.
 */

import type { DomainAgent, AgentTask, AgentResult, AgentContext } from "@/lib/agents/types";
import { scopedLogger } from "@/lib/agents/context";
import { AssetsDB } from "@/lib/db/assets.db";
import { ExpensesDB } from "@/lib/db/finance.db";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { FiadosDB } from "@/lib/db/fiados.db";
import { CashRegistersDB } from "@/lib/db/sales.db";

// ── Utilidades del dominio ───────────────────────────────────────────────────

/** Soles con dos decimales. Todo monto que sale de acá pasó por esto. */
const soles = (n: number) => Math.round(n * 100) / 100;

const fmt = (n: number) =>
  `S/ ${soles(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const texto = (v: unknown): string => String(v ?? "").trim();

/** ¿Está en modo ensayo? El route lo pide antes de ofrecer la confirmación. */
const esEnsayo = (task: AgentTask) => task.payload.__validar === true;

/**
 * Normaliza para comparar: sin tildes, sin guiones, minúsculas.
 *
 * Una placa se dicta «A cuatro B ocho nueve dos» y se escribe «A4B-892»: sin
 * sacar el guion, buscar "A4B892" no encuentra nada.
 */
function clave(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Palabras de 3+ letras/dígitos — el matching es por palabra, no por substring. */
function palabras(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
}

/**
 * Una fecha dictada, siempre en el pasado razonable.
 *
 * El modelo resuelve «ayer» contra la fecha de hoy que ya viaja en el snapshot;
 * acá sólo se valida que lo que llegó sea una fecha y que no sea de otro siglo.
 * Un gasto con fecha de mañana desordena el cierre del mes en silencio.
 */
function fechaValida(raw: unknown): { ok: true; fecha: Date } | { ok: false; error: string } {
  const s = texto(raw);
  if (!s) return { ok: true, fecha: new Date() };
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: `No entendí la fecha "${s}". Usá el formato AAAA-MM-DD.` };
  }
  const manana = Date.now() + 86_400_000;
  if (d.getTime() > manana) {
    return { ok: false, error: `Esa fecha (${s}) es futura. Un gasto se anota cuando ya salió la plata.` };
  }
  if (d.getTime() < Date.now() - 3 * 365 * 86_400_000) {
    return { ok: false, error: `Esa fecha (${s}) es de hace más de 3 años. ¿Está bien el año?` };
  }
  return { ok: true, fecha: d };
}

const METODOS_PAGO = ["efectivo", "yape", "plin", "transferencia", "tarjeta", "credito"] as const;
type MetodoPagoGasto = (typeof METODOS_PAGO)[number];

/** Los métodos que mueven el cajón. `credito` no salió de la caja: se debe. */
const METODOS_CAJA = new Set(["efectivo", "yape", "plin", "transferencia", "tarjeta"]);

function metodoPago(raw: unknown): MetodoPagoGasto | null {
  const m = clave(texto(raw));
  const hit = METODOS_PAGO.find((x) => clave(x) === m);
  return hit ?? null;
}

/** Categorías del libro de la máquina — las mismas del formulario de Activos. */
const CATEGORIAS_MAQUINA = ["combustible", "mantenimiento", "repuesto", "operador", "peaje", "otro"] as const;

/** Categorías del libro de gastos — las mismas del formulario de Gastos. */
const CATEGORIAS_GASTO = [
  "alquiler", "servicios", "personal", "transporte",
  "limpieza", "marketing", "mantenimiento", "otros",
] as const;

/**
 * ¿Hay que preguntar, o hay un ganador claro?
 *
 * Que aparezcan dos resultados NO es ambigüedad: buscando «camión N12» también
 * pica «Camión N7» por compartir la palabra «camión», y frenar ahí para
 * preguntar convierte cada dictado en un ida y vuelta. El puntaje es RELATIVO
 * (misma lección que el matcher de voz del POS): sólo se pregunta cuando el
 * segundo le pisa los talones al primero.
 */
function hayEmpate(rank: { score: number }[]): boolean {
  return rank.length > 1 && rank[1].score >= rank[0].score * 0.8;
}

// ── Lecturas: sin esto, el modelo inventa ids ────────────────────────────────

/**
 * Busca una máquina por nombre, placa o tipo.
 *
 * Devolver el `id` es el punto: sin él, «anotá el combustible del camión N12»
 * termina en un `assetId` inventado y la tarjeta pregunta por un activo que no
 * existe. Con más de una coincidencia se ordena por puntaje pero se dice que
 * hay varias — elegir por el agente es elegir mal la mitad de las veces.
 */
async function buscarMaquina(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const q = texto(task.payload.texto);
  if (!q) return { success: false, error: "Decime qué máquina buscar (nombre o placa)." };

  const activos = await AssetsDB.listWithStats(task.tenantId, { includeInactive: true });
  const qk = clave(q);
  const qp = palabras(q);

  const puntuar = (a: { name: string; plate: string | null; type: string }) => {
    const nk = clave(a.name);
    const pk = clave(a.plate ?? "");
    // La placa es identidad: si coincide (entera o como parte), gana sobre todo.
    if (pk && (pk === qk || pk.includes(qk) || qk.includes(pk))) return 100;
    if (nk === qk) return 90;
    if (nk.includes(qk)) return 70;
    const np = new Set([...palabras(a.name), ...palabras(a.type)]);
    const comunes = qp.filter((w) => np.has(w)).length;
    return comunes * 20;
  };

  const rank = activos
    .map((a) => ({ a, score: puntuar(a) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score);

  scopedLogger(ctx).info("Buscando máquina", { q, encontradas: rank.length });

  return {
    success: true,
    data: {
      encontradas: rank.length,
      maquinas: rank.slice(0, 8).map(({ a }) => ({
        maquinaId: a.id,
        nombre: a.name,
        placa: a.plate,
        tipo: a.type,
        estado: a.status,
        activa: a.active,
        horometro: a.currentHours,
      })),
      ...(rank.length === 0 && {
        mensaje: `Ninguna máquina coincide con "${q}". Las máquinas se dan de alta en Mi Plata › Reportes › Activos.`,
      }),
      ...(hayEmpate(rank) && {
        mensaje: "Hay más de una que calza parecido: preguntá cuál antes de anotar nada.",
      }),
      /**
       * El veredicto, explícito.
       *
       * Devolver dos filas y callarse hacía que el modelo preguntara «¿N12 o
       * N7?» buscando «camión N12» — la respuesta estaba en el orden, pero
       * nadie se la había dicho. Que aparezca N7 no es duda: es que comparte la
       * palabra «camión».
       */
      ...(rank.length > 0 && !hayEmpate(rank) && {
        recomendado: rank[0].a.id,
        mensaje: `"${rank[0].a.name}" es la que mejor calza: usá ese maquinaId sin preguntar.`,
      }),
    },
  };
}

/**
 * Busca a una persona del padrón de adelantos, con sus adelantos abiertos.
 *
 * Trae los adelantos en la misma respuesta porque las dos preguntas que siguen
 * («¿a quién le adelanto?» y «¿contra cuál entrega?») necesitan ids distintos, y
 * dos viajes al modelo por lo mismo son dos oportunidades de inventar uno.
 */
async function buscarPersona(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const q = texto(task.payload.texto);
  if (!q) return { success: false, error: "Decime a quién buscar (nombre o documento)." };

  const [personas, adelantos] = await Promise.all([
    AdelantosDB.listBeneficiarios(task.tenantId),
    AdelantosDB.list(task.tenantId, { status: "ABIERTO" }),
  ]);

  const qk = clave(q);
  const qp = palabras(q);
  const rank = personas
    .map((p) => {
      const nk = clave(p.nombre);
      const dk = clave(p.documento ?? "");
      let score = 0;
      if (dk && dk === qk) score = 100;
      else if (nk === qk) score = 90;
      else if (nk.includes(qk)) score = 70;
      else {
        const np = new Set(palabras(p.nombre));
        score = qp.filter((w) => np.has(w)).length * 20;
      }
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score);

  scopedLogger(ctx).info("Buscando persona del padrón", { q, encontradas: rank.length });

  return {
    success: true,
    data: {
      encontradas: rank.length,
      personas: rank.slice(0, 8).map(({ p }) => ({
        personaId: p.id,
        nombre: p.nombre,
        documento: p.documento ?? null,
        telefono: p.telefono ?? null,
        limiteCredito: p.limiteCredito ?? null,
        adelantosAbiertos: adelantos
          .filter((a) => a.beneficiarioId === p.id)
          .map((a) => ({
            adelantoId: a.id,
            codigo: a.codigoOperacion ?? null,
            monto: soles(Number(a.montoAdelantado ?? 0)),
            saldo: soles(Number(a.saldoPendiente ?? 0)),
            fecha: a.fechaAdelanto ? String(a.fechaAdelanto).slice(0, 10) : null,
          })),
      })),
      ...(rank.length === 0 && {
        mensaje: `Nadie del padrón coincide con "${q}". Las personas se dan de alta en Mi Plata › Por cobrar › Adelantos.`,
      }),
      ...(hayEmpate(rank) && { mensaje: "Hay más de una que calza parecido: preguntá cuál antes de anotar nada." }),
      ...(rank.length > 0 && !hayEmpate(rank) && {
        recomendado: rank[0].p.id,
        mensaje: `"${rank[0].p.nombre}" es quien mejor calza: usá ese personaId sin preguntar.`,
      }),
    },
  };
}

/**
 * Busca las deudas abiertas de un cliente (fiados) para poder cobrarlas.
 *
 * ACTIVO y VENCIDO son los que siguen debiendo; PAGADO y CANCELADO no. Es la
 * misma regla que usa `cobranzas.fiados`, repetida acá porque cobrar contra un
 * fiado cancelado tira error en la DB class y el usuario no entendería por qué.
 */
async function buscarDeuda(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const q = texto(task.payload.texto);
  const lista = (await FiadosDB.list(task.tenantId)).filter(
    (f) => f.status === "ACTIVO" || f.status === "VENCIDO",
  );

  const qk = clave(q);
  const qp = palabras(q);
  const coincide = (f: { customerName?: string | null; customerId: string }) => {
    if (!q) return true;
    const nk = clave(f.customerName ?? "");
    const tk = clave(f.customerId);
    if (tk.includes(qk) || qk.includes(tk)) return true;
    if (nk === qk || nk.includes(qk)) return true;
    const np = new Set(palabras(f.customerName ?? ""));
    return qp.some((w) => np.has(w));
  };

  const deudas = lista
    .filter(coincide)
    .map((f) => ({
      fiadoId: f.id,
      cliente: f.customerName || f.customerId,
      telefono: f.customerId,
      saldo: soles(Number(f.saldo ?? 0)),
      total: soles(Number(f.total ?? 0)),
      estado: f.status,
      desde: f.createdAt ? String(f.createdAt).slice(0, 10) : null,
    }))
    .filter((d) => d.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo);

  scopedLogger(ctx).info("Buscando fiados abiertos", { q, encontrados: deudas.length });

  return {
    success: true,
    data: {
      encontradas: deudas.length,
      deudas: deudas.slice(0, 10),
      ...(deudas.length === 0 && {
        mensaje: q ? `Nadie con deuda abierta coincide con "${q}".` : "No hay fiados abiertos.",
      }),
      // Acá SÍ alcanza con que haya más de una: dos deudas del mismo cliente son
      // dos deudas distintas, y cobrar en la equivocada deja las dos mal.
      ...(deudas.length > 1 && { mensaje: "Hay más de una deuda abierta: preguntá cuál antes de cobrar." }),
    },
  };
}

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
function resolverMonto(
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
async function registrarGasto(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
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
async function registrarIngreso(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
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
async function registrarAdelanto(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
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
async function cobrarFiado(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
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
async function liquidarAdelanto(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
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

// ── Agente ───────────────────────────────────────────────────────────────────

export const plataAgent: DomainAgent = {
  domain: "plata",
  actions: [
    "buscar-maquina",
    "buscar-persona",
    "buscar-deuda",
    "registrar-gasto",
    "registrar-ingreso",
    "registrar-adelanto",
    "cobrar-fiado",
    "liquidar-adelanto",
  ],
  description:
    "Anota operaciones de plata dictadas en lenguaje natural: gastos (del negocio o de una máquina), ingresos, adelantos a personas, cobros de fiado y liquidaciones de adelanto. Las escrituras pasan por confirmación humana.",

  async execute(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    try {
      switch (task.action) {
        case "buscar-maquina":     return await buscarMaquina(task, ctx);
        case "buscar-persona":     return await buscarPersona(task, ctx);
        case "buscar-deuda":       return await buscarDeuda(task, ctx);
        case "registrar-gasto":    return await registrarGasto(task, ctx);
        case "registrar-ingreso":  return await registrarIngreso(task, ctx);
        case "registrar-adelanto": return await registrarAdelanto(task, ctx);
        case "cobrar-fiado":       return await cobrarFiado(task, ctx);
        case "liquidar-adelanto":  return await liquidarAdelanto(task, ctx);
        default:
          return { success: false, error: `Acción desconocida de plata: ${task.action}` };
      }
    } catch (err) {
      /**
       * Los errores de las DB classes son mensajes de negocio pensados para que
       * los lea una persona («Supera el límite de crédito de Juan…»). Se pasan
       * tal cual al modelo: reemplazarlos por «error interno» le saca al usuario
       * lo único que le dice qué hacer.
       */
      const mensaje = err instanceof Error ? err.message : String(err);
      scopedLogger(ctx).error("Plata agent falló", { action: task.action, error: mensaje });
      return { success: false, error: mensaje };
    }
  },
};
