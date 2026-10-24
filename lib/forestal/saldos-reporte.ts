/**
 * saldos-reporte — los lotes y las hojas del reporte de Saldos, en UN lugar.
 *
 * La cuenta de cada lote (al 56 %, producido, resta, plazo) estaba escrita dos
 * veces: una en la pantalla (`LotesConSaldo`) y otra en el orquestador para el
 * PDF, el CSV y el Excel. Dos copias de la misma resta divergen a la primera
 * columna nueva, y un reporte firmable que dice otra cosa que la pantalla deja
 * al que firma sin saber a cuál creerle. Acá vive una sola vez.
 *
 * PURO y client-safe: sin React, sin fetch, sin Prisma.
 */

import type { HojaExcel } from "@/lib/export-excel";
import { normalizarCodigoContrato } from "@/lib/forestal/contratos";
import { RENDIMIENTO_META } from "@/lib/forestal/loctp-catalogos";
import {
  consumidoDelLote,
  diasDeEspera,
  loteVencido,
  permisosDelLote,
  pieTablarDe,
  piezasLibres,
  producidoDelLote,
  volumenLibre,
  type LoteAserrio,
} from "@/lib/forestal/lotes-aserrio";
import type {
  BalanceCapacidad,
  FiltrosCapacidad,
  LoteDeCapacidad,
} from "@/lib/forestal/capacidad-de-planta";
import { limaDateKey } from "@/lib/utils";

/* Cuatro decimales, como el resto del libro (`Decimal(12,4)` en el schema).
   Con dos, 19.7439 − 18.328 daba 1.41 y la pantalla mostraba «1.410» en vez de
   «1.416»: seis milésimas de m³ inventadas por un redondeo intermedio. */
const r4 = (v: number) => Math.round(v * 10_000) / 10_000;

/**
 * Días que faltan para `finProceso`. Negativo = ya se pasó. `null` = sin fecha.
 *
 * Por día de CALENDARIO, no por horas: «vence hoy» dice 0 aunque falten tres
 * horas. Un `finProceso` date-only («2026-10-01») ya viene en el día del
 * negocio; leerlo como instante lo corre a la noche del 30 en hora peruana. Un
 * timestamp completo sí se convierte al día de Lima, que es donde abre la
 * planta.
 */
