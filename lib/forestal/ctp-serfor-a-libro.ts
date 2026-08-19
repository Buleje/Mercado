/**
 * Del formato del SNIFFS a lo que espera cada endpoint del libro.
 *
 * Hay UN solo formato de entrada —el del SNIFFS— pero dos puertas de escritura,
 * porque los registros se guardan en modelos distintos:
 *  · Ingresos, Producción y Salidas → `wood-entries/import` (ADR-138),
 *  · Consumos y Retrozado → `ctp-serfor-import`.
 *
 * Esa división es interna: el operador sube un archivo y listo. Acá vive la
 * traducción, que es la única parte que sabe de las dos formas.
 *
 * PURO: se prueba sin abrir un archivo ni levantar un endpoint.
 */

import { armarCadena, consumosDeCorrida, mapaCodigoAGuia, repartirConsumos } from "./ctp-cadena-import";
import { medidasDeTexto } from "./medidas-paquete";
import type { FilaParseada, FormatoCtp } from "./ctp-formatos-serfor";

/** Qué endpoint escribe cada sección. */
export const ENDPOINT_DE: Record<FormatoCtp, { url: string; registro: string }> = {
  ingresos: { url: "/api/admin/forestal/wood-entries/import", registro: "ingresos" },
  produccion: { url: "/api/admin/forestal/wood-entries/import", registro: "produccion" },
  salidas: { url: "/api/admin/forestal/wood-entries/import", registro: "salida" },
  consumos: { url: "/api/admin/forestal/ctp-serfor-import", registro: "consumos" },
  retrozado: { url: "/api/admin/forestal/ctp-serfor-import", registro: "retrozado" },
  /* Los inventarios NO entran por el libro: son la existencia de apertura, no
     un movimiento. Van al endpoint de ingresos porque cada troza del patio ES
     un ingreso que ya está —con su GTF— y así queda trazable; la aserrada entra
     como corrida ya producida sin consumo, que es lo que un saldo inicial
     significa: producto que existe sin que este libro cuente cómo se hizo. */
  inventarioTrozas: { url: "/api/admin/forestal/wood-entries/import", registro: "ingresos" },
  inventarioAserrada: { url: "/api/admin/forestal/wood-entries/import", registro: "produccion" },
};

/** El nombre del array en el body de cada endpoint. */
export const CAMPO_BODY: Record<FormatoCtp, string> = {
  ingresos: "ingresos",
  produccion: "produccion",
  salidas: "salida",
  consumos: "consumos",
  retrozado: "retrozado",
  inventarioTrozas: "ingresos",
  inventarioAserrada: "produccion",
};

const txt = (v: unknown): string => (v == null ? "" : String(v).trim());
/** «-» y «S/L» es cómo el formato escribe «no tiene»: no son un dato. */
const sinGuion = (v: unknown): string => {
  const s = txt(v);
  return s === "-" || s === "--" || s.toUpperCase() === "S/L" ? "" : s;
};
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);

/**
 * Qué tipo de producto es, en el vocabulario del schema.
 *
 * El formato escribe «MADERA EN ROLLO» y «MADERA ASERRADA (PAQUETERIA CORTA)»;
 * el modelo guarda `rolliza` / `aserrada`. Lo que no se reconoce cae en
 * `rolliza`, que es el ingreso por defecto de un aserradero — inventar un tipo
 * nuevo por una variante de escritura ensuciaría el libro.
 */
/**
 * El inventario escribe la especie como «Cedrelinga cateniformis / Tornillo»:
 * científico primero, común después. El libro los guarda en dos campos.
 */
export function especieComunDe(v: unknown): string {
  const partes = txt(v).split("/");
  return (partes.length > 1 ? partes.slice(1).join("/") : partes[0] ?? "").trim() || "Sin especie";
}

export function especieCientificaDe(v: unknown): string | null {
  const partes = txt(v).split("/");
  return partes.length > 1 ? partes[0].trim() || null : null;
}

