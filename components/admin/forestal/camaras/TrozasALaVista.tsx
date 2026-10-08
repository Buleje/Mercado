"use client";

/**
 * «Trozas a la vista» (ADR-480) — en Hoy en el patio: las trozas cuyo
 * marcador leyó la cámara ese día, con dónde está cada una (libre, en un
 * lote, ya salió) y «Consumir» para las elegidas.
 *
 * La cámara PROPONE: «Consumir» lleva a Consumos › Patio con lo elegido y ahí
 * una persona confirma y aparta en el lote mixto (ADR-441), con la misma
 * regla de siempre (LM3). Esta pantalla no escribe nada del stock.
 */

import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Flame, Loader2, MoreHorizontal, Printer } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { imprimirHojaDePrueba } from "@/lib/camaras/imprimir-marcadores";
import { enlaceConsumirDesdeCamara, type EstadoTrozaALaVista, type TrozaALaVista } from "@/lib/camaras/marcadores";
import { formatNumber, formatTime } from "@/lib/format";
import { BLOQUE, CHIP_BASE, CHIP_TONO, type Tono } from "./camaras-ui";
import ContarAhora from "./ContarAhora";
import { navegarEnElPanel } from "./navegar-panel";
import { useTrozasALaVista } from "./use-trozas-a-la-vista";

const ESTADO: Record<EstadoTrozaALaVista, { texto: string; tono: Tono }> = {
  libre: { texto: "En el patio", tono: "ok" },
  en_mixto: { texto: "En lote mixto", tono: "info" },
  en_lote: { texto: "En un lote", tono: "info" },
  salio: { texto: "Ya salió", tono: "neutro" },
  sin_asignar: { texto: "Sin asignar", tono: "aviso" },
};

const sePuede = (t: TrozaALaVista) => t.estado === "libre" && t.motivo === null;
const TH = "px-2 py-2 text-left text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const TD = "px-2 py-2 align-top text-sm text-[var(--text-primary)]";

function Fila({ t, elegida, onElegir }: { t: TrozaALaVista; elegida: boolean; onElegir: (v: boolean) => void }) {
  const e = ESTADO[t.estado];
  return (
    <tr className="border-t border-[var(--rule-soft)]">
      <td className={TD}>
        <input
          type="checkbox"
          checked={elegida}
          disabled={!sePuede(t)}
          onChange={(ev) => onElegir(ev.target.checked)}
          aria-label={`Elegir el marcador ${t.marcador}`}
          className="h-5 w-5 accent-[var(--accent)] disabled:opacity-40"
        />
      </td>
      <td className={`${TD} font-mono font-bold`}>#{t.marcador}</td>
      <td className={`${TD} font-bold`}>{t.troza?.codigo ?? "—"}</td>
      <td className={TD}>{t.troza?.especie ?? "—"}</td>
      <td className={`${TD} tabular-nums`}>{t.troza?.volumenM3 != null ? formatNumber(t.troza.volumenM3, 3) : "—"}</td>
      <td className={TD}>
        <span className={`${CHIP_BASE} ${CHIP_TONO[e.tono]}`} title={t.motivo ?? undefined}>
          {t.troza?.loteCode && t.estado !== "libre" ? `${e.texto} ${t.troza.loteCode}` : e.texto}
        </span>
        {t.motivo && t.estado === "libre" && (
          <span className="mt-0.5 block text-xs text-[var(--text-tertiary)]">{t.motivo}</span>
        )}
      </td>
      <td className={`${TD} tabular-nums text-[var(--text-secondary)]`}>{formatTime(t.ultima)}</td>
    </tr>
  );
}

