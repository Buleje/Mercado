import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { claveNumeroGtf, colaDeGtf, mismoNumeroGtf } from "@/lib/forestal/gtf-talonario";
import { foliosEnTexto, mensajeGuiaYaRecibida, mismaGuiaTh } from "@/lib/forestal/guia-th-al-ctp";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { mismoDuenoDeGuia, puedeSerDelDueno, type IdentidadDeGuiaBuscada } from "@/lib/forestal/loth-talonario";

/**
 * GtfNumeroDB — «¿esta guía ya entró al libro?» con UNA sola regla de N°
 * (28-09-2026, revisión del puente Libro TH → CTP).
 *
 * El talonario del TH escribe `19-001-0000065` y SERFOR publica
 * `019-001-0000065`: comparados letra a letra son dos guías y la misma madera
 * entraba dos veces. Acá se comparan tramo a tramo (`mismoNumeroGtf`), y el
 * candado de la guía se toma con la LLAVE del número, no con cómo se escribió.
 *
 * Lo usan el alta de una guía entera (`WoodEntriesDB.createDesdeGtfSerfor`),
 * «Recibir» del puente, «Anular» en el Libro TH y las guías guardadas. No
 * importa ninguna otra DB class: la pueden usar `forest-gtf.db` y
 * `forest-loth.db` sin ciclos.
 */

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Estados de un ingreso que NO cuentan como «la guía entró». Es la regla del
 * alta desde una guía entera (ADR-312): anular y rechazar son las dos formas
 * de decir «esta madera no está en el libro», y las dos dejan volver a
 * cargarla. Las guías guardadas y el puente del TH usan la MISMA.
 */
export const ESTADOS_SIN_INGRESO = ["anulado", "rechazado"] as const;

/**
 * Anular en el Libro TH una guía cuya madera YA entró al Libro CTP liberaba
 * sus trozas: re-emitida, «Recibir» metía las mismas codificaciones otra vez
 * y el ingreso viejo quedaba colgado de una guía anulada. Se frena con 409
 * hasta que el CTP anule sus ingresos (revisión 28-09-2026).
 */
export class GuiaYaEnElCtpError extends Error {
  constructor(
    message: string,
    readonly libroNros: (number | null)[],
    /**
     * El `error` del 409: la guía entera (o una línea de su despacho) o, desde
     * ADR-450 R4, una línea de Trozado o Tala cuya troza está viva en el CTP.
     */
    readonly codigo: "guia_ya_en_el_ctp" | "troza_ya_en_el_ctp" = "guia_ya_en_el_ctp",
  ) {
    super(message);
    this.name = "GuiaYaEnElCtpError";
  }
}

export interface IngresoVivoDeGuia {
  id: string;
  libroNro: number | null;
  gtfNumber: string;
  serforNumeroRegistro: string | null;
  speciesCommonName: string;
  /** Permiso y titular del ingreso: dicen si es la MISMA guía que otra con su N°. */
  originCode: string | null;
  providerName: string;
}

/** El permiso y el titular de una guía, para no confundirla con otra de igual N°. */
export interface IdentidadDeGuia {
  gtfNumber: string;
  permiso: string | null;
  titular: string | null;
}

