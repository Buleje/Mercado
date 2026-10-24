"use client";

/**
 * «Recorrido» de la ficha de una troza: la línea de tiempo vertical de lo que
 * le pasó —del bosque y la guía hasta la sierra, la salida o hoy—, con la
 * fecha de cada paso y lo que tardó cada tramo. Los pasos que no ocurrieron
 * se ven apagados: que una pieza no se haya apartado también es un dato.
 *
 * Las fechas y los tramos los arma `recorridoDeFicha` (puro, con test); acá
 * sólo se dice cada paso con sus detalles.
 */

import { FileText, Flame, Layers, PackageCheck, PackageOpen, Scissors, Truck } from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import type { EventoTroza } from "@/lib/forestal/planta-zona-types";
import { fraseDeMedidaEnPlanta } from "@/lib/forestal/tarjeta-troza";
import {
  eventosDelProducto, fechaDelLibro, recorridoDeFicha, textoTramo, trozaPatioDeFicha,
  type FichaTroza, type PasoRecorrido,
} from "@/lib/forestal/troza-ficha-recorrido";
import type { EstadoTroza } from "@/lib/forestal/trozas-patio";
import { HitoDelBosque } from "./ctp-arbol-de-la-troza";
import { Hito, Linea } from "./ctp-troza-ficha-partes";

const n = (v: number | null | undefined, d = 4) => (v == null ? "—" : v.toFixed(d));
const ENLACE = "font-mono font-bold text-[var(--accent-ink)] underline dark:text-[var(--accent)]";
const AVISO = "text-[var(--data-warning-ink)]";

interface Props {
  ficha: FichaTroza;
  eventos: readonly EventoTroza[];
  estado: EstadoTroza;
  hoyKey: string;
  onVerOtra?: (id: string) => void;
}

