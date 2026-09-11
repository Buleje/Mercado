import "server-only";
import { prisma } from "@/lib/prisma";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { invalidateByPrefix } from "@/lib/cache";
import {
  CATALOGO_VACIO,
  agregarEspecie,
  editarEspecie,
  normalizarCatalogo,
  resumirEspeciesDelLibro,
  quitarEspecie,
  restaurarEspecie,
  type CatalogoEspecies,
  type EspecieEnElLibro,
  type ResultadoCatalogo,
} from "@/lib/forestal/especies-catalogo";

/**
 * ForestEspeciesDB — el catálogo de especies que edita el aserradero.
 *
 * POR QUÉ KV y no un modelo Prisma (mismo criterio que la biblioteca de fotos y
 * que trámites, ADR-308 §4): son decenas de especies por planta, no miles, y
 * cada entrada es un nombre. Promoverlo a tabla el día que haga falta (sinónimos,
 * CITES por especie, aprobación) es leer el KV e insertar filas —sin fabricar
 * una migración que necesita DIRECT_URL.
 *
 * Los writes se auditan: la especie es lo que el libro declara ante SERFOR, y
 * quién la creó o la sacó de la lista tiene que poder saberse.
 */

const KEY_PREFIX = "ctp-especies-catalogo:";

const clave = (tenantId: string) => `${KEY_PREFIX}${tenantId}`;

/**
 * Lo que el catálogo rechaza por sus propias reglas —una especie repetida, un
 * nombre vacío— y no por una falla del sistema. El route lo traduce a 422 con
 * el motivo tal cual: son mensajes escritos para quien está cargando.
 */
export class EspecieCatalogoError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "EspecieCatalogoError";
  }
}

/** Guarda y deja el rastro. Devuelve el catálogo ya guardado. */
async function aplicar(
  tenantId: string,
  resultado: ResultadoCatalogo,
  user: string,
  detalle: string,
): Promise<{ catalogo: CatalogoEspecies; mensaje: string }> {
  if (!resultado.ok) throw new EspecieCatalogoError(resultado.motivo);
  await PlatformSettingsDB.set(clave(tenantId), resultado.catalogo, user);
  auditCtp({
    tenantId,
    action: "ctp_especie_catalogo",
    entity: "ForestEspecieCatalogo",
    entityId: tenantId,
    detail: detalle,
    user,
  });
  return { catalogo: resultado.catalogo, mensaje: resultado.mensaje };
}

