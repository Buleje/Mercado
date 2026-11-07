/**
 * Cotejar lo que declara el SNIFFS contra lo que se cubicó, cuando la corrida
 * NO tiene lote (ADR-397 + ADR-408).
 *
 * ## Por qué el cotejo cambia de contraparte
 *
 * En el modal CON lote, «Traer del SNIFFS» compara lo pegado contra el
 * MATERIAL de la corrida: especie consumida, volumen consumido y el margen que
 * queda bajo el tope del 56 %. En «Producir sin lote» no hay material —la
 * corrida nace sin consumos, que es su razón de ser—, así que ese cotejo no
 * tiene contra qué correr.
 *
 * Callarlo sería perder lo único que hace valioso el pegado acá. Lo que se hace
 * es cambiarle la contraparte: **se coteja contra lo cubicado**, que es lo que
 * esta pantalla sí tiene declarado y lo que va a entrar al Libro. Tres cuentas:
 *
 * 1. **Especie** — la leída contra la que declara el asiento.
 * 2. **Producto por producto y total** — los m³ del SNIFFS contra los m³ que
 *    suman los paquetes cubicados de ese mismo producto del catálogo LO-CTP.
 * 3. **Rendimiento** — lo cubicado sobre el volumen consumido que declara la
 *    captura. Es un número DERIVADO y se dice que lo es: acá no hay consumo en
 *    el Libro con qué compararlo, el consumido sale de la captura. Sirve para
 *    avisar antes de tiempo lo que va a pasar cuando a esta corrida se le
 *    vincule su materia prima y el tope del 56 % sí la mida.
 *
 * Nada se corrige solo: esto devuelve diferencias para mostrarlas. No promedia,
 * no elige un lado y no escribe en el formulario.
 */

import { RENDIMIENTO_META } from "./loctp-catalogos";
import { claveEspecie } from "./loth-constants";
import { fmtM3 } from "./cubicacion-formato";
import type { DetalleProduccionSniffs } from "./sniffs-produccion-parse";

/**
 * Un litro. El SNIFFS imprime **tres** decimales y el Libro guarda cuatro: por
 * debajo de un litro la diferencia es la impresión, no la madera. Con un umbral
 * de float (0.0001) siete filas redondas darían «no cuadra» y se aprende a
 * ignorar la lista entera.
 */
export const TOLERANCIA_M3 = 0.001;

/** Lo que el asiento declara cuando el cubicado no mapea a un producto. */
const PRODUCTO_POR_DEFECTO = "MADERA ASERRADA";

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

export type EstadoFilaCotejo =
  /** Los dos lados dicen lo mismo (dentro del litro). */
  | "cuadra"
  /** Los dos lo traen y no coinciden. */
  | "difiere"
  /** El SNIFFS lo declara y acá no se cubicó nada de ese producto. */
  | "falta-cubicar"
  /** Se cubicó un producto que la captura no declara. */
  | "de-mas";

export interface FilaCotejoSniffs {
  /** El producto del catálogo LO-CTP, o lo crudo si no se reconoció. */
  producto: string;
  /** Cómo lo escribe el SNIFFS, cuando no se reconoció en el catálogo. */
  crudo: string | null;
  sniffsM3: number | null;
  cubicadoM3: number | null;
  /** Cubicado − SNIFFS, sólo cuando los dos lados traen el producto. */
  diferenciaM3: number | null;
  estado: EstadoFilaCotejo;
}

export type EstadoEspecieCotejo = "sin-dato" | "coincide" | "difiere" | "solo-sniffs";

export interface CotejoSniffsSinLote {
  filas: FilaCotejoSniffs[];
  totales: { sniffsM3: number; cubicadoM3: number; diferenciaM3: number; cuadra: boolean };
  especie: { sniffs: string | null; asiento: string | null; estado: EstadoEspecieCotejo };
  /**
   * Derivado del consumido que declara la captura — no del Libro, que para esta
   * corrida no tiene consumos. `null` si la captura no trae el consumido.
   */
  rendimiento: {
    consumidoM3: number;
    /** Porcentaje con un decimal. */
    pct: number;
    /** Lo que entraría bajo el tope del 56 % de ese consumido. */
    topeM3: number;
    excede: boolean;
    /** Más producto que materia prima: eso no existe. */
    imposible: boolean;
  } | null;
  avisos: { tono: "aviso" | "error"; texto: string }[];
}

interface LadoSniffs {
  m3: number;
  crudo: string | null;
}

/**
 * El resumen del SNIFFS es «por PMF y Producto»: con dos PMF el mismo producto
 * aparece dos veces y son la misma línea del Libro. Se suman.
 */
