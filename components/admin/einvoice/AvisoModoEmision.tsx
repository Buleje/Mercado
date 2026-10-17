"use client";

/**
 * Lo primero que se lee en «Emitir comprobante»: si se crea un comprobante
 * electrónico (oficial o de prueba) o si hoy no se crea nada, quién emite y,
 * si falta algo, los requisitos con su estado y a dónde ir (F01/F02/F03/M54).
 */
import { AlertCircle, CheckCircle, Info, XCircle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { PermisoDe } from "@/components/admin/shared/PermisoDe";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import { cn } from "@/lib/utils";
import { DESTINO_CONEXION, origenDeCobros } from "@/components/admin/sunat/EstadoSunatLinea";
import { requisitosDeEmision, type LecturaModo } from "@/components/admin/sunat/requisitos-emision";
import type { SunatModoOficialState } from "@/lib/sunat/modo-oficial.types";

const TONO: Record<LecturaModo["tono"], { caja: string; icono: string }> = {
  ok: {
    caja: "border-[var(--data-success-500)]/40 bg-[var(--data-success-50)]",
    icono: "text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]",
  },
  aviso: {
    caja: "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)]",
    icono: "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]",
  },
  neutro: { caja: "border-[var(--rule-soft)] bg-[var(--surface-sunken)]", icono: "text-[var(--text-tertiary)]" },
};

export function AvisoModoEmision({ estado, lectura }: { estado: SunatModoOficialState | null; lectura: LecturaModo }) {
  const tono = TONO[lectura.tono];
  const Icono = lectura.tono === "ok" ? CheckCircle : lectura.tono === "aviso" ? AlertCircle : Info;
  const emisor = estado?.emisor;
  return (
    <div role="status" data-qa="aviso-modo-emision" className={cn("space-y-2 rounded-xl border px-3 py-2", tono.caja)}>
      <p className="flex items-start gap-2 text-sm font-semibold text-[var(--text-primary)]">
        <Icono className={cn("mt-0.5 h-4 w-4 shrink-0", tono.icono)} aria-hidden />
        <span>{lectura.aviso}</span>
      </p>
      {emisor && lectura.puedeEmitir && (
        <p className="pl-6 text-sm text-[var(--text-secondary)]">
          Emite <span className="font-semibold text-[var(--text-primary)]">{emisor.razonSocial}</span> · RUC {emisor.ruc}
        </p>
      )}
      {estado && lectura.modo === "apagado" && (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-1 pl-6">
          <ul className="space-y-1">
            {requisitosDeEmision(estado).map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                {r.ok ? (
                  <CheckCircle className="h-4 w-4 shrink-0 text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]" aria-label="Listo" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" aria-label="Falta" />
                )}
                <span>{r.etiqueta}</span>
                {!r.ok && <InfoTip what={r.queHacer} side="top" />}
              </li>
            ))}
          </ul>
          <span className="ml-auto text-sm">
            <PermisoDe
              origen={origenDeCobros()}
              sinPermiso={<span className="text-[var(--text-secondary)]">Lo configura el dueño.</span>}
            >
              <EnlacePanel href={hrefDeDestino(DESTINO_CONEXION)}>Configurar →</EnlacePanel>
            </PermisoDe>
          </span>
        </div>
      )}
    </div>
  );
}
