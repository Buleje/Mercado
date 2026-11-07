import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { normalizarEstado, siguienteCodigoInterno, type BloqueInput, type DocumentoPlantacion, type PlantacionInput, type PlantacionListItem, type PlantacionRegistro } from "@/lib/forestal/plantacion-tramite";

/**
 * ForestPlantacionesDB — Registro de Plantación Forestal (RNPF, ADR-380).
 *
 * Relacional a propósito (no KV): 1 trámite → N bloques → N vértices + N
 * especies por bloque, la misma forma que exige el Anexo N°01 oficial. Los
 * bloques (con sus vértices/especies) se REEMPLAZAN completos en cada save
 * — la UI edita el árbol entero por vez, mismo criterio que el import bulk
 * de censo (`ForestPlanDB.bulkImportTrees`).
 *
 * `tenantId` 1er parámetro; todo write auditado vía `auditCtp` — lo que se
 * declara para el RNPF es parte del expediente, no metadata.
 */

const CACHE_PREFIX = "forest-plantaciones";

const dec = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? null : new Prisma.Decimal(v);
const num = (v: Prisma.Decimal | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));
const txt = (v: string | null | undefined) => v?.trim() || null;

type PlantacionRow = Prisma.ForestPlantacionTramiteGetPayload<Record<string, never>>;
type BloqueRow = Prisma.ForestPlantacionBloqueGetPayload<Record<string, never>> & {
  vertices: Prisma.ForestPlantacionVerticeGetPayload<Record<string, never>>[];
  especies: Prisma.ForestPlantacionEspecieGetPayload<Record<string, never>>[];
};

