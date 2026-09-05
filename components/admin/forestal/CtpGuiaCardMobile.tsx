"use client";

/**
 * La guía en el celular (ADR-346).
 *
 * En el patio la bandeja se mira desde un teléfono: una tarjeta por **papel**,
 * con sus especies listadas y los dos botones que se usan parado frente al
 * camión —recepcionar y validar—. El detalle asiento por asiento vive en la
 * ficha; en 360px una tabla anidada no se lee.
 */

import { CheckCheck, Download, PackageCheck } from "@buleje/design-system/icons";
import type { GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import { PROVEEDOR_INVENTARIO_APERTURA } from "@/lib/forestal/ctp-serfor-a-libro";
import EspecieFoto from "./EspecieFoto";
import type { useEspeciesFotos } from "./hooks/use-especies-fotos";
import { StatusBadge, formatDate, type WoodEntry, type WoodEntryStatus } from "./ctp-shared";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

export default function CtpGuiaCardMobile({
  guia,
  fotosEspecie,
  marcada,
  onAlternarMarca,
  modoBandeja,
  onDetail,
  onValidarGuia,
  onRecepcionarGuia,
  busy,
}: {
  guia: GuiaIngreso<WoodEntry>;
  fotosEspecie: ReturnType<typeof useEspeciesFotos>["indice"];
  marcada: boolean;
  onAlternarMarca: (v: boolean) => void;
  modoBandeja: boolean;
  onDetail: (e: WoodEntry) => void;
  onValidarGuia: (g: GuiaIngreso<WoodEntry>) => void;
  onRecepcionarGuia: (g: GuiaIngreso<WoodEntry>) => void;
  busy: string | null;
}) {
  const pendientes = guia.lineas.filter((l) => l.status === "pendiente").length;

  return (
    <article
      className={`rounded-2xl border-2 p-4 ${
        marcada ? "border-[var(--accent)] bg-primary/5" : "border-[var(--rule-base)] bg-[var(--surface-raised)]"
      }`}
    >
      <header className="flex items-start gap-3">
        {pendientes > 0 && (
          <input
            type="checkbox"
            aria-label={`Seleccionar la guía ${guia.gtfNumber}`}
            checked={marcada}
            onChange={(e) => onAlternarMarca(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand-ink)]"
          />
        )}
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onDetail(guia.lineas[0])}
            className="block truncate text-left font-mono text-base font-bold text-[var(--text-primary)] underline-offset-2 hover:underline"
          >
            {guia.gtfNumber}
          </button>
          <p className="flex items-center gap-1.5 truncate text-sm text-[var(--text-secondary)]">
            {guia.providerName}
            {guia.providerName === PROVEEDOR_INVENTARIO_APERTURA && (
              <span
                title="Existencia de apertura: entró por el importador del libro"
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--data-info-500)]/15 px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
              >
                <Download className="h-3 w-3 shrink-0" aria-hidden /> Importado
              </span>
            )}
          </p>
          <p className="text-sm text-[var(--text-tertiary)]">
            {formatDate(guia.entryDate)} · {guia.lineas.length} asiento{guia.lineas.length === 1 ? "" : "s"} del libro
          </p>
        </div>
        {guia.statusMixto ? (
          <span className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)]">
            mixto
          </span>
        ) : (
          <StatusBadge status={guia.status as WoodEntryStatus} />
        )}
      </header>

      <ul className="mt-3 space-y-1">
        {guia.especies.map((e) => (
          <li key={e.comun} className="flex items-center gap-2 text-sm">
            <EspecieFoto especie={e.comun} indice={fotosEspecie} />
            <span className="min-w-0 flex-1 truncate font-medium text-[var(--text-primary)]">{e.comun}</span>
            {e.cites && (
              <span className="rounded-full bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">
                CITES
              </span>
            )}
            <span className="shrink-0 font-mono tabular-nums text-[var(--text-secondary)]">
              {fmtM3(e.volumenM3)} m³
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-[var(--rule-soft)] pt-2 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
        {fmtM3(guia.volumenM3)} m³ ·{" "}
        <span className="font-normal text-[var(--text-tertiary)]">
          {guia.trozasCount > 0 ? `${guia.trozasCount} trozas` : `${guia.piezas} piezas`}
          {guia.trozasCount > 0 && ` · ${guia.trozasDecididas}/${guia.trozasCount} recibidas`}
        </span>
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {modoBandeja && (
          <button
            type="button"
            onClick={() => onRecepcionarGuia(guia)}
            disabled={Boolean(busy)}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-3 text-sm font-bold text-white disabled:opacity-40"
          >
            <PackageCheck className="h-4 w-4" aria-hidden /> Recepcionar
          </button>
        )}
        {pendientes > 0 && (
          <button
            type="button"
            onClick={() => onValidarGuia(guia)}
            disabled={Boolean(busy)}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] disabled:opacity-40"
          >
            <CheckCheck className="h-4 w-4" aria-hidden /> Validar {pendientes > 1 ? pendientes : ""}
          </button>
        )}
      </div>
    </article>
  );
}
