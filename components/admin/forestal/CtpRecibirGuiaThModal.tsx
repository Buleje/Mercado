"use client";

/**
 * CtpRecibirGuiaThModal — recibir en el Libro CTP la guía que emitió tu Libro
 * TH, con sus trozas, sin tipear (Brandon 28-09-2026: «cuando se va a emitir
 * la guía quiero que ese registro pase a libro CTP de mi sistema para luego
 * poner recepcionarla»).
 *
 * Lo único que se pone acá es lo que la guía no puede saber: el día en que la
 * madera bajó en el patio. Lo demás —un renglón por especie, cada troza con su
 * código, D1, D2, largo y m³— lo arma el servidor con la guía del bosque y se
 * muestra ANTES de registrar, tal como va a quedar.
 */

import { useState } from "react";
import { AlertTriangle, CalendarClock, TreePine } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatDateShort } from "@/lib/format";
import { MAX_TEXTO_RECIBIR, type RecibidaTh } from "@/lib/forestal/guia-th-al-ctp";
import { MIN_MOTIVO_VENCIDA } from "@/lib/forestal/fecha-de-llegada";
import { limaDateKey } from "@/lib/utils";
import { useRecibirGuiaTh } from "./hooks/use-recibir-guia-th";
import { LineasDeLaGuia, TrozasDeLaGuia } from "./ctp-recibir-guia-th-partes";
import { Btn, I } from "./ctp-shared";

export interface CtpRecibirGuiaThModalProps {
  guardadaId: string;
  /** Para el título mientras llega el detalle. */
  gtfNumber: string;
  /** Se abre desde otro modal (el listado de guías guardadas). */
  aboveModals?: boolean;
  onClose: () => void;
  onRecibida: (r: RecibidaTh) => void;
}

const dia = (iso: string | null) => (iso ? formatDateShort(iso, { soloFecha: true }) : "—");

/** «42/300»: cuánto queda, igual que el tope del servidor. */
function Cuenta({ id, n }: { id: string; n: number }) {
  return (
    <span id={id} className="self-end text-xs tabular-nums text-[var(--text-tertiary)]" aria-live="polite">
      {n}/{MAX_TEXTO_RECIBIR}
    </span>
  );
}

function Dato({ label, valor, mono }: { label: string; valor: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">{label}</p>
      <p className={`truncate text-sm font-bold text-[var(--text-primary)] ${mono ? "font-mono tabular-nums" : ""}`} title={valor}>
        {valor}
      </p>
    </div>
  );
}

