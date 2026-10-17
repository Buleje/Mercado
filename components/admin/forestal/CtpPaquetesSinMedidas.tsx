"use client";

/**
 * Paquetes sin medidas en la campana de avisos del libro, con su arreglo al lado.
 *
 * Un paquete puede entrar al libro sin espesor, ancho o largo (en Blas, 34 de 835,
 * repartidos en 15 corridas). Sin las tres no se recalcula el volumen, el freno de
 * cifras imposibles cae a su criterio flojo y no se imprime la lista de empaque —
 * y hasta ahora sólo se notaba mirando la celda MEDIDAS de cada fila. Acá sale sola,
 * agrupada por corrida, diciendo qué medida falta, y se arregla sin cambiar de
 * pestaña:
 *
 *  · **Poner medidas** — abre el MISMO editor de escuadría de Productos disponibles
 *    y la ficha (`CtpEscuadriaPaqueteModal`), que se tipea en pulgadas y pies, se
 *    guarda en cm y m y no pisa el volumen declarado. No hay un segundo editor.
 *
 * No es un indicador (memoria `deuda-no-es-indicador`): pide trabajo, así que no
 * va a la grilla de KPIs y no se dibuja cuando no hay ninguno.
 *
 * El botón sólo sale a quien el servidor deja escribir (`puedePedir` con el MISMO
 * array del PATCH) y sobre un mes abierto: el almacenero ve qué falta pero no un
 * botón que le respondería 403, y un paquete de un mes cerrado dice que hay que
 * reabrirlo en vez de ofrecer un botón que el servidor rechazaría.
 */

import { useMemo, useState } from "react";
import { CheckCircle2, Lock, Ruler } from "@buleje/design-system/icons";
import { useMiRol } from "@/hooks/use-mi-rol";
import { puedePedir } from "@/lib/auth/roles-rutas-panel";
import { formatNumber } from "@/lib/format";
import {
  agruparPorCorrida,
  avisoDeRecorte,
  resumenPaquetesSinMedidas,
  rotuloDeCorrida,
  textoMedidaQueFalta,
  type PaqueteSinMedidas,
} from "@/lib/forestal/paquetes-sin-medidas";
import { guardarEscuadriaDePaquete, type EscuadriaAGuardar } from "@/lib/forestal/escuadria-guardar";
import { Btn } from "./ctp-shared";
import CtpEscuadriaPaqueteModal, { type PaqueteAMedir } from "./CtpEscuadriaPaqueteModal";

const ROTULO =
  "mb-2 flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";

/** Lo que pide el editor de escuadría, desde el paquete del aviso. */
function paqueteAMedirDe(p: PaqueteSinMedidas): PaqueteAMedir {
  return {
    id: p.id,
    codigo: p.codigo,
    ctpEntryId: p.ctpEntryId,
    lineNo: p.lineNo,
    producto: p.producto,
    especie: p.especie,
    cantidad: p.cantidad,
    volumenM3: p.volumenM3,
    espesorCm: p.espesorCm,
    anchoCm: p.anchoCm,
    largoM: p.largoM,
  };
}

