/**
 * Las filas que hay detrás de cada fuente del balance, en la forma que se
 * muestra y se exporta.
 *
 * Cada fuente trae sus propias columnas porque son cosas distintas: una troza
 * tiene código y dimensiones, un lote tiene tope y plazo, una corrida tiene
 * paquetes. Forzarlas a una tabla común obligaría a dejar la mitad en blanco.
 *
 * PURO: lo usan el modal (pantalla), el Excel y el PDF del detalle. Si la tabla
 * de la pantalla y el archivo se armaran por separado, divergirían a la primera
 * columna nueva.
 */

import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import {
  corridasDeFuente,
  fechaLegible,
  filaDeTroza,
  lotesDeFuente,
  trozasDeFuente,
  type EntradaCapacidad,
  type FiltrosCapacidad,
  type FuenteDeCapacidad,
  type TrozaDeLote,
} from "./capacidad-de-planta";

export type Celda = string | number;

export interface FilaDetalle {
  celdas: Record<string, Celda>;
  /** Filas anidadas —las piezas de un lote— que la pantalla puede desplegar. */
  hijas?: { columnas: string[]; filas: Record<string, Celda>[] };
}

export interface TablaDetalle {
  columnas: string[];
  filas: FilaDetalle[];
}

/** Columnas que van a la derecha: número, no texto. */
export const esColumnaNumerica = (col: string) =>
  /m³|pt|Piezas|Producido|Despachado|Disponible|Consumido|Resta|56|Paquetes|Apartado/.test(col);

/** Columnas en m³ (4 decimales en pantalla y en el PDF). */
export const esColumnaM3 = (col: string) =>
  /m³|Resta|Consumido|56|Apartado/.test(col) && !/pt/.test(col);

const filasDeTrozasDeLote = (trozas: readonly TrozaDeLote[]) => ({
  columnas: ["Código", "Especie", "m³", "pt", "Permiso", "Guía", "Estado"],
  filas: trozas.map((t) => ({
    Código: t.codigo,
    Especie: t.especie,
    "m³": t.m3,
    pt: pieTablarDe(t.m3),
    Permiso: t.permiso || "—",
    Guía: t.guia || "—",
    Estado: t.consumida ? "aserrada" : "sin aserrar",
  })),
});

export function tablaDeFuente(
  fuente: FuenteDeCapacidad,
  entrada: EntradaCapacidad,
  filtros: FiltrosCapacidad,
): TablaDetalle {
  if (fuente.clave === "patio" || fuente.clave === "porRecepcionar") {
    return {
      columnas: [
        "Código",
        "Especie",
        "Dimensiones",
        "m³",
        "pt",
        "Permiso",
        "Guía",
        "Proveedor",
        "Fecha",
      ],
      filas: trozasDeFuente(fuente.clave, entrada.patio, filtros).map((t) => {
        const f = filaDeTroza(t);
        return {
          celdas: {
            Código: f.codigo,
            Especie: f.especie,
            Dimensiones: f.dimensiones,
            "m³": f.m3,
            pt: f.pt,
            Permiso: f.permiso,
            Guía: f.guia,
            Proveedor: f.proveedor,
            Fecha: f.fecha,
          },
        };
      }),
    };
  }

  if (fuente.clave === "apartado") {
    return {
      columnas: [
        "Lote",
        "Permiso",
        "Especie",
        "Estado",
        "Apartado (m³)",
        "Apartado (pt)",
        "Piezas sin aserrar",
      ],
      filas: lotesDeFuente(entrada.lotes, filtros)
        .filter((l) => l.apartadoM3 > 0)
        .map((l) => ({
          celdas: {
            Lote: l.code,
            Permiso: l.permisos.join(" + ") || "—",
            Especie: l.especie ?? "—",
            Estado: l.status,
            "Apartado (m³)": l.apartadoM3,
            "Apartado (pt)": pieTablarDe(l.apartadoM3),
            "Piezas sin aserrar": l.trozas.filter((t) => !t.consumida).length,
          },
          hijas: l.trozas.some((t) => !t.consumida)
            ? filasDeTrozasDeLote(l.trozas.filter((t) => !t.consumida))
            : undefined,
        })),
    };
  }

  if (fuente.clave === "lotes") {
    return {
      columnas: [
        "Lote",
        "Permiso",
        "Especie",
        "Estado",
        "Consumido (m³)",
        "Al 56 % (m³)",
        "Producido (m³)",
        "Resta (m³)",
        "Resta (pt)",
        "Piezas",
      ],
      filas: lotesDeFuente(entrada.lotes, filtros).map((l) => ({
        celdas: {
          Lote: l.code,
          Permiso: l.permisos.join(" + ") || "—",
          Especie: l.especie ?? "—",
          Estado: l.status,
          "Consumido (m³)": l.consumidoM3,
          "Al 56 % (m³)": l.esperado56M3,
          /* Vacío y no 0: una corrida en pt o kg no se puede sumar en m³, y un
             cero ahí se leería como «no produjo nada». */
          "Producido (m³)": l.producidoM3 ?? "",
          "Resta (m³)": l.restaM3 ?? "",
          "Resta (pt)": l.restaM3 == null ? "" : pieTablarDe(l.restaM3),
          Piezas: l.trozas.length,
        },
        /* Las piezas del lote, para cruzar lote↔guía sin salir de Saldos. */
        hijas: l.trozas.length ? filasDeTrozasDeLote(l.trozas) : undefined,
      })),
    };
  }

  /* Productos: una fila por CORRIDA con saldo, no por tipo de producto. El tipo
     agrega corridas de permisos distintos; la corrida es la unidad que se puede
     atribuir a un origen (ADR-349). */
  return {
    columnas: [
      "Fecha",
      "Lote",
      "Producto",
      "Especie",
      "Disponible (m³)",
      "Disponible (pt)",
      "Permiso",
      "Guías",
      "Paquetes",
    ],
    filas: corridasDeFuente(entrada.corridas ?? [], filtros).map((c) => {
      const permisos = [...new Set(c.titularOrigen.map((p) => p.trim()).filter(Boolean))];
      const guias = [...new Set(c.gtfOrigen.map((g) => g.trim()).filter(Boolean))];
      return {
        celdas: {
          Fecha: fechaLegible(c.fecha, true),
          Lote: c.lote ?? "—",
          Producto: c.producto ?? "—",
          Especie: c.especie ?? "—",
          "Disponible (m³)": c.disponible,
          "Disponible (pt)": pieTablarDe(c.disponible),
          Permiso:
            permisos.length === 0
              ? "sin origen"
              : permisos.length === 1
                ? permisos[0]
                : `${permisos.length} mezclados`,
          Guías: guias.join(", ") || "—",
          Paquetes: c.paquetes.length,
        },
      };
    }),
  };
}

/** La tabla aplanada para el archivo: cada fila con sus celdas, sin hijas. */
export const filasPlanas = (t: TablaDetalle): Record<string, Celda>[] =>
  t.filas.map((f) => f.celdas);
