/**
 * lib/agents/domains/plata/busquedas.ts
 *
 * Las lecturas que existen para que el modelo NO invente ids.
 *
 * Cada una devuelve, además de los resultados, su veredicto: `recomendado`
 * cuando hay un ganador claro, o un mensaje pidiendo aclarar cuando el segundo
 * le pisa los talones al primero. Devolver dos filas y callarse hacía que el
 * modelo preguntara «¿N12 o N7?» teniendo la respuesta en el orden.
 */

import type { AgentTask, AgentResult, AgentContext } from "@/lib/agents/types";
import { scopedLogger } from "@/lib/agents/context";
import { AssetsDB } from "@/lib/db/assets.db";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { FiadosDB } from "@/lib/db/fiados.db";
import { SuppliersDB } from "@/lib/db/purchases.db";
import { TreasuryDB } from "@/lib/db/treasury.db";
import { ForestLoteDB } from "@/lib/db/forest-lote.db";
import { soles, clave, palabras, texto, hayEmpate } from "./comun";

// ── Lecturas: sin esto, el modelo inventa ids ────────────────────────────────

/**
 * Busca una máquina por nombre, placa o tipo.
 *
 * Devolver el `id` es el punto: sin él, «anotá el combustible del camión N12»
 * termina en un `assetId` inventado y la tarjeta pregunta por un activo que no
 * existe. Con más de una coincidencia se ordena por puntaje pero se dice que
 * hay varias — elegir por el agente es elegir mal la mitad de las veces.
 */