export default function CtpPaquetesSinMedidas({
  paquetes,
  total,
  enElPatio,
  ahora,
  className = "",
}: {
  paquetes: readonly PaqueteSinMedidas[];
  /** Cuántos hay EN TOTAL: `paquetes` puede venir recortada por el servidor. */
  total: number;
  /** De ésos, cuántos siguen en el patio (la cifra de la pestaña Productos disponibles). */
  enElPatio?: number;
  /** El «hoy» del año del rótulo. Por defecto el reloj; se pasa para probarlo. */
  ahora?: Date;
  /** El margen lo decide quien la ubica: no se dibuja nada cuando no hay paquetes. */
  className?: string;
}) {
  const [aMedir, setAMedir] = useState<PaqueteAMedir | null>(null);
  /* El resultado vive acá y no en la fila: la fila desaparece al guardarse (la
     campana vuelve a leer sola), y el «listo» tiene que seguir a la vista. */
  const [aviso, setAviso] = useState<string | null>(null);
  const rol = useMiRol();
  const puedeCambiar = puedePedir("PATCH /api/admin/forestal/ctp", rol);
  /* Con el rol todavía cargando (`null`) no hay botones, pero tampoco se afirma
     que falte permiso: a un admin le parpadearía «lo hace el dueño». */
  const sinPermiso = rol != null && !puedeCambiar;
  const corridas = useMemo(() => agruparPorCorrida(paquetes), [paquetes]);

  async function guardar(medidas: EscuadriaAGuardar) {
    /* Si falla, la excepción llega al modal, que la muestra y sigue abierto. */
    await guardarEscuadriaDePaquete(medidas);
    setAviso(`Medidas puestas: el paquete ${aMedir?.codigo ?? ""} ya tiene su escuadría.`);
    setAMedir(null);
  }

  if (paquetes.length === 0 && !aviso) return null;
  const recorte = avisoDeRecorte(paquetes.length, total);
  return (
    <section aria-label="Paquetes sin medidas" className={className}>
      {paquetes.length > 0 && (
        <>
          <p className={ROTULO}>
            <Ruler className="h-3.5 w-3.5" aria-hidden /> {resumenPaquetesSinMedidas(total, enElPatio)}
          </p>
          <p className="mb-2 text-sm text-[var(--text-secondary)]">
            Sin las tres medidas no se recalcula el volumen ni se imprime la lista de empaque.
          </p>
          {sinPermiso && (
            <p className="mb-2 text-sm text-[var(--text-secondary)]">
              Poner las medidas lo hace el dueño o el administrador: avísale para que las cargue.
            </p>
          )}
          <ul className="space-y-2">
            {corridas.map((c) => (
              <li
                key={c.ctpEntryId}
                className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]"
              >
                <div className="bg-[var(--surface-sunken)] px-3 py-2">
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    {rotuloDeCorrida(c, ahora ?? new Date())}
                  </p>
                  {(c.especie || c.producto) && (
                    <p className="text-sm text-[var(--text-secondary)]">
                      {[c.especie, c.producto].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <ul className="divide-y divide-[var(--rule-soft)]">
                  {c.paquetes.map((p) => (
                    <FilaPaquete
                      key={p.id}
                      paquete={p}
                      puedeCambiar={puedeCambiar}
                      onMedir={() => setAMedir(paqueteAMedirDe(p))}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {recorte && <p className="mt-2 text-sm text-[var(--text-tertiary)]">{recorte}</p>}
        </>
      )}
      {aviso && (
        <p
          role="status"
          className="mt-2 flex items-start gap-2 text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {aviso}
        </p>
      )}
      {aMedir && (
        <CtpEscuadriaPaqueteModal paquete={aMedir} onCerrar={() => setAMedir(null)} onGuardar={guardar} />
      )}
    </section>
  );
}

function FilaPaquete({
  paquete: p,
  puedeCambiar,
  onMedir,
}: {
  paquete: PaqueteSinMedidas;
  /** Sin permiso de escritura se lee qué falta, sin botón. */
  puedeCambiar: boolean;
  onMedir: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="min-w-0">
        <p className="text-sm text-[var(--text-secondary)]">
          <span className="break-all font-mono font-bold text-[var(--text-primary)]">{p.codigo}</span>
          {" · "}
          {p.cantidad > 0 ? `${formatNumber(p.cantidad, 0)} ${p.cantidad === 1 ? "pieza" : "piezas"}` : "sin piezas"}
          {" · "}
          <span className="font-mono tabular-nums">{formatNumber(p.volumenM3, 3)} m³</span>
        </p>
        <p className="text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          {textoMedidaQueFalta(p.faltan)}
        </p>
      </div>
      {puedeCambiar &&
        (p.periodoCerrado ? (
          <p className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)]">
            <Lock className="h-4 w-4 shrink-0" aria-hidden /> Mes cerrado: reábrelo para medirlo
          </p>
        ) : (
          <Btn
            className="w-full sm:w-auto"
            onClick={onMedir}
            aria-label={`Poner medidas al paquete ${p.codigo}`}
          >
            <Ruler className="h-4 w-4" aria-hidden />
            Poner medidas
          </Btn>
        ))}
    </li>
  );
}