export default function TrozasALaVista({ fecha, esHoy, activo }: { fecha: string; esHoy: boolean; activo: boolean }) {
  const { datos, cargando, error, recargar } = useTrozasALaVista(fecha, activo);
  const [elegidas, setElegidas] = useState<ReadonlySet<number>>(new Set());
  const trozas = useMemo(() => datos?.trozas ?? [], [datos]);
  const libres = trozas.filter(sePuede);
  const sel = trozas.filter((t) => elegidas.has(t.marcador) && sePuede(t));
  const m3Sel = sel.reduce((s, t) => s + (t.troza?.volumenM3 ?? 0), 0);
  const todas = libres.length > 0 && sel.length === libres.length;

  const elegir = (marcador: number, v: boolean) =>
    setElegidas((prev) => {
      const n = new Set(prev);
      if (v) n.add(marcador);
      else n.delete(marcador);
      return n;
    });

  return (
    <section className={`${BLOQUE} space-y-3`} data-testid="trozas-a-la-vista">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto flex items-center gap-1.5">
          <CardTitle>Trozas a la vista</CardTitle>
          <InfoTip
            title="Trozas a la vista"
            what="Las trozas cuyo marcador (el cuadro negro de 18 cm en la testa) leyó la cámara este día. El marcador se imprime en Etiquetas › «Marcador A4 · cámara»."
            affects="«Consumir» abre Consumos › Patio con las elegidas: ahí las confirmas y se apartan en el lote mixto. La cámara propone, tú decides."
            example="34 a la vista · 20 en el patio · eliges 12 → Consumir 12 → Apartar 12 en LM-2026-004."
          />
        </div>
        {datos && datos.resumen.vistas > 0 && (
          <span className="text-sm text-[var(--text-secondary)]">
            {datos.resumen.vistas} a la vista · {datos.resumen.libres} en el patio · {formatNumber(datos.resumen.m3Libres, 3)} m³
          </span>
        )}
        <ActionMenu
          label="Más de trozas a la vista"
          icon={MoreHorizontal}
          soloIcono
          size="sm"
          actions={[
            {
              id: "hoja-prueba",
              label: "Hoja de prueba (3, 5 y 8 m)",
              hint: "Tres marcadores para probar hasta dónde lee la cámara",
              icon: Printer,
              onSelect: imprimirHojaDePrueba,
            },
          ]}
        />
      </div>

      <ContarAhora esHoy={esHoy} onContado={() => void recargar()} />

      {error ? (
        <p role="alert" className="text-sm font-semibold text-[var(--data-error-ink)]">
          No se pudo leer lo que vio la cámara: {error}
        </p>
      ) : !datos ? (
        <p className="flex items-center gap-2 py-3 text-sm text-[var(--text-tertiary)]" aria-busy>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo lo que vio la cámara…
        </p>
      ) : trozas.length === 0 ? (
        <p className="py-2 text-sm text-[var(--text-secondary)]">
          {esHoy ? "Hoy la cámara todavía no contó trozas." : "Ese día la cámara no contó trozas."}
        </p>
      ) : (
        <>
          <div className={`overflow-x-auto ${cargando ? "opacity-60" : ""}`} aria-busy={cargando}>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={`${TH} w-10`} data-label="Elegir">
                    <input
                      type="checkbox"
                      checked={todas}
                      disabled={libres.length === 0}
                      onChange={(ev) => setElegidas(ev.target.checked ? new Set(libres.map((t) => t.marcador)) : new Set())}
                      aria-label="Elegir todas las que están en el patio"
                      className="h-5 w-5 accent-[var(--accent)]"
                    />
                  </th>
                  <th className={TH}>Marcador</th>
                  <th className={TH}>Troza</th>
                  <th className={TH}>Especie</th>
                  <th className={TH}>m³</th>
                  <th className={TH}>Dónde está</th>
                  <th className={TH}>Vista</th>
                </tr>
              </thead>
              <tbody>
                {trozas.map((t) => (
                  <Fila key={t.marcador} t={t} elegida={elegidas.has(t.marcador)} onElegir={(v) => elegir(t.marcador, v)} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {sel.length > 0 && (
              <span className="text-sm text-[var(--text-secondary)]">
                {sel.length} {sel.length === 1 ? "elegida" : "elegidas"} · {formatNumber(m3Sel, 3)} m³ (vista previa)
              </span>
            )}
            <button
              type="button"
              disabled={sel.length === 0}
              onClick={() => navegarEnElPanel(enlaceConsumirDesdeCamara(fecha, sel.map((t) => t.marcador)))}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
            >
              <Flame className="h-4 w-4" aria-hidden />
              Consumir{sel.length ? ` ${sel.length}` : ""}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
