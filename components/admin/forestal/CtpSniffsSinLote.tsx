"use client";

/**
 * «Traer del SNIFFS» en «Producir sin lote» (ADR-397 + ADR-408).
 *
 * ## Qué hace acá, y qué NO hace a propósito
 *
 * En el modal CON lote lo pegado **arma los paquetes**. Acá no: los paquetes de
 * esta pantalla salen de lo cubicado (`paquetesDeLoCubicado`) y esa tiene que
 * seguir siendo la única fuente. El resumen del SNIFFS es por producto: trae
 * m³, pero **no trae piezas ni medidas** —`paquetesDesdeSniffs` los crea con
 * `cantidad: 0`—, y en este modal el m³ de un paquete sale del pie tablar de su
 * medida. Un paquete traído de la captura entraría sin escuadría: rompería la
 * cuenta de PT del pie del modal y el cobro del aserrío, que busca su tramo por
 * el largo de cada paquete (ADR-412). Tampoco puede entrar «como piezas al
 * cubicador» por lo mismo: no hay espesor, ancho, largo ni cantidad que cubicar.
 *
 * Entonces lo pegado entra como **lo declarado al SNIFFS**, al lado de lo
 * cubicado, y se dice dónde no coinciden (`cotejarSniffsSinLote`). De ahí sólo
 * pueden bajar al formulario dos datos que esta pantalla ya pide a mano —la
 * fecha y la especie— y cada uno con su botón: nada entra callado.
 *
 * El cotejo del modal con lote —especie, volumen consumido y margen bajo el
 * tope del 56 % contra el MATERIAL— acá no tiene contra qué correr: la corrida
 * nace sin consumos. No se calla: cambia de contraparte a lo cubicado, y el
 * consumido que declara la captura se muestra diciendo que es de la captura.
 */

import { useMemo, useState } from "react";
import {
  interpretarDetalleProduccionSniffs,
  pareceDetalleSniffs,
  type DetalleProduccionSniffs,
} from "@/lib/forestal/sniffs-produccion-parse";
import { cotejarSniffsSinLote } from "@/lib/forestal/sniffs-cotejo-sin-lote";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { useLecturaPegada } from "./hooks/use-lectura-pegada";
import { leerDetalleConIA } from "./hooks/leer-sniffs-con-ia";
import { Tecla, ZonaPegarSniffs } from "./CtpPegarSniffs";
import { PanelCotejoSniffs } from "./CtpCotejoSniffsPanel";

type PaqueteCotejable = { productType: string | null; volumenM3: number };

export default function CtpSniffsSinLote({
  paquetes,
  especie,
  corridas,
  especiesConocidas,
  fecha,
  onUsarFecha,
  onUsarEspecie,
  onAnotar,
}: {
  /** Los paquetes que salen de lo cubicado — la única fuente de la tabla. */
  paquetes: readonly { productType: string | null; volumenM3: number }[];
  /** La especie que va a declarar el asiento, ya decidida. */
  especie: string | null;
  /**
   * Lo cubicado partido en una corrida por especie (ADR-429). La programación
   * del SNIFFS es de UNA especie: con panguana y tornillo en el mismo lote,
   * cotejar la captura de tornillo contra todo pintaba la panguana como
   * «de más». Si la especie leída es una de estas, se coteja sólo contra ella.
   */
  corridas?: readonly { especie: string; paquetes: readonly PaqueteCotejable[] }[];
  especiesConocidas: readonly string[];
  fecha: string;
  onUsarFecha: (iso: string) => void;
  onUsarEspecie: (nombre: string) => void;
  onAnotar: (linea: string) => void;
}) {
  const [detalle, setDetalle] = useState<DetalleProduccionSniffs | null>(null);

  const lectura = useLecturaPegada<DetalleProduccionSniffs>({
    interpretar: (texto) => interpretarDetalleProduccionSniffs(texto),
    interpretarConIA: (imagen) => leerDetalleConIA(imagen),
    /* Más laxo que la puerta del lote: acá alcanza con el consumido o la
       especie para que el cotejo diga algo, aunque la tabla no se haya leído. */
    validar: (d, fuente) =>
      d.productos.length === 0 && d.volumenConsumidoM3 == null && !d.especieComun
        ? fuente === "captura"
          ? "Leí la captura pero no encontré el «Detalle de la programación de producción». Prueba con una captura donde se vea entera, o copia el texto de la tabla y pégalo acá."
          : (d.avisos[0] ?? "No encontré nada que cotejar en lo que pegaste.")
        : null,
    parece: pareceDetalleSniffs,
    onLeido: (d) => setDetalle(d),
  });

  const cotejo = useMemo(() => {
    if (!detalle) return null;
    const leida = claveEspecie(detalle.especieComun ?? "");
    const suya = leida ? corridas?.find((c) => claveEspecie(c.especie) === leida) : undefined;
    return cotejarSniffsSinLote(
      detalle,
      suya ? { paquetes: suya.paquetes, especie: suya.especie } : { paquetes, especie },
    );
  }, [detalle, paquetes, especie, corridas]);

  if (detalle && cotejo && !lectura.leyendo) {
    return (
      <PanelCotejoSniffs
        detalle={detalle}
        cotejo={cotejo}
        fecha={fecha}
        especiesConocidas={especiesConocidas}
        onUsarFecha={onUsarFecha}
        onUsarEspecie={onUsarEspecie}
        onAnotar={onAnotar}
        miniatura={lectura.miniatura}
        onDescartar={() => {
          setDetalle(null);
          lectura.limpiar();
        }}
      />
    );
  }

  return (
    <ZonaPegarSniffs
      lectura={lectura}
      texto={
        <>
          pega la captura del «Detalle de la programación de producción» (<Tecla>Ctrl+V</Tecla>). No
          agrega paquetes —los m³ salen de lo que cubicaste— pero dice, producto por producto, si lo
          cubicado cuadra con lo que declaraste.
        </>
      }
    />
  );
}
