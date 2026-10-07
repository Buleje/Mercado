"use client";

/**
 * «Deshacer la importación» de una guía del Libro TH (ADR-461 §12).
 *
 * Una guía IMPORTADA no se anula con «Anular»: su madera ya estaba en el Libro
 * CTP (vino de SERFOR) y el 409 de las guías del TH la frenaba. Este botón
 * deshace lo que asentó la importación —la guía, sus despachos, los trozados y
 * las talas referenciales que creó, y el permiso si lo creó y queda vacío— y
 * dice antes qué se va a anular y qué queda. Lo decide el servidor.
 *
 * Va en el resultado de «Importar guías» (botón) y en el menú ⋯ de la fila de
 * la guía en la vista GTF (que abre `ModalDeshacer` directo).
 */

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Ban, Loader2, Undo2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { motivoLegible } from "@/lib/forestal/motivo";
import type { DeshacerImportacion } from "@/lib/forestal/loth-importar-guia-tipos";
import { useDeshacerImportacion } from "./hooks/use-deshacer-importacion";
import { verIngresosDelCtp } from "./LothGtfCtp";
import { Btn } from "./ctp-shared";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function BotonDeshacerImportacion({
  gtfId,
  gtfNumber,
  onHecho,
  aboveModals = false,
}: {
  gtfId: string;
  gtfNumber: string;
  /** Se deshizo: recargar lo que muestra la guía. */
  onHecho: (r: DeshacerImportacion) => void;
  /** Dentro de otro modal (el de «Importar guías»). */
  aboveModals?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const titulo = "Deshacer la importación: anula la guía, sus despachos y los trozados y talas referenciales que creó";
  return (
    <>
      <Btn size="sm" variant="danger" onClick={() => setAbierto(true)} title={titulo} aria-label={`Deshacer la importación de la GTF ${gtfNumber}`}>
        <Undo2 className="h-4 w-4" aria-hidden /> Deshacer la importación
      </Btn>
      {abierto && (
        <ModalDeshacer
          gtfId={gtfId}
          gtfNumber={gtfNumber}
          aboveModals={aboveModals}
          onClose={() => setAbierto(false)}
          onHecho={(r) => {
            setAbierto(false);
            onHecho(r);
          }}
        />
      )}
    </>
  );
}

export function ModalDeshacer({
  gtfId,
  gtfNumber,
  aboveModals,
  onClose,
  onHecho,
}: {
  gtfId: string;
  gtfNumber: string;
  aboveModals: boolean;
  onClose: () => void;
  onHecho: (r: DeshacerImportacion) => void;
}) {
  const { revision, enviando, errorEnvio, deshacer } = useDeshacerImportacion(gtfId);
  const [motivo, setMotivo] = useState("");
  const d = revision.datos;
  const puede = !!d && !d.bloqueo && motivoLegible(motivo) && !enviando;

  async function confirmar() {
    if (!puede) return;
    const r = await deshacer(motivo.trim());
    if (!r) return;
    toast.success(`Importación de la GTF ${r.gtfNumber} deshecha`, { description: resumen(r) });
    onHecho(r);
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      aboveModals={aboveModals}
      title="Deshacer la importación"
      description={`GTF ${gtfNumber} · se anula, no se borra`}
      icon={Undo2}
      footer={
        <ModalFooter error={errorEnvio}>
          <Btn variant="ghost" onClick={onClose}>
            Cancelar
          </Btn>
          <Btn variant="danger" onClick={() => void confirmar()} disabled={!puede}>
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Undo2 className="h-4 w-4" aria-hidden />}
            Deshacer la importación
          </Btn>
        </ModalFooter>
      }
    >
      <div className="space-y-3 px-5 py-4 text-sm sm:px-6">
        {revision.cargando && (
          <p className="flex items-center gap-2 text-[var(--text-secondary)]" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Revisando qué asentó la importación…
          </p>
        )}
        {revision.error && (
          <p role="alert" className="font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            {revision.error}
          </p>
        )}
        {d && <QueSeDeshace d={d} />}
        {d && !d.bloqueo && (
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Motivo *</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Ej.: se importó en el permiso equivocado; va al DEMA de la comunidad."
              className="w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]"
            />
            <span className="mt-1 block text-xs text-[var(--text-tertiary)]">Al menos 3 letras. Queda en el libro junto a cada línea anulada.</span>
          </label>
        )}
      </div>
    </AdminModal>
  );
}

