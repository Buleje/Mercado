import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { auditCtp } from "@/lib/forestal/ctp-audit";
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
    ubigeo: r.ubigeo,
    telefono: r.telefono,
    email: r.email,
    registroMtc: r.registroMtc,
    licencia: r.licencia,
    tituloHabilitante: r.tituloHabilitante,
    notas: r.notas,
    activo: r.activo,
    usos: r.usos,
    ultimoUso: r.ultimoUso ? r.ultimoUso.toISOString() : null,
  };
}

function aVehiculo(r: VehiculoRow): Vehiculo {
  return {
    id: r.id,
    placa: r.placa,
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
      ubigeo: vacioANull(input.ubigeo),
      telefono: vacioANull(input.telefono),
      email: vacioANull(input.email),
      registroMtc: vacioANull(input.registroMtc),
      licencia: vacioANull(input.licencia),
      tituloHabilitante: vacioANull(input.tituloHabilitante),
      notas: vacioANull(input.notas),
      ...(input.activo === undefined ? {} : { activo: input.activo }),
    };

    const existente = input.id
      ? await prisma.forestParty.findFirst({ where: { id: input.id, tenantId, deletedAt: null } })
      : docNumero && docTipo
        ? await prisma.forestParty.findFirst({ where: { tenantId, docTipo, docNumero, deletedAt: null } })
        : null;

    let row: ParteRow;
    if (existente) {
      // Unión de roles: nunca se le quita a alguien un papel que ya cumplió, salvo
      // que se edite explícitamente desde el directorio (ahí llegan todos los roles).
      const roles = Array.from(new Set([...(existente.roles as RolParte[]), ...input.roles]));
      // Sin `id` el match fue POR DOCUMENTO: la llamada viene de un alta rápida
      // (la barra de la guía) que sólo manda los campos de esa pantalla. Pisar con
      // `null` lo que no vino borraría la dirección que se cargó desde otra —
      // exactamente lo que pasó al guardar como proveedor a un destinatario ya
      // completo. Sólo la edición explícita puede vaciar un campo.
      const data = input.id ? campos : soloConValor(campos);
      row = await prisma.forestParty.update({
        where: { id: existente.id },
        data: { ...data, roles },
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
      detail: `${existente ? "Actualizó" : "Agregó"} a ${row.nombre}${row.docNumero ? ` (${row.docTipo} ${row.docNumero})` : ""} como ${(row.roles as string[]).join(", ")}`,
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

    const objetivo = input.id
      ? await prisma.forestVehiculo.findFirst({ where: { id: input.id, tenantId, deletedAt: null } })
      : porPlaca;

    const row = objetivo
      ? await prisma.forestVehiculo.update({
          where: { id: objetivo.id },
          // Mismo criterio que las partes: sin `id`, el match fue por placa y el
          // que llamó puede no conocer la marca ni la capacidad. Sólo la edición
          // explícita vacía campos.
          data: input.id ? campos : soloConValor(campos),
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
      detail: `${objetivo ? "Actualizó" : "Agregó"} el vehículo ${row.placa}${row.marca ? ` (${row.marca})` : ""}`,
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