export function diasParaVencer(
  finProceso: string | Date | null | undefined,
  ahora: Date,
): number | null {
  if (!finProceso) return null;
  const clave =
    typeof finProceso === "string" && finProceso.length <= 10
      ? finProceso
      : limaDateKey(finProceso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clave)) return null;
  const hoy = limaDateKey(ahora);
  const aMs = (k: string) => {
    const [a, m, d] = k.split("-").map(Number);
    return Date.UTC(a, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((aMs(clave) - aMs(hoy)) / 86_400_000);
}

/** El lote en la forma que leen la tabla, el balance, el PDF, el CSV y el Excel. */
export interface LoteDeReporte extends LoteDeCapacidad {
  especie: string;
  /** Días desde que se abrió. `null` si la fecha no se entiende. */
  diasParado: number | null;
  /** `YYYY-MM-DD` o `null`. */
  finProceso: string | null;
  diasParaVencer: number | null;
  vencido: boolean;
}

/**
 * Los lotes con su saldo, calculados UNA vez.
 *
 * La resta es la de la pantalla: al 56 % (ya redondeado) − producido. Es lo que
 * el operador ve en la columna «Resta», así que es lo que baja el reporte.
 * `producidoM3` y `restaM3` en `null` = sin producción sumable (otra unidad o
 * sin corridas vivas): sin minuendo no hay resta que inventar.
 */
export function lotesParaReporte(lotes: readonly LoteAserrio[], ahora: Date): LoteDeReporte[] {
  return lotes.map((l) => {
    const consumido = consumidoDelLote(l);
    const esperado56 = r4(consumido * RENDIMIENTO_META);
    const producido = producidoDelLote(l);
    return {
      id: l.id,
      code: l.code,
      permisos: permisosDelLote(l),
      especie: l.speciesCommon,
      status: l.status,
      consumidoM3: consumido,
      esperado56M3: esperado56,
      producidoM3: producido,
      restaM3: producido == null ? null : r4(esperado56 - producido),
      apartadoM3: volumenLibre(l),
      piezas: piezasLibres(l).length,
      diasParado: diasDeEspera(l, ahora),
      finProceso: l.finProceso ? String(l.finProceso).slice(0, 10) : null,
      diasParaVencer: diasParaVencer(l.finProceso, ahora),
      vencido: loteVencido(l, ahora),
      /* Las piezas, con su guía: el cruce lote↔guía que pide el detalle. */
      trozas: l.trozas.map((t) => ({
        id: t.id,
        codigo: t.codigoPlanta ?? t.codificacion ?? "—",
        especie: t.especieComun ?? l.speciesCommon,
        m3: Number(t.volumenM3 ?? 0),
        permiso: (t.permiso ?? "").trim(),
        guia: (t.gtfNumber ?? "").trim(),
        consumida: Boolean(t.consumidaEnId),
      })),
    };
  });
}

/** El plazo escrito como lo lee el operador. */
export function textoPlazo(l: Pick<LoteDeReporte, "vencido" | "diasParaVencer">): string {
  if (l.vencido) return `${Math.abs(l.diasParaVencer ?? 0)} días vencido`;
  if (l.diasParaVencer == null) return "sin fecha";
  if (l.diasParaVencer === 0) return "vence hoy";
  return `quedan ${l.diasParaVencer} días`;
}

/**
 * Los lotes bajo el recorte de la capacidad (permiso y especie; la guía no).
 *
 * Con varios permisos tildados alcanza con que el lote tenga UNO: es el mismo
 * «o» de la tabla. Un lote junta piezas de varias guías, así que con una guía
 * puesta no hay lote que se pueda atribuir: lista vacía, y la tabla lo dice.
 */
export function filtrarLotesDeReporte(
  lotes: readonly LoteDeReporte[],
  f: FiltrosCapacidad,
): LoteDeReporte[] {
  if ((f.guia?.length ?? 0) > 0) return [];
  const mismo = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();
  return lotes.filter(
    (l) =>
      (!(f.permiso?.length ?? 0) || l.permisos.some((p) => f.permiso!.includes(p))) &&
      (!(f.especie?.length ?? 0) || f.especie!.some((e) => mismo(e, l.especie ?? ""))),
  );
}

/**
 * Los lotes de UN permiso, para «Solo este permiso» (ADR-421).
 *
 * `/lotes-aserrio` no lee `contratoId`, así que el recorte se hace acá con el
 * código del contrato activo. Mismo criterio que la capacidad
 * (`lotesDeFuente`): el lote entra sólo si TODA su madera es de ese permiso.
 * Un lote con dos títulos adentro atribuido entero a uno sumaría madera ajena
 * al balance de ese papel; se deja afuera y se CUENTA, para decirlo.
 *
 * Un lote sin piezas todavía se mira por el permiso que declaró al armarse
 * (`lote.permiso`, ADR-393).
 */
export function lotesDelContrato(
  lotes: readonly LoteAserrio[],
  codigo: string | null,
): { dentro: LoteAserrio[]; mezclados: LoteAserrio[] } {
  if (!codigo) return { dentro: [...lotes], mezclados: [] };
  const c = normalizarCodigoContrato(codigo);
  const dentro: LoteAserrio[] = [];
  const mezclados: LoteAserrio[] = [];
  for (const l of lotes) {
    const propios = [...new Set(permisosDelLote(l).map(normalizarCodigoContrato).filter(Boolean))];
    if (propios.length === 0) {
      if (normalizarCodigoContrato(l.permiso ?? "") === c) dentro.push(l);
    } else if (propios.length === 1) {
      if (propios[0] === c) dentro.push(l);
    } else if (propios.includes(c)) {
      mezclados.push(l);
    }
  }
  return { dentro, mezclados };
}

/** Lo mínimo del saldo que leen las dos primeras hojas. */
interface EntradaHojas {
  porEspecie: ReadonlyArray<{
    especie: string;
    scientific?: string | null;
    cites?: boolean;
    ingresoM3: number;
    pendienteM3: number;
    consumidoM3: number;
    saldoM3: number;
  }>;
  productos: ReadonlyArray<{
    producto: string;
    producido: number;
    despachado: number;
    stock: number;
  }>;
  lotes: readonly LoteDeReporte[];
  balance: BalanceCapacidad;
  /** Cómo se lee el recorte puesto: «Toda la planta» o «Sólo …». */
  textoFiltros: string;
}

/**
 * Las cuatro hojas del reporte de existencias: materia prima, productos, lotes
 * y capacidad. Cuatro hojas de UN archivo, no cuatro archivos: el navegador
 * bloquea la segunda descarga automática.
 *
 * Las cantidades van como NÚMERO: un m³ que llega como cadena no se suma en la
 * planilla, y la razón de exportar a Excel es sumar.
 */
export function hojasDeSaldos(e: EntradaHojas): HojaExcel[] {
  return [
    {
      nombre: "Materia prima",
      filas: e.porEspecie.map((s) => ({
        Especie: s.especie,
        "Nombre científico": s.scientific ?? "",
        CITES: s.cites ? "Sí" : "No",
        "Ingresado (m³)": s.ingresoM3,
        "Sin validar (m³)": s.pendienteM3,
        "Consumido (m³)": s.consumidoM3,
        "Saldo (m³)": s.saldoM3,
      })),
    },
    {
      /* Sin columna de unidad a propósito: `productos[]` agrega corridas que
         pueden venir en m³, pt o unidades, y una unidad inventada en la
         cabecera haría sumar peras con manzanas. */
      nombre: "Productos",
      filas: e.productos.map((p) => ({
        Producto: p.producto,
        Producido: p.producido,
        Despachado: p.despachado,
        Disponible: p.stock,
      })),
    },
    {
      nombre: "Lotes de aserrío",
      filas: e.lotes.map((l) => ({
        Lote: l.code,
        "N° de permiso": l.permisos.join(" + "),
        Especie: l.especie,
        Estado: l.status,
        "Consumido (m³)": l.consumidoM3,
        "Al 56 % (m³)": l.esperado56M3,
        "Producido (m³)": l.producidoM3 ?? "",
        "Resta al 56 % (m³)": l.restaM3 ?? "",
        "Apartado sin aserrar (m³)": l.apartadoM3,
        "Piezas libres": l.piezas,
        "Días parado": l.diasParado ?? "",
        "Fin de proceso": l.finProceso ?? "",
        "Días para vencer": l.diasParaVencer ?? "",
        Plazo: textoPlazo(l),
      })),
    },
    {
      /* El techo, con la misma advertencia que la pantalla: es una cota
         máxima, no una promesa. */
      nombre: "Capacidad de la planta",
      filas: [
        ...e.balance.fuentes.map((f) => ({
          Fuente: f.label,
          "Hoy (m³)": f.m3,
          "Al 56 %": f.convertido ? "sí" : "no (ya es producto)",
          "En producto (m³)": f.enProducto,
          "En producto (pt)": pieTablarDe(f.enProducto),
          Detalle: f.detalle ?? "",
        })),
        {
          Fuente: "CAPACIDAD MÁXIMA",
          "Hoy (m³)": "",
          "Al 56 %": "",
          "En producto (m³)": e.balance.totalProducto,
          "En producto (pt)": pieTablarDe(e.balance.totalProducto),
          Detalle: `${e.textoFiltros}. Cota máxima, no una promesa.`,
        },
      ],
    },
  ];
}
