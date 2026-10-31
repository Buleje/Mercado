"use client";

/**
 * La columna derecha de la libreta: todo lo guardado de la entrada elegida,
 * agrupado (identificación, dirección, autorización, internos), con un sello
 * por campo —«Guía (21)» si sale impreso en la hoja, «Interno» si queda sólo en
 * la libreta— y lo que le falta para la guía, ANTES de usarla.
 *
 * A 400 px ocupa la ventana entera y lleva «Volver» a la lista.
 */

import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, ArrowLeft, Pencil } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { ROL_LABEL, type RolParte } from "@/lib/forestal/directorio";
import { fichaDeParte, fichaDeVehiculo, papelesDe, textoDeUso, type CampoFicha, type EntradaLibreta, type MarcasDeUso } from "@/lib/forestal/libreta";
import { Btn } from "./ctp-shared";

function SelloDeCampo({ c }: { c: CampoFicha }) {
  return c.sello === "guia" ? (
    <span className="shrink-0 rounded-md bg-[var(--accent)]/12 px-1.5 py-0.5 text-xs font-bold text-[var(--accent-ink)]">
      Guía{c.casillero ? ` ${c.casillero}` : ""}
    </span>
  ) : (
    <span className="shrink-0 rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 text-xs font-semibold text-[var(--text-tertiary)]">Interno</span>
  );
}

export default function LibretaFicha({
  entrada,
  rolFicha,
  nota,
  marcas,
  onEditar,
  onVolver,
}: {
  entrada: EntradaLibreta;
  /** El papel con el que se lee: el del bloque que abrió la libreta. */
  rolFicha: RolParte | null;
  /** Una línea sobre cómo se usa ésta en este bloque (otro papel, otro bloque). */
  nota?: string | null;
  marcas: MarcasDeUso;
  onEditar?: () => void;
  onVolver: () => void;
}) {
  const ficha = entrada.tipo === "vehiculo" ? fichaDeVehiculo(entrada.vehiculo) : fichaDeParte(entrada.parte, rolFicha ?? entrada.parte.roles[0] ?? "destinatario");
  const papeles = entrada.tipo === "parte" ? papelesDe(entrada.parte) : "Vehículo";

  return (
    <div className="grid content-start gap-3" data-testid="libreta-ficha">
      <Btn variant="ghost" className="w-fit sm:hidden" onClick={onVolver}>
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Volver a la lista
      </Btn>

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <CardTitle as="h3" className={`text-base font-bold text-[var(--text-primary)] ${entrada.tipo === "vehiculo" ? "font-mono" : ""}`}>
            {entrada.nombre}
          </CardTitle>
          <p className="text-xs text-[var(--text-tertiary)]">
            {papeles || "Sin papel"} · {textoDeUso(entrada, marcas)}
          </p>
        </div>
        <InfoTip
          title="Qué sale en la guía"
          what="«Guía» = se imprime en la hoja, con su casillero del formato 2024 cuando el formato lo numera. «Interno» = queda en tu libreta y en el sistema, no en el papel."
          example={rolFicha ? `Leída como ${ROL_LABEL[rolFicha].toLowerCase()}: así quedaría en este bloque.` : undefined}
          side="left"
        />
        {onEditar && (
          <Btn variant="secondary" onClick={onEditar} aria-label={`Editar ${entrada.nombre}`}>
            <Pencil className="h-4 w-4" aria-hidden />
            Editar
          </Btn>
        )}
      </div>

      {ficha.faltan.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm font-medium text-[var(--data-warning-ink)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Para la guía le falta {ficha.faltan.join(" y ")}.</span>
        </p>
      )}
      {nota && <p className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">{nota}</p>}

      {ficha.grupos.map((g) => (
        <section key={g.clave} aria-label={g.titulo} className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2">
          <p aria-hidden className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            {g.titulo}
          </p>
          <dl className="grid gap-1.5">
            {g.campos.map((c) => (
              <div key={c.clave} className="grid grid-cols-1 gap-x-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
                <dt className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[var(--text-secondary)]">
                  <span className="min-w-0">{c.etiqueta}</span>
                  <SelloDeCampo c={c} />
                  {c.condicion && <span className="text-xs text-[var(--text-tertiary)]">{c.condicion}</span>}
                </dt>
                <dd
                  className={`min-w-0 break-words text-sm ${c.mono ? "font-mono tabular-nums" : ""} ${
                    c.falta ? "font-bold text-[var(--data-warning-ink)]" : c.noAplica ? "italic text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"
                  }`}
                >
                  {c.valor || (c.falta ? "Falta" : c.noAplica ? "No aplica" : "—")}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
