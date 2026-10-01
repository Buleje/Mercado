"use client";

/**
 * «Revisar y vincular» — las producciones ya declaradas que TIENEN trozas de
 * su especie en el patio (motivo `lista`), una por una.
 *
 * Nunca se vincula sin mirar: cada corrida muestra su propuesta ya marcada,
 * la persona desmarca lo que no entró y firma. «Saltar» la deja para después.
 * Si otra persona usó esas trozas en el medio (409), se vuelve a pedir la
 * propuesta de esa corrida y se dice por qué.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Layers, Loader2 } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { formatNumber } from "@/lib/format";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import type { DiagnosticoCorrida } from "@/lib/forestal/vincular-trozas";
import { leerCorridaSinOrigen, vincularTrozas } from "@/hooks/use-vincular-trozas";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";
import { ListaDeTrozas, TotalMarcadas } from "./CtpDeQueTrozasSalio";

const LINK =
  "inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-bold text-[var(--accent-ink)] underline underline-offset-2 hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]";

export default function CtpRevisarVinculosModal({
  corridas,
  onCerrar,
  onVinculada,
  onElegirAMano,
}: {
  corridas: readonly DiagnosticoCorrida[];
  onCerrar: () => void;
  /** Una quedó vinculada: la bandeja y la tabla releen. */
  onVinculada: (mensaje: string) => void;
  /** Abrir la corrida en el vinculador de siempre (por lote, a mano). */
  onElegirAMano?: (c: DiagnosticoCorrida) => void;
}) {
  /* La cola se congela al abrir: la bandeja relee tras cada firma y la lista
     no puede correrse bajo el dedo de quien está revisando. */
  const [cola] = useState(() => corridas.map((c) => c.corridaId));
  const [frescas, setFrescas] = useState<Record<string, DiagnosticoCorrida>>({});
  const [i, setI] = useState(0);
  const [desmarcadas, setDesmarcadas] = useState<Set<string>>(new Set());
  const [vinculadas, setVinculadas] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const porId = useMemo(() => new Map(corridas.map((c) => [c.corridaId, c])), [corridas]);
  const id = cola[i];
  const c = id ? (frescas[id] ?? porId.get(id) ?? null) : null;
  const marcadas = c ? c.propuesta.filter((t) => !desmarcadas.has(t.trozaId)) : [];
  const todas = c != null && marcadas.length === c.propuesta.length;

  const siguiente = () => {
    setDesmarcadas(new Set());
    setError(null);
    setI((n) => n + 1);
  };
  const alternar = (trozaId: string) =>
    setDesmarcadas((prev) => {
      const n = new Set(prev);
      if (n.has(trozaId)) n.delete(trozaId);
      else n.add(trozaId);
      return n;
    });

  const vincular = async () => {
    /* El mes de la corrida está cerrado (ADR-139): el servidor rechaza
       cualquier vínculo con PERIODO_CERRADO, así que el botón ni lo intenta. */
    if (!c || marcadas.length === 0 || c.mesCerrado) return;
    setEnviando(true);
    setError(null);
    const r = await vincularTrozas(
      c.corridaId,
      marcadas.map((t) => t.trozaId),
    );
    if (r.ok) {
      const msg = `N.º ${c.lineNo ?? "—"} vinculada: ${r.trozas} ${r.trozas === 1 ? "troza" : "trozas"}.${
        r.sobreElTope ? " Ojo: rinde más del 56 %." : ""
      }`;
      toast.success(msg);
      setVinculadas((n) => n + 1);
      setEnviando(false);
      onVinculada(msg);
      siguiente();
      return;
    }
    /* La propuesta que se veía puede no valer más (otra persona usó esas
       trozas): se pide de nuevo la de ESTA corrida antes de dejar reintentar. */
    setError(r.message);
    const nueva = await leerCorridaSinOrigen(c.corridaId);
    if (nueva) {
      setFrescas((prev) => ({ ...prev, [c.corridaId]: nueva }));
      setDesmarcadas(new Set());
    }
    setEnviando(false);
  };

  const terminado = i >= cola.length;
  return (
    <AdminModal
      open
      onClose={enviando ? () => undefined : onCerrar}
      title="Revisar y vincular"
      description={terminado ? "Revisión terminada" : `${i + 1} de ${cola.length} · marca las trozas que entraron`}
      icon={Layers}
      variant="wide"
      footer={
        terminado ? (
          <ModalFooter>
            <Btn variant="primary" onClick={onCerrar}>
              Cerrar
            </Btn>
          </ModalFooter>
        ) : (
          <ModalFooter error={error}>
            <Btn variant="secondary" onClick={siguiente} disabled={enviando}>
              Saltar
            </Btn>
            <Btn
              variant="primary"
              onClick={() => void vincular()}
              disabled={enviando || marcadas.length === 0 || Boolean(c?.mesCerrado)}
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {enviando
                ? "Vinculando…"
                : c?.mesCerrado
                  ? "El mes está cerrado: reábrelo para vincular"
                  : marcadas.length === 0
                    ? "Marca al menos una"
                    : `Vincular ${marcadas.length} ${marcadas.length === 1 ? "troza" : "trozas"}`}
            </Btn>
          </ModalFooter>
        )
      }
    >
      <ModalBody>
        {terminado || !c ? (
          <p className="text-base text-[var(--text-primary)]">
            Vinculaste <b>{vinculadas}</b> de {cola.length}.
            {vinculadas < cola.length && " Las saltadas siguen en la bandeja."}
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <CardTitle as="h3" className="text-base font-bold text-[var(--text-primary)]">
                N.º {c.lineNo ?? "—"} · {c.especie}
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)]">
                {etiquetaLarga(c.fecha)} · <span className="font-mono tabular-nums">{formatNumber(c.m3Producido, 3)}</span>{" "}
                m³ producidos{c.permiso ? ` · permiso ${c.permiso}` : ""}
              </p>
              {c.detalle && <p className="mt-1 text-sm text-[var(--text-tertiary)]">{c.detalle}</p>}
            </div>
            {c.propuesta.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">Ya no quedan trozas para proponer. Sáltala.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-x-2">
                  <TotalMarcadas marcadas={marcadas} de={c.propuesta.length} />
                  <button
                    type="button"
                    onClick={() =>
                      setDesmarcadas(todas ? new Set(c.propuesta.map((t) => t.trozaId)) : new Set())
                    }
                    className={LINK}
                  >
                    {todas ? "Desmarcar todas" : "Marcar todas"}
                  </button>
                </div>
                <ListaDeTrozas
                  trozas={c.propuesta}
                  estaMarcada={(t) => !desmarcadas.has(t)}
                  onAlternar={alternar}
                  etiqueta={`Trozas propuestas para la N.º ${c.lineNo ?? ""}`}
                />
              </>
            )}
            {onElegirAMano && (
              <button type="button" onClick={() => onElegirAMano(c)} className={LINK}>
                Elegir otras trozas a mano
              </button>
            )}
          </div>
        )}
      </ModalBody>
    </AdminModal>
  );
}