export function tipoDeProducto(v: unknown): "rolliza" | "aserrada" {
  return /aserrad/i.test(txt(v)) ? "aserrada" : "rolliza";
}

/**
 * El proveedor del ingreso.
 *
 * El formato del SNIFFS NO trae al titular: lo identifica por el número de la
 * guía y el código de origen. Como el endpoint lo exige (un ingreso sin
 * proveedor no se puede fiscalizar), se compone con lo que sí hay en vez de
 * dejarlo vacío — y queda explícito que salió del documento, no de un dato que
 * alguien cargó.
 */
export function proveedorDesdeFormato(datos: Record<string, unknown>): string {
  const origen = txt(datos.codigoOrigen) || txt(datos.fuenteOrigen);
  const doc = txt(datos.numeroDocumento);
  if (origen && doc) return `Origen ${origen} · ${doc}`;
  return origen || doc || "Sin identificar (importado del SNIFFS)";
}

/**
 * Traduce las filas al cuerpo que espera el endpoint de esa sección.
 *
 * Sólo las filas SIN problemas: una fila incompleta se reporta en la pantalla
 * antes de llegar acá, y mandarla igual sólo consigue que el server la rechace
 * con un mensaje peor.
 */
export function aCuerpoDelLibro(
  formato: FormatoCtp,
  filas: readonly FilaParseada[],
  /**
   * Las otras secciones del mismo archivo.
   *
   * Sin esto la producción entra sin consumos y el aserradero muestra como
   * disponible una madera que el libro declara aserrada. Con esto, el lote —que
   * es la columna que el SNIFFS ya trae— enlaza el consumo con la corrida, y
   * los saldos se derivan solos.
   */
  libro?: { ingresos?: readonly FilaParseada[]; consumos?: readonly FilaParseada[] },
): Record<string, unknown>[] {
  const listas = filas.filter((f) => f.problemas.length === 0);

  switch (formato) {
    case "ingresos":
      return listas.map((f) => ({
        row: f.fila,
        gtfNumber: txt(f.datos.numeroDocumento),
        entryDate: f.datos.fecha ?? null,
        providerName: proveedorDesdeFormato(f.datos),
        speciesCommonName: txt(f.datos.especieComun),
        speciesScientificName: txt(f.datos.especieCientifica) || null,
        productType: tipoDeProducto(f.datos.tipoProducto),
        volumeM3: num(f.datos.cantidad),
        /* El código de CTP identifica la PIEZA: con él el endpoint crea la
           troza, que es lo que después encuentran el Consumo y el Retrozado del
           mismo libro. Se sigue copiando a las notas porque ahí lo lee un
           humano que abre la ficha del ingreso. */
        codigoCtp: txt(f.datos.codigoCtp) || null,
        notes: [
          txt(f.datos.codigoCtp) && `Código CTP ${txt(f.datos.codigoCtp)}`,
          txt(f.datos.codigoOrigen) && `Origen ${txt(f.datos.codigoOrigen)}`,
          txt(f.datos.observaciones),
        ]
          .filter(Boolean)
          .join(" · ") || null,
      }));

    case "produccion": {
      /* El origen de cada corrida NO se inventa: sale del lote, que es la
         columna que comparten Consumos y Producción en el formato oficial. Lo
         que el libro no diga queda sin atribuir —la invariante I2 admite el
         hueco, y el certificado es el que después lo exige. */
      const mapa = mapaCodigoAGuia(libro?.ingresos);
      const plan = armarCadena({ consumos: libro?.consumos, produccion: filas });

      /* Para cada fila de producción, su parte del consumo del lote. */
      const parteDeFila = new Map<number, { gtfIngreso: string; volumeM3: number }[]>();
      /* Los códigos de troza del lote van a la PRIMERA corrida del lote y a una
         sola: una pieza se consume entera en una corrida, no en pedazos entre
         varias. Los m³ sí se reparten a prorrata —esa es la otra cara— pero la
         pieza es indivisible y repetirla marcaría la misma troza dos veces. */
      const trozasDeFila = new Map<number, string[]>();
      for (const corrida of plan.corridas) {
        const { atribuidos } = consumosDeCorrida(corrida, mapa);
        const partes = repartirConsumos(atribuidos, corrida.producciones);
        corrida.producciones.forEach((p, i) => parteDeFila.set(p.fila, partes[i] ?? []));
        const primera = corrida.producciones[0];
        if (primera) {
          trozasDeFila.set(
            primera.fila,
            [...new Set(corrida.consumos.map((c) => c.codigoOrigen).filter(Boolean))],
          );
        }
      }

      return listas.map((f) => {
        const consumos = parteDeFila.get(f.fila) ?? [];
        const entrada = consumos.reduce((s, c) => s + c.volumeM3, 0);
        const cantidad = num(f.datos.cantidad);
        return {
          row: f.fila,
          entryDate: f.datos.fecha ?? null,
          productType: txt(f.datos.tipoProducto),
          speciesCommon: txt(f.datos.especieComun),
          unit: "m3",
          quantity: cantidad,
          consumos,
          trozasConsumidas: trozasDeFila.get(f.fila) ?? [],
          /* El coeficiente que pide SERFOR. Sólo si hay consumo atribuido: sin
             denominador, un 0 mentiría diciendo que la corrida no rindió. */
          rendimientoPct: entrada > 0 ? Math.round((cantidad / entrada) * 10_000) / 100 : null,
          /* El lote también se GUARDA, no sólo se escribe en la nota: es la
             columna con la que el propio formato enlaza consumo, producción y
             salida, y con la que se distinguen dos corridas iguales del mismo día. */
          materiaPrimaRef: txt(f.datos.lote) || null,
          notes:
            [txt(f.datos.lote) && `Lote ${txt(f.datos.lote)}`, txt(f.datos.observaciones)]
              .filter(Boolean)
              .join(" · ") || null,
        };
      });
    }

    case "salidas":
      return listas.map((f) => ({
        row: f.fila,
        entryDate: f.datos.fecha ?? null,
        gtfNumber: txt(f.datos.numeroDocumento) || null,
        productType: txt(f.datos.tipoProducto),
        speciesCommon: txt(f.datos.especieComun) || "—",
        unit: "m3",
        quantity: num(f.datos.cantidad),
        destino: txt(f.datos.observaciones) || null,
      }));

    case "consumos":
      return listas.map((f) => ({
        fila: f.fila,
        fecha: f.datos.fecha ?? null,
        codigoOrigen: txt(f.datos.codigoOrigen),
        especieComun: txt(f.datos.especieComun) || null,
        cantidad: num(f.datos.cantidad),
        lote: txt(f.datos.lote) || null,
        observaciones: txt(f.datos.observaciones) || null,
      }));

    case "inventarioTrozas": {
      /* Sólo lo que está EN STOCK. Una troza ya consumida o despachada sigue en
         la lista con su estado, pero cargarla como existencia la haría aparecer
         disponible dos veces: una acá y otra en el libro que ya la movió. */
      const enStock = listas.filter((f) => {
        const e = txt(f.datos.estado).toLowerCase();
        return !e || /stock|disponible/.test(e);
      });

      /* AGRUPADAS POR GUÍA. Varias trozas del inventario comparten su GTF —en el
         archivo real, tres seguidas traen la misma— y el importador es
         insert-only por `gtfNumber`: mandando una fila por troza, la segunda y
         la tercera se descartan como «duplicada en el archivo» y su volumen se
         pierde sin que nadie lo note. Un ingreso ES la guía; las trozas son su
         detalle. */
      const porGuia = new Map<string, FilaParseada[]>();
      for (const f of enStock) {
        /* Sin GTF cada troza va sola con una clave propia: agruparlas todas bajo
           un mismo «sin guía» las metería en un ingreso inventado. */
        const g = txt(f.datos.numeroDocumento) || `INV-${txt(f.datos.codigoPlanta) || f.fila}`;
        porGuia.set(g, [...(porGuia.get(g) ?? []), f]);
      }

      return [...porGuia.entries()].map(([gtf, trozas]) => {
        const primera = trozas[0];
        return {
          row: primera.fila,
          gtfNumber: gtf,
          entryDate: null,
          providerName: txt(primera.datos.contrato) || "Existencia de apertura (inventario)",
          speciesCommonName: especieComunDe(primera.datos.especie),
          speciesScientificName: especieCientificaDe(primera.datos.especie),
          productType: tipoDeProducto(primera.datos.tipoProducto),
          /* El volumen del ingreso es la SUMA de sus piezas: si se mandara sólo
             el de la primera, la guía declararía menos madera de la que ampara
             y el saldo saldría corto. */
          volumeM3: Math.round(trozas.reduce((s, t) => s + num(t.datos.volumenM3), 0) * 10_000) / 10_000,
          trozas: trozas.map((t, i) => {
            /* DOS códigos distintos, y el modelo los guarda por separado:
               «Código Troza» es con el que la pieza salió del bosque (29/A) y
               «Código Planta» el que este centro le marca al recibirla
               (3037752). El archivo escribe «-» cuando no tiene, y guardar un
               «-» como código haría que la troza se busque por un guión. */
            const delBosque = sinGuion(t.datos.codigoTroza);
            const dePlanta = sinGuion(t.datos.codigoPlanta);
            const d1 = t.datos.d1Cm != null ? num(t.datos.d1Cm) : null;
            const d2 = t.datos.d2Cm != null ? num(t.datos.d2Cm) : null;
            return {
              orden: i + 1,
              codificacion: delBosque || dePlanta || null,
              codigoPlanta: dePlanta || null,
              especieComun: especieComunDe(t.datos.especie),
              especieCientifica: especieCientificaDe(t.datos.especie),
              dimensiones: [t.datos.d1Cm, t.datos.d2Cm, t.datos.largoM].every((v) => v != null && v !== "")
                ? `${txt(t.datos.d1Cm)} X ${txt(t.datos.d2Cm)} X ${txt(t.datos.largoM)}`
                : null,
              largoM: t.datos.largoM != null ? num(t.datos.largoM) : null,
              /* El promedio de los dos extremos: es el diámetro que se muestra y
                 con el que se cubica por Huber. Sin él la ficha de la troza sale
                 sin diámetro teniendo D1 y D2 al lado. */
              diametroCm: d1 != null && d2 != null ? Math.round(((d1 + d2) / 2) * 100) / 100 : (d1 ?? d2),
              d1Cm: d1,
              d2Cm: d2,
              cantidad: 1,
              volumenM3: num(t.datos.volumenM3),
            };
          }),
          notes: [
            `Inventario de apertura · ${trozas.length} troza${trozas.length === 1 ? "" : "s"}`,
            /* La madre se conserva: sin ella un retrozo importado pierde de qué
               troza salió, que es la mitad de su trazabilidad. */
            ...trozas
              .filter((t) => txt(t.datos.trozaPadre))
              .slice(0, 5)
              .map((t) => `${sinGuion(t.datos.codigoPlanta) || sinGuion(t.datos.codigoTroza)} es retrozo de ${txt(t.datos.trozaPadre)}`),
            txt(primera.datos.resolucion) && `Res. ${txt(primera.datos.resolucion)}`,
          ]
            .filter(Boolean)
            .join(" · "),
        };
      });
    }

    case "inventarioAserrada":
      /* Un paquete que ya está en el depósito: entra como corrida SIN consumos.
         No es un hueco de trazabilidad que haya que tapar — es exactamente lo
         que un saldo inicial declara: producto que existe y cuyo origen está en
         un libro anterior a este.

         PAQUETE POR PAQUETE. Cada fila del inventario es un bulto físico, así
         que va su código y su lote: además de quedar guardados, son los que lo
         distinguen de otro paquete de la misma especie, producto y volumen —lo
         normal en un depósito, donde los paquetes se arman iguales—. Sin eso el
         importador descartaba el segundo como «duplicado en el archivo». */
      return listas.map((f) => {
        const paquete = txt(f.datos.paquete);
        const lote = txt(f.datos.lote);
        const dims = txt(f.datos.dimensiones);
        return {
          row: f.fila,
          entryDate: f.datos.fecha ?? null,
          productType: txt(f.datos.tipoProducto) || "MADERA ASERRADA",
          speciesCommon: especieComunDe(f.datos.especie),
          unit: "m3",
          quantity: num(f.datos.volumenM3),
          consumos: [],
          rendimientoPct: null,
          /* «-» y «S/L» son cómo el formato escribe «no tiene»: guardarlos sería
             inventar un código de paquete que no existe. */
          codigoProducto: paquete && paquete !== "-" ? paquete : null,
          materiaPrimaRef: lote && lote !== "S/L" ? lote : null,
          pieces: f.datos.cantidad != null ? Math.round(num(f.datos.cantidad)) : null,
          /* El bulto con su ficha: presentación y medidas de la pieza tipo. Sin
             esto la lista de productos disponibles mostraba «—» en Presentación
             y Medidas para todo lo importado, teniendo el dato en el archivo. */
          presentacion: txt(f.datos.presentacion) || null,
          medidas: medidasDeTexto(dims),
          notes: [
            "Inventario de apertura",
            lote && lote !== "S/L" && `Lote ${lote}`,
            paquete && paquete !== "-" && `Paquete ${paquete}`,
            dims && dims !== "0 X 0 X 0" && dims,
            txt(f.datos.presentacion),
            txt(f.datos.volumenPt) && `${txt(f.datos.volumenPt)} pt`,
            txt(f.datos.consumoInterno) && "C/I",
          ]
            .filter(Boolean)
            .join(" · "),
        };
      });

    case "retrozado":
      return listas.map((f) => ({
        fila: f.fila,
        fecha: f.datos.fecha ?? null,
        codigoMadre: txt(f.datos.codigoMadre),
        codigoRetrozo: txt(f.datos.codigoRetrozo),
        diametroMayor: f.datos.diametroMayor ?? null,
        diametroMenor: f.datos.diametroMenor ?? null,
        longitud: f.datos.longitud ?? null,
        volumenFinal: num(f.datos.volumenFinal),
        observaciones: txt(f.datos.observaciones) || null,
      }));
  }
}