export const GtfNumeroDB = {
  /**
   * El candado de UNA guía dentro de la transacción: dos altas, un «Recibir» y
   * un «Anular en el TH» del mismo N° van en fila. La llave es la del número
   * (`19-1-65`), así `19-001-…` y `019-001-…` esperan el mismo turno.
   */
  async bloquear(tx: Prisma.TransactionClient, tenantId: string, gtfNumber: string): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    const clave = claveNumeroGtf(gtfNumber) ?? gtfNumber.trim();
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${`gtf-numero:${clave}`}))`;
  },

  /**
   * Los ingresos vivos del libro con este N° (tramo a tramo). Con
   * `serforNumeroRegistro`, los de ese registro Y los que no tienen registro
   * (el alta desde SERFOR lo usa así: dos emisores pueden repetir un N° y el
   * registro los separa — pero un ingreso SIN registro, como el que entra con
   * «Recibir» desde el Libro TH, es esa misma guía y no se vuelve a cargar).
   *
   * SIN `take` a propósito (revisión 28-09): con una cola corta («1») las
   * candidatas pueden ser muchas y cortar en N dejaba afuera justo el
   * duplicado. Se traen sólo 7 columnas chicas (Blas: 26 ingresos en total).
   */
  async ingresosVivos(
    db: Db,
    tenantId: string,
    gtfNumber: string,
    opts: {
      serforNumeroRegistro?: string | null;
      /**
       * De quién es la guía buscada (29-09-2026). Con ella, un ingreso con el
       * mismo N° pero de OTRO titular y OTRO permiso no es esta guía: dos
       * titulares comparten la serie 019-001. Sin ella, vienen todos.
       */
      identidad?: IdentidadDeGuiaBuscada | null;
    } = {},
  ): Promise<IngresoVivoDeGuia[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const cola = colaDeGtf(gtfNumber);
    if (!cola) return [];
    const registro = opts.serforNumeroRegistro?.trim() || null;
    const candidatas = await db.woodEntry.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { notIn: [...ESTADOS_SIN_INGRESO] },
        gtfNumber: { endsWith: cola, mode: "insensitive" },
        ...(registro ? { OR: [{ serforNumeroRegistro: registro }, { serforNumeroRegistro: null }] } : {}),
      },
      select: {
        id: true, libroNro: true, gtfNumber: true, serforNumeroRegistro: true, speciesCommonName: true,
        originCode: true, providerName: true,
      },
      orderBy: { libroNro: "asc" },
    });
    return candidatas.filter(
      (c) =>
        mismoNumeroGtf(c.gtfNumber, gtfNumber) &&
        puedeSerDelDueno({ titular: c.providerName, permiso: c.originCode }, opts.identidad),
    );
  },

  /**
   * Antes de anular una guía (o una línea de su despacho) en el Libro TH,
   * DENTRO de la transacción que anula: toma el candado del N° (el mismo de
   * «Recibir» y del alta) y frena si la guía tiene ingresos vivos en el Libro
   * CTP del negocio. Cuentan sólo los que son LA MISMA guía (`mismaGuiaTh`:
   * permiso, o titular si falta el permiso): otro ingreso con el mismo N° pero
   * otro permiso es otra guía y no traba el TH.
   *
   * Y los del MISMO dueño con la vara de «Recibir» (`mismoDuenoDeGuia`, revisión
   * 29-09-2026): en Blas el plan dice «CCNN SAN LUIS DE CHINCHIGUANI» y SERFOR
   * «COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI». «Recibir» los tomaba por la
   * misma guía («ya entró») y anular en el TH no veía ese ingreso: liberaba
   * trozas que ya estaban en el CTP.
   */
  async exigirSinIngresosEnElCtp(tx: Prisma.TransactionClient, tenantId: string, guia: IdentidadDeGuia): Promise<void> {
    await GtfNumeroDB.bloquear(tx, tenantId, guia.gtfNumber);
    const vivos = (await GtfNumeroDB.ingresosVivos(tx, tenantId, guia.gtfNumber)).filter((e) => {
      const ingreso = { permisoCodigo: e.originCode, titularNombre: e.providerName };
      return mismaGuiaTh(ingreso, guia).ok || mismoDuenoDeGuia({ titular: e.providerName, permiso: e.originCode }, guia) === true;
    });
    if (vivos.length > 0) {
      const nros = vivos.map((v) => v.libroNro);
      throw new GuiaYaEnElCtpError(mensajeGuiaYaRecibida(nros), nros);
    }
  },

  /**
   * Trozas con esta codificación que ya están en un ingreso vivo del libro,
   * de la MISMA especie (y del mismo permiso, si los dos lo dicen). «Recibir»
   * frena con ellas: la misma pieza no entra dos veces aunque venga en otra
   * guía. Acotado a especie+permiso (revisión 28-09): un código de troza no es
   * único en el negocio —en `main` hay 10 repetidos en más de una guía— y
   * compararlo contra todo frenaba piezas distintas. Las sin código (`-` o
   * vacío) no se comparan.
   */
  async trozasYaEnElLibro(
    db: Db,
    tenantId: string,
    piezas: readonly { codificacion: string | null; especie: string | null; lothTrozadoId?: string | null }[],
    permiso: string | null,
  ): Promise<{ codificacion: string | null; libroNro: number | null; gtfNumber: string }[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const buscadas = piezas
      .map((p) => ({ codigo: (p.codificacion ?? "").trim(), especie: claveEspecie(p.especie) }))
      .filter((p) => p.codigo && p.codigo !== "-");
    /* ADR-450: la MISMA línea de Trozado del Libro TH es la misma pieza, se
       llame como se llame y sea del permiso que sea: comparación exacta. */
    const trozados = new Set(piezas.map((p) => p.lothTrozadoId?.trim()).filter((x): x is string => !!x));
    if (buscadas.length === 0 && trozados.size === 0) return [];
    const filas = await db.woodEntryTroza.findMany({
      where: {
        tenantId,
        OR: [
          { codificacion: { in: [...new Set(buscadas.map((b) => b.codigo))], mode: "insensitive" } },
          { lothTrozadoId: { in: [...trozados] } },
        ],
        entry: { tenantId, deletedAt: null, status: { notIn: [...ESTADOS_SIN_INGRESO] } },
      },
      select: {
        codificacion: true,
        especieComun: true,
        lothTrozadoId: true,
        entry: { select: { libroNro: true, gtfNumber: true, speciesCommonName: true, originCode: true } },
      },
    });
    return filas
      .filter((f) => {
        if (f.lothTrozadoId && trozados.has(f.lothTrozadoId)) return true;
        const codigo = (f.codificacion ?? "").trim().toUpperCase();
        const especie = claveEspecie(f.especieComun ?? f.entry.speciesCommonName);
        const misma = buscadas.some((b) => b.codigo.toUpperCase() === codigo && (!b.especie || !especie || b.especie === especie));
        return misma && mismaGuiaTh({ permisoCodigo: f.entry.originCode, titularNombre: null }, { permiso, titular: null }).ok;
      })
      .map((f) => ({ codificacion: f.codificacion, libroNro: f.entry.libroNro, gtfNumber: f.entry.gtfNumber }));
  },

  /**
   * Los candados de «Recibir» de varias guías, en el orden de la LLAVE del N°
   * (la que usa `bloquear`), no del texto: `019-…` y `19-…` son el mismo
   * candado y dos anulaciones tienen que pedirlos en el mismo orden para no
   * abrazarse. Repetir uno ya tomado en la misma transacción no espera.
   */
  async bloquearEnOrden(tx: Prisma.TransactionClient, tenantId: string, numerosDeGuia: readonly string[]): Promise<void> {
    const porLlave = new Map<string, string>();
    for (const n of numerosDeGuia.map((x) => x.trim()).filter(Boolean)) {
      const k = claveNumeroGtf(n) ?? n;
      if (!porLlave.has(k)) porLlave.set(k, n);
    }
    for (const k of [...porLlave.keys()].sort()) {
      await GtfNumeroDB.bloquear(tx, tenantId, porLlave.get(k) as string);
    }
  },

  /**
   * Las trozas del Libro CTP (de ingresos vivos) que vienen de estas líneas de
   * Trozado del Libro TH (`lothTrozadoId`). Vacío = ninguna entró. Llamar con
   * los candados de sus guías tomados (`bloquearEnOrden`).
   */
  async trozadosEnElCtp(tx: Prisma.TransactionClient, tenantId: string, trozadoIds: readonly string[]) {
    if (!tenantId) throw new Error("tenantId is required");
    const ids = [...new Set(trozadoIds.filter(Boolean))];
    if (ids.length === 0) return [];
    return tx.woodEntryTroza.findMany({
      where: {
        tenantId,
        lothTrozadoId: { in: ids },
        entry: { tenantId, deletedAt: null, status: { notIn: [...ESTADOS_SIN_INGRESO] } },
      },
      select: { lothTrozadoId: true, codificacion: true, entry: { select: { libroNro: true, gtfNumber: true } } },
      orderBy: { codificacion: "asc" },
    });
  },

  /**
   * ADR-450 R4 · antes de anular (o borrar) en el Libro TH una línea de
   * Trozado o de Tala, DENTRO de la transacción que anula: si una troza de
   * esas líneas ya está viva en el Libro CTP (por `lothTrozadoId`), 409 con
   * los ingresos a anular primero — el mismo patrón que anular la guía.
   *
   * Candado: el de «Recibir» (`bloquear` con el N° de cada guía que despachó
   * esas trozas, en orden para que dos anulaciones no se abracen). Así un
   * «Recibir» en curso termina antes, y al entrar se ve lo que dejó.
   */
  async exigirTrozadosFueraDelCtp(
    tx: Prisma.TransactionClient,
    tenantId: string,
    trozadoIds: readonly string[],
    numerosDeGuia: readonly string[],
    /** Cómo se nombra la línea: `{ de: "del trozado #17", la: "el trozado #17" }`. */
    queSeAnula: { de: string; la: string },
  ): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    const ids = [...new Set(trozadoIds.filter(Boolean))];
    if (ids.length === 0) return;
    await GtfNumeroDB.bloquearEnOrden(tx, tenantId, numerosDeGuia);
    const vivas = await GtfNumeroDB.trozadosEnElCtp(tx, tenantId, ids);
    if (vivas.length === 0) return;
    const nros = [...new Set(vivas.map((v) => v.entry.libroNro))];
    const cods = [...new Set(vivas.map((v) => v.codificacion?.trim()).filter((c): c is string => !!c))];
    const guias = [...new Set(vivas.map((v) => v.entry.gtfNumber))];
    const piezas = cods.length === 1 ? `La troza ${cods[0]}` : cods.length > 1 ? `Las trozas ${cods.slice(0, 5).join(", ")}${cods.length > 5 ? ` (y ${cods.length - 5} más)` : ""}` : "Una troza";
    throw new GuiaYaEnElCtpError(
      `${piezas} ${queSeAnula.de} ya ${cods.length > 1 ? "están" : "está"} en tu Libro CTP (${foliosEnTexto(nros)}, guía ${guias.join(", ")}). ${nros.length === 1 ? "Anula ese ingreso" : "Anula esos ingresos"} allá primero y después anula ${queSeAnula.la}.`,
      nros,
      "troza_ya_en_el_ctp",
    );
  },
};
