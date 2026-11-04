/**
 * precio-troza-lectura — junta lo que pide `GET /api/admin/forestal/precio-troza`.
 * Sólo lectura y nada se guarda: compone las corridas del libro
 * (`leerRendimientoAserradero`, sin plata), el consumo por guía con su origen
 * (`ForestCtpConsumoDB.consumosConOrigen`, una ida) y las referencias de precio
 * del tenant (`WoodEntriesPrecioDB.referencias`: lo pagado por m³ y el precio
 * de venta por PT de sus paquetes). Las cuentas salen de los dos módulos puros.
 *
 * Fuera de la ruta para poder cruzarlo con un tenant real bajo `tsx`.
 */
import { ForestCtpConsumoDB } from "@/lib/db/forest-ctp-consumo.db";
import { WoodEntriesPrecioDB } from "@/lib/db/wood-entries-precio.db";
import { PT_POR_M3 } from "./cubicacion";
import { RENDIMIENTO_PLAUSIBLE_MAX, RENDIMIENTO_PLAUSIBLE_MIN } from "./loctp-catalogos";
import { claveEspecie } from "./loth-constants";
import { MIN_CORRIDAS_MEDIDO, precioMaximoTroza, RENDIMIENTO_REGLA_PCT, rendimientoParaPrecio } from "./precio-maximo-troza";
import type { AgruparOrigenPor, PrecioMaximoEspecie, PrecioTrozaDTO } from "./precio-troza-tipos";
import { leerRendimientoAserradero } from "./rendimiento-lectura";
import { origenDeIngreso, rendimientoPorOrigen, type CorridaParaOrigen } from "./rendimiento-por-origen";

