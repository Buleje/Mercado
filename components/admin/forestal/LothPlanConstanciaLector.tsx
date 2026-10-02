"use client";

/**
 * «Leer la constancia» — el botón del alta de una plantación y la línea que
 * dice qué pasó (ronda 3 de ADR-459). La lógica vive en
 * `hooks/use-lector-constancia`; el formulario decide qué completar.
 *
 * Dos piezas porque van en dos lugares: el botón a la derecha del título del
 * bloque «Registro de la plantación», y la línea de resultado debajo de sus
 * campos — donde la persona mira lo que se completó.
 */

import { AlertTriangle, CheckCircle2, Loader2, ScanText, X as XIcon } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import AvisoClaveIa from "@/components/admin/shared/AvisoClaveIa";
import type { LectorConstancia } from "./hooks/use-lector-constancia";

export default function LothPlanConstanciaLector({ lector }: { lector: LectorConstancia }) {
  const leyendo = lector.estado.estado === "leyendo";
  return (
    <span className="flex items-center gap-1.5">
      <input
        ref={lector.input}
        type="file"
        accept={lector.leePdf ? "image/*,application/pdf" : "image/*"}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          /* Se vacía para que elegir el MISMO archivo otra vez vuelva a leerlo. */
          e.target.value = "";
          if (file) void lector.leer(file);
        }}
      />
      <button
        type="button"
        onClick={lector.pedirArchivo}
        disabled={leyendo}
        aria-busy={leyendo || undefined}
        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] disabled:opacity-60"
      >
        {leyendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ScanText className="h-4 w-4" aria-hidden="true" />}
        {leyendo ? "Leyendo…" : "Leer la constancia"}
      </button>
      <InfoTip
        title="Leer la constancia"
        what="Sube la foto o el PDF de la constancia de inscripción: se completan el código, la constancia, la fecha, el titular, la ubicación, la superficie y las especies con sus m³."
        affects="Sólo llena lo vacío: lo que ya escribiste no se toca. Revisa los m³ contra el papel antes de crear: son la base del saldo."
        example="Constancia 096-2025 → 19-SEC/REG-PLT-2025-096 · 12,5 ha · Bolaina 120 m³ (2018)."
      />
    </span>
  );
}

/** La línea debajo del bloque: leyendo, sin clave, el error, o qué se completó. */
export function LineaLectorConstancia({ lector }: { lector: LectorConstancia }) {
  const e = lector.estado;
  if (e.estado === "quieto") return null;
  if (e.estado === "leyendo") {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-sm text-[var(--text-secondary)]" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Leyendo «{e.archivo}»: tarda unos segundos.
      </p>
    );
  }
  if (e.estado === "sin_clave") return <AvisoClaveIa className="mt-2" mensaje={e.mensaje} conInstrucciones={e.instrucciones} />;
  if (e.estado === "error") {
    return (
      <p
        role="alert"
        className={`mt-2 flex items-start gap-1.5 text-sm font-semibold ${
          e.deConfiguracion ? "text-[var(--text-secondary)]" : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
        }`}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0">{e.error}</span>
      </p>
    );
  }
  const r = e.resultado;
  const nada = r.completados.length === 0 && r.especies.length === 0 && r.especiesCompletadas.length === 0;
  return (
    <div
      role="status"
      className="mt-2 flex items-start gap-2 rounded-xl border border-[var(--data-info-100)] bg-[var(--data-info-50)] px-3 py-2 text-xs text-[var(--text-secondary)] dark:border-[var(--data-info-500)]/30 dark:bg-[var(--data-info-500)]/10"
    >
      <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]" aria-hidden="true" />
      <span className="min-w-0 grow space-y-0.5">
        <span className="block">
          {nada ? (
            "La constancia no trajo nada que no estuviera escrito."
          ) : (
            <>
              {r.completados.length > 0 && <>De la constancia se completaron: {r.completados.join(", ")}. </>}
              {r.especies.length > 0 && (
                <>
                  {r.especies.length === 1 ? "Especie nueva" : `${r.especies.length} especies nuevas`}:{" "}
                  <b className="text-[var(--text-primary)]">{r.especies.join(", ")}</b> — revisa sus m³ contra el papel.{" "}
                </>
              )}
              {r.especiesCompletadas.length > 0 && <>Se completaron celdas vacías de: {r.especiesCompletadas.join(", ")}. </>}
              Lo que ya estaba escrito no se tocó.
            </>
          )}
        </span>
        {r.yaEstaban.length > 0 && <span className="block">Ya estaban: {r.yaEstaban.join(", ")} (no se cambiaron).</span>}
        {r.avisos.map((a) => (
          <span key={a} className="block font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            Ojo: {a}.
          </span>
        ))}
        {r.nota && <span className="block italic">La lectura avisa: {r.nota}</span>}
      </span>
      <button
        type="button"
        onClick={lector.cerrar}
        aria-label="Cerrar el aviso de la constancia"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
      >
        <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
