import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { CONSUMO_VIGENTE } from "@/lib/db/forest-ctp-consumo.db";
import type {
  FilaConsumoProveedor,
  FilaCorridaProveedor,
  FilaDespachoProveedor,
  FilaIngresoProveedor,
} from "@/lib/forestal/proveedor-trazabilidad";
import {
  normalizarDocumento,
  normalizarNombre,
  normalizarPlaca,
  type DocTipo,
  type Parte,
  type ParteInput,
  type RolParte,
  type Vehiculo,
  type VehiculoInput,
  type AdjuntoParte,
} from "@/lib/forestal/directorio";

/**
 * ForestDirectorioDB — la libreta del aserradero (ADR-317).
 *
 * Partes (proveedor · destinatario · transportista · conductor) y vehículos.
 * `tenantId` 1er parámetro, escritura auditada, caché invalidada tras cada write.
 *
 * ## La regla que define esta clase: el documento es la identidad
 *
 * Guardar una parte NO es "insertar una fila": es *upsert por documento*. Si ya
 * existe una parte con ese RUC/DNI en el tenant, se actualiza y se le SUMAN los
 * roles nuevos. Sin eso la libreta reproduce el problema que vino a resolver —
 * el mismo comprador cargado tres veces porque una vez se tipeó desde ingresos,
 * otra desde la guía y otra desde el directorio.
 *
 * Las partes sin documento sí se duplican, y está bien: no hay con qué
 * fusionarlas, y adivinar por nombre parecido uniría a dos personas distintas.
 */

const CACHE_PREFIX = "forest-directorio";

/** Se intentó guardar una placa que ya está en el directorio (otro id). */
export class PlacaDuplicadaError extends Error {
  constructor(readonly placa: string) {
    super(`La placa ${placa} ya está en el directorio. Editá el vehículo existente en vez de crear otro.`);
    this.name = "PlacaDuplicadaError";
  }
}

type ParteRow = Prisma.ForestPartyGetPayload<Record<string, never>>;
type VehiculoRow = Prisma.ForestVehiculoGetPayload<{ include: { transportista: { select: { nombre: true } } } }>;

/** Vacío → `null`: una columna con `""` es un dato que no existe fingiendo existir. */
const vacioANull = (v: string | undefined | null): string | null => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

/**
 * Se queda con los campos que traen algo. Es la diferencia entre "no me lo
 * mandaste" y "quiero borrarlo": un upsert por documento no puede vaciar datos
 * que la pantalla que lo llamó ni siquiera muestra.
 */
function soloConValor<T extends Record<string, unknown>>(campos: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(campos)) {
    if (v !== null && v !== undefined && v !== "") out[k as keyof T] = v as T[keyof T];
  }
  return out;
}

/** Lo mínimo para poner el logo de una parte en la cabecera de un documento. */
export interface LogoDeParte {
  id: string;
  nombre: string;
  docNumero: string | null;
  logo: string;
}

function aParte(r: ParteRow): Parte {
  return {
    id: r.id,
    roles: (r.roles as RolParte[]) ?? [],
    nombre: r.nombre,
    docTipo: (r.docTipo as DocTipo | null) ?? null,
    docNumero: r.docNumero,
    direccion: r.direccion,
    region: r.region,
    provincia: r.provincia,
    distrito: r.distrito,
    zona: r.zona,
    ubigeo: r.ubigeo,
    telefono: r.telefono,
    email: r.email,
    registroMtc: r.registroMtc,
    licencia: r.licencia,
    tituloHabilitante: r.tituloHabilitante,
    resolucion: r.resolucion,
    planManejo: r.planManejo,
    arffs: r.arffs,
    representante: r.representante,
    notas: r.notas,
    activo: r.activo,
    usos: r.usos,
    ultimoUso: r.ultimoUso ? r.ultimoUso.toISOString() : null,
    logo: r.logo,
    // `Json?` llega como `unknown`: si alguna vez se guardó otra cosa, la lista
    // sale vacía en vez de romper la pantalla del directorio.
    adjuntos: Array.isArray(r.adjuntos) ? (r.adjuntos as unknown as AdjuntoParte[]) : [],
  };
}