function sniffsPorProducto(detalle: DetalleProduccionSniffs): Map<string, LadoSniffs> {
  const mapa = new Map<string, LadoSniffs>();
  for (const p of detalle.productos) {
    const reconocido = p.productType?.trim();
    const clave = reconocido || p.productoCrudo.trim().toUpperCase();
    if (!clave) continue;
    const previo = mapa.get(clave);
    mapa.set(clave, {
      m3: r4((previo?.m3 ?? 0) + (Number(p.volumenM3) || 0)),
      crudo: reconocido ? (previo?.crudo ?? null) : p.productoCrudo.trim(),
    });
  }
  return mapa;
}

function cubicadoPorProducto(
  paquetes: readonly { productType: string | null; volumenM3: number }[],
): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const p of paquetes) {
    /* El mismo valor que se manda a registrar: un paquete sin producto entra al
       Libro como el genérico, así que cotejar contra `null` compararía contra
       algo que nunca se va a declarar. */
    const clave = p.productType?.trim() || PRODUCTO_POR_DEFECTO;
    mapa.set(clave, r4((mapa.get(clave) ?? 0) + (Number(p.volumenM3) || 0)));
  }
  return mapa;
}

function estadoEspecie(sniffs: string | null, asiento: string | null): EstadoEspecieCotejo {
  const a = claveEspecie(sniffs ?? "");
  const b = claveEspecie(asiento ?? "");
  if (!a) return "sin-dato";
  if (!b) return "solo-sniffs";
  return a === b ? "coincide" : "difiere";
}

/**
 * Cómo escribe el Libro una especie que la captura trae en mayúsculas.
 *
 * «TORNILLO» y «Tornillo» son dos maderas distintas para cualquier agrupación
 * por texto, así que antes de bajar la leída a las piezas se busca la grafía
 * que el tenant ya usa (lo cubicado, el patio, el catálogo de fábrica).
 */
export function especieComoLaEscribeElLibro(
  leida: string | null | undefined,
  conocidas: readonly string[],
): string | null {
  const limpia = (leida ?? "").trim();
  if (!limpia) return null;
  const clave = claveEspecie(limpia);
  return conocidas.find((c) => claveEspecie(c) === clave) ?? limpia;
}

