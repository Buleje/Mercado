"use client";

/**
 * Ficha de una ZONA del croquis: cuánto hay parado ahí (PT primero, después m³
 * y piezas), de qué especie, con qué permiso y de qué dueño, y la lista de
 * pilas y trozas sueltas que tiene adentro. Tocar una fila abre su ficha.
 */

import { useMemo, useState } from "react";
import { Edit3, Truck, Boxes, Layers } from "@buleje/design-system/icons";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import { codigoTroza, fmtMedidaCorta, resumirZonaCroquis, especieDe, type ContenidoZona, type GrupoMedida } from "@/lib/forestal/planta-croquis";
import { zonaTipoMeta, type PlantaZona } from "@/lib/forestal/planta-zona-types";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "./ctp-lotes-modal-marco";
import type { SeleccionCroquis } from "./hooks/use-croquis-leaflet";

type Eje = "especie" | "permiso" | "dueno";

const fila = "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-sunken)]";

function Cifra({ label, valor, fuerte }: { label: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={`rounded-xl px-2.5 py-2 ${fuerte ? "bg-[var(--accent-soft)]" : "bg-[var(--surface-sunken)]"}`}>
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p className={`font-bold tabular-nums text-[var(--text-primary)] ${fuerte ? "text-lg" : "text-base"}`}>{valor}</p>
    </div>
  );
}

function Grupo({ g }: { g: GrupoMedida }) {
  return (
    <li className="flex items-baseline justify-between gap-2 py-1 text-sm">
      <span className="min-w-0 truncate text-[var(--text-secondary)]">{g.clave}</span>
      <span className="shrink-0 tabular-nums font-semibold text-[var(--text-primary)]">
        {fmtMedidaCorta({ pt: g.pt || null, m3: g.m3 || null, piezas: g.piezas || null }) ?? "—"}
        {g.pt > 0 && g.m3 > 0 && <span className="ml-1.5 font-normal text-[var(--text-tertiary)]">{formatNumber(g.m3, { max: 2 })} m³</span>}
      </span>
    </li>
  );
}

export default function CtpPlantaCroquisFichaZona({ zona, contenido, onAbrir, onEditar, onDespachar }: {
  zona: PlantaZona;
  contenido: ContenidoZona | undefined;
  onAbrir: (s: SeleccionCroquis) => void;
  onEditar: () => void;
  onDespachar: () => void;
}) {
  const [eje, setEje] = useState<Eje>("especie");
  const r = useMemo(() => resumirZonaCroquis(contenido), [contenido]);
  const meta = zonaTipoMeta(zona.tipo);
  const pilas = (contenido?.pilas ?? []).filter((p) => !p.vacia);
  const sueltas = contenido?.sueltas ?? [];
  const grupos = eje === "especie" ? r.porEspecie : eje === "permiso" ? r.porPermiso : r.porDueno;
  const puedeDespachar = zona.tipo === "reserva" && pilas.some((p) => p.item.kind === "producto");

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: meta.ring }} />
        {meta.label}{zona.areaM2 != null ? ` · ${formatNumber(Math.round(zona.areaM2))} m²` : ""}
      </p>

      {r.pilas + r.sueltas === 0 ? (
        <p className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5 text-sm text-[var(--text-secondary)]">
          Zona vacía. Toca una guía de la lista y después esta zona.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Cifra label="Pie tablar" valor={r.pt > 0 ? formatNumber(r.pt, { max: 0 }) : "—"} fuerte />
            <Cifra label="m³" valor={r.m3 > 0 ? formatNumber(r.m3, { max: 2 }) : "—"} />
            <Cifra label="Piezas" valor={r.piezas > 0 ? formatNumber(r.piezas) : "—"} />
          </div>
          {r.sinPt > 0 && (
            <p className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
              PT parcial: {r.sinPt} {r.sinPt === 1 ? "línea no trae" : "líneas no traen"} pie tablar
              <InfoTip title="PT parcial" what="Algunas guías o corridas no tienen su pie tablar cargado; el total suma solo las que sí." example="Una troza sin medidas Oxapampino solo aporta su m³." />
            </p>
          )}

          <div>
            <SegmentedControl<Eje>
              size="sm"
              value={eje}
              onChange={setEje}
              label="Desglose de la zona"
              options={[{ value: "especie", label: "Especie" }, { value: "permiso", label: "Permiso" }, { value: "dueno", label: "Dueño" }]}
            />
            <ul className="mt-1.5 divide-y divide-[var(--rule-soft)]">{grupos.map((g) => <Grupo key={g.clave} g={g} />)}</ul>
          </div>

          {pilas.length > 0 && (
            <section>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]"><Boxes className="h-3.5 w-3.5" /> Pilas ({pilas.length})</p>
              <ul className="max-h-56 overflow-y-auto">
                {pilas.map((p) => (
                  <li key={p.item.id}>
                    <button type="button" className={fila} onClick={() => onAbrir({ tipo: "pila", id: p.item.id })}>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-[var(--text-primary)]">{p.item.label}</span>
                        <span className="block truncate text-xs text-[var(--text-tertiary)]">{[especieDe(p.item), p.item.dueno].filter(Boolean).join(" · ") || "—"}{p.separadas > 0 ? ` · ${p.separadas} separada${p.separadas === 1 ? "" : "s"}` : ""}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-xs font-bold text-[var(--text-secondary)]">{fmtMedidaCorta(p.medida) ?? "—"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {sueltas.length > 0 && (
            <section>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]"><Layers className="h-3.5 w-3.5" /> Trozas sueltas ({sueltas.length})</p>
              <ul className="max-h-48 overflow-y-auto">
                {sueltas.map((s) => (
                  <li key={s.troza.id}>
                    <button type="button" className={fila} onClick={() => onAbrir({ tipo: "troza", id: s.troza.id })}>
                      <span className="min-w-0">
                        <span className="block truncate font-mono font-semibold text-[var(--text-primary)]">{codigoTroza(s.troza)}</span>
                        <span className="block truncate text-xs text-[var(--text-tertiary)]">de {s.pila.label}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-xs font-bold text-[var(--text-secondary)]">{fmtMedidaCorta(s.medida) ?? "—"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {puedeDespachar && <button type="button" onClick={onDespachar} className={BOTON_PRIMARIO}><Truck className="h-4 w-4" /> Emitir guía</button>}
        <button type="button" onClick={onEditar} className={BOTON_SECUNDARIO}><Edit3 className="h-4 w-4" /> Editar zona</button>
      </div>
    </div>
  );
}