export async function buscarMaquina(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
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
export async function buscarPersona(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
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
export async function buscarDeuda(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
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


// ── Proveedores, cuentas y lotes ─────────────────────────────────────────────

/**
 * Ordena candidatos por qué tan bien calzan con lo que se dictó.
 *
 * Es el mismo criterio de `buscarMaquina`, extraído: identidad exacta (un RUC,
 * un código de lote) gana sobre nombre, y el nombre completo sobre las palabras
 * sueltas. Repetirlo en cada búsqueda hacía que cada una derivara con el tiempo.
 */
function rankear<T>(
  items: T[],
  consulta: string,
  campos: (x: T) => { identidad?: (string | null | undefined)[]; nombre: string; extra?: string },
): { x: T; score: number }[] {
  const qk = clave(consulta);
  const qp = palabras(consulta);
  return items
    .map((x) => {
      const c = campos(x);
      const nk = clave(c.nombre);
      let score = 0;
      for (const id of c.identidad ?? []) {
        const ik = clave(id ?? "");
        if (ik && (ik === qk || ik.includes(qk) || qk.includes(ik))) { score = 100; break; }
      }
      if (score === 0) {
        if (nk === qk) score = 90;
        else if (nk.includes(qk)) score = 70;
        else {
          const np = new Set([...palabras(c.nombre), ...palabras(c.extra ?? "")]);
          score = qp.filter((w) => np.has(w)).length * 20;
        }
      }
      return { x, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** El veredicto que ya usa `buscarMaquina`, para no repetirlo en cada búsqueda. */
function veredicto<T>(
  rank: { x: T; score: number }[],
  idDe: (x: T) => string,
  nombreDe: (x: T) => string,
  sinResultados: string,
  comoLlamarlo: string,
): Record<string, unknown> {
  if (rank.length === 0) return { mensaje: sinResultados };
  if (hayEmpate(rank)) {
    return { mensaje: "Hay más de uno que calza parecido: preguntá cuál antes de anotar nada." };
  }
  return {
    recomendado: idDe(rank[0].x),
    mensaje: `"${nombreDe(rank[0].x)}" es el que mejor calza: usá ese ${comoLlamarlo} sin preguntar.`,
  };
}

/**
 * Busca un proveedor del padrón por nombre, RUC o documento.
 *
 * Devolver el id es lo que convierte «le compré a Distribuidora Ucayali» en una
 * compra que después se puede cruzar («¿cuánto le compré a X este año?»). Con el
 * nombre suelto, cada dictado escribe una variante distinta del mismo proveedor.
 */
export async function buscarProveedor(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const q = texto(task.payload.texto);
  if (!q) return { success: false, error: "Decime qué proveedor buscar (nombre, RUC o documento)." };

  const proveedores = await SuppliersDB.getAll(task.tenantId);
  const rank = rankear(proveedores, q, (p) => ({
    identidad: [p.ruc, p.documento],
    nombre: p.name,
    extra: p.razonSocial ?? "",
  }));

  scopedLogger(ctx).info("Buscando proveedor", { q, encontrados: rank.length });
  return {
    success: true,
    data: {
      encontrados: rank.length,
      proveedores: rank.slice(0, 8).map(({ x: p }) => ({
        proveedorId: p.id,
        nombre: p.name,
        ruc: p.ruc ?? null,
        telefono: p.phone ?? null,
      })),
      ...veredicto(
        rank,
        (p) => p.id,
        (p) => p.name,
        `Ningún proveedor coincide con "${q}". Se dan de alta en Compras › Proveedores.`,
        "proveedorId",
      ),
    },
  };
}

/**
 * Busca una cuenta de tesorería (banco, caja fuerte, billetera) por nombre.
 *
 * Devuelve el saldo porque mover plata sin ver de cuánto se parte es la forma
 * de dejar una cuenta en rojo sin enterarse.
 */
export async function buscarCuenta(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const q = texto(task.payload.texto);
  const cuentas = await TreasuryDB.listCuentas(task.tenantId);
  if (cuentas.length === 0) {
    return {
      success: true,
      data: { encontradas: 0, cuentas: [], mensaje: "No hay cuentas de tesorería creadas. Se dan de alta en Mi Plata › Caja › Tesorería." },
    };
  }

  // Sin texto se listan todas: «pasá plata del banco a la caja» necesita ver las dos.
  const rank = q
    ? rankear(cuentas, q, (c) => ({ identidad: [c.numeroCuenta], nombre: c.nombre, extra: `${c.banco ?? ""} ${c.tipo}` }))
    : cuentas.map((x) => ({ x, score: 1 }));

  scopedLogger(ctx).info("Buscando cuenta de tesorería", { q, encontradas: rank.length });
  return {
    success: true,
    data: {
      encontradas: rank.length,
      cuentas: rank.slice(0, 10).map(({ x: c }) => ({
        cuentaId: c.id,
        nombre: c.nombre,
        tipo: c.tipo,
        banco: c.banco,
        moneda: c.moneda,
        saldo: soles(c.saldo),
      })),
      ...(q
        ? veredicto(
            rank,
            (c) => c.id,
            (c) => c.nombre,
            `Ninguna cuenta coincide con "${q}".`,
            "cuentaId",
          )
        : {}),
    },
  };
}

/**
 * Busca un lote de producción forestal por su código (L-2026-001).
 *
 * No existe un libro de gastos POR lote: lo que hay es el centro de costo del
 * gasto. Esta búsqueda devuelve el código EXACTO para que «el lote L-2026-3»
 * dictado termine en `centroCosto: "L-2026-003"` y no en tres variantes que
 * después no suman juntas.
 */
export async function buscarLote(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const q = texto(task.payload.texto);
  const items = await ForestLoteDB.list(task.tenantId, {});
  const rank = q
    ? rankear(items, q, (l) => ({
        identidad: [l.loteCode],
        nombre: l.loteCode,
        extra: `${l.speciesCommon ?? ""} ${l.productType ?? ""} ${l.destino ?? ""}`,
      }))
    : items.slice(0, 10).map((x) => ({ x, score: 1 }));

  scopedLogger(ctx).info("Buscando lote de producción", { q, encontrados: rank.length });
  return {
    success: true,
    data: {
      encontrados: rank.length,
      lotes: rank.slice(0, 8).map(({ x: l }) => ({
        loteId: l.id,
        codigo: l.loteCode,
        estado: l.status,
        especie: l.speciesCommon ?? null,
        producto: l.productType ?? null,
      })),
      ...(rank.length === 0
        ? { mensaje: `Ningún lote coincide con "${q}". Los lotes se arman en Forestal › Lotes de Producción.` }
        : {
            /**
             * Para el gasto se usa el CÓDIGO, no el id: el centro de costo lo
             * lee una persona en un reporte, y «L-2026-003» significa algo
             * mientras que un cuid no.
             */
            usarComoCentroCosto: rank[0].x.loteCode,
            mensaje: `Pasá "${rank[0].x.loteCode}" como centroCosto del gasto.`,
          }),
    },
  };
}