/** Normaliza la respuesta de los dos endpoints a una sola forma para la UI. */
export type ResumenImport = { creados: number; porCrear: number; existen: number; errores: number };
export type FilaResultado = { fila?: number; codigo: string; accion: string; mensaje: string };

export function normalizarRespuesta(cuerpo: unknown): { resumen: ResumenImport; filas: FilaResultado[] } {
  const c = (cuerpo ?? {}) as Record<string, unknown>;

  /* `ctp-serfor-import` ya devuelve esta forma. */
  if (c.resumen && Array.isArray(c.filas)) {
    return c as never;
  }

  /* `wood-entries/import` devuelve `detalle` con otra nomenclatura, y su
     `resumen` usa `crear`/`saltados` donde el otro usa `porCrear`/`existen`. */
  const rows = (Array.isArray(c.detalle) ? c.detalle : []) as {
    row?: number;
    gtf?: string | null;
    action: string;
    message: string;
  }[];
  const filas: FilaResultado[] = rows.map((r) => ({
    fila: r.row,
    codigo: r.gtf ?? "—",
    /* «difiere» no existe del otro lado: se muestra como que ya está, porque el
       importador es insert-only y tampoco lo va a tocar. */
    accion: r.action === "difiere" ? "existe" : r.action,
    mensaje: r.message,
  }));
  /* Se cuenta desde las filas y no desde su `resumen`: son dos nomenclaturas
     distintas y una sola fuente evita que el titular y la lista se
     contradigan. */
  return {
    resumen: {
      creados: filas.filter((f) => f.accion === "creado").length,
      porCrear: filas.filter((f) => f.accion === "crear").length,
      existen: filas.filter((f) => f.accion === "existe").length,
      errores: filas.filter((f) => f.accion === "error").length,
    },
    filas,
  };
}
