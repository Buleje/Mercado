"use client";

/**
 * «Qué parte del lote se usa» — el cuadro resumen con casillas (Brandon
 * 2026-10-27). Por tipo, especie, dueño, espesor o largo; lo desmarcado sigue
 * en el cubicador pero no entra a Resúmenes ni a la Distribución.
 *
 * Se trabaja sobre un BORRADOR y se aplica con el botón: cada clic no vuelve a
 * repartir la Distribución que está detrás, y el aviso de lo que ya pasó al
 * Libro se lee ANTES de cambiar, no después.
 */
import { useMemo, useState } from "react";
import { DataTable, WarningAlert } from "@buleje/design-system";
import { ListChecks } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { Casilla } from "@/components/ui-system/Casilla";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { button } from "@/components/ui-system/button-variants";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { fmtM3, fmtPct, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import {
  cuadroDeUso,
  dimensionesOfrecidas,
  esUsoParcial,
  ETIQUETA_USO,
  filtrarPorUso,
  ponerUso,
  TODO_EL_LOTE,
  totalesUso,
  type DimensionUso,
  type FueraDelLote,
} from "@/lib/forestal/cubicacion-uso";
import { leerLoQueYaEstaEnElLibro } from "./hooks/use-uso-del-lote";

const mismos = (a: FueraDelLote, b: FueraDelLote) => JSON.stringify(a) === JSON.stringify(b);

export default function UsoDelLoteModal({
  todas,
  fuera,
  onGuardar,
  onCerrar,
}: {
  /** El lote ENTERO del cubicador. */
  todas: readonly PiezaCubicada[];
  fuera: FueraDelLote;
  onGuardar: (fuera: FueraDelLote) => void;
  onCerrar: () => void;
}) {
  const [borrador, setBorrador] = useState<FueraDelLote>(fuera);
  const [dim, setDim] = useState<DimensionUso>("tipo");
  const dims = useMemo(() => dimensionesOfrecidas(todas, borrador), [todas, borrador]);
  const filas = useMemo(() => cuadroDeUso(todas, dim, borrador), [todas, dim, borrador]);
  const total = useMemo(() => totalesUso(todas), [todas]);
  const usado = useMemo(() => totalesUso(filtrarPorUso(todas, borrador)), [todas, borrador]);
  /* Se lee al abrir: la Distribución no está montada al lado del cubicador. */
  const enLibro = useMemo(leerLoQueYaEstaEnElLibro, []);

  const parcial = esUsoParcial(borrador);
  const cambio = !mismos(borrador, fuera);
  const marcadas = filas.filter((f) => f.usada).length;
  const claves = filas.map((f) => f.clave);
  const sinNada = usado.piezas === 0;
  const avisoLibro = cambio && enLibro.bloques + enLibro.lineas > 0;

  const aplicar = () => {
    onGuardar(borrador);
    onCerrar();
  };

  return (
    <AdminModal
      open
      onClose={onCerrar}
      size="lg"
      icon={ListChecks}
      title="Qué parte del lote se usa"
      ayuda={
        <InfoTip
          what="Desmarca lo que no va. No se borra: sigue en el cubicador, pero no entra a Resúmenes, a la Distribución ni a lo que se declara desde ahí."
          affects="Se combina: una pieza entra si su tipo, su especie, su dueño, su espesor y su largo están marcados. Un tipo o una especie nueva que cargues entra sola."
          example="Sólo comercial y paquetería de Tornillo: en Tipo desmarca Corta y Tabla; en Especie, las otras maderas."
        />
      }
      footer={
        <ModalFooter
          error={
            sinNada ? "Así no entra ninguna pieza: marca al menos un tipo y una especie." : null
          }
          nota={
            <span className="flex flex-col font-mono tabular-nums" data-uso-nota>
              <span className="whitespace-nowrap">
                Se usa {fmtPiezas(usado.piezas)} de {fmtPiezas(total.piezas)} pzas
              </span>
              <span className="whitespace-nowrap">
                {fmtPt(usado.pt)} de {fmtPt(total.pt)} PT · {fmtM3(usado.m3)} m³
              </span>
            </span>
          }
        >
          {parcial && (
            <button
              type="button"
              onClick={() => setBorrador(TODO_EL_LOTE)}
              className={button({ variant: "secondary" })}
            >
              Marcar todo
            </button>
          )}
          <button type="button" onClick={onCerrar} className={button({ variant: "secondary" })}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={!cambio || sinNada}
            onClick={aplicar}
            className={button({ variant: "accent" })}
            data-uso-aplicar
          >
            {parcial ? "Usar esta parte" : "Usar todo el lote"}
          </button>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-4`}>
        {avisoLibro && (
          <WarningAlert
            title="Lo que ya pasó al Libro no cambia"
            description={
              <span>
                {[
                  enLibro.bloques > 0
                    ? `${enLibro.bloques} ${enLibro.bloques === 1 ? "bloque tiene" : "bloques tienen"} lote en el Libro`
                    : null,
                  enLibro.lineas > 0
                    ? `${enLibro.lineas} ${enLibro.lineas === 1 ? "línea está marcada" : "líneas están marcadas"} «Distribuido»`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" y ")}
                . La Distribución se vuelve a repartir con esta parte: revisa esos bloques antes de
                declarar más.
              </span>
            }
          />
        )}

        <SegmentedControl
          value={dim}
          onChange={setDim}
          size="lg"
          label="Elegir por"
          options={dims.map((d) => {
            const n = borrador[d]?.length ?? 0;
            return { value: d, label: ETIQUETA_USO[d], badge: n > 0 ? `${n} fuera` : undefined };
          })}
        />

        <DataTable className="w-full" data-uso-tabla={dim}>
          <caption className="sr-only">Qué {ETIQUETA_USO[dim].toLowerCase()} se usa</caption>
          <thead>
            <tr>
              <th scope="col" className="w-12">
                <Casilla
                  checked={marcadas === filas.length && filas.length > 0}
                  indeterminada={marcadas > 0 && marcadas < filas.length}
                  onChange={() =>
                    setBorrador((b) => ponerUso(b, dim, claves, marcadas < filas.length))
                  }
                  aria-label={marcadas < filas.length ? "Marcar todos" : "Desmarcar todos"}
                />
              </th>
              <th scope="col">{ETIQUETA_USO[dim]}</th>
              <th scope="col" className="text-right">
                Piezas
              </th>
              <th scope="col" className="text-right">
                PT
              </th>
              <th scope="col" className="text-right">
                m³
              </th>
              <th scope="col" className="text-right">
                % del PT
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave} data-usada={f.usada ? "si" : "no"}>
                <td>
                  <Casilla
                    checked={f.usada}
                    onChange={() => setBorrador((b) => ponerUso(b, dim, [f.clave], !f.usada))}
                    aria-label={`Usar ${f.label}`}
                  />
                </td>
                <td>
                  <span
                    className={
                      f.usada
                        ? "font-bold text-[var(--text-primary)]"
                        : "text-[var(--text-tertiary)] line-through"
                    }
                  >
                    {f.label}
                  </span>
                  {!f.usada && (
                    <span className="ml-2 text-xs font-bold text-[var(--text-tertiary)]">
                      no se usa
                    </span>
                  )}
                </td>
                <td className="text-right tabular-nums">{fmtPiezas(f.piezas)}</td>
                <td className="text-right tabular-nums">{fmtPt(f.pt)}</td>
                <td className="text-right tabular-nums">{fmtM3(f.m3)}</td>
                <td className="text-right tabular-nums">{fmtPct(f.pct)}%</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </AdminModal>
  );
}
