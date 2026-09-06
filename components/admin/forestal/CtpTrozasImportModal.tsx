"use client";

/**
 * CtpTrozasImportModal — pegar la lista de trozas de la guía (ADR-320).
 *
 * Cuando SERFOR no responde o el proveedor mandó el detalle en un Excel, esto
 * evita las dos salidas malas: tipear ochenta filas o registrar el ingreso sin
 * trozas (que es el que después no se puede cruzar contra el POA).
 *
 * Se pega y se ve ANTES de aceptar: cuántas entraron, cuáles se rechazaron y
 * por qué, y si el total cuadra con el volumen declarado en el ingreso.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Check, ClipboardList } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import {
  compararConDeclarado,
  filasDesdeTexto,
  interpretarTrozas,
  type TrozaImportada,
} from "@/lib/forestal/trozas-import";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

const EJEMPLO = `Código\tEspecie\tD1\tD2\tLargo\nT-01\tTornillo\t45\t40\t3.5`;

export default function CtpTrozasImportModal({
  especie,
  especieCientifica,
  volumenDeclarado,
  onAceptar,
  onClose,
}: {
  especie?: string | null;
  especieCientifica?: string | null;
  /** m³ que declara el ingreso: se compara contra el total de la lista. */
  volumenDeclarado?: number;
  onAceptar: (trozas: TrozaImportada[]) => void;
  onClose: () => void;
}) {
  const [texto, setTexto] = useState("");

  const resultado = useMemo(
    () =>
      interpretarTrozas(filasDesdeTexto(texto), {
        especiePorDefecto: especie ?? null,
        especieCientificaPorDefecto: especieCientifica ?? null,
      }),
    [texto, especie, especieCientifica],
  );

  const desajuste = useMemo(
    () => (volumenDeclarado ? compararConDeclarado(resultado.volumenTotal, volumenDeclarado) : null),
    [resultado.volumenTotal, volumenDeclarado],
  );

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Cargar la lista de trozas"
      description="Pegado desde el Excel o el papel de la guía"
      icon={ClipboardList}
      variant="info"
      footer={
        <ModalFooter
          nota={
            texto.trim()
              ? `${resultado.trozas.length} troza(s) · ${fmtM3(resultado.volumenTotal)} m³${resultado.errores.length > 0 ? ` · ${resultado.errores.length} fila(s) rechazada(s)` : ""}`
              : undefined
          }
        >
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn
            variant="primary"
            disabled={resultado.trozas.length === 0}
            onClick={() => {
              onAceptar(resultado.trozas);
              onClose();
            }}
          >
            {resultado.trozas.length === 0 ? <ClipboardList className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            Usar {resultado.trozas.length || ""} troza{resultado.trozas.length === 1 ? "" : "s"}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        <p className="text-sm text-[var(--text-secondary)]">
          Pegá la lista tal como está en el Excel o en el papel de la guía. Se aceptan tabuladores, comas, punto y coma o
          columnas separadas por espacios. Si trae encabezados, se leen solos.
        </p>

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={8}
          spellCheck={false}
          placeholder={EJEMPLO}
          className="w-full rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 font-mono text-sm text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]"
        />

        {/* El conteo/volumen vive en el pie (visible sin scrollear): acá sólo
            lo que hay que LEER — el desajuste, los avisos y la vista previa. */}
        {texto.trim().length > 0 && (
          <div className="space-y-2">
            {desajuste && (
              <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] p-2.5 text-sm font-medium text-[var(--data-warning-700)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {desajuste}
              </p>
            )}

            {resultado.avisos.map((a) => (
              <p key={a} className="text-sm text-[var(--text-tertiary)]">{a}</p>
            ))}

            {resultado.errores.length > 0 && (
              <ul className="max-h-24 space-y-0.5 overflow-y-auto text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                {resultado.errores.slice(0, 20).map((e) => (
                  <li key={e.fila}>Fila {e.fila}: {e.motivo}</li>
                ))}
              </ul>
            )}

            {resultado.trozas.length > 0 && (
              <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-xl border border-[var(--rule-base)] p-2">
                {resultado.trozas.slice(0, 50).map((t) => (
                  <li key={t.orden} className="flex items-center gap-2 text-sm">
                    <span className="w-8 shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{t.orden}</span>
                    <span className="w-28 shrink-0 truncate font-mono text-xs text-[var(--text-primary)]">
                      {t.codificacion ?? "—"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">{t.especieComun ?? "—"}</span>
                    <span className="w-28 shrink-0 text-right font-mono text-xs text-[var(--text-tertiary)]">
                      {t.dimensiones ?? "—"}
                    </span>
                    <span className="w-20 shrink-0 text-right font-mono tabular-nums text-[var(--text-primary)]">
                      {t.volumenM3 != null ? fmtM3(t.volumenM3) : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

      </ModalBody>
    </AdminModal>
  );
}