export const ForestEspeciesDB = {
  /** El catálogo del tenant. Nunca `null`: sin nada guardado son las de fábrica. */
  async get(tenantId: string): Promise<CatalogoEspecies> {
    if (!tenantId) throw new Error("tenantId is required");
    const raw = await PlatformSettingsDB.get<unknown>(clave(tenantId));
    return raw ? normalizarCatalogo(raw) : CATALOGO_VACIO;
  },

  /**
   * El científico que ESTA planta declaró para esa especie, si lo declaró.
   *
   * Lo usa el libro al abrir un asiento sin científico: la columna existe en el
   * LO-CTP y el que carga una corrida a las seis de la mañana no se acuerda del
   * binomio. No inventa nada — devuelve `null` si el catálogo no lo sabe, que
   * es lo que el libro ya hacía.
   */
  async cientificoDe(tenantId: string, nombre: string): Promise<string | null> {
    if (!tenantId || !nombre?.trim()) return null;
    const objetivo = claveEspecie(nombre);
    if (!objetivo) return null;
    const catalogo = await this.get(tenantId);
    return catalogo.agregadas.find((e) => e.clave === objetivo)?.cientifico?.trim() || null;
  },

  async agregar(
    tenantId: string,
    entrada: { nombre: string; cientifico?: string | null },
    user = "unknown",
  ) {
    const actual = await this.get(tenantId);
    const r = agregarEspecie(actual, entrada, { usuario: user });
    return aplicar(tenantId, r, user, `Agregó la especie «${entrada.nombre}» al catálogo`);
  },

  async editar(
    tenantId: string,
    claveEspecie: string,
    cambios: { nombre?: string; cientifico?: string | null },
    user = "unknown",
  ) {
    const actual = await this.get(tenantId);
    const r = editarEspecie(actual, claveEspecie, cambios, { usuario: user });
    return aplicar(
      tenantId,
      r,
      user,
      `Editó la especie «${claveEspecie}»${cambios.nombre ? ` → «${cambios.nombre}»` : ""}`,
    );
  },

  async quitar(tenantId: string, claveEspecie: string, user = "unknown") {
    const actual = await this.get(tenantId);
    const r = quitarEspecie(actual, claveEspecie);
    return aplicar(tenantId, r, user, `Quitó la especie «${claveEspecie}» del catálogo`);
  },

  async restaurar(tenantId: string, claveEspecie: string, user = "unknown") {
    const actual = await this.get(tenantId);
    const r = restaurarEspecie(actual, claveEspecie);
    return aplicar(tenantId, r, user, `Volvió a mostrar la especie «${claveEspecie}»`);
  },

  /**
   * Las especies que el libro YA tiene escritas, con todas sus grafías.
   *
   * Cuatro lugares nombran una especie y los cuatro cuentan: el ingreso de la
   * GTF, la troza del patio, el asiento del libro y el lote de aserrío. Una
   * especie que sólo aparece en trozas es tan real como la que encabeza un
   * asiento — y es justo la que nadie se acuerda de dar de alta.
   *
   * Se leen los cuatro en paralelo y se agrupan por clave normalizada
   * (`resumirEspeciesDelLibro`, pura y con tests). Lo borrado no cuenta: una
   * especie que sólo vive en filas dadas de baja no es del libro.
   */
  async usadasEnElLibro(tenantId: string): Promise<EspecieEnElLibro[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const [catalogo, ingresos, trozas, asientos, lotes] = await Promise.all([
      this.get(tenantId),
      prisma.woodEntry.groupBy({
        by: ["speciesCommonName", "speciesScientificName"],
        where: { tenantId, deletedAt: null },
        _count: { _all: true },
      }),
      prisma.woodEntryTroza.groupBy({
        by: ["especieComun", "especieCientifica"],
        where: { tenantId },
        _count: { _all: true },
      }),
      prisma.forestCtpEntry.groupBy({
        by: ["speciesCommon", "speciesScientific"],
        where: { tenantId, deletedAt: null },
        _count: { _all: true },
      }),
      prisma.forestLoteAserrio.groupBy({
        by: ["speciesCommon", "speciesScientific"],
        where: { tenantId, deletedAt: null },
        _count: { _all: true },
      }),
    ]);

    return resumirEspeciesDelLibro(
      [
        ...ingresos.map((r) => ({
          nombre: r.speciesCommonName,
          cientifico: r.speciesScientificName,
          usos: r._count._all,
        })),
        ...trozas.map((r) => ({
          nombre: r.especieComun,
          cientifico: r.especieCientifica,
          usos: r._count._all,
        })),
        ...asientos.map((r) => ({
          nombre: r.speciesCommon,
          cientifico: r.speciesScientific,
          usos: r._count._all,
        })),
        ...lotes.map((r) => ({
          nombre: r.speciesCommon,
          cientifico: r.speciesScientific,
          usos: r._count._all,
        })),
      ],
      catalogo,
    );
  },

  /**
   * Da de alta varias de una vez — sembrar el catálogo con lo que el libro ya
   * usa. Se aplican UNA POR UNA sobre el catálogo en memoria y recién al final
   * se guarda: así la segunda ve a la primera y el tope y los repetidos se
   * respetan igual que agregando a mano. Lo rechazado no aborta el resto; se
   * devuelve dicho, porque sembrar 9 de 11 con dos motivos es mejor que no
   * sembrar ninguna.
   */
  async agregarVarias(
    tenantId: string,
    entradas: readonly { nombre: string; cientifico?: string | null }[],
    user = "unknown",
  ): Promise<{ catalogo: CatalogoEspecies; mensaje: string; agregadas: string[]; rechazadas: { nombre: string; motivo: string }[] }> {
    let catalogo = await this.get(tenantId);
    const agregadas: string[] = [];
    const rechazadas: { nombre: string; motivo: string }[] = [];
    for (const e of entradas) {
      const r = agregarEspecie(catalogo, e, { usuario: user });
      if (r.ok) {
        catalogo = r.catalogo;
        agregadas.push(e.nombre);
      } else {
        rechazadas.push({ nombre: e.nombre, motivo: r.motivo });
      }
    }
    if (agregadas.length === 0) {
      throw new EspecieCatalogoError(
        rechazadas[0]?.motivo ?? "No había ninguna especie nueva para agregar.",
      );
    }
    await PlatformSettingsDB.set(clave(tenantId), catalogo, user);
    auditCtp({
      tenantId,
      action: "ctp_especie_catalogo",
      entity: "ForestEspecieCatalogo",
      entityId: tenantId,
      detail: `Sembró ${agregadas.length} especie(s) desde el libro: ${agregadas.join(", ")}`,
      user,
    });
    return {
      catalogo,
      agregadas,
      rechazadas,
      mensaje:
        `Se agregaron ${agregadas.length} especie${agregadas.length === 1 ? "" : "s"} que tu libro ya usaba` +
        (rechazadas.length > 0 ? ` · ${rechazadas.length} quedaron afuera: ${rechazadas[0].motivo}` : "."),
    };
  },

  /**
   * Unifica en el LIBRO las grafías de una especie: «TORNILLO» pasa a decir
   * «Tornillo» donde estaba escrito distinto.
   *
   * ⚠️ Esto **reescribe filas del libro**, que es un acta que se declara ante
   * SERFOR. Por eso: nunca automático, nunca en silencio y nunca por
   * aproximación — sólo las grafías EXACTAS que el resumen encontró bajo la
   * misma clave normalizada, y todo queda auditado con el conteo por tabla.
   * No toca volúmenes, fechas ni atribuciones: cambia cómo se escribe un
   * nombre, no lo que el libro declara.
   */
  async unificarEnElLibro(
    tenantId: string,
    entrada: { clave: string; nombre: string },
    user = "unknown",
  ): Promise<{ mensaje: string; filas: number; porTabla: { tabla: string; filas: number }[] }> {
    if (!tenantId) throw new Error("tenantId is required");
    const objetivo = claveEspecie(entrada.clave);
    const nombre = entrada.nombre.trim();
    if (!objetivo || !nombre) throw new EspecieCatalogoError("Falta decir qué especie unificar.");
    if (claveEspecie(nombre) !== objetivo) {
      /* Unificar es elegir entre las formas que YA existen de esa especie, no
         renombrarla: si el nombre bueno fuera de otra especie, el libro pasaría
         a declarar una madera distinta de la que entró. */
      throw new EspecieCatalogoError(
        "La forma elegida tiene que ser la misma especie, escrita distinto.",
      );
    }

    const delLibro = await this.usadasEnElLibro(tenantId);
    const especie = delLibro.find((e) => e.clave === objetivo);
    const otras = (especie?.grafias ?? []).map((g) => g.texto).filter((t) => t !== nombre);
    if (otras.length === 0) {
      throw new EspecieCatalogoError(`«${nombre}» ya es la única forma escrita en el libro.`);
    }

    const [ingresos, trozas, asientos, lotes] = await prisma.$transaction([
      prisma.woodEntry.updateMany({
        where: { tenantId, deletedAt: null, speciesCommonName: { in: otras } },
        data: { speciesCommonName: nombre },
      }),
      prisma.woodEntryTroza.updateMany({
        where: { tenantId, especieComun: { in: otras } },
        data: { especieComun: nombre },
      }),
      prisma.forestCtpEntry.updateMany({
        where: { tenantId, deletedAt: null, speciesCommon: { in: otras } },
        data: { speciesCommon: nombre },
      }),
      prisma.forestLoteAserrio.updateMany({
        where: { tenantId, deletedAt: null, speciesCommon: { in: otras } },
        data: { speciesCommon: nombre },
      }),
    ]);

    const porTabla = [
      { tabla: "Ingresos", filas: ingresos.count },
      { tabla: "Trozas", filas: trozas.count },
      { tabla: "Asientos del libro", filas: asientos.count },
      { tabla: "Lotes de aserrío", filas: lotes.count },
    ];
    const filas = porTabla.reduce((t, x) => t + x.filas, 0);

    auditCtp({
      tenantId,
      action: "ctp_especie_unificar",
      entity: "ForestEspecieCatalogo",
      entityId: objetivo,
      detail:
        `Unificó la especie como «${nombre}» (antes: ${otras.join(", ")}) — ` +
        porTabla.map((x) => `${x.tabla}: ${x.filas}`).join(" · "),
      user,
    });
    /* El libro entero cambió de texto en esas filas: lo cacheado lo dice viejo. */
    await invalidateByPrefix(`ctp:${tenantId}`);
    await invalidateByPrefix(`wood-entries:${tenantId}`);

    return {
      porTabla,
      filas,
      mensaje: `Quedó «${nombre}» en ${filas} fila${filas === 1 ? "" : "s"} del libro. Las ${otras.length} forma(s) anteriores ya no figuran.`,
    };
  },
};
