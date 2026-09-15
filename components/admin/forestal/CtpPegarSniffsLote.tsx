"use client";

/**
 * «Traer del SNIFFS» en el paso 1 del lote de inventario (ADR-398).
 *
 * La misma captura del «Detalle de la programación de producción» trae TODO lo
 * que el paso 1 pregunta —N° de lote, fechas, especie, volumen consumido— y lo
 * que el paso 2 va a pedir después (los productos). Acá se lee una vez, se
 * llena el formulario y los productos viajan al paso 2 ya cargados: un pegado
 * arma el lote entero. Lo que se llenó sigue siendo editable; esto no guarda
 * nada por sí solo.
 */

import { ScanText, X } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import {
  interpretarDetalleProduccionSniffs,
  pareceDetalleSniffs,
  type DetalleProduccionSniffs,
} from "@/lib/forestal/sniffs-produccion-parse";
import { useLecturaPegada } from "./hooks/use-lectura-pegada";
import { leerDetalleConIA } from "./hooks/leer-sniffs-con-ia";
import { Tecla, ZonaPegarSniffs, fmtDiaSniffs } from "./CtpPegarSniffs";

export default function CtpPegarSniffsLote({
  detalle,
  onDetalle,
  onDescartar,
}: {
  /** Lo ya leído, si hay: se muestra el resumen en vez de la zona. */
  detalle: DetalleProduccionSniffs | null;
  onDetalle: (detalle: DetalleProduccionSniffs) => void;
  onDescartar: () => void;
}) {
  const lectura = useLecturaPegada<DetalleProduccionSniffs>({
    interpretar: (texto) => interpretarDetalleProduccionSniffs(texto),
    interpretarConIA: (imagen) => leerDetalleConIA(imagen),
    validar: (d) =>
      !d.lote && !d.especieComun && !d.fechaInicio && d.volumenConsumidoM3 == null && d.productos.length === 0
        ? "No encontré los datos del lote en lo que pegaste. Pega la pantalla «Detalle de la programación de producción» del SNIFFS."
        : null,
    parece: pareceDetalleSniffs,
    onLeido: (d) => onDetalle(d),
  });

  if (detalle && !lectura.leyendo) {
    const productos = detalle.productos.filter((p) => p.volumenM3 > 0);
    const totalM3 = Math.round(productos.reduce((a, p) => a + p.volumenM3, 0) * 10_000) / 10_000;
    const partes = [
      detalle.lote ? `lote ${detalle.lote}` : null,
      detalle.fechaInicio ? `${fmtDiaSniffs(detalle.fechaInicio)}${detalle.fechaFin ? ` → ${fmtDiaSniffs(detalle.fechaFin)}` : ""}` : null,
      [detalle.especieCientifica, detalle.especieComun].filter(Boolean).join(" · ") || null,
      detalle.volumenConsumidoM3 != null ? `consumido ${fmtM3(detalle.volumenConsumidoM3)} m³` : "consumido: no se leyó, ponlo a mano",
    ].filter(Boolean);
    return (
      <div className="mb-3 rounded-xl border-2 border-[var(--accent)] bg-primary/10 px-3 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <ScanText className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
          <b className="text-[var(--text-primary)]">Leído del SNIFFS</b>
          <span className="min-w-0 flex-1 font-mono text-xs tabular-nums text-[var(--text-secondary)]">{partes.join(" · ")}</span>
          <button
            type="button"
            onClick={onDescartar}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[var(--text-secondary)] underline-offset-2 hover:underline"
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Descartar
          </button>
        </div>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {productos.length > 0
            ? `${productos.length} producto${productos.length === 1 ? "" : "s"} (${fmtM3(totalM3)} m³) van al paso siguiente, listos para revisar y agregar.`
            : "La captura no trae productos: se declaran en el paso siguiente."}{" "}
          Los campos de abajo se llenaron con lo leído; corrige lo que haga falta.
        </p>
      </div>
    );
  }

  return (
    <ZonaPegarSniffs
      lectura={lectura}
      texto={
        <>
          pega la captura del «Detalle de la programación de producción» (<Tecla>Ctrl+V</Tecla>): llena el lote, las
          fechas, la especie y el consumido, y lleva los productos al paso siguiente.
        </>
      }
    />
  );
}
