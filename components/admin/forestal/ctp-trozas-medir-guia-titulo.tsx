"use client";

/**
 * El título habilitante que trae la ficha SERFOR, en la vista previa de «Traer
 * de la guía» (Brandon 05-10, «Completar Blas con el QR»): si los ingresos de
 * la guía no lo declaran, se declara junto con las medidas. Sólo lee lo que
 * decidió el servidor (`tituloDesdeFicha`): las reglas son del backend.
 */

import type { TituloDeLaFicha } from "@/lib/forestal/titulo-de-guia";

const AVISO = "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";
const OK = "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]";

/** ¿Al guardar se declara el título? (lo que cambia el texto del botón). */
export const tituloSeDeclara = (t: TituloDeLaFicha | null | undefined) =>
  t?.estado === "declarar" && !t.bloqueoRol;

export default function CtpTrozasMedirGuiaTitulo({ t }: { t: TituloDeLaFicha | null }) {
  if (!t) return null;
  const nombre = (
    <>
      <b className="font-mono text-[var(--text-primary)]">{t.codigo}</b>
      {t.resolucion && <> · {t.resolucion}</>}
    </>
  );
  const titular = t.titular ? <span className="text-[var(--text-tertiary)]"> ({t.titular})</span> : null;
  const omitidos = t.omitidos.length > 0 && t.estado === "declarar" && (
    <span className="text-[var(--text-tertiary)]">
      {" "}· no se toca en {t.omitidos.map((o) => `${o.especie ?? "—"} (${o.motivo})`).join(", ")}
    </span>
  );

  let cuerpo: React.ReactNode;
  if (t.estado === "sin_codigo") {
    cuerpo = <span className="text-[var(--text-tertiary)]">La ficha no trae el N° del título habilitante.</span>;
  } else if (t.estado === "declarar" && t.bloqueoRol) {
    cuerpo = (
      <span className={AVISO}>
        Título: {nombre}{titular} — falta en el libro, pero {t.bloqueoRol}.
      </span>
    );
  } else if (t.estado === "declarar") {
    cuerpo = (
      <>
        <b className={OK}>Título:</b> {nombre}{titular} —{" "}
        {t.declaraCodigo ? "se declara junto con las medidas" : "se completa la resolución junto con las medidas"}
        {t.vinculaPermiso ? " y se vincula a tu permiso de la lista" : ""}.{omitidos}
      </>
    );
  } else if (t.estado === "distinto") {
    cuerpo = (
      <span className={AVISO}>
        La ficha dice {nombre}, pero el libro {t.omitidos.map((o) => o.motivo).filter(Boolean).join(" · ")}. Revisa el
        ingreso.
      </span>
    );
  } else if (t.estado === "ya_tiene") {
    cuerpo = <span className="text-[var(--text-tertiary)]">Título {t.codigo}: ya está declarado en el libro.</span>;
  } else {
    cuerpo = (
      <span className={AVISO}>
        Título {nombre}: no se puede declarar ({t.omitidos.map((o) => o.motivo).join(" · ")}).
      </span>
    );
  }
  return <p className="break-words text-sm text-[var(--text-secondary)]">{cuerpo}</p>;
}
