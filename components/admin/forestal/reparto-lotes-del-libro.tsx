"use client";

/**
 * Pestaña «Lotes del Libro» del panel «Lotes» (03-10): un lote abierto con
 * rolliza libre se trae como bloque nuevo o se vincula a un bloque que no
 * tiene lote (típicamente uno cargado a mano). Al vincular, el bloque toma el
 * `loteId` y las trozas libres del lote; si su especie o su m³ no coinciden,
 * se avisa antes (avisa, no frena: en el Libro manda el lote).
 */

import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Boxes, Link2, ListChecks, Plus } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import { avisosDelVinculo, lotesParaUsar, motivoNoVincula, type LoteParaUsar } from "@/lib/forestal/panel-lotes-reparto";
import type { PanelLotes } from "./hooks/use-panel-lotes";
import { Aviso, BTN, BTN_PRIMARIO, CAMPO } from "./reparto-panel-lotes-ui";

type Props = {
  panel: PanelLotes;
  lotes: LoteAserrio[];
  bloques: BloqueRolliza[];
  cargando: boolean;
  /** Abre «Trozas del bloque» con ese bloque elegido. */
  onElegirTrozas: (bloqueId: string) => void;
};

const nombreBloque = (b: BloqueRolliza) =>
  `${b.etiqueta || "Sin etiqueta"} · ${b.especie || "sin especie"} · ${fmtM3(Number(b.m3) || 0)} m³`;

export default function RepartoLotesDelLibro({ panel, lotes, bloques, cargando, onElegirTrozas }: Props) {
  const usables = useMemo(() => lotesParaUsar(lotes, bloques), [lotes, bloques]);
  const vinculables = bloques.filter((b) => motivoNoVincula(b) === null);
  const [hecho, setHecho] = useState<{ loteId: string; texto: string; tono: "ok" | "error" } | null>(null);

  return (
    <section aria-label="Lotes abiertos del Libro" className="space-y-3">
      <div className="flex items-center gap-2">
        <CardTitle as="h4" className="text-sm font-bold text-[var(--text-primary)]">
          Lotes abiertos con rolliza libre ({usables.length})
        </CardTitle>
        <InfoTip
          title="Usar un lote ya creado"
          what="«Traer como bloque» suma una fila con la rolliza libre del lote y sus trozas. «Vincular» le pone ese lote a un bloque que ya tienes, por ejemplo uno cargado a mano."
          affects="El bloque queda con el lote y sus trozas: sus jornadas se registran en el Libro. Un lote va en un solo bloque, para no declarar la misma madera dos veces."
          example="Bloque a mano «Tornillo 10 m³» + lote LA-2026-007 (4 trozas, 9.8 m³) → el bloque queda con esas 4 trozas y te avisa que el m³ no coincide."
        />
      </div>

      {cargando && usables.length === 0 && <p className="text-sm text-[var(--text-tertiary)]">Cargando los lotes del Libro…</p>}
      {!cargando && usables.length === 0 && (
        <p className="text-sm text-[var(--text-secondary)]">No hay lotes abiertos con trozas libres. Créalos en «Sugeridos del patio» o en «Trozas del bloque».</p>
      )}

      <ul className="space-y-2">
        {usables.map((u) => (
          <FilaLote
            key={u.lote.id}
            u={u}
            vinculables={vinculables}
            hecho={hecho?.loteId === u.lote.id ? hecho : null}
            onTraer={() => {
              panel.traerLote(u.lote);
              setHecho({ loteId: u.lote.id, texto: `Entró a la tabla como bloque «Lote ${u.lote.code}».`, tono: "ok" });
            }}
            onVincular={(bloqueId) => {
              const motivo = panel.vincular(bloqueId, u.lote);
              setHecho({
                loteId: u.lote.id,
                texto: motivo ?? `Vinculado: el bloque ya tiene el lote ${u.lote.code} y sus ${u.libres} trozas.`,
                tono: motivo ? "error" : "ok",
              });
            }}
            onElegirTrozas={onElegirTrozas}
            bloqueDelLote={bloques.find((b) => b.loteId === u.lote.id) ?? null}
          />
        ))}
      </ul>
    </section>
  );
}

function FilaLote({ u, vinculables, hecho, onTraer, onVincular, onElegirTrozas, bloqueDelLote }: {
  u: LoteParaUsar;
  vinculables: BloqueRolliza[];
  hecho: { texto: string; tono: "ok" | "error" } | null;
  onTraer: () => void;
  onVincular: (bloqueId: string) => void;
  onElegirTrozas: (bloqueId: string) => void;
  bloqueDelLote: BloqueRolliza | null;
}) {
  const [destino, setDestino] = useState("");
  const elegido = vinculables.find((b) => b.id === destino) ?? null;
  const avisos = elegido ? avisosDelVinculo(elegido, u.lote) : [];
  const { lote } = u;
  return (
    <li className="space-y-2 rounded-xl border border-[var(--rule-base)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 font-bold text-[var(--text-primary)]">
            <Boxes className="h-4 w-4 text-[var(--accent)]" aria-hidden /> {lote.code}
            <span className="font-normal text-[var(--text-secondary)]">· {lote.speciesCommon || "Sin especie"}</span>
          </span>
          <span className="block break-all text-xs text-[var(--text-secondary)]">
            {u.permiso ?? "Sin permiso"} · {u.libres} {u.libres === 1 ? "troza libre" : "trozas libres"} · <b className="tabular-nums">{fmtM3(u.m3)} m³</b>
          </span>
        </span>
        {bloqueDelLote ? (
          <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
            En el bloque «{u.enBloque}»
            <button type="button" onClick={() => onElegirTrozas(bloqueDelLote.id)} className={BTN}>
              <ListChecks className="h-4 w-4" aria-hidden /> Elegir trozas
            </button>
          </span>
        ) : (
          <button type="button" onClick={onTraer} className={BTN}>
            <Plus className="h-4 w-4" aria-hidden /> Traer como bloque
          </button>
        )}
      </div>

      {!bloqueDelLote && vinculables.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            aria-label={`Bloque al que vincular el lote ${lote.code}`}
            className={`${CAMPO} min-w-0 flex-1`}
          >
            <option value="">Vincular a un bloque sin lote…</option>
            {vinculables.map((b) => (
              <option key={b.id} value={b.id}>{nombreBloque(b)}</option>
            ))}
          </select>
          <button type="button" onClick={() => elegido && onVincular(elegido.id)} disabled={!elegido} className={BTN_PRIMARIO}>
            <Link2 className="h-4 w-4" aria-hidden /> Vincular
          </button>
        </div>
      )}
      {avisos.map((a) => (
        <Aviso key={a} tono="aviso">{a}</Aviso>
      ))}
      {hecho && <Aviso tono={hecho.tono === "ok" ? "ok" : "error"}>{hecho.texto}</Aviso>}
    </li>
  );
}
