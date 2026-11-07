"use client";

/**
 * CtpDespachoViajeLineas — la lista del POSIBLE viaje, para que el dueño lo
 * confirme antes de anotar la GRE o poner el precio.
 *
 * El servidor propone (`ForestCtpDespachoDB.viajeDe`): las salidas del mismo
 * día que van al mismo cliente o en el mismo camión, marcadas sólo las que no
 * chocan con ninguna otra. Con A placa ABC, B sin placa y C placa XYZ,
 * abriendo B ni A ni C van marcadas: no pueden ir juntas y no hay cómo saber
 * cuál es. Lo que se manda es lo marcado aquí, y el servidor vuelve a validar
 * todos los pares.
 *
 * Sin placa (las 7 de Blas del 28-10 no la tienen) «mismo viaje» es sólo
 * mismo día + mismo cliente: se avisa y se ofrece escribir la placa, que
 * queda aparte de la GTF impresa.
 */

import { useState } from "react";
import { WarningAlert } from "@buleje/design-system";
import { Loader2 } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatNumber } from "@/lib/format";
import { gresDistintas, gtfCorta, type LineaDelViaje, type ViajeDeDespacho } from "@/lib/forestal/despacho-viaje";
import { Btn, I } from "./ctp-shared";

const lista = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/**
 * Por qué lo marcado NO puede ser un viaje (null = sí puede): dos que chocan
 * entre sí o dos GRE distintas ya anotadas. Lo mismo que rechaza el servidor.
 */
export function bloqueoDelViaje(viaje: ViajeDeDespacho, marcadas: ReadonlySet<string>): string | null {
  const choque = viaje.choques.find((c) => marcadas.has(c.a) && marcadas.has(c.b));
  if (choque) return `No pueden ir juntas: ${choque.motivo}. Desmarca una.`;
  const gres = gresDistintas(viaje.lineas.filter((l) => marcadas.has(l.id)).map((l) => l.gre));
  if (gres.length > 1) return `Las líneas marcadas tienen guías de remisión distintas (${lista(gres)}): no son el mismo viaje. Desmarca las que no van.`;
  return null;
}

function detalle(l: LineaDelViaje): string {
  return [
    l.gtfNumber ? `GTF ${gtfCorta(l.gtfNumber)}` : "sin GTF",
    [l.productType, l.speciesCommon].filter(Boolean).join(" · "),
    l.pt != null ? `${formatNumber(l.pt, 2)} PT` : l.m3 != null ? `${formatNumber(l.m3, 3)} m³` : "",
    l.placa ? `placa ${l.placa}` : "sin placa",
    l.gre ? `GRE ${l.gre}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function CtpDespachoViajeLineas({
  despachoId,
  viaje,
  marcadas,
  onMarcar,
  onPlacaGuardada,
}: {
  despachoId: string;
  viaje: ViajeDeDespacho;
  marcadas: ReadonlySet<string>;
  onMarcar: (id: string, marcar: boolean) => void;
  onPlacaGuardada: (aviso: string) => void;
}) {
  const [placa, setPlaca] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seleccionadas = viaje.lineas.filter((l) => marcadas.has(l.id));
  const sinPlaca = seleccionadas.filter((l) => !l.placa);
  const bloqueo = bloqueoDelViaje(viaje, marcadas);

  async function guardarPlaca() {
    if (!placa.trim()) return setError("Escribe la placa del camión (por ejemplo W2D-853).");
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp", {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          id: despachoId,
          action: "placa_viaje",
          placa: placa.trim(),
          viaje: seleccionadas.map((l) => l.id).filter((id) => id !== despachoId),
        }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.message ?? `HTTP ${r.status}`);
      setPlaca("");
      onPlacaGuardada(`Placa ${json.placa} anotada en ${json.anotadas} ${json.anotadas === 1 ? "línea" : "líneas"} del viaje.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  if (viaje.lineas.length < 2) return null;
  return (
    <div className="space-y-2">
      <ul className="space-y-1" aria-label="Líneas del viaje">
        {viaje.lineas.map((l) => {
          const propia = l.id === despachoId;
          return (
            <li key={l.id}>
              <label className={`flex items-start gap-2 text-sm ${l.compatible ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]"}`}>
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  checked={marcadas.has(l.id)}
                  disabled={propia || !l.compatible}
                  onChange={(e) => onMarcar(l.id, e.target.checked)}
                />
                <span className="min-w-0">
                  <strong className="font-mono text-[var(--text-primary)]">#{l.lineNo}</strong> {detalle(l)}
                  {propia && <span className="text-[var(--text-tertiary)]"> · esta</span>}
                  {l.motivo && <span className="block text-[var(--text-tertiary)]">{l.motivo}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {bloqueo && <WarningAlert title={bloqueo} />}

      {seleccionadas.length > 1 && sinPlaca.length > 0 && (
        <WarningAlert
          title="Sin placa: confirma que es el mismo camión"
          description={`${sinPlaca.length === seleccionadas.length ? "Ninguna línea marcada tiene" : `${lista(sinPlaca.map((l) => `#${l.lineNo}`))} no ${sinPlaca.length === 1 ? "tiene" : "tienen"}`} placa. La guía de remisión la pide igual: escríbela y la GTF impresa no cambia.`}
        >
          <div className="flex gap-2 pt-1">
            <input
              className={I}
              value={placa}
              onChange={(e) => setPlaca(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") void guardarPlaca(); }}
              placeholder="W2D-853"
              aria-label="Placa del camión"
              maxLength={12}
            />
            <Btn variant="secondary" disabled={guardando || !placa.trim() || Boolean(bloqueo)} onClick={() => void guardarPlaca()}>
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar placa
            </Btn>
          </div>
          {error && <p role="alert" className="text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
        </WarningAlert>
      )}
    </div>
  );
}
