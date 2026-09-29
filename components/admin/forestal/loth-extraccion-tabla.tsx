"use client";

/**
 * La tabla de «Extracción», el centro de la vista (ADR-454 §6).
 *
 * «Todos»: una fila por permiso que se abre en sus especies. Un permiso: una
 * fila por especie. El pie es SIEMPRE una fila que mandó el servidor (el
 * total del alcance, o la especie elegida en todo el alcance): acá no se suma.
 *
 * En el celular sigue siendo tabla (`hoja-grilla`: las tarjetas automáticas del
 * panel apilarían 13 cifras por fila) con scroll a lo ancho y la primera
 * columna fija, para no perder de qué permiso es cada cifra.
 */

import { Fragment, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { ChevronRight } from "@buleje/design-system/icons";
import { FiltroColumna } from "@/components/admin/shared/filtros-columna";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { ExtraccionResponse } from "@/lib/forestal/loth-extraccion-tipos";
import { COLUMNAS_DE_CIFRAS, CORTE, CeldasDeFila } from "./loth-extraccion-celdas";
import { AYUDA_RECIBIDO_AL_DIA } from "./loth-extraccion-ayuda";
import { opcionesDeEspecie, vistaDeTabla, type FilaTabla } from "./loth-extraccion-shared";

/** La primera columna: fija al hacer scroll a lo ancho, opaca para tapar lo que pasa por debajo. */
const PRIMERA = "sticky left-0 z-[1] border-r border-[var(--rule-base)] px-2! py-1.5! text-left align-top";
const ANCHO_PRIMERA = "block w-32";

/**
 * Las tarjetas automáticas del panel (`.admin-mobile-cards`) no conocen el
 * pie: `hoja-grilla` devuelve thead y tbody a tabla, y esto hace lo mismo con
 * el `tfoot` — si no, el total quedaba como una tarjeta suelta bajo la tabla.
 */
const PIE_COMO_TABLA =
  "max-sm:[&_tfoot]:table-footer-group! max-sm:[&_tfoot_tr]:table-row! max-sm:[&_tfoot_td]:table-cell! max-sm:[&_tfoot_th]:table-cell! max-sm:[&_tfoot_td]:before:hidden! max-sm:[&_tfoot_th]:before:hidden!";

const GRUPOS: { label: string; span: number }[] = [
  { label: "Aprobado", span: 2 },
  { label: "Tala", span: 2 },
  { label: "Trozado", span: 2 },
  { label: "Despacho", span: 2 },
  { label: "Monte y planta", span: 3 },
];

const COLUMNAS: { label: string; corte?: boolean; alDia?: keyof typeof AYUDA_RECIBIDO_AL_DIA }[] = [
  { label: "Según censo", corte: true },
  { label: "Autorizado" },
  { label: "Talado", corte: true },
  { label: "Saldo" },
  { label: "Trozado", corte: true },
  { label: "Saldo" },
  { label: "Despachado", corte: true },
  { label: "Saldo" },
  { label: "En el monte", corte: true },
  { label: "Recibido en planta", alDia: "recibido" },
  { label: "Aserrado", alDia: "aserrado" },
];

function Nombre({ fila, abierto, onAlternar }: { fila: FilaTabla; abierto: boolean; onAlternar?: () => void }) {
  const texto = (
    <>
      {/* El código del permiso se parte en sus guiones antes que cortarse: «…-096» es lo que lo distingue. */}
      <span className="block break-words font-bold text-[var(--text-primary)]">{fila.etiqueta}</span>
      {fila.detalle && <span className="block truncate text-xs text-[var(--text-tertiary)]">{fila.detalle}</span>}
    </>
  );
  if (!onAlternar) return <span className={ANCHO_PRIMERA}>{texto}</span>;
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-expanded={abierto}
      title={abierto ? "Cerrar sus especies" : "Ver sus especies"}
      className={`${ANCHO_PRIMERA} flex items-start gap-1 rounded-md text-left hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40`}
    >
      <ChevronRight
        className={`mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform ${abierto ? "rotate-90" : ""}`}
        aria-hidden
      />
      <span className="min-w-0 flex-1">{texto}</span>
    </button>
  );
}

