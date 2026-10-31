"use client";

/**
 * Paso «Desde la cámara» del lote mixto (ADR-480 sobre ADR-441): llega de
 * Cámaras › Trozas a la vista › «Consumir» con los marcadores elegidos. Lista
 * esas trozas (ya tildadas las que se pueden apartar; las demás con su motivo)
 * y las aparta en el mixto abierto con la acción de siempre (`agregar`).
 *
 * No hay camino de escritura nuevo: la cámara propone, la persona confirma,
 * y el servidor aplica LM1-LM4 igual que al escanear.
 */

import { useEffect, useMemo, useState } from "react";
import { Camera, Loader2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { cerrarAlNavegar } from "./enlace-cierra-ventana";
import type { RespuestaALaVista, TrozaALaVista } from "@/lib/camaras/marcadores";
import { formatNumber } from "@/lib/format";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";
import { diaLegible } from "./camaras/camaras-ui";
import type { EstadoLotesMixtos } from "./hooks/use-lotes-mixtos";

export interface PedidoDesdeCamara {
  dia: string;
  pasada: string | null;
  marcadores: number[];
}

const sePuede = (t: TrozaALaVista) => t.estado === "libre" && t.motivo === null && Boolean(t.troza);

export default function CtpLoteMixtoDesdeCamara({
  pedido,
  mixtos,
  onClose,
  onApartadas,
}: {
  pedido: PedidoDesdeCamara;
  mixtos: EstadoLotesMixtos;
  onClose: () => void;
  /** Ya apartadas: quien llama abre el mixto para seguir (repartir, producir). */
  onApartadas: (mensaje: string) => void;
}) {
  const [datos, setDatos] = useState<RespuestaALaVista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegidas, setElegidas] = useState<ReadonlySet<string>>(new Set());
  const [apartando, setApartando] = useState(false);

  useEffect(() => {
    let vigente = true;
    const q = new URLSearchParams({ dia: pedido.dia });
    if (pedido.pasada) q.set("pasada", pedido.pasada);
    if (pedido.marcadores.length) q.set("m", pedido.marcadores.join(","));
    void fetch(`/api/admin/camaras/trozas-a-la-vista?${q.toString()}`, { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as RespuestaALaVista & { message?: string };
        if (!r.ok) throw new Error(j.message ?? `El servidor respondió ${r.status}`);
        if (!vigente) return;
        setDatos(j);
        setElegidas(new Set(j.trozas.filter(sePuede).map((t) => t.troza!.id)));
      })
      .catch((e: unknown) => {
        if (vigente) setError(e instanceof Error ? e.message : "No se pudo leer lo que vio la cámara.");
      });
    return () => {
      vigente = false;
    };
  }, [pedido]);

  const trozas = useMemo(() => datos?.trozas ?? [], [datos]);
  const sel = trozas.filter((t) => t.troza && elegidas.has(t.troza.id) && sePuede(t));
  const m3 = sel.reduce((s, t) => s + (t.troza?.volumenM3 ?? 0), 0);
  const destino = mixtos.abiertos[0] ?? null;

  const apartar = async () => {
    setApartando(true);
    setError(null);
    try {
      const mixto = destino ?? (await mixtos.crear(`Desde la cámara del ${diaLegible(pedido.dia)}`));
      const r = await mixtos.reservar(
        mixto,
        "agregar",
        sel.map((t) => t.troza!.id),
        `Cámara: ${sel.length} trozas a ${mixto.code}`,
      );
      if (r.estado === "error") throw new Error(r.mensaje);
      onApartadas(
        r.estado === "encolada"
          ? `Sin señal: ${sel.length} trozas quedaron anotadas y suben solas a ${mixto.code}.`
          : `${r.hechas} en ${mixto.code}${r.rechazadas.length ? ` · ${r.rechazadas.length} no entraron: ${r.rechazadas.map((x) => x.motivo).slice(0, 2).join(" · ")}` : ""}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron apartar.");
    } finally {
      setApartando(false);
    }
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Consumir desde la cámara"
      description={`Lo que vio la cámara el ${diaLegible(pedido.dia)}: confirma y se aparta en el lote mixto`}
      icon={Camera}
      variant="wide"
      footer={
        <ModalFooter>
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" disabled={sel.length === 0 || apartando} onClick={() => void apartar()}>
            {apartando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Apartar {sel.length} en {destino ? destino.code : "un lote mixto nuevo"}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        {error && (
          <p role="alert" className="text-sm font-semibold text-[var(--data-error-ink)]">
            {error}
          </p>
        )}
        {!datos && !error ? (
          <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]" aria-busy>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo lo que vio la cámara…
          </p>
        ) : trozas.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">La cámara no vio esas trozas ese día.</p>
        ) : (
          <>
            <p className="text-sm text-[var(--text-secondary)]">
              {sel.length} de {trozas.length} · {formatNumber(m3, 3)} m³ (vista previa: el libro decide al apartar)
            </p>
            <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]">
              {trozas.map((t) => {
                const puede = sePuede(t);
                const id = t.troza?.id ?? `m${t.marcador}`;
                return (
                  <li key={t.marcador} className="flex items-start gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={puede && elegidas.has(id)}
                      disabled={!puede}
                      onChange={(e) =>
                        setElegidas((prev) => {
                          const n = new Set(prev);
                          if (e.target.checked) n.add(id);
                          else n.delete(id);
                          return n;
                        })
                      }
                      aria-label={`Apartar ${t.troza?.codigo ?? `el marcador ${t.marcador}`}`}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)] disabled:opacity-40"
                    />
                    <span className="min-w-0 flex-1 text-sm">
                      {/* El código lleva a la ficha de la troza: cierra esta ventana antes (si
                          no, quedaría encima de la ficha); ctrl+clic la abre en otra pestaña. */}
                      <span className="font-bold text-[var(--text-primary)]">
                        <EnlacePanel cosa="troza" id={t.troza?.id} onClick={cerrarAlNavegar(onClose)}>
                          {t.troza?.codigo ?? "—"}
                        </EnlacePanel>
                      </span>
                      <span className="text-[var(--text-secondary)]">
                        {" "}
                        · #{t.marcador}
                        {t.troza?.especie ? ` · ${t.troza.especie}` : ""}
                        {t.troza?.volumenM3 != null ? ` · ${formatNumber(t.troza.volumenM3, 3)} m³` : ""}
                      </span>
                      {t.motivo && <span className="block text-xs text-[var(--text-tertiary)]">{t.motivo}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </ModalBody>
    </AdminModal>
  );
}
