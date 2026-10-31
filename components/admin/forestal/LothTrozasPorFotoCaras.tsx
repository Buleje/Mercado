"use client";

/**
 * Las dos caras de la carga en «Medir por foto» (F2, Brandon 16-10: «D2 por
 * la otra cara»). Atrás da D1; con «Medir la otra cara» la foto de adelante
 * da D2. Cada punta de adelante se empareja sola con su troza de atrás
 * (`emparejarCaras`); las dudosas salen con «?» en la foto y «Revisar» en la
 * tabla, y se corrigen tocándolas: «esta de adelante es la N° 7».
 *
 * Sin la foto de adelante todo queda como antes: D2 vacío = pareja (ADR-492).
 */
import type { ChangeEvent } from "react";
import { Camera, ImagePlus } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import { Btn, I } from "./ctp-shared";
import type { TrozasPorFoto } from "./hooks/use-trozas-por-foto";

const BOTON = "inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold focus-within:ring-2 focus-within:ring-[var(--accent)]/40";
const AVISO = "text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";
const ALERTA = "text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";

function ElegirAdelante({ p }: { p: TrozasPorFoto }) {
  const alElegir = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void p.elegirAdelante(file);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className={`${BOTON} border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)]`}>
        <Camera className="h-5 w-5" aria-hidden="true" /> Medir la otra cara
        <input type="file" accept="image/*" capture="environment" onChange={alElegir} data-qa="foto-carga-adelante" className="sr-only" />
      </label>
      <label className={`${BOTON} border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)]`}>
        <ImagePlus className="h-5 w-5" aria-hidden="true" /> Galería
        <input type="file" accept="image/*" onChange={alElegir} data-qa="foto-galeria-adelante" className="sr-only" />
      </label>
    </div>
  );
}

export default function LothTrozasPorFotoCaras({ p }: { p: TrozasPorFoto }) {
  const { adelante, atras } = p;
  const ayuda = (
    <InfoTip
      title="D2 por la otra cara"
      what="Pasa las dos hojas de escala a la cara de adelante de la carga y tómale otra foto. Cada punta de adelante se junta sola con su troza de atrás: atrás da el D1 y adelante el D2, los dos con corteza."
      affects="Al pasar a la guía, D1 es la punta mayor y D2 la menor, como en el libro. Sin esta foto, D2 queda igual a D1 y la troza va marcada «D2 = D1»."
      example="La que sale con «?» no calzó segura: tócala y dile cuál es («esta de adelante es la N° 7»)."
      ariaLabel="Cómo se mide la otra cara"
    />
  );

  if (adelante.fase !== "listo") {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-[var(--rule-base)] p-2">
        <span className="mr-auto flex items-center gap-1 text-sm font-semibold text-[var(--text-secondary)]">
          {adelante.fase === "midiendo" ? (
            <>
              <LoadingSpinner size={20} /> Midiendo la cara de adelante…
            </>
          ) : adelante.fase === "sin_hoja" ? (
            <span role="alert" className={ALERTA}>
              No encontré la hoja de escala en la foto de adelante.
            </span>
          ) : adelante.fase === "error" ? (
            <span role="alert" className={ALERTA}>
              {adelante.error ?? "No se pudo medir la foto de adelante."}
            </span>
          ) : (
            "D2: falta la cara de adelante"
          )}
          {ayuda}
        </span>
        {adelante.fase !== "midiendo" && <ElegirAdelante p={p} />}
      </div>
    );
  }

  const mismas = atras.testas.length === adelante.testas.length;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Cara de la carga" className="grid grow grid-cols-2 gap-1 rounded-2xl bg-[var(--surface-sunken)] p-1 sm:grow-0">
          {(["atras", "adelante"] as const).map((lado) => (
            <button
              key={lado}
              type="button"
              role="radio"
              aria-checked={p.vista === lado}
              onClick={() => p.setVista(lado)}
              data-qa={`cara-${lado}`}
              className={`h-12 rounded-xl px-3 text-sm font-bold whitespace-nowrap transition-colors ${
                p.vista === lado ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {lado === "atras" ? `Atrás · D1 (${atras.testas.length})` : `Adelante · D2 (${adelante.testas.length})`}
            </button>
          ))}
        </div>
        <span className="flex items-center gap-1" data-qa="estado-parejas">
          {p.dudosas > 0 || !mismas ? (
            <span className={AVISO}>
              {p.dudosas > 0 ? `${p.dudosas} por revisar` : "Revisa las parejas"}
              {!mismas && ` · ${atras.testas.length} atrás, ${adelante.testas.length} adelante`}
            </span>
          ) : (
            <span className="text-sm font-semibold text-[var(--text-secondary)]">Todas emparejadas</span>
          )}
          {ayuda}
        </span>
      </div>
    </div>
  );
}

/**
 * Debajo de la foto de adelante, con una punta elegida: de qué troza de atrás
 * es. Elegir otra la fija («esta de adelante es la N° 7»); «Automática»
 * devuelve la decisión al emparejado.
 */
export function ParejaDeLaElegida({ p }: { p: TrozasPorFoto }) {
  if (p.vista !== "adelante" || !p.seleccion) return null;
  const idAdelante = p.seleccion;
  const pareja = p.atrasDe.get(idAdelante);
  const fija = pareja?.fija ?? false;
  return (
    <div className="flex flex-wrap items-center gap-2" data-qa="pareja-elegida">
      <label className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
        Esta de adelante es la N°
        <select
          value={pareja?.atras ?? ""}
          onChange={(e) => p.fijarPareja(idAdelante, e.target.value || null)}
          data-qa="pareja-de-adelante"
          className={`${I} w-auto! min-w-24! font-mono`}
        >
          {!pareja && <option value="">—</option>}
          {p.atras.testas.map((t, k) => (
            <option key={t.id} value={t.id}>
              {p.codigosAtras[k]}
            </option>
          ))}
        </select>
      </label>
      {pareja?.dudosa && <span className={AVISO}>No calzó segura</span>}
      {fija && (
        <Btn variant="ghost" onClick={() => p.fijarPareja(idAdelante, null)}>
          Automática
        </Btn>
      )}
    </div>
  );
}
