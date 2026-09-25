"use client";

/**
 * La cabecera de Saldos: qué es la vista, de qué período, y dos botones.
 *
 * Tenía cuatro botones sueltos (PDF, CSV, Excel, Recargar) y la frase que
 * importa —«es el saldo que se declara ante SERFOR»— vivía en un tooltip que no
 * llega por teclado ni en una tableta. Ahora el título es un h2 con esa frase a
 * la vista, las descargas van en un menú (ley de la vista #4: a la vista sólo lo
 * de uso constante) y «Recargar» refresca TODO lo de la pantalla, no sólo el
 * saldo.
 */

import { SectionTitle } from "@buleje/design-system";
import {
  AlertCircle,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  RefreshCw,
} from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import CtpAvisoAlcancePermiso from "../CtpAvisoAlcancePermiso";
import { Btn } from "../ctp-shared";

const AVISO = {
  error: "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-ink)]",
  warning:
    "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-ink)]",
} as const;

export default function SaldosCabecera({
  periodo,
  hayDatos,
  fuentesCargando,
  recargando,
  onRecargar,
  onPdf,
  onExcel,
  onCsv,
  errorReporte,
  errorCarga,
  alcance,
}: {
  periodo: string;
  hayDatos: boolean;
  /** Mientras el patio o los lotes no llegan, un reporte diría «0 piezas». */
  fuentesCargando: boolean;
  recargando: boolean;
  onRecargar: () => void;
  onPdf: () => void;
  onExcel: () => void;
  onCsv: () => void;
  errorReporte: string | null;
  errorCarga: string | null;
  /** Código del permiso de «Solo este permiso», o `null` = toda la planta. */
  alcance: string | null;
}) {
  const bloqueado = !hayDatos || fuentesCargando;
  const espera = fuentesCargando ? "Esperando el patio y los lotes…" : undefined;

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionTitle className="flex flex-wrap items-baseline gap-x-2">
            Saldos del libro
            <span className="font-mono text-sm font-normal tabular-nums text-[var(--text-tertiary)]">
              {periodo}
            </span>
          </SectionTitle>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Lo que declaras ante SERFOR y lo que puede salir de la planta.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Btn
            variant="secondary"
            size="md"
            onClick={onRecargar}
            disabled={recargando}
            aria-label="Recargar todos los saldos"
          >
            <RefreshCw className={`h-4 w-4 ${recargando ? "animate-spin" : ""}`} aria-hidden />
            <span className="max-sm:sr-only">Recargar</span>
          </Btn>
          <ActionMenu
            label="Descargar"
            icon={Download}
            size="sm"
            compactoEnMovil
            disabled={bloqueado}
            title={espera}
            actions={[
              {
                id: "pdf",
                label: "Reporte PDF",
                hint: "El saldo que se declara ante SERFOR, para imprimir o fiscalizar",
                icon: FileDown,
                tone: "dark",
                disabled: bloqueado,
                onSelect: onPdf,
              },
              {
                id: "excel",
                label: "Excel (un archivo, varias hojas)",
                hint: "Materia prima, productos, lotes, capacidad y el patio por permiso",
                icon: FileSpreadsheet,
                disabled: bloqueado,
                onSelect: onExcel,
              },
              {
                id: "csv",
                label: "CSV",
                hint: "Las mismas tablas en texto plano",
                icon: FileText,
                disabled: bloqueado,
                onSelect: onCsv,
              },
            ]}
          />
        </div>
      </header>

      {/* El filtro por permiso es PARCIAL en Saldos: sin decirlo, la pestaña
          mostraría números de un permiso al lado de números de toda la planta
          como si fueran del mismo papel. */}
      {alcance && (
        <CtpAvisoAlcancePermiso
          codigo={alcance}
          acotado={["el patio", "la capacidad", "lo pendiente"]}
          sinAcotar={[
            "los saldos del libro",
            "la curva",
            "la conciliación",
            "la antigüedad por guía",
          ]}
        />
      )}

      {errorReporte && (
        <div
          role="alert"
          className={`flex items-start gap-3 rounded-xl border-2 p-4 text-sm ${AVISO.warning}`}
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>
            <strong>No se pudo abrir el reporte:</strong> {errorReporte}
          </p>
        </div>
      )}

      {errorCarga && (
        <div
          role="alert"
          className={`flex items-start gap-3 rounded-xl border-2 p-4 text-sm ${AVISO.error}`}
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>
            <strong>No se pudieron leer los saldos:</strong> {errorCarga}
          </p>
        </div>
      )}
    </div>
  );
}
