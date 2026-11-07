"use client";

/**
 * «Por N° de registro SERFOR» — la segunda puerta de «Importar guías
 * despachadas» (ADR-461). Se pegan uno o varios N° de registro del SNIFFS
 * (`1-19-0313629`, CON sus guiones), uno por línea o separados por coma; cada
 * uno se trae de la consulta pública de SERFOR al pedir la vista previa.
 *
 * El N° de GTF impreso (`019-001-0000004`) NO es el registro: se avisa en vez
 * de mandarlo, porque SERFOR no lo encuentra por ese número.
 */

import { useId } from "react";
import { AlertTriangle, CheckCircle2, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { registrosDelTexto } from "./hooks/importar-guias-pantalla";

export default function LothImportarGuiasRegistros({
  texto,
  onTexto,
  leidosDeFoto,
  onQuitarLeido,
}: {
  texto: string;
  onTexto: (v: string) => void;
  /** Los que salieron de «Foto o PDF»: se suman a los pegados. */
  leidosDeFoto: readonly string[];
  onQuitarLeido: (numero: string) => void;
}) {
  const id = useId();
  const r = registrosDelTexto(texto);
  const total = new Set([...r.validos, ...leidosDeFoto]).size;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className="text-sm font-semibold text-[var(--text-primary)]">
          N° de registro de cada guía
        </label>
        <InfoTip
          title="N° de registro SERFOR"
          what="Es el número que el SNIFFS le pone a cada guía al registrarla; está junto al QR o en el recuadro del estado, rotulado «N° REGISTRO». Va con sus guiones, tal como sale impreso."
          affects="Con él se trae la guía de la consulta pública de SERFOR: sus trozas, el titular y el título habilitante. No es el N° de GTF impreso arriba de la guía."
          example="1-19-0313629 · 110-19-0469791 (uno por línea, o separados por coma)"
        />
      </div>
      <textarea
        id={id}
        value={texto}
        onChange={(e) => onTexto(e.target.value)}
        rows={5}
        spellCheck={false}
        autoComplete="off"
        placeholder={"1-19-0313629\n110-19-0469791"}
        className="w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 font-mono text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)] sm:text-sm"
      />

      {(r.gtf.length > 0 || r.invalidos.length > 0) && (
        <ul className="space-y-1 text-sm" aria-live="polite">
          {r.gtf.map((g) => (
            <li
              key={`gtf-${g}`}
              className="flex items-start gap-2 text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                <span className="font-mono font-bold">{g}</span> es un N° de GTF, no de registro:
                busca el «N° REGISTRO» junto al QR.
              </span>
            </li>
          ))}
          {r.invalidos.map((g) => (
            <li
              key={`inv-${g}`}
              className="flex items-start gap-2 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                <span className="font-mono font-bold">{g}</span> no tiene la forma de un N° de
                registro (dígitos con guiones).
              </span>
            </li>
          ))}
        </ul>
      )}

      {leidosDeFoto.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-[var(--text-secondary)]">
            Leídos de una foto
          </div>
          <ul className="flex flex-wrap gap-2">
            {leidosDeFoto.map((n) => (
              <li
                key={n}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] pl-2.5 pr-1 font-mono text-sm text-[var(--text-primary)]"
              >
                {n}
                <button
                  type="button"
                  onClick={() => onQuitarLeido(n)}
                  aria-label={`Quitar el registro ${n}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {total > 0 && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          {total} {total === 1 ? "guía para traer de SERFOR" : "guías para traer de SERFOR"}
        </p>
      )}
    </div>
  );
}