function aVehiculo(r: VehiculoRow): Vehiculo {
  return {
    id: r.id,
    placa: r.placa,
    placaRemolque: r.placaRemolque,
    marca: r.marca,
    tipo: r.tipo,
    configuracion: r.configuracion,
    capacidadM3: r.capacidadM3 == null ? null : Number(r.capacidadM3),
    transportistaId: r.transportistaId,
    transportistaNombre: r.transportista?.nombre ?? null,
    notas: r.notas,
    activo: r.activo,
    usos: r.usos,
    ultimoUso: r.ultimoUso ? r.ultimoUso.toISOString() : null,
  };
}

export const ForestDirectorioDB = {
  // ── Partes ───────────────────────────────────────────────────────────────

  /**
   * La libreta de partes. `rol` filtra por papel (una empresa con varios roles
   * aparece en todos); `incluirInactivos` sólo para la vista de administración —
   * los selectores de la guía nunca deben ofrecer una parte dada de baja.
   */
  async listarPartes(
    tenantId: string,
    opts: { rol?: RolParte; q?: string; incluirInactivos?: boolean } = {},
  ): Promise<Parte[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const where: Prisma.ForestPartyWhereInput = {
      tenantId,
      deletedAt: null,
      ...(opts.incluirInactivos ? {} : { activo: true }),
      ...(opts.rol ? { roles: { has: opts.rol } } : {}),
      ...(opts.q?.trim()
        ? {
            OR: [
              { nombre: { contains: opts.q.trim(), mode: "insensitive" } },
              { docNumero: { contains: normalizarDocumento(opts.q), mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const rows = await prisma.forestParty.findMany({
      where,
      orderBy: [{ usos: "desc" }, { ultimoUso: "desc" }, { nombre: "asc" }],
      take: 500,
    });
    return rows.map(aParte);
  },

  async getParte(tenantId: string, id: string): Promise<Parte | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.forestParty.findFirst({ where: { id, tenantId, deletedAt: null } });
    return row ? aParte(row) : null;
  },

  /** Busca por documento — el camino del autocompletado: "¿este RUC ya lo tengo?". */
  async buscarPorDocumento(tenantId: string, docTipo: DocTipo, docNumero: string): Promise<Parte | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const num = normalizarDocumento(docNumero);
    if (!num) return null;
    const row = await prisma.forestParty.findFirst({
      where: { tenantId, docTipo, docNumero: num, deletedAt: null },
    });
    return row ? aParte(row) : null;
  },

  /**
   * Alta o actualización de una parte.
   *
   * Con `id` edita esa fila. Sin `id` pero con documento, hace upsert sobre el
   * documento: **los roles se fusionan, no se pisan** — cargar a un proveedor
   * como destinatario no debe borrarle el rol con el que ya entró madera.
   * Sin `id` ni documento, inserta.
   */
  async guardarParte(
    tenantId: string,
    input: ParteInput & { id?: string },
    usuario: string,
  ): Promise<Parte> {
    if (!tenantId) throw new Error("tenantId is required");
    const docTipo = input.docTipo ?? null;
    const docNumero = docTipo ? vacioANull(normalizarDocumento(input.docNumero ?? "")) : null;

    const campos = {
      nombre: normalizarNombre(input.nombre),
      docTipo: docNumero ? docTipo : null,
      docNumero,
      direccion: vacioANull(input.direccion),
      region: vacioANull(input.region),
      provincia: vacioANull(input.provincia),
      distrito: vacioANull(input.distrito),
      zona: vacioANull(input.zona),
      ubigeo: vacioANull(input.ubigeo),
      telefono: vacioANull(input.telefono),
      email: vacioANull(input.email),
      registroMtc: vacioANull(input.registroMtc),
      licencia: vacioANull(input.licencia),
      tituloHabilitante: vacioANull(input.tituloHabilitante),
      resolucion: vacioANull(input.resolucion),
      planManejo: vacioANull(input.planManejo),
      arffs: vacioANull(input.arffs),
      representante: vacioANull(input.representante),
      notas: vacioANull(input.notas),
      ...(input.activo === undefined ? {} : { activo: input.activo }),
      // `null` explícito borra el logo; `undefined` lo deja como estaba (una
      // edición de datos no tiene por qué tocar la imagen).
      ...(input.logo === undefined ? {} : { logo: input.logo || null }),
      ...(input.adjuntos === undefined ? {} : { adjuntos: input.adjuntos }),
    };

    const vivo = input.id
      ? await prisma.forestParty.findFirst({ where: { id: input.id, tenantId, deletedAt: null } })
      : docNumero && docTipo
        ? await prisma.forestParty.findFirst({ where: { tenantId, docTipo, docNumero, deletedAt: null } })
        : null;

    /**
     * Mismo criterio que las placas: volver a cargar un RUC que se dio de baja
     * revive su ficha en vez de crear una segunda. Sin esto el directorio
     * terminaba con dos entradas del mismo titular —una viva y una borrada— y
     * la que traía la dirección cargada era justamente la borrada.
     */
    const dadoDeBaja =
      !vivo && !input.id && docNumero && docTipo
        ? await prisma.forestParty.findFirst({
            where: { tenantId, docTipo, docNumero, deletedAt: { not: null } },
            orderBy: { deletedAt: "desc" },
          })
        : null;
    const existente = vivo ?? dadoDeBaja;

    let row: ParteRow;
    if (existente) {
      /**
       * Unión de roles **sólo en el alta rápida** (match por documento): ahí la
       * pantalla manda el papel de ESE momento —«lo estoy usando como
       * destinatario»— y quitarle los otros borraría historia.
       *
       * Con `id` la llamada viene de la edición del directorio, donde el
       * formulario muestra todos los roles: ahí lo que llega ES la lista. Sin
       * esta distinción un rol puesto por error no se podía sacar nunca, y una
       * empresa marcada «transportista» por accidente se ofrecía para siempre
       * como transportista al rellenar una guía.
       */
      const roles = input.id
        ? input.roles
        : Array.from(new Set([...(existente.roles as RolParte[]), ...input.roles]));
      // Sin `id` el match fue POR DOCUMENTO: la llamada viene de un alta rápida
      // (la barra de la guía) que sólo manda los campos de esa pantalla. Pisar con
      // `null` lo que no vino borraría la dirección que se cargó desde otra —
      // exactamente lo que pasó al guardar como proveedor a un destinatario ya
      // completo. Sólo la edición explícita puede vaciar un campo.
      const data = input.id ? campos : soloConValor(campos);
      row = await prisma.forestParty.update({
        where: { id: existente.id },
        data: {
          ...data,
          roles,
          ...(existente.deletedAt ? { deletedAt: null, activo: input.activo ?? true } : {}),
        },
      });
    } else {
      row = await prisma.forestParty.create({
        data: { tenantId, roles: input.roles, ...campos, createdBy: usuario || "unknown" },
      });
    }

    auditCtp({
      tenantId,
      action: "ctp_parte_upsert",
      entity: "ForestParty",
      entityId: row.id,
      detail: `${existente?.deletedAt ? "Reactivó" : existente ? "Actualizó" : "Agregó"} a ${row.nombre}${row.docNumero ? ` (${row.docTipo} ${row.docNumero})` : ""} como ${(row.roles as string[]).join(", ")}`,
      user: usuario,
    });
    this.invalidar(tenantId);
    return aParte(row);
  },

  /**
   * Baja de una parte. Soft delete: las guías ya emitidas la nombran, y borrarla
   * de verdad dejaría huérfano el rastro que un fiscalizador va a cruzar.
   */
  async eliminarParte(tenantId: string, id: string, usuario: string): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.forestParty.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!row) return false;
    await prisma.forestParty.update({
      where: { id },
      data: { deletedAt: new Date(), activo: false },
    });
    auditCtp({
      tenantId,
      action: "ctp_parte_delete",
      entity: "ForestParty",
      entityId: id,
      detail: `Dio de baja a ${row.nombre} del directorio`,
      user: usuario,
    });
    this.invalidar(tenantId);
    return true;
  },

  // ── Vehículos ────────────────────────────────────────────────────────────

  /**
   * Partes con logo cargado. Ver `LogoDeParte`: el listado normal NO los manda
   * porque son data URLs de hasta 160 KB y una libreta de cincuenta partes
   * serían ocho megas por pantallazo.
   */
  async logosDePartes(tenantId: string): Promise<LogoDeParte[]> {
    const filas = await prisma.forestParty.findMany({
      where: { tenantId, deletedAt: null, NOT: { logo: null } },
      select: { id: true, nombre: true, docNumero: true, logo: true },
      take: 200,
    });
    return filas
      .filter((f): f is typeof f & { logo: string } => Boolean(f.logo))
      .map((f) => ({ id: f.id, nombre: f.nombre, docNumero: f.docNumero, logo: f.logo }));
  },

  async listarVehiculos(
    tenantId: string,
    opts: { q?: string; incluirInactivos?: boolean } = {},
  ): Promise<Vehiculo[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const rows = await prisma.forestVehiculo.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(opts.incluirInactivos ? {} : { activo: true }),
        ...(opts.q?.trim() ? { placa: { contains: normalizarPlaca(opts.q), mode: "insensitive" } } : {}),
      },
      include: { transportista: { select: { nombre: true } } },
      orderBy: [{ usos: "desc" }, { ultimoUso: "desc" }, { placa: "asc" }],
      take: 500,
    });
    return rows.map(aVehiculo);
  },

  /**
   * Alta o actualización de un vehículo. La placa normalizada es la identidad:
   * sin `id`, guardar una placa que ya existe **actualiza** ese vehículo (nadie
   * quiere dos filas del mismo camión porque una decía "A2C-123" y otra "A2C123").
   */
  async guardarVehiculo(
    tenantId: string,
    input: VehiculoInput & { id?: string },
    usuario: string,
  ): Promise<Vehiculo> {
    if (!tenantId) throw new Error("tenantId is required");
    const placa = normalizarPlaca(input.placa);
    if (!placa) throw new Error("La placa es obligatoria");

    const campos = {
      placa,
      placaRemolque: vacioANull(input.placaRemolque ? normalizarPlaca(input.placaRemolque) : null),
      marca: vacioANull(input.marca),
      tipo: vacioANull(input.tipo),
      configuracion: vacioANull(input.configuracion),
      capacidadM3: input.capacidadM3 == null ? null : new Prisma.Decimal(input.capacidadM3),
      transportistaId: vacioANull(input.transportistaId),
      notas: vacioANull(input.notas),
      ...(input.activo === undefined ? {} : { activo: input.activo }),
    };

    const porPlaca = await prisma.forestVehiculo.findFirst({ where: { tenantId, placa, deletedAt: null } });
    // Editando otro vehículo y poniéndole una placa ocupada: eso sí es un choque
    // real, no un re-alta — se avisa en vez de fusionar dos camiones distintos.
    if (input.id && porPlaca && porPlaca.id !== input.id) throw new PlacaDuplicadaError(placa);

    /**
     * La baja es lógica, pero el índice único `(tenantId, placa)` **no** excluye
     * las borradas: volver a dar de alta una placa dada de baja se iba por
     * `create` y reventaba contra el índice — el operador veía "internal_error"
     * sin una sola pista. Re-alta de una placa que ya estuvo = revivir su ficha,
     * que además conserva su historial de viajes.
     */
    const dadoDeBaja =
      !porPlaca
        ? await prisma.forestVehiculo.findFirst({
            where: { tenantId, placa, deletedAt: { not: null } },
            orderBy: { deletedAt: "desc" },
          })
        : null;
    // Editando OTRO vehículo hacia una placa que pertenece a una ficha de baja:
    // el índice tampoco lo permite. Se avisa con el motivo en vez del 500.
    if (input.id && dadoDeBaja && dadoDeBaja.id !== input.id) throw new PlacaDuplicadaError(placa);

    const objetivo = input.id
      ? await prisma.forestVehiculo.findFirst({ where: { id: input.id, tenantId, deletedAt: null } })
      : (porPlaca ?? dadoDeBaja);

    const row = objetivo
      ? await prisma.forestVehiculo.update({
          where: { id: objetivo.id },
          // Mismo criterio que las partes: sin `id`, el match fue por placa y el
          // que llamó puede no conocer la marca ni la capacidad. Sólo la edición
          // explícita vacía campos.
          data: {
            ...(input.id ? campos : soloConValor(campos)),
            // Revivir la ficha: sin esto el alta "no haría nada visible".
            ...(objetivo.deletedAt ? { deletedAt: null, activo: input.activo ?? true } : {}),
          },
          include: { transportista: { select: { nombre: true } } },
        })
      : await prisma.forestVehiculo.create({
          data: { tenantId, ...campos, createdBy: usuario || "unknown" },
          include: { transportista: { select: { nombre: true } } },
        });

    auditCtp({
      tenantId,
      action: "ctp_vehiculo_upsert",
      entity: "ForestVehiculo",
      entityId: row.id,
      // El re-alta se distingue en la auditoría: "reactivó" y "actualizó" son
      // hechos distintos para quien después lee el rastro.
      detail: `${objetivo?.deletedAt ? "Reactivó" : objetivo ? "Actualizó" : "Agregó"} el vehículo ${row.placa}${row.marca ? ` (${row.marca})` : ""}`,
      user: usuario,
    });
    this.invalidar(tenantId);
    return aVehiculo(row);
  },

  async eliminarVehiculo(tenantId: string, id: string, usuario: string): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.forestVehiculo.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!row) return false;
    await prisma.forestVehiculo.update({ where: { id }, data: { deletedAt: new Date(), activo: false } });
    auditCtp({
      tenantId,
      action: "ctp_vehiculo_delete",
      entity: "ForestVehiculo",
      entityId: id,
      detail: `Dio de baja el vehículo ${row.placa}`,
      user: usuario,
    });
    this.invalidar(tenantId);
    return true;
  },

  // ── Uso ──────────────────────────────────────────────────────────────────

  /**
   * Marca que estas partes/vehículos se usaron en un documento real.
   *
   * Es lo que hace que la libreta se ordene sola: el destinatario de todos los
   * martes queda arriba sin que nadie lo configure. NO es dato de compliance —
   * si falla, se loguea y la operación sigue (la guía ya se guardó).
   */
  async marcarUso(tenantId: string, ids: { partes?: string[]; vehiculos?: string[] }): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    const partes = (ids.partes ?? []).filter(Boolean);
    const vehiculos = (ids.vehiculos ?? []).filter(Boolean);
    if (!partes.length && !vehiculos.length) return;
    const ahora = new Date();
    await Promise.all([
      partes.length
        ? prisma.forestParty.updateMany({
            where: { tenantId, id: { in: partes }, deletedAt: null },
            data: { usos: { increment: 1 }, ultimoUso: ahora },
          })
        : Promise.resolve(),
      vehiculos.length
        ? prisma.forestVehiculo.updateMany({
            where: { tenantId, id: { in: vehiculos }, deletedAt: null },
            data: { usos: { increment: 1 }, ultimoUso: ahora },
          })
        : Promise.resolve(),
    ]);
    this.invalidar(tenantId);
  },

  // ── Trazabilidad del proveedor ───────────────────────────────────────────

  /**
   * Todo lo que entró de un titular y qué pasó con eso (ADR-319).
   *
   * Se busca por NOMBRE y no por id porque el ingreso guarda `providerName` en
   * texto (ADR-134): el directorio completa esa identidad, pero migrar el
   * histórico es otro paso. `contains` insensible para que "Maderera del
   * Oriente SAC" encuentre también lo que se tipeó sin "SAC".
   */
  async trazabilidadProveedor(
    tenantId: string,
    nombre: string,
    opts: { desde?: Date; hasta?: Date } = {},
  ): Promise<{
    ingresos: FilaIngresoProveedor[];
    consumos: FilaConsumoProveedor[];
    corridas: FilaCorridaProveedor[];
    despachos: FilaDespachoProveedor[];
  }> {
    if (!tenantId) throw new Error("tenantId is required");
    const q = nombre.trim();
    if (!q) return { ingresos: [], consumos: [], corridas: [], despachos: [] };

    const entries = await prisma.woodEntry.findMany({
      where: {
        tenantId,
        deletedAt: null,
        providerName: { contains: q, mode: "insensitive" },
        ...(opts.desde || opts.hasta
          ? { entryDate: { ...(opts.desde ? { gte: opts.desde } : {}), ...(opts.hasta ? { lte: opts.hasta } : {}) } }
          : {}),
      },
      select: {
        id: true,
        gtfNumber: true,
        serforNumeroRegistro: true,
        entryDate: true,
        speciesCommonName: true,
        speciesCites: true,
        originCode: true,
        volumeM3: true,
        status: true,
        costoTotal: true,
      },
      orderBy: { entryDate: "desc" },
      take: 1000,
    });

    const ingresos: FilaIngresoProveedor[] = entries.map((e) => ({
      woodEntryId: e.id,
      gtfNumber: e.gtfNumber,
      serforNumeroRegistro: e.serforNumeroRegistro,
      entryDate: e.entryDate.toISOString(),
      especie: e.speciesCommonName ?? "—",
      cites: e.speciesCites,
      originCode: e.originCode,
      volumeM3: Number(e.volumeM3),
      status: e.status,
      costoTotal: e.costoTotal == null ? null : Number(e.costoTotal),
    }));
    if (!ingresos.length) return { ingresos, consumos: [], corridas: [], despachos: [] };

    const ids = ingresos.map((i) => i.woodEntryId);
    // Sólo consumos VIGENTES: una corrida anulada devolvió su materia prima al
    // patio, así que contarla haría desaparecer madera que sigue estando.
    const filasConsumo = await prisma.forestCtpConsumo.findMany({
      where: { tenantId, woodEntryId: { in: ids }, ...CONSUMO_VIGENTE },
      select: { woodEntryId: true, ctpEntryId: true, volumeM3: true },
    });
    const consumos: FilaConsumoProveedor[] = filasConsumo.map((c) => ({
      woodEntryId: c.woodEntryId,
      produccionEntryId: c.ctpEntryId,
      volumeM3: Number(c.volumeM3),
    }));

    const idsCorridas = [...new Set(consumos.map((c) => c.produccionEntryId))];
    if (!idsCorridas.length) return { ingresos, consumos, corridas: [], despachos: [] };

    const filasCorrida = await prisma.forestCtpEntry.findMany({
      where: { tenantId, id: { in: idsCorridas }, deletedAt: null },
      select: {
        id: true,
        lineNo: true,
        entryDate: true,
        productType: true,
        speciesCommon: true,
        lineaProduccion: true,
        quantity: true,
        unit: true,
        // Cuántos ingresos DISTINTOS la alimentaron: >1 ⇒ mezcla de titulares.
        _count: { select: { consumos: true } },
      },
    });
    const corridas: FilaCorridaProveedor[] = filasCorrida.map((c) => ({
      produccionEntryId: c.id,
      lineNo: c.lineNo,
      fecha: c.entryDate.toISOString(),
      productType: c.productType,
      especie: c.speciesCommon,
      lineaProduccion: c.lineaProduccion,
      quantity: c.quantity == null ? 0 : Number(c.quantity),
      unit: c.unit,
      ingresosDistintos: c._count.consumos,
    }));

    const filasDespacho = await prisma.forestCtpDespachoOrigen.findMany({
      where: {
        tenantId,
        produccionEntryId: { in: idsCorridas },
        // Un despacho anulado no sacó nada del patio.
        despacho: { deletedAt: null, status: "registrado" },
      },
      select: {
        despachoEntryId: true,
        produccionEntryId: true,
        quantity: true,
        despacho: { select: { lineNo: true, entryDate: true, gtfNumber: true, destino: true } },
      },
    });
    const despachos: FilaDespachoProveedor[] = filasDespacho.map((d) => ({
      despachoEntryId: d.despachoEntryId,
      produccionEntryId: d.produccionEntryId,
      lineNo: d.despacho.lineNo,
      fecha: d.despacho.entryDate.toISOString(),
      gtfNumber: d.despacho.gtfNumber,
      destino: d.despacho.destino,
      quantity: Number(d.quantity),
    }));

    return { ingresos, consumos, corridas, despachos };
  },

  invalidar(tenantId: string): void {
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch (err) {
      // No rompe el write, pero un caché que no se invalida sirve datos viejos:
      // se loguea siempre (regla 4 de code-quality).
      logger.error("[forest-directorio] no se pudo invalidar la caché", { error: String(err), tenantId });
    }
  },
};