export default function LothExtraccionTabla({
  datos,
  especie,
  onEspecie,
}: {
  datos: ExtraccionResponse;
  especie: string | null;
  onEspecie: (clave: string | null) => void;
}) {
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(() => new Set());
  const vista = vistaDeTabla(datos, especie);
  const etiquetaDe = new Map(datos.especies.map((e) => [e.clave, e.etiqueta]));
  const alternar = (id: string) =>
    setAbiertos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  return (
    <DataTable
      filtrable
      className={`hoja-grilla text-sm ${PIE_COMO_TABLA}`}
      wrapperClassName="rounded-2xl bg-[var(--surface-raised)]"
      aria-label="Extracción por permiso: lo aprobado según censo y el saldo de cada operación"
    >
      <thead>
        <tr>
          <th rowSpan={2} scope="col" className={`${PRIMERA} bg-[var(--surface-sunken)]`}>
            <span className={ANCHO_PRIMERA}>
              {vista.modo === "permisos" ? "Permiso" : "Especie"}
              <FiltroColumna
                label="Especie"
                value={especie ?? undefined}
                options={opcionesDeEspecie(datos)}
                etiqueta={(v) => etiquetaDe.get(v) ?? v}
                onChange={(v) => onEspecie(v ?? null)}
                placeholder="Especies"
                className="w-full max-w-full!"
              />
            </span>
          </th>
          {GRUPOS.map((g, i) => (
            <th key={g.label} colSpan={g.span} scope="colgroup" className={`px-2! py-1! text-center! ${CORTE}`}>
              <span className="inline-flex items-center gap-1">
                {g.label}
                {i === 0 && (
                  <InfoTip
                    title="Aprobado según censo"
                    what="Lo censado menos los semilleros y los árboles bajo el diámetro mínimo."
                    affects="Es la base de los tres saldos: saldo = base − la operación."
                    example="Censo 563.401 m³ − semilleros 162.882 = 400.519 m³."
                    side="bottom"
                  />
                )}
              </span>
            </th>
          ))}
          <th rowSpan={2} scope="col" className={`px-1.5! py-1.5! text-right! align-bottom normal-case! tracking-normal! ${CORTE}`}>
            {/* El ⓘ debajo del rótulo: al lado, la columna medía 86 px y sacaba la tabla de la caja a 1280. */}
            <span className="inline-flex flex-col items-end gap-0.5">
              Avance
              <InfoTip
                title="Avance"
                what="Lo talado dividido entre el tope: lo autorizado, o el censo si no hay autorizado."
                affects="Ámbar desde el 80 %; rojo si pasa lo autorizado."
                example="Autorizado 80 m³ y talado 66 m³: 82 %, en ámbar."
                side="left"
              />
            </span>
          </th>
        </tr>
        <tr>
          {COLUMNAS.map((c, i) => (
            <th key={i} scope="col" className={`px-1! py-1.5! text-right align-bottom leading-tight normal-case! tracking-normal! ${c.corte ? CORTE : ""}`}>
              {c.alDia && datos.recibidoAlDia ? (
                /* Debajo del rótulo, como «Avance»: al lado ensancha la columna y la tabla sale de la caja a 1280. */
                <span className="inline-flex flex-col items-end gap-0.5">
                  {c.label}
                  <InfoTip title={`${c.label} · al día de hoy`} what={AYUDA_RECIBIDO_AL_DIA[c.alDia]} side="bottom" />
                </span>
              ) : (
                c.label
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {vista.filas.length === 0 && (
          <tr>
            <td colSpan={COLUMNAS_DE_CIFRAS + 1} className="px-3! py-6! text-center text-[var(--text-tertiary)]">
              Ningún permiso tiene esa especie.
            </td>
          </tr>
        )}
        {vista.filas.map((fila) => {
          const abre = fila.hijos.length > 0;
          const abierto = abre && abiertos.has(fila.id);
          return (
            <Fragment key={fila.id}>
              <tr>
                <th scope="row" className={`${PRIMERA} bg-[var(--surface-raised)] font-normal`}>
                  <Nombre fila={fila} abierto={abierto} onAlternar={abre ? () => alternar(fila.id) : undefined} />
                </th>
                <CeldasDeFila f={fila.fila} fuerte={vista.modo === "permisos"} />
              </tr>
              {abierto &&
                fila.hijos.map((h) => (
                  <tr key={`${fila.id}-${h.clave}`} className="bg-[var(--surface-sunken)]">
                    <th scope="row" className={`${PRIMERA} bg-[var(--surface-sunken)] font-normal`}>
                      <span className={`${ANCHO_PRIMERA} pl-5`}>
                        <span className="block truncate text-[var(--text-primary)]">{h.etiqueta}</span>
                        {h.fueraDelPlan && (
                          <span className="block text-xs font-bold text-[var(--data-warning-ink)]">fuera del plan</span>
                        )}
                      </span>
                    </th>
                    <CeldasDeFila f={h} />
                  </tr>
                ))}
            </Fragment>
          );
        })}
      </tbody>
      {vista.pie && (
        <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
          <tr>
            <th scope="row" className={`${PRIMERA} bg-[var(--surface-sunken)]`}>
              <span className={`${ANCHO_PRIMERA} font-bold text-[var(--text-primary)]`}>{vista.pie.etiqueta}</span>
            </th>
            <CeldasDeFila f={vista.pie.fila} fuerte />
          </tr>
        </tfoot>
      )}
    </DataTable>
  );
}