/** Fila de la DB (trámite + bloques completos) → forma pura `PlantacionInput`/`PlantacionRegistro`. */
function toRegistro(row: PlantacionRow, bloques: BloqueRow[]): PlantacionRegistro {
  const documentos = (row.documentosJson as unknown as DocumentoPlantacion[] | null) ?? [];
  const datos: PlantacionInput = {
    id: row.id,
    tipoTramite: row.tipoTramite === "actualizacion" ? "actualizacion" : "inscripcion",
    codigoPlantacionSerfor: row.codigoPlantacionSerfor,
    estado: row.estado,

    titularTipoPersona: row.titularTipoPersona as PlantacionInput["titularTipoPersona"],
    titularTipoDocumento: row.titularTipoDocumento,
    titularNumeroDocumento: row.titularNumeroDocumento,
    titularRazonSocial: row.titularRazonSocial,
    titularApellidoPaterno: row.titularApellidoPaterno,
    titularApellidoMaterno: row.titularApellidoMaterno,
    titularNombres: row.titularNombres,
    titularTelefonoFijo: row.titularTelefonoFijo,
    titularCelular: row.titularCelular,
    titularEmail: row.titularEmail,
    titularDepartamento: row.titularDepartamento,
    titularProvincia: row.titularProvincia,
    titularDistrito: row.titularDistrito,
    titularTipoVia: row.titularTipoVia,
    titularDireccion: row.titularDireccion,
    titularNumero: row.titularNumero,
    titularDocumentoAutorizaUso: row.titularDocumentoAutorizaUso,

    repTiene: row.repTiene,
    repTipoDocumento: row.repTipoDocumento,
    repNumeroDocumento: row.repNumeroDocumento,
    repApellidoPaterno: row.repApellidoPaterno,
    repApellidoMaterno: row.repApellidoMaterno,
    repNombres: row.repNombres,
    repTelefonoFijo: row.repTelefonoFijo,
    repCelular: row.repCelular,
    repEmail: row.repEmail,
    repDepartamento: row.repDepartamento,
    repProvincia: row.repProvincia,
    repDistrito: row.repDistrito,
    repTipoVia: row.repTipoVia,
    repDireccion: row.repDireccion,
    repNumero: row.repNumero,

    predioNombre: row.predioNombre,
    predioAreaTotalHa: num(row.predioAreaTotalHa),
    predioDepartamento: row.predioDepartamento,
    predioProvincia: row.predioProvincia,
    predioDistrito: row.predioDistrito,
    predioSectorAnexo: row.predioSectorAnexo,
    predioZonaUtm: row.predioZonaUtm,
    predioEste: num(row.predioEste),
    predioNorte: num(row.predioNorte),
    predioDatum: row.predioDatum,

    titularidadTipo: row.titularidadTipo,
    titularidadTipoPersona: row.titularidadTipoPersona as PlantacionInput["titularidadTipoPersona"],
    titularidadDocumentoTipo: row.titularidadDocumentoTipo,
    titularidadDocumentoNumero: row.titularidadDocumentoNumero,
    titularidadNombre: row.titularidadNombre,
    titularidadDocAcreditaTipo: row.titularidadDocAcreditaTipo,
    titularidadDocAcreditaNumero: row.titularidadDocAcreditaNumero,
    titularidadInscripcionSunarp: row.titularidadInscripcionSunarp,
    titularidadDocAutorizaUso: row.titularidadDocAutorizaUso,
    posesionarioNombre: row.posesionarioNombre,
    posesionarioDocumentoAcredita: row.posesionarioDocumentoAcredita,
    posesionarioAniosConduccion: row.posesionarioAniosConduccion,

    tituloHabilitanteTiene: row.tituloHabilitanteTiene,
    tituloHabilitanteTipo: row.tituloHabilitanteTipo,
    tituloHabilitanteCodigo: row.tituloHabilitanteCodigo,

    djLugar: row.djLugar,
    djFecha: row.djFecha ? row.djFecha.toISOString().slice(0, 10) : null,
    djTitularNombre: row.djTitularNombre,
    djDni: row.djDni,
    djAceptado: row.djAceptado,

    documentos,
    notas: row.notas,

    bloques: bloques
      .sort((a, b) => a.numero - b.numero)
      .map((b) => ({
        id: b.id,
        numero: b.numero,
        nombre: b.nombre,
        superficieHa: num(b.superficieHa),
        vertices: b.vertices
          .sort((a, c) => a.orden - c.orden)
          .map((v) => ({ id: v.id, orden: v.orden, zonaUtm: v.zonaUtm, este: Number(v.este), norte: Number(v.norte) })),
        especies: b.especies.map((e) => ({
          id: e.id,
          nombreComun: e.nombreComun,
          nombreCientifico: e.nombreCientifico,
          tipoVegetativo: e.tipoVegetativo,
          cantidad: e.cantidad,
          finalidad: e.finalidad,
          mesInstalacion: e.mesInstalacion,
          anioInstalacion: e.anioInstalacion,
          observaciones: e.observaciones,
          cites: e.cites,
          citesProcedencia: e.citesProcedencia,
          situacionActual: e.situacionActual,
          produccionCantidad: num(e.produccionCantidad),
          produccionUnidad: e.produccionUnidad,
        })),
      })),
  };

  return {
    id: row.id,
    codigoInterno: row.codigoInterno,
    codigoPlantacionSerfor: row.codigoPlantacionSerfor,
    tipoTramite: datos.tipoTramite,
    estado: normalizarEstado(row.estado),
    datos,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Sin `@relation` en el schema (mismo criterio que `ForestPlan`/`ForestPlanSpecies`:
 * "ref. app-level", no un FK de Prisma) — así que NO se puede `include`. Se arma
 * el árbol bloques→vértices+especies con queries separadas, agrupadas en JS.
 */
type Db = typeof prisma | Prisma.TransactionClient;

async function bloquesConHijos(db: Db, tenantId: string, plantacionId: string): Promise<BloqueRow[]> {
  const bloques = await db.forestPlantacionBloque.findMany({ where: { tenantId, plantacionId, deletedAt: null }, orderBy: { numero: "asc" } });
  if (!bloques.length) return [];
  const bloqueIds = bloques.map((b) => b.id);
  const [vertices, especies] = await Promise.all([
    db.forestPlantacionVertice.findMany({ where: { tenantId, bloqueId: { in: bloqueIds } }, orderBy: { orden: "asc" } }),
    db.forestPlantacionEspecie.findMany({ where: { tenantId, bloqueId: { in: bloqueIds }, deletedAt: null } }),
  ]);
  return bloques.map((b) => ({
    ...b,
    vertices: vertices.filter((v) => v.bloqueId === b.id),
    especies: especies.filter((e) => e.bloqueId === b.id),
  }));
}

export const ForestPlantacionesDB = {
  /** Listado liviano ("Mis Registros de Plantación") — sin vértices/especies. */
  async list(tenantId: string): Promise<PlantacionListItem[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const [rows, conteos] = await Promise.all([
      prisma.forestPlantacionTramite.findMany({ where: { tenantId, deletedAt: null }, orderBy: { updatedAt: "desc" } }),
      prisma.forestPlantacionBloque.groupBy({ by: ["plantacionId"], where: { tenantId, deletedAt: null }, _count: { _all: true } }),
    ]);
    const numBloquesPorPlantacion = new Map(conteos.map((c) => [c.plantacionId, c._count._all]));
    return rows.map((r) => ({
      id: r.id,
      codigoInterno: r.codigoInterno,
      codigoPlantacionSerfor: r.codigoPlantacionSerfor,
      tipoTramite: r.tipoTramite,
      estado: normalizarEstado(r.estado),
      titular:
        (r.titularTipoPersona === "juridica"
          ? r.titularRazonSocial
          : [r.titularNombres, r.titularApellidoPaterno].filter(Boolean).join(" ")) || null,
      predioNombre: r.predioNombre,
      predioDistrito: r.predioDistrito,
      predioAreaTotalHa: num(r.predioAreaTotalHa),
      numBloques: numBloquesPorPlantacion.get(r.id) ?? 0,
      updatedAt: r.updatedAt.toISOString(),
    }));
  },

  async getById(tenantId: string, id: string): Promise<PlantacionRegistro | null> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) return null;
    const row = await prisma.forestPlantacionTramite.findFirst({ where: { tenantId, id, deletedAt: null } });
    if (!row) return null;
    const bloques = await bloquesConHijos(prisma, tenantId, id);
    return toRegistro(row as PlantacionRow, bloques);
  },

  /**
   * Crea o actualiza (upsert por id). Asigna `codigoInterno` SOLO al crear —
   * nunca se reasigna. Los bloques (con vértices/especies) se reemplazan
   * completos dentro de la misma transacción: la UI edita el árbol entero.
   */
  async save(tenantId: string, input: PlantacionInput, user = "unknown"): Promise<PlantacionRegistro> {
    if (!tenantId) throw new Error("tenantId is required");

    const registro = await prisma.$transaction(async (tx) => {
      let tramiteId = input.id;
      let codigoInterno: string;

      const dataTramite: Prisma.ForestPlantacionTramiteUncheckedCreateInput = {
        tenantId,
        codigoInterno: "", // se completa abajo
        codigoPlantacionSerfor: txt(input.codigoPlantacionSerfor),
        tipoTramite: input.tipoTramite === "actualizacion" ? "actualizacion" : "inscripcion",
        estado: normalizarEstado(input.estado),

        titularTipoPersona: input.titularTipoPersona ?? null,
        titularTipoDocumento: txt(input.titularTipoDocumento),
        titularNumeroDocumento: txt(input.titularNumeroDocumento),
        titularRazonSocial: txt(input.titularRazonSocial),
        titularApellidoPaterno: txt(input.titularApellidoPaterno),
        titularApellidoMaterno: txt(input.titularApellidoMaterno),
        titularNombres: txt(input.titularNombres),
        titularTelefonoFijo: txt(input.titularTelefonoFijo),
        titularCelular: txt(input.titularCelular),
        titularEmail: txt(input.titularEmail),
        titularDepartamento: txt(input.titularDepartamento),
        titularProvincia: txt(input.titularProvincia),
        titularDistrito: txt(input.titularDistrito),
        titularTipoVia: txt(input.titularTipoVia),
        titularDireccion: txt(input.titularDireccion),
        titularNumero: txt(input.titularNumero),
        titularDocumentoAutorizaUso: txt(input.titularDocumentoAutorizaUso),

        repTiene: Boolean(input.repTiene),
        repTipoDocumento: txt(input.repTipoDocumento),
        repNumeroDocumento: txt(input.repNumeroDocumento),
        repApellidoPaterno: txt(input.repApellidoPaterno),
        repApellidoMaterno: txt(input.repApellidoMaterno),
        repNombres: txt(input.repNombres),
        repTelefonoFijo: txt(input.repTelefonoFijo),
        repCelular: txt(input.repCelular),
        repEmail: txt(input.repEmail),
        repDepartamento: txt(input.repDepartamento),
        repProvincia: txt(input.repProvincia),
        repDistrito: txt(input.repDistrito),
        repTipoVia: txt(input.repTipoVia),
        repDireccion: txt(input.repDireccion),
        repNumero: txt(input.repNumero),

        predioNombre: txt(input.predioNombre),
        predioAreaTotalHa: dec(input.predioAreaTotalHa),
        predioDepartamento: txt(input.predioDepartamento),
        predioProvincia: txt(input.predioProvincia),
        predioDistrito: txt(input.predioDistrito),
        predioSectorAnexo: txt(input.predioSectorAnexo),
        predioZonaUtm: txt(input.predioZonaUtm),
        predioEste: dec(input.predioEste),
        predioNorte: dec(input.predioNorte),
        predioDatum: input.predioDatum?.trim() || "WGS84",

        titularidadTipo: txt(input.titularidadTipo),
        titularidadTipoPersona: input.titularidadTipoPersona ?? null,
        titularidadDocumentoTipo: txt(input.titularidadDocumentoTipo),
        titularidadDocumentoNumero: txt(input.titularidadDocumentoNumero),
        titularidadNombre: txt(input.titularidadNombre),
        titularidadDocAcreditaTipo: txt(input.titularidadDocAcreditaTipo),
        titularidadDocAcreditaNumero: txt(input.titularidadDocAcreditaNumero),
        titularidadInscripcionSunarp: txt(input.titularidadInscripcionSunarp),
        titularidadDocAutorizaUso: txt(input.titularidadDocAutorizaUso),
        posesionarioNombre: txt(input.posesionarioNombre),
        posesionarioDocumentoAcredita: txt(input.posesionarioDocumentoAcredita),
        posesionarioAniosConduccion: input.posesionarioAniosConduccion ?? null,

        tituloHabilitanteTiene: Boolean(input.tituloHabilitanteTiene),
        tituloHabilitanteTipo: txt(input.tituloHabilitanteTipo),
        tituloHabilitanteCodigo: txt(input.tituloHabilitanteCodigo),

        djLugar: txt(input.djLugar),
        djFecha: input.djFecha ? new Date(input.djFecha) : null,
        djTitularNombre: txt(input.djTitularNombre),
        djDni: txt(input.djDni),
        djAceptado: Boolean(input.djAceptado),
        djAceptadoAt: input.djAceptado ? new Date() : null,

        documentosJson: (input.documentos ?? []) as unknown as Prisma.InputJsonValue,
        notas: txt(input.notas),

        createdBy: user,
      };

      if (tramiteId) {
        const existente = await tx.forestPlantacionTramite.findFirst({ where: { id: tramiteId, tenantId, deletedAt: null } });
        if (!existente) throw new Error("Plantación no encontrada");
        codigoInterno = existente.codigoInterno;
        await tx.forestPlantacionTramite.update({
          where: { id: tramiteId, tenantId } satisfies Prisma.ForestPlantacionTramiteWhereUniqueInput,
          data: { ...dataTramite, codigoInterno },
        });
      } else {
        const existentes = await tx.forestPlantacionTramite.findMany({ where: { tenantId }, select: { codigoInterno: true } });
        codigoInterno = siguienteCodigoInterno(existentes.map((e) => e.codigoInterno), new Date());
        const creado = await tx.forestPlantacionTramite.create({ data: { ...dataTramite, codigoInterno } });
        tramiteId = creado.id;
      }

      // Reemplazo completo de bloques: borra los que ya no vienen, upsert el resto.
      const bloquesInput: BloqueInput[] = input.bloques ?? [];
      const idsVigentes = bloquesInput.map((b) => b.id).filter((id): id is string => Boolean(id));
      await tx.forestPlantacionBloque.updateMany({
        where: { tenantId, plantacionId: tramiteId, id: { notIn: idsVigentes.length ? idsVigentes : ["__none__"] } },
        data: { deletedAt: new Date() },
      });

      for (const b of bloquesInput) {
        const bloqueRow = b.id
          ? await tx.forestPlantacionBloque.update({
              where: { id: b.id, tenantId } satisfies Prisma.ForestPlantacionBloqueWhereUniqueInput,
              data: { numero: b.numero, nombre: txt(b.nombre), superficieHa: dec(b.superficieHa) },
            })
          : await tx.forestPlantacionBloque.create({
              data: { tenantId, plantacionId: tramiteId, numero: b.numero, nombre: txt(b.nombre), superficieHa: dec(b.superficieHa) },
            });

        // Vértices y especies se recrean enteros: son sub-datos del bloque, no
        // registros con historial propio (a diferencia del trámite/bloque).
        await tx.forestPlantacionVertice.deleteMany({ where: { tenantId, bloqueId: bloqueRow.id } });
        if (b.vertices.length) {
          await tx.forestPlantacionVertice.createMany({
            data: b.vertices.map((v, i) => ({
              tenantId,
              bloqueId: bloqueRow.id,
              orden: v.orden ?? i,
              zonaUtm: txt(v.zonaUtm),
              este: new Prisma.Decimal(v.este),
              norte: new Prisma.Decimal(v.norte),
            })),
          });
        }

        await tx.forestPlantacionEspecie.deleteMany({ where: { tenantId, bloqueId: bloqueRow.id } });
        if (b.especies.length) {
          await tx.forestPlantacionEspecie.createMany({
            data: b.especies.map((e) => ({
              tenantId,
              bloqueId: bloqueRow.id,
              nombreComun: e.nombreComun.trim(),
              nombreCientifico: txt(e.nombreCientifico),
              tipoVegetativo: txt(e.tipoVegetativo),
              cantidad: e.cantidad ?? null,
              finalidad: txt(e.finalidad),
              mesInstalacion: e.mesInstalacion ?? null,
              anioInstalacion: e.anioInstalacion ?? null,
              observaciones: txt(e.observaciones),
              cites: Boolean(e.cites),
              citesProcedencia: txt(e.citesProcedencia),
              situacionActual: txt(e.situacionActual),
              produccionCantidad: dec(e.produccionCantidad),
              produccionUnidad: txt(e.produccionUnidad),
            })),
          });
        }
      }

      const final = await tx.forestPlantacionTramite.findFirstOrThrow({ where: { id: tramiteId, tenantId } });
      const bloques = await bloquesConHijos(tx, tenantId, tramiteId);
      return toRegistro(final as PlantacionRow, bloques);
    });

    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    auditCtp({
      tenantId,
      action: input.id ? "ctp_plantacion_update" : "ctp_plantacion_create",
      entity: "ForestPlantacionTramite",
      entityId: registro.id,
      detail: `${input.id ? "Actualizó" : "Registró"} la plantación "${registro.datos.predioNombre ?? registro.codigoInterno}" · ${registro.codigoInterno} · ${registro.tipoTramite} · ${registro.estado}`,
      user,
    });
    return registro;
  },

  /** Duplica un trámite completo (titular/predio/bloques/vértices/especies),
   *  SIN documentos adjuntos ni código SERFOR — es un borrador nuevo (§16). */
  async duplicar(tenantId: string, id: string, user = "unknown"): Promise<PlantacionRegistro> {
    const original = await this.getById(tenantId, id);
    if (!original) throw new Error("Plantación no encontrada");
    const copia: PlantacionInput = {
      ...original.datos,
      id: undefined,
      codigoPlantacionSerfor: null,
      estado: "borrador",
      djAceptado: false,
      documentos: [],
      bloques: original.datos.bloques.map((b) => ({ ...b, id: undefined, vertices: b.vertices.map((v) => ({ ...v, id: undefined })), especies: b.especies.map((e) => ({ ...e, id: undefined })) })),
    };
    return this.save(tenantId, copia, user);
  },

  async remove(tenantId: string, id: string, user = "unknown"): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) return false;
    const existente = await prisma.forestPlantacionTramite.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existente) return false;

    await prisma.$transaction([
      prisma.forestPlantacionTramite.update({ where: { id, tenantId } satisfies Prisma.ForestPlantacionTramiteWhereUniqueInput, data: { deletedAt: new Date() } }),
      prisma.forestPlantacionBloque.updateMany({ where: { tenantId, plantacionId: id }, data: { deletedAt: new Date() } }),
    ]);

    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    auditCtp({
      tenantId,
      action: "ctp_plantacion_delete",
      entity: "ForestPlantacionTramite",
      entityId: id,
      detail: `Borró la plantación "${existente.predioNombre ?? existente.codigoInterno}" (${existente.codigoInterno})`,
      user,
    });
    return true;
  },
};