export interface ParametrosPrecioTroza {
  especie?: string;
  /** `AAAA-MM-DD`, sobre la fecha de la corrida. */
  desde?: string;
  hasta?: string;
  aserrioM3?: number;
  fleteM3?: number;
  margenPct?: number;
  /** S/ por PT escrito por el usuario: gana al de sus ventas (para la especie filtrada, o todas). */
  precioPt?: number;
  agruparPor?: AgruparOrigenPor;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function leerPrecioTroza(tenantId: string, p: ParametrosPrecioTroza): Promise<PrecioTrozaDTO> {
  if (!tenantId) throw new Error("tenantId is required");
  const agruparPor = p.agruparPor ?? "proveedor";
  const kFiltro = p.especie ? claveEspecie(p.especie) : null;
  const [rend, refs] = await Promise.all([leerRendimientoAserradero(tenantId, { plata: false }), WoodEntriesPrecioDB.referencias(tenantId)]);

  const enVentana = rend.corridas.filter(
    (c) =>
      (!p.desde || c.fecha >= p.desde) && (!p.hasta || c.fecha <= p.hasta) && (kFiltro == null || claveEspecie(c.especie) === kFiltro),
  );
  /* Una corrida en proceso no enseña (rendimiento-especie, regla 1); una en PT no tiene m³ de salida.
     Una sin aserrado anotado (sólo consumo de trozas) cuenta como en proceso: con 0 PT hundía el
     promedio de la especie (Blas 04-11: 3 de 6 de tornillo sin salida, 40,0 % → 27,7 % al cerrar
     sus lotes). Mismo corte que `ponderado` de rendimiento-especie. */
  const corridasFuera = { enProceso: 0, enPt: 0, sinEntrada: 0 };
  const terminadas = enVentana.filter((c) => {
    if (c.parcial) corridasFuera.enProceso++;
    else if ((c.unidad ?? "m3") !== "m3") corridasFuera.enPt++;
    else if (!(c.m3Entrada > 0)) corridasFuera.sinEntrada++;
    else if (!(c.m3Salida > 0)) corridasFuera.enProceso++;
    else return true;
    return false;
  });

  const consumos = await ForestCtpConsumoDB.consumosConOrigen(
    tenantId,
    terminadas.map((c) => c.id),
  );
  const porCorrida = new Map<string, CorridaParaOrigen["consumos"][number][]>();
  for (const x of consumos) {
    const lista = porCorrida.get(x.ctpEntryId) ?? [];
    lista.push({ origen: origenDeIngreso(x.woodEntry, agruparPor), m3: Number(x.volumeM3) || 0 });
    porCorrida.set(x.ctpEntryId, lista);
  }

  /* El precio de venta: el escrito gana; si no, la mediana de sus paquetes de esa especie. */
  const precioDe = (especie: string): { precio: number | null; fuente: PrecioMaximoEspecie["fuentePrecio"] } => {
    const k = claveEspecie(especie);
    if (p.precioPt != null && p.precioPt > 0 && (kFiltro == null || k === kFiltro)) return { precio: p.precioPt, fuente: "parametro" };
    const v = refs.ventaPt[k];
    return v != null && v > 0 ? { precio: v, fuente: "ventas" } : { precio: null, fuente: null };
  };

  const origen = rendimientoPorOrigen(
    terminadas.map((c) => ({
      id: c.id,
      lote: c.lote,
      especie: c.especie,
      m3Entrada: c.m3Entrada,
      m3Salida: c.m3Salida,
      consumos: porCorrida.get(c.id) ?? [],
    })),
    (esp) => precioDe(esp).precio,
  );

  /* Especies: las de sus corridas y las que tienen precio de venta (o la filtrada aunque no haya nada). */
  const nombres = new Map<string, string>();
  for (const c of enVentana) if (c.especie !== "Sin especie" && !nombres.has(claveEspecie(c.especie))) nombres.set(claveEspecie(c.especie), c.especie);
  for (const k of Object.keys(refs.ventaPt)) {
    if ((kFiltro == null || k === kFiltro) && !nombres.has(k)) nombres.set(k, k.charAt(0).toUpperCase() + k.slice(1));
  }
  if (p.especie && kFiltro && !nombres.has(kFiltro)) nombres.set(kFiltro, p.especie.trim());

  const porEspecie: PrecioMaximoEspecie[] = [...nombres]
    .map(([k, especie]) => {
      const rendimiento = rendimientoParaPrecio(terminadas.filter((c) => claveEspecie(c.especie) === k));
      const { precio, fuente } = precioDe(especie);
      const d = precioMaximoTroza({
        rendimientoPct: rendimiento.pct,
        precioVentaPt: precio,
        aserrioM3: p.aserrioM3 ?? null,
        fleteM3: p.fleteM3 ?? null,
        margenPct: p.margenPct ?? null,
      });
      const pagado = refs.pagado.porEspecie[k] ?? null;
      return {
        especie,
        rendimientoPct: rendimiento.pct,
        fuenteRendimiento: rendimiento.fuente,
        corridasMedidas: rendimiento.corridas,
        rendimientoMedidoPct: rendimiento.medidoPct,
        motivoRendimiento: rendimiento.motivo,
        ...d,
        precioVentaPt: precio,
        fuentePrecio: fuente,
        pagadoHoyM3: pagado,
        holguraM3: pagado && d.precioMaximoM3 != null ? r2(d.precioMaximoM3 - pagado.mediana) : null,
      } satisfies PrecioMaximoEspecie;
    })
    /* Con precio primero (es la respuesta), después por cuántas corridas la respaldan. */
    .sort(
      (a, b) =>
        Number(b.precioMaximoM3 != null) - Number(a.precioMaximoM3 != null) ||
        b.corridasMedidas - a.corridasMedidas ||
        a.especie.localeCompare(b.especie, "es"),
    );

  return {
    parametros: {
      especie: p.especie ?? null,
      desde: p.desde ?? null,
      hasta: p.hasta ?? null,
      aserrioM3: p.aserrioM3 ?? null,
      fleteM3: p.fleteM3 ?? null,
      margenPct: p.margenPct ?? null,
      precioPt: p.precioPt ?? null,
      agruparPor,
    },
    regla: {
      rendimientoPct: RENDIMIENTO_REGLA_PCT,
      ptPorM3Aserrada: PT_POR_M3,
      minCorridasMedido: MIN_CORRIDAS_MEDIDO,
      franjaMin: RENDIMIENTO_PLAUSIBLE_MIN,
      franjaMax: RENDIMIENTO_PLAUSIBLE_MAX,
    },
    porEspecie,
    porOrigen: origen.filas,
    totalOrigen: origen.total,
    corridasFuera,
  };
}
