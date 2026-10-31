/**
 * forest-ctp-guia-salida.db — LEE la GTF de salida de un despacho del Libro CTP
 * ENTERA, lista para los mismos papeles que la guía del Libro TH: hoja SERFOR,
 * talonario de la matricial y «con formato» (`GuiaSalidaImprimible`, 27-10).
 *
 * Una guía son varias líneas de despacho con el mismo N° (ADR-362): se pida
 * desde la línea que sea, se arma con todas las del mismo N° y el mismo estado
 * (vigentes con vigentes, anuladas con anuladas: la regla de `claveDeGuia` en
 * Guías emitidas y de `mismaGuiaQue` en el talonario). Las vigentes NO miran
 * la fecha: dos líneas del mismo N° confirmado en días distintos son UNA guía
 * en Guías emitidas, y la hoja pedida desde una sola declaraba menos carga
 * (revisión 27-10). Las anuladas sí: un N° anulado en otro día es otro papel,
 * y una línea anulada suelta no arrastra a las vivas. El (3) es el de la cabecera.
 *
 * Sólo lectura (no audita). Todo con el `tenantId` de la sesión: la línea de
 * otro negocio no existe.
 */
import { prisma } from "@/lib/prisma";
import { ForestCtpDB } from "./forest-ctp.db";
import { ForestCtpDespachoDB } from "./forest-ctp-despacho.db";
import { ForestCtpFichaDB } from "./forest-ctp-ficha.db";
import { ForestContratoDB } from "./forest-contrato.db";
import { ForestEspeciesDB } from "./forest-especies.db";
import { especiesDisponibles } from "@/lib/forestal/especies-catalogo";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { faltantesGtf, leerGtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { estadoDeGuia } from "@/lib/forestal/gtf-estado";
import { esMaderaEnRollo } from "@/lib/forestal/gtf-anexos";
import type { CtpFicha, PermisoDeGuia } from "@/lib/forestal/ctp-ficha-types";
import type { LineaProducto } from "@/lib/forestal/ctp-gtf-formato";
// Sólo el TIPO: `ctp-gtf-print` es "use client" y desde el servidor tira (23-10).
import type { GtfCadena } from "@/lib/forestal/ctp-gtf-print";
import type { PiezaGuia } from "@/lib/forestal/loth-guia-despacho";
import { entradasGuiaSalida, type GuiaSalidaImprimible, type RespuestaGuiaSalida } from "@/lib/forestal/guia-salida-imprimible";
import { logger } from "@/lib/logger";

export type LecturaGuiaSalida =
  | ({ ok: true; ficha: CtpFicha } & RespuestaGuiaSalida)
  /** NO_EXISTE: la línea no es de este negocio o no es un despacho. SIN_GUIA: todavía no tiene N° (borrador). */
  | { ok: false; error: "NO_EXISTE" | "SIN_GUIA" };

const UNIDAD: Record<string, string> = { m3: "m³", kg: "Kg", pt: "pt", unidad: "unidad" };

const fechaIso = (d: Date | null | undefined): string => (d ? d.toISOString().slice(0, 10) : "");
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const txt = (v: string | null | undefined) => (v ?? "").trim();
const num = (v: unknown): number | null => (v == null ? null : Number(v));

type LineaDelLibro = NonNullable<Awaited<ReturnType<typeof ForestCtpDB.getById>>>;
type RenglonDelLibro = Pick<
  LineaDelLibro,
  "speciesCommon" | "speciesScientific" | "productType" | "presentacion" | "unit" | "pieces" | "quantity"
>;

/**
 * El renglón (37) de UNA línea, como lo arma la pantalla al registrar
 * (`lineasDeGuia`): el binomio que no escribió el operador sale del catálogo
 * de especies del negocio, como `cientificoDe` en el cliente.
 */
function lineaDelDespacho(d: RenglonDelLibro, cientificoDe: (comun: string) => string | null): LineaProducto {
  const unidad = UNIDAD[d.unit ?? "m3"] ?? d.unit ?? "m3";
  return {
    cientifico: txt(d.speciesScientific) || cientificoDe(txt(d.speciesCommon)) || "",
    comun: d.speciesCommon ?? "",
    tipoProducto: d.productType ?? "",
    presentacion: txt(d.presentacion) || unidad,
    cantidad: d.pieces ?? 0,
    unidad,
    total: Number(d.quantity ?? 0) || 0,
  };
}

/** El binomio de un nombre común según el catálogo del negocio (lo que hace `cientificoDe` en la pantalla). */
async function cientificosDelCatalogo(tenantId: string): Promise<(comun: string) => string | null> {
  const mapa = new Map<string, string>();
  try {
    for (const e of especiesDisponibles(await ForestEspeciesDB.get(tenantId))) {
      if (e.cientifico) mapa.set(e.clave, e.cientifico);
    }
  } catch (err) {
    // Sin catálogo, el binomio que no se escribió va en blanco: el papel sale igual.
    logger.warn("[guia-salida] catálogo de especies no leído", { error: String(err), tenantId });
  }
  return (comun) => (comun ? mapa.get(claveEspecie(comun)) ?? null : null);
}

/**
 * Los permisos cargados, recortados a lo que lee el formato (5)(6)(8)(9)(10):
 * lo mismo que la pantalla (`usePermisosForestal`, sólo los activos). Sin la
 * lista, un título que sólo vive en los permisos sale en blanco: se sigue igual.
 */
async function permisosDeLaGuia(tenantId: string): Promise<PermisoDeGuia[]> {
  try {
    const contratos = await ForestContratoDB.list(tenantId, { incluirInactivos: false });
    return contratos.map((c) => ({
      codigo: c.codigo,
      tipo: c.tipo,
      resolucionNumero: c.resolucionNumero,
      vigenciaHasta: c.vigenciaHasta,
      isActive: c.isActive,
    }));
  } catch (err) {
    logger.warn("[guia-salida] permisos no leídos", { error: String(err), tenantId });
    return [];
  }
}

export class ForestCtpGuiaSalidaDB {
  /**
   * La guía de salida del despacho `despachoId`, con todas sus líneas, su
   * cadena de custodia, las trozas que salieron sin aserrar y las entradas del
   * talonario (las mismas de la hoja SERFOR).
   */
  static async guiaSalidaDeDespacho(tenantId: string, despachoId: string): Promise<LecturaGuiaSalida> {
    if (!tenantId) throw new Error("tenantId is required");
    const d = await ForestCtpDB.getById(tenantId, despachoId);
    if (!d || d.section !== "despacho") return { ok: false, error: "NO_EXISTE" };
    if (estadoDeGuia(d.gtfNumber) !== "emitida") return { ok: false, error: "SIN_GUIA" };
    const numero = txt(d.gtfNumber);
    const vigente = d.status === "registrado";

    const hermanas = await ForestCtpDB.despachosDeLasGuias(tenantId, [numero]);
    const delPapel = [
      d,
      ...hermanas.filter(
        (h) =>
          h.id !== d.id &&
          h.section === "despacho" &&
          !h.deletedAt &&
          (h.status === "registrado") === vigente &&
          (vigente || fechaIso(h.entryDate) === fechaIso(d.entryDate)),
      ),
    ].sort((x, y) => x.lineNo - y.lineNo);
    const cabecera = delPapel[0];
    const fecha = fechaIso(cabecera.entryDate);
    const lineIds = delPapel.map((x) => x.id);

    const [ficha, permisos, cientificoDe, trazas, trozasCrudas] = await Promise.all([
      ForestCtpFichaDB.get(tenantId),
      permisosDeLaGuia(tenantId),
      cientificosDelCatalogo(tenantId),
      Promise.all(lineIds.map((id) => ForestCtpDespachoDB.trazabilidadCompleta(tenantId, id))),
      /* Las trozas que se fueron enteras en esta guía (ADR-363). Anular la línea
         las devuelve al patio (`despachadaEnId` = null): una guía anulada sale
         sin lista. */
      prisma.woodEntryTroza.findMany({
        where: { tenantId, despachadaEnId: { in: lineIds } },
        select: {
          codificacion: true,
          codigoPlanta: true,
          arbolCodigo: true,
          especieComun: true,
          especieCientifica: true,
          largoM: true,
          d1Cm: true,
          d2Cm: true,
          diametroCm: true,
          volumenM3: true,
          despachadaEnId: true,
        },
        orderBy: [{ orden: "asc" }, { id: "asc" }],
      }),
    ]);

    const lineas = delPapel.map((x) => lineaDelDespacho(x, cientificoDe));

    /* La cadena como la arma la pantalla (`cadenaDeGuia`): cada corrida una vez,
       con lo que aporta a la guía entera y sus guías de ingreso; las trozas sin
       transformar, agrupadas por la guía con la que ENTRARON y sin N° de corrida. */
    const tramos = new Map<string, { lineNo: number | null; quantity: number; guias: Set<string> }>();
    const sumar = (clave: string, lineNo: number | null, cantidad: number, guias: readonly string[]) => {
      const previo = tramos.get(clave);
      if (previo) {
        previo.quantity = r4(previo.quantity + cantidad);
        for (const g of guias) previo.guias.add(g);
      } else {
        tramos.set(clave, { lineNo, quantity: r4(cantidad), guias: new Set(guias) });
      }
    };
    for (const t of trazas) {
      for (const c of t.corridas) sumar(c.produccionEntryId, c.lineNo, c.quantity, c.guias);
      for (const p of t.trozas) sumar(`troza:${p.gtfIngreso || "sin-guia"}`, null, p.volumenM3, p.gtfIngreso ? [p.gtfIngreso] : []);
    }
    const cadena: GtfCadena = {
      corridas: [...tramos.values()].map((c) => ({ lineNo: c.lineNo, quantity: c.quantity, guias: [...c.guias] })),
    };

    const citesDe = new Map(delPapel.map((x) => [x.id, x.cites]));
    const trozas: PiezaGuia[] = trozasCrudas.map((p) => {
      const comun = txt(p.especieComun) || null;
      const d1 = num(p.d1Cm);
      const d2 = num(p.d2Cm);
      // Una troza medida con un solo diámetro (promedio) lo lleva en el mayor.
      const mayor = d1 ?? (d2 == null ? num(p.diametroCm) : null);
      return {
        codigo: txt(p.codificacion) || txt(p.codigoPlanta),
        arbol: txt(p.arbolCodigo) || null,
        comun,
        cientifico: txt(p.especieCientifica) || (comun ? cientificoDe(comun) : null),
        cites: citesDe.get(p.despachadaEnId ?? "") ?? false,
        diamMayorM: mayor == null ? null : mayor / 100,
        diamMenorM: d2 == null ? null : d2 / 100,
        lengthM: num(p.largoM),
        volumeM3: num(p.volumenM3),
      };
    });

    const datos = leerGtfDatos(cabecera.gtfDatos);
    const guia: GuiaSalidaImprimible = {
      despachoId: cabecera.id,
      lineNo: cabecera.lineNo,
      lineIds,
      gtfNumber: txt(cabecera.gtfNumber) || numero,
      fecha,
      datos,
      lineas,
      cadena,
      trozas,
      enRollo: esMaderaEnRollo(lineas),
      titular: txt(ficha.razonSocial),
      faltan: faltantesGtf(datos).map((f) => f.campo),
      anulada: !vigente,
    };
    return { ok: true, ficha, guia, entradas: entradasGuiaSalida(guia, ficha, permisos) };
  }
}