/** «La GTF, 5 despachos, 5 trozados y 2 talas referenciales». */
function resumen(r: DeshacerImportacion): string {
  const anuladas = r.talas.filter((t) => t.accion === "anular").length;
  const reducidas = r.talas.length - anuladas;
  return [
    `Anulados: la guía, ${plural(r.despachos, "despacho", "despachos")}, ${plural(r.trozados, "trozado", "trozados")} y ${plural(anuladas, "tala referencial", "talas referenciales")}`,
    reducidas > 0 && plural(reducidas, "tala reducida", "talas reducidas"),
    r.plan?.baja && "permiso dado de baja",
  ]
    .filter(Boolean)
    .join(" · ");
}

function QueSeDeshace({ d }: { d: DeshacerImportacion }) {
  const anuladas = d.talas.filter((t) => t.accion === "anular");
  const reducidas = d.talas.filter((t) => t.accion === "reducir");
  const ctp = d.bloqueo?.codigo === "guia_ya_en_el_ctp" || d.bloqueo?.codigo === "troza_ya_en_el_ctp";
  return (
    <div className="space-y-3">
      {d.bloqueo && (
        <div
          role="alert"
          className="flex flex-wrap items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]"
        >
          <Ban className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 basis-60">{d.bloqueo.mensaje}</span>
          {ctp && (
            <Btn size="sm" variant="secondary" onClick={verIngresosDelCtp}>
              Ir a Ingresos del CTP
            </Btn>
          )}
        </div>
      )}
      <ul className="space-y-1.5 text-[var(--text-primary)]">
        <li>
          Se anula la <b className="font-mono">GTF {d.gtfNumber}</b>
          {d.registro ? <span className="text-[var(--text-secondary)]"> · registro SERFOR {d.registro}</span> : null}
          {d.volumenM3 != null ? <span className="font-mono tabular-nums text-[var(--text-secondary)]"> · {fmtM3(d.volumenM3)} m³</span> : null}
        </li>
        <li>{plural(d.despachos, "línea de despacho", "líneas de despacho")}</li>
        <li>
          {plural(d.trozados, "trozado que creó la importación", "trozados que creó la importación")}
          {d.trozadosQueQuedan > 0 && (
            <span className="text-[var(--text-secondary)]">
              {" "}
              · {plural(d.trozadosQueQuedan, "trozado de antes queda", "trozados de antes quedan")} (sólo pierde este despacho)
            </span>
          )}
        </li>
        <li>
          {plural(anuladas.length, "tala referencial", "talas referenciales")}
          {anuladas.length > 0 && (
            <span className="text-[var(--text-secondary)]"> (árbol {anuladas.map((t) => t.treeCode).join(", ")})</span>
          )}
        </li>
        {reducidas.map((t) => (
          <li key={t.id} className="flex items-start gap-1.5 text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              La tala referencial del árbol <b>{t.treeCode}</b> (línea #{t.lineNo}) se reduce de{" "}
              <span className="font-mono tabular-nums">{fmtM3(t.antesM3 ?? 0)}</span> a{" "}
              <span className="font-mono tabular-nums">{fmtM3(t.despuesM3 ?? 0)} m³</span>: la sigue sosteniendo la GTF{" "}
              {t.otrasGuias.join(", ")}.
            </span>
          </li>
        ))}
        {d.plan && <li className="text-[var(--text-secondary)]">{d.plan.nombre}: {d.plan.motivo}</li>}
      </ul>
    </div>
  );
}
