/**
 * Cuándo se armó o se aserró un lote, en una línea, con el ⓘ de sus datos
 * (parte de `CtpLoteCard`, 27-09).
 *
 * Lo que antes eran renglones sueltos en el cuerpo de la tarjeta —la nota
 * larga («Armado desde la ficha del permiso… para 2 corridas sin materia…»),
 * la programación del SNIFFS («Proceso: 24 set. 2026 → sin cierre»), la
 * materia prima que consume y las «3 apartadas» del pie— vive ahora en ese ⓘ.
 * A la vista queda sólo la fecha de fin cuando existe: es la que vence.
 */

import type { ReactNode } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { labelProductoConsumible } from "@/lib/forestal/lote-programacion";
import {
  DIAS_LOTE_ANEJO,
  ORIGEN_LOTE_INVENTARIO,
  diasDeEspera,
  esLoteDeInventario,
  piezasLibres,
  type LoteAserrio,
} from "@/lib/forestal/lotes-aserrio";
import { fechaDelLibro } from "./permiso-volumen-ui";
import { ConTip } from "./ctp-lote-card-partes";

const Linea = ({ children }: { children: ReactNode }) => <span className="block">{children}</span>;

/** «del jueves 24/09 al martes 01/10», o «desde el jueves 24/09, sin fecha de fin». */
function ventanaDeProceso(inicio: string, fin: string | null | undefined): string {
  return fin
    ? `del ${fechaDelLibro(inicio)} al ${fechaDelLibro(fin)}`
    : `desde el ${fechaDelLibro(inicio)}, sin fecha de fin`;
}

const notaDe = (lote: LoteAserrio): string | null =>
  lote.notes && lote.notes !== ORIGEN_LOTE_INVENTARIO ? lote.notes : null;

function DatosDelLote({ lote }: { lote: LoteAserrio }) {
  const libres = piezasLibres(lote).length;
  const nota = notaDe(lote);
  return (
    <>
      {lote.speciesScientific && (
        <Linea>
          Especie: {lote.speciesCommon} (<i>{lote.speciesScientific}</i>)
        </Linea>
      )}
      {nota && <Linea>Nota: {nota}</Linea>}
      {esLoteDeInventario(lote) && <Linea>Inventario: se declaró por volumen, sin trozas del patio.</Linea>}
      {lote.ordenProduccion && <Linea>Orden de producción: {lote.ordenProduccion}</Linea>}
      {lote.tipoProductoConsumir && <Linea>Consume: {labelProductoConsumible(lote.tipoProductoConsumir)}</Linea>}
      {lote.inicioProceso && <Linea>Programado {ventanaDeProceso(lote.inicioProceso, lote.finProceso)}.</Linea>}
      {lote.piezas > 0 && (
        <Linea>
          {lote.piezas} pieza{lote.piezas === 1 ? "" : "s"} apartada{lote.piezas === 1 ? "" : "s"}
          {lote.status === "abierto" && libres < lote.piezas ? `, ${libres} sin aserrar` : ""}.
        </Linea>
      )}
    </>
  );
}

/** ¿Hay algo que decir en el ⓘ de datos? Sin nada, el ícono no se dibuja. */
function tieneDatos(lote: LoteAserrio): boolean {
  return Boolean(
    lote.speciesScientific ||
      notaDe(lote) ||
      esLoteDeInventario(lote) ||
      lote.ordenProduccion ||
      lote.tipoProductoConsumir ||
      lote.inicioProceso ||
      lote.piezas > 0,
  );
}

export function LoteCuando({ lote, ahora }: { lote: LoteAserrio; ahora: Date }) {
  const corrida = lote.produccion;
  const dias = diasDeEspera(lote, ahora);
  /* A partir de una semana lo dice el aviso de la tarjeta: acá no se repite. */
  const conAviso = dias != null && dias >= DIAS_LOTE_ANEJO && lote.piezas > 0;
  return (
    <ConTip
      className="items-start text-sm text-[var(--text-secondary)]"
      tip={
        tieneDatos(lote) ? (
          <InfoTip
            title={`Datos del lote ${lote.code}`}
            ariaLabel={`Más datos del lote ${lote.code}`}
            body={<DatosDelLote lote={lote} />}
          />
        ) : null
      }
    >
      {lote.status === "abierto" ? (
        <>
          Armado el {fechaDelLibro(lote.fechaApertura)}
          {dias != null && dias > 0 && !conAviso && ` · esperando ${dias} día${dias === 1 ? "" : "s"}`}
          {lote.finProceso && ` · termina el ${fechaDelLibro(lote.finProceso)}`}
        </>
      ) : (
        <>
          Aserrado el {fechaDelLibro(lote.fechaConsumo)}
          {corrida && (
            /* «corrida N° 95104» se parte entero, no «N°» en una línea y el
               número en la otra. */
            <>
              {" · "}
              <span className="whitespace-nowrap">
                corrida <b className="font-bold tabular-nums text-[var(--text-primary)]">N° {corrida.lineNo}</b>
              </span>
            </>
          )}
        </>
      )}
    </ConTip>
  );
}