export function cotejarSniffsSinLote(
  detalle: DetalleProduccionSniffs,
  cubicado: {
    paquetes: readonly { productType: string | null; volumenM3: number }[];
    /** La que va a declarar el asiento, ya decidida. */
    especie: string | null;
  },
): CotejoSniffsSinLote {
  const delSniffs = sniffsPorProducto(detalle);
  const delCubicado = cubicadoPorProducto(cubicado.paquetes);

  const filas: FilaCotejoSniffs[] = [];
  for (const [producto, lado] of delSniffs) {
    const cub = delCubicado.get(producto) ?? null;
    const dif = cub == null ? null : r4(cub - lado.m3);
    filas.push({
      producto,
      crudo: lado.crudo,
      sniffsM3: lado.m3,
      cubicadoM3: cub,
      diferenciaM3: dif,
      estado:
        cub == null ? "falta-cubicar" : Math.abs(dif ?? 0) <= TOLERANCIA_M3 ? "cuadra" : "difiere",
    });
  }
  /* Sin filas de producto en la captura no hay cotejo por producto que hacer:
     listar lo cubicado como «de más» pintaría de rojo una pantalla donde el
     único que no dijo nada es el papel. Se dice eso y se cotejan la especie y
     el consumido, que sí se leyeron. */
  if (delSniffs.size > 0) {
    for (const [producto, m3] of delCubicado) {
      if (delSniffs.has(producto)) continue;
      filas.push({
        producto,
        crudo: null,
        sniffsM3: null,
        cubicadoM3: m3,
        diferenciaM3: null,
        estado: "de-mas",
      });
    }
  }

  const totalSniffs = r4([...delSniffs.values()].reduce((a, l) => a + l.m3, 0));
  const totalCubicado = r4([...delCubicado.values()].reduce((a, m) => a + m, 0));
  const difTotal = r4(totalCubicado - totalSniffs);

  const especie = {
    sniffs: detalle.especieComun,
    asiento: cubicado.especie,
    estado: estadoEspecie(detalle.especieComun, cubicado.especie),
  };

  const consumido = detalle.volumenConsumidoM3;
  const rendimiento =
    consumido != null && consumido > 0 && totalCubicado > 0
      ? {
          consumidoM3: r4(consumido),
          pct: Math.round((totalCubicado / consumido) * 1000) / 10,
          topeM3: r4(consumido * RENDIMIENTO_META),
          excede: totalCubicado > r4(consumido * RENDIMIENTO_META) + TOLERANCIA_M3,
          imposible: totalCubicado > consumido + TOLERANCIA_M3,
        }
      : null;

  /* Sin filas de producto no se agrega un aviso propio: el parser ya dice
     «No encontré filas de producto. Pega la tabla…» y viaja en `detalle.avisos`.
     Dos carteles para el mismo hueco enseñan a no leer ninguno. */
  const avisos: CotejoSniffsSinLote["avisos"] = [];
  if (especie.estado === "difiere") {
    avisos.push({
      tono: "error",
      texto: `La captura es de ${especie.sniffs} y este asiento declara ${especie.asiento}. No se cambia nada solo: revisa si es la captura de esta jornada.`,
    });
  }
  if (rendimiento?.imposible) {
    avisos.push({
      tono: "error",
      texto: `Lo cubicado suma ${fmtM3(totalCubicado)} m³ y la captura declara ${fmtM3(rendimiento.consumidoM3)} m³ consumidos: de esa madera no sale tanto producto. Revisa la captura o lo cubicado.`,
    });
  } else if (rendimiento?.excede) {
    avisos.push({
      tono: "aviso",
      texto: `Lo cubicado rinde ${rendimiento.pct} % sobre los ${fmtM3(rendimiento.consumidoM3)} m³ que la captura declara consumidos; bajo el tope del ${Math.round(RENDIMIENTO_META * 100)} % entrarían ${fmtM3(rendimiento.topeM3)} m³. Se registra igual —esta corrida nace sin consumos— pero cuando le vincules su materia prima, lo de más no va a entrar.`,
    });
  }
  if (totalSniffs > 0 && Math.abs(difTotal) > TOLERANCIA_M3) {
    avisos.push({
      tono: "aviso",
      texto: `La captura declara ${fmtM3(totalSniffs)} m³ y lo cubicado suma ${fmtM3(totalCubicado)} m³ (${difTotal > 0 ? "+" : "−"}${fmtM3(Math.abs(difTotal))} m³). Se registra lo cubicado: acá los m³ salen del pie tablar de cada medida.`,
    });
  }
  const faltan = filas.filter((f) => f.estado === "falta-cubicar");
  if (faltan.length > 0) {
    avisos.push({
      tono: "aviso",
      texto: `La captura declara ${faltan.length === 1 ? "un producto que no cubicaste" : `${faltan.length} productos que no cubicaste`}: ${faltan.map((f) => f.crudo ?? f.producto).join(" · ")}. Vuelve a cubicar si faltan medidas.`,
    });
  }
  const deMas = filas.filter((f) => f.estado === "de-mas");
  if (deMas.length > 0) {
    avisos.push({
      tono: "aviso",
      texto: `Cubicaste ${deMas.length === 1 ? "un producto que la captura no declara" : `${deMas.length} productos que la captura no declara`}: ${deMas.map((f) => f.producto).join(" · ")}.`,
    });
  }
  const sinCatalogo = filas.filter((f) => f.crudo);
  if (sinCatalogo.length > 0) {
    avisos.push({
      tono: "aviso",
      texto: `${sinCatalogo.map((f) => `«${f.crudo}»`).join(" · ")} no está en el catálogo del LO-CTP: esa fila no se puede cotejar contra lo cubicado.`,
    });
  }
  for (const a of detalle.avisos) avisos.push({ tono: "aviso", texto: a });

  return {
    filas,
    totales: {
      sniffsM3: totalSniffs,
      cubicadoM3: totalCubicado,
      diferenciaM3: difTotal,
      cuadra: totalSniffs > 0 && Math.abs(difTotal) <= TOLERANCIA_M3,
    },
    especie,
    rendimiento,
    avisos,
  };
}

/**
 * La línea que deja el rastro del cotejo en las observaciones del asiento.
 *
 * Una corrida sin lote no tiene dónde guardar lo leído —`ForestLoteAserrio.sniffs`
 * es del lote, y acá no hay— así que el único lugar del Libro que puede decir
 * «esto se coteja con la programación 18-2026» es la observación. Se ofrece con
 * un botón: no se escribe sola.
 */
export function lineaObservacionSniffs(
  detalle: DetalleProduccionSniffs,
  cotejo: CotejoSniffsSinLote,
): string {
  const partes = [
    detalle.lote ? `programación ${detalle.lote}` : null,
    detalle.especieComun,
    detalle.volumenConsumidoM3 != null ? `consumido ${fmtM3(detalle.volumenConsumidoM3)} m³` : null,
    cotejo.filas.some((f) => f.sniffsM3 != null)
      ? `declara ${fmtM3(cotejo.totales.sniffsM3)} m³ en ${cotejo.filas.filter((f) => f.sniffsM3 != null).length} producto(s)`
      : null,
    `cubicado ${fmtM3(cotejo.totales.cubicadoM3)} m³`,
  ].filter(Boolean);
  return `Cotejado con el SNIFFS: ${partes.join(" · ")}.`;
}