/** Un paso del recorrido, con lo que se sabe de él. */
function Paso({ p, ficha: f, eventos, estado, hoyKey, onVerOtra }: Props & { p: PasoRecorrido }) {
  const t = f.troza;
  const cuando = p.clave === "hoy" ? "hoy" : fechaDelLibro(p.fecha, hoyKey);
  const comun = { cuando, nota: p.fechaDe ? `fecha de la ${p.fechaDe}` : null, tramo: p.tramo ? textoTramo(p.tramo) : null };

  switch (p.clave) {
    case "guia":
      return <Hito icono={FileText} ocurrio titulo={`Entró con la GTF ${f.ingreso.gtfNumber}`} {...comun} />;

    case "recepcion": {
      /* TRES estados, no dos: «no llegó» es distinto de «no consta que haya
         llegado». Decir «se recibió» sin fecha ni visto bueno sería afirmar
         algo que el libro no dice, que es justo lo que revisa una fiscalización. */
      const recibida = trozaPatioDeFicha(f).guiaRecepcionada !== false;
      return (
        <Hito
          icono={PackageCheck}
          ocurrio={!t.noRecepcionada && recibida}
          tono={t.noRecepcionada ? "warn" : "ok"}
          titulo={t.noRecepcionada ? "Nunca bajó del camión" : recibida ? "Se recibió en planta" : "Sin constancia de recepción"}
          {...comun}
        >
          {t.noRecepcionada ? (
            <p className={AVISO}>La guía la declara, pero el centro no la recibió: no cuenta como madera disponible.</p>
          ) : !recibida ? (
            <p>Nadie registró la descarga de esta carga: no hay fecha de recepción ni está validada en el libro.</p>
          ) : (
            <Linea k="Código de planta" v={t.codigoPlanta ?? "sin marcar"} mono />
          )}
          {/* Llegó distinta (ADR-450): lo medido en planta, aparte; la guía no se toca. */}
          <Linea k="Llegó distinta" v={t.noRecepcionada ? null : fraseDeMedidaEnPlanta(t.recibida ?? null, t.volumenM3)} />
          <Linea k="Observación" v={t.recepcionObs} />
        </Hito>
      );
    }

    case "pedazo":
      return (
        <Hito icono={Scissors} ocurrio titulo="Es un pedazo de otra troza" {...comun}>
          {f.madre && (
            <p>
              Salió de{" "}
              <button type="button" onClick={() => onVerOtra?.(f.madre!.id)} className={ENLACE}>
                {f.madre.codificacion ?? f.madre.codigoPlanta ?? "la madre"}
              </button>
              {f.madre.volumenM3 != null && <> ({n(f.madre.volumenM3)} m³)</>}
            </p>
          )}
        </Hito>
      );

    case "lote": {
      const titulo = f.lote
        ? `Apartada en el lote ${f.lote.code}`
        : f.loteMixto ? `En el lote mixto ${f.loteMixto.code}` : "Sin apartar en ningún lote";
      return (
        <Hito icono={Layers} ocurrio={Boolean(f.lote || f.loteMixto)} titulo={titulo} {...comun}>
          {f.lote ? (
            <Linea k="Estado del lote" v={f.lote.status === "abierto" ? "abierto — todavía no entró a la sierra" : f.lote.status} />
          ) : f.loteMixto ? (
            <p>Está en la pila escaneada: al repartir el mixto pasa a su lote de aserrío.</p>
          ) : estado === "por_recepcionar" ? (
            <p>Primero tiene que recibirse su guía: hasta entonces no se puede apartar.</p>
          ) : (
            <p>Está suelta en el patio: cualquier corrida puede tomarla.</p>
          )}
        </Hito>
      );
    }

    case "retrozo":
      return (
        <Hito icono={Scissors} ocurrio titulo={`Se cortó en ${f.retrozos.length} ${f.retrozos.length === 1 ? "pedazo" : "pedazos"}`} {...comun}>
          <p className="mb-1">Su madera siguió viaje en estas piezas — por eso la troza entera ya no se puede consumir.</p>
          <ul className="space-y-1">
            {f.retrozos.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 rounded-lg bg-[var(--surface-sunken)] px-2 py-1">
                <button type="button" onClick={() => onVerOtra?.(r.id)} className={`text-xs ${ENLACE}`}>
                  {r.codificacion ?? r.codigoPlanta ?? "pedazo"}
                </button>
                <span className="font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-secondary)]">
                  {n(r.volumenM3)} m³ · {n(r.d1Cm, 0)}·{n(r.d2Cm, 0)} cm · {n(r.largoM, 2)} m
                </span>
                {r.descarte && <span className="rounded bg-[var(--data-warning-500)]/18 px-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)]">descarte</span>}
                {r.usada && <span className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">ya se usó</span>}
              </li>
            ))}
          </ul>
        </Hito>
      );

    case "corrida": {
      const c = f.corrida!;
      const producto = eventosDelProducto(f, eventos);
      return (
        <Hito
          icono={Flame}
          ocurrio={c.vigente}
          tono={c.vigente ? "ok" : "warn"}
          titulo={c.vigente ? `Se aserró en la corrida #${c.lineNo}` : `Estuvo en la corrida #${c.lineNo}, que se anuló`}
          {...comun}
        >
          {!c.vigente && <p className={AVISO}>La corrida se anuló, así que esta madera volvió al patio.</p>}
          <Linea k="Producto" v={[c.producto, c.presentacion].filter(Boolean).join(" · ") || null} />
          <Linea k="Declarado" v={c.cantidad != null ? `${n(c.cantidad)} ${c.unidad ?? ""}`.trim() : null} mono />
          <Linea k="Rendimiento" v={c.rendimientoPct != null ? `${n(c.rendimientoPct, 2)} %` : null} mono />
          <Linea k="Línea" v={c.linea === "LRE" ? "LRE — recuperación" : c.linea} />
          {producto.length > 0 && (
            <div className="mt-1.5 rounded-lg bg-[var(--surface-sunken)] px-2 py-1.5">
              <p className="font-bold text-[var(--text-primary)]">Lo que pasó con el producto de esa corrida</p>
              <ul className="mt-0.5 space-y-0.5">
                {producto.map((e, i) => (
                  <li key={`${e.tipo}-${e.fecha}-${i}`}>
                    <span className="font-mono tabular-nums">{fechaDelLibro(e.fecha, hoyKey)}</span> · {e.detalle ?? e.ref}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Hito>
      );
    }

    case "despacho": {
      const d = f.despacho!;
      return (
        <Hito
          icono={Truck}
          ocurrio={d.vigente}
          tono={d.vigente ? "ok" : "warn"}
          titulo={d.vigente ? "Salió entera, sin aserrar" : `Estuvo en el despacho #${d.lineNo}, que se anuló`}
          {...comun}
        >
          {!d.vigente && <p className={AVISO}>El despacho se anuló: la troza volvió al patio.</p>}
          <Linea k={d.docType ?? "Guía de salida"} v={d.gtfNumber} mono />
          <Linea k="Cantidad" v={d.cantidad != null ? `${n(d.cantidad)} ${d.unidad ?? ""}`.trim() : null} mono />
        </Hito>
      );
    }

    case "hoy":
      return (
        <Hito
          icono={PackageOpen}
          ocurrio={false}
          titulo={estado === "por_recepcionar" ? "Hoy: su guía sigue en la bandeja" : "Hoy: sigue en el patio"}
          {...comun}
        >
          <p>No entró a ninguna corrida vigente ni salió con ninguna guía.</p>
        </Hito>
      );
  }
}

export function RecorridoDeLaTroza(props: Props) {
  const { ficha: f, eventos, estado, hoyKey } = props;
  const pasos = recorridoDeFicha(f, eventos, estado, hoyKey);
  return (
    <section aria-labelledby="troza-ficha-recorrido" className="min-w-0 space-y-2">
      <Kicker as="h3" id="troza-ficha-recorrido">Recorrido</Kicker>
      <ol>
        {/* Del bosque (ADR-450): el árbol es lo que pasó antes de la guía. */}
        <HitoDelBosque arbol={f.arbol} arbolCodigo={f.troza.arbolCodigo} />
        {pasos.map((p) => (
          <Paso key={p.clave} p={p} {...props} />
        ))}
      </ol>
    </section>
  );
}
