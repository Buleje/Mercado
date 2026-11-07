"use client";

/**
 * Paso 2 del modo inventario de la vista Lotes: los paquetes que produjo esta
 * madera, con el MISMO formulario que declara producción desde un lote real —
 * el tope del 56 % y el rendimiento se ven igual, no hay una segunda versión
 * de esta pantalla.
 *
 * Salió de `CtpLotesView` (27-09) sin cambios: el lote y la corrida nacen
 * juntos recién al confirmar este paso — nada se crea a medias.
 */

import { useState } from "react";
import type { EstadoLotesAserrio } from "./hooks/use-lotes-aserrio";
import type { MaterialDeInventario } from "./CtpLoteArmarModal";
import type { AvisoLotes } from "./CtpLotesModales";
import CtpRegistrarProduccionModal, { type ProduccionRegistrada } from "./CtpRegistrarProduccionModal";
import { sniffsRefDesdeDetalle } from "@/lib/forestal/sniffs-produccion-parse";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

export default function CtpLotesInventarioPaso2({
  material,
  crearInventario,
  setAviso,
  onCerrar,
  onCambioEnElLibro,
}: {
  material: MaterialDeInventario;
  crearInventario: EstadoLotesAserrio["crearInventario"];
  setAviso: (a: AvisoLotes) => void;
  onCerrar: () => void;
  /** Se anuló un día desde la tira: los lotes releen sin cerrar el modal. */
  onCambioEnElLibro: () => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar(datos: ProduccionRegistrada) {
    setGuardando(true);
    setError(null);
    try {
      const r = await crearInventario({
        speciesCommon: material.speciesCommon,
        speciesScientific: material.speciesScientific,
        volumenConsumidoM3: material.volumenConsumidoM3,
        fecha: material.fecha,
        finProceso: material.finProceso,
        code: material.code,
        notes: material.notes,
        /* La foto de lo que declaró el SNIFFS (ADR-398): con ella la tarjeta
           puede decir después si el libro cuadra con lo declarado allá. */
        sniffs: material.sniffs
          ? sniffsRefDesdeDetalle(material.sniffs, "captura")
          : null,
        paquetes: datos.paquetes.map((p) => ({
          codigo: p.codigo,
          productType: p.productType,
          presentacion: p.presentacion,
          cantidad: p.cantidad,
          volumenM3: p.volumenM3,
          espesorCm: p.espesorCm,
          anchoCm: p.anchoCm,
          largoM: p.largoM,
          observations: p.observations || null,
        })),
      });
      setAviso({
        tono: "ok",
        texto:
          `Lote ${r.lote.code} declarado como inventario: ${fmtM3(datos.volumen)} m³ producidos ` +
          `en la corrida N° ${r.corrida.lineNo}. Ya se puede despachar y, si queda margen del 56 %, ` +
          `declararle más producción desde la tabla de Producción.`,
      });
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <CtpRegistrarProduccionModal
      lote={null}
      titulo={`Inventario declarado — ${material.speciesCommon}`}
      descripcion={`${material.speciesCommon} · ${fmtM3(material.volumenConsumidoM3)} m³ consumidos (declarado, sin trozas reales)`}
      material={{
        especie: material.speciesCommon,
        especieCientifica: material.speciesScientific ?? null,
        piezas: 0,
        volumenM3: material.volumenConsumidoM3,
        permisos: [],
        origenes: [],
      }}
      fecha={material.fecha}
      productoInicial={material.productType}
      /* Lo pegado en el paso 1 llega revisado acá: un pegado, un click. */
      sniffsInicial={material.sniffs}
      guardando={guardando}
      error={error}
      ctaLabel="Declarar el inventario"
      onConfirmar={(datos) => void confirmar(datos)}
      onClose={onCerrar}
      /* Se anuló un día desde la tira: los lotes releen sin cerrar el modal. */
      onCambioEnElLibro={onCambioEnElLibro}
    />
  );
}