export default function CtpRecibirGuiaThModal({
  guardadaId,
  gtfNumber,
  aboveModals = false,
  onClose,
  onRecibida,
}: CtpRecibirGuiaThModalProps) {
  const { preparado: p, cargando, errorCarga, recibir, enviando } = useRecibirGuiaTh(guardadaId);
  const hoy = limaDateKey();
  const [llegada, setLlegada] = useState(hoy);
  const [observacion, setObservacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** El servidor dijo que llegó después del vencimiento: se confirma con motivo. */
  const [vencida, setVencida] = useState<string | null>(null);
  const [motivoVencida, setMotivoVencida] = useState("");

  const faltaMotivo = vencida != null && motivoVencida.trim().length < MIN_MOTIVO_VENCIDA;
  const puede = Boolean(p) && !cargando && !enviando && Boolean(llegada) && !faltaMotivo;

  const enviar = async () => {
    if (!puede) return;
    setError(null);
    const r = await recibir({
      fechaLlegada: llegada,
      observacion: observacion.trim() || undefined,
      ...(vencida != null ? { aceptaVencida: true, motivoVencida: motivoVencida.trim() } : {}),
    });
    if (r.ok) {
      onRecibida(r.recibida);
      return;
    }
    if (r.codigo === "GUIA_VENCIDA") {
      setVencida(r.vencimiento ?? p?.vencimiento ?? "");
      setError(null);
      return;
    }
    setError(r.mensaje);
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title={`Recibir la guía ${p?.gtfNumber ?? gtfNumber}`}
      description="Viene de tu Libro TH: entra con sus trozas, sin tipear"
      icon={TreePine}
      variant="wide"
      aboveModals={aboveModals}
      claveVentana="ctp-recibir-guia-th"
      footer={
        <ModalFooter
          error={error ?? errorCarga}
          nota={p ? <span>{p.trozas} {p.trozas === 1 ? "troza" : "trozas"} · {fmtM3(p.totalM3)} m³</span> : cargando ? "Leyendo la guía de tu Libro TH…" : null}
        >
          <Btn variant="secondary" onClick={onClose} disabled={enviando}>
            Cancelar
          </Btn>
          <Btn variant="primary" onClick={() => void enviar()} disabled={!puede}>
            {enviando ? "Recibiendo…" : "Recibir la guía"}
          </Btn>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} flex flex-col gap-4`} data-testid="recibir-guia-th">
        {p && (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 sm:grid-cols-4">
              <Dato label="Titular" valor={p.titular ?? "—"} />
              <Dato label="Permiso" valor={p.permiso ?? "—"} mono />
              <Dato label="Guía del" valor={dia(p.gtfDate)} />
              <Dato label="Vence" valor={p.vencimiento ? dia(p.vencimiento) : "sin fecha"} />
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="inline-flex items-center gap-1.5">
                <label htmlFor="recibir-th-llegada" className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                  <CalendarClock className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
                  Llegó al patio el
                </label>
                <InfoTip
                  title="Fecha de llegada"
                  ariaLabel="Qué fecha va en la llegada"
                  what="El día en que la madera bajó del camión en tu patio."
                  affects="Queda como la llegada de la guía y de cada troza en el libro: desde ese día se pueden aserrar."
                  example="La guía salió del bosque el lunes y el camión llegó el miércoles: pones el miércoles."
                />
              </span>
              <input
                id="recibir-th-llegada"
                type="date"
                value={llegada}
                min={p.gtfDate ?? undefined}
                max={hoy}
                onChange={(e) => {
                  setLlegada(e.target.value);
                  setVencida(null);
                }}
                className={`${I} max-w-48`}
              />
            </div>

            {vencida != null && (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/50 bg-[var(--data-warning-50)] p-3 dark:bg-[var(--data-warning-500)]/10"
              >
                <p className="flex items-start gap-2 text-sm font-bold text-[var(--data-warning-ink)]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  La guía venció el {dia(vencida || null)} y la madera llega el {dia(llegada)}. Si de verdad llegó así, escribe por qué.
                </p>
                <input
                  aria-label="Por qué llegó después del vencimiento"
                  aria-describedby="recibir-th-motivo-cuenta"
                  value={motivoVencida}
                  onChange={(e) => setMotivoVencida(e.target.value)}
                  placeholder="Ej.: el camión se quedó en el puesto de control por lluvia"
                  maxLength={MAX_TEXTO_RECIBIR}
                  className={I}
                />
                <Cuenta id="recibir-th-motivo-cuenta" n={motivoVencida.length} />
              </div>
            )}

            <LineasDeLaGuia lineas={p.lineas} totalM3={p.totalM3} />
            <TrozasDeLaGuia lineas={p.lineas} />

            {p.avisos.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm text-[var(--data-warning-ink)]">
                {p.avisos.map((a) => (
                  <li key={a} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {a}
                  </li>
                ))}
              </ul>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold text-[var(--text-primary)]">
                Observación <span className="font-normal text-[var(--text-tertiary)]">(opcional)</span>
              </span>
              <input
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="Si lo que bajó no es lo que dice la guía"
                maxLength={MAX_TEXTO_RECIBIR}
                aria-describedby="recibir-th-obs-cuenta"
                className={I}
              />
              <Cuenta id="recibir-th-obs-cuenta" n={observacion.length} />
            </label>
          </>
        )}
        {cargando && !p && <p className="text-sm text-[var(--text-tertiary)]">Leyendo la guía de tu Libro TH…</p>}
      </div>
    </AdminModal>
  );
}
