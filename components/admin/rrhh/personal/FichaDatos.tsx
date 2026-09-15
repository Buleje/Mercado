/**
 * FichaDatos — la pestaña «Datos» de la ficha: cinco tarjetas (identidad,
 * contacto, emergencia, trabajo, observaciones) en vez de una lista corrida de
 * pares clave/valor. Sólo presentación; los datos salen de la lectura fresca
 * de la ficha.
 */

import type { ReactNode } from "react";
import { BlockTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { etiquetaModalidad, formatearFecha, formatearPEN } from "../rrhh-ui";
import type { ColaboradorDTO } from "@/lib/rrhh/tipos";

export default function FichaDatos({ colaborador: c, mostrarTarifa }: { colaborador: ColaboradorDTO; mostrarTarifa: boolean }) {
  const documento = c.documento ? `${c.tipoDocumento ?? ""} ${c.documento}`.trim() : null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Tarjeta titulo="Identidad">
        <dl>
          <Dato k="Documento" v={documento} numeros />
          <Dato k="Apodo" v={c.apodo} />
        </dl>
      </Tarjeta>
      <Tarjeta titulo="Contacto">
        <dl>
          <Dato k="Celular" v={c.celular} telefono />
          <Dato k="Dirección" v={c.direccion} />
        </dl>
      </Tarjeta>
      <Tarjeta titulo="En caso de emergencia">
        <dl>
          <Dato k="Avisar a" v={c.contactoEmergencia.nombre} />
          <Dato k="Celular" v={c.contactoEmergencia.celular} telefono />
        </dl>
      </Tarjeta>
      <Tarjeta titulo="Trabajo">
        <dl>
          <Dato k="Puesto" v={c.puesto?.nombre ?? "Sin puesto"} />
          <Dato k="Ingreso" v={formatearFecha(c.fechaIngreso) || null} numeros />
          {c.fechaCese && <Dato k="Cese" v={`${formatearFecha(c.fechaCese)}${c.motivoCese ? ` · ${c.motivoCese}` : ""}`} />}
          {mostrarTarifa && (
            <Dato k="Tarifa vigente" v={c.tarifaVigente ? `${formatearPEN(c.tarifaVigente.monto)} ${etiquetaModalidad(c.tarifaVigente.modalidad)}` : "Sin tarifa"} />
          )}
        </dl>
      </Tarjeta>
      <Tarjeta titulo="Observaciones" className="md:col-span-2">
        {c.observaciones ? (
          <p className="whitespace-pre-line pb-2 text-sm leading-relaxed text-[var(--text-primary)]">{c.observaciones}</p>
        ) : (
          <p className="pb-2 text-sm text-[var(--text-tertiary)]">Sin observaciones.</p>
        )}
      </Tarjeta>
    </div>
  );
}

function Tarjeta({ titulo, children, className }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 pb-1.5 pt-3.5", className)}>
      <BlockTitle as="h3" className="mb-1.5">
        {titulo}
      </BlockTitle>
      {children}
    </section>
  );
}

function Dato({ k, v, telefono, numeros }: { k: string; v: string | null | undefined; telefono?: boolean; numeros?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--rule-soft)] py-2 last:border-0">
      <dt className="shrink-0 text-sm text-[var(--text-tertiary)]">{k}</dt>
      <dd className={cn("min-w-0 break-words text-right text-sm font-medium text-[var(--text-primary)]", numeros && "tabular-nums")}>
        {!v ? (
          <span className="font-normal text-[var(--text-tertiary)]">—</span>
        ) : telefono ? (
          <a href={`tel:${v.replace(/\s+/g, "")}`} className="tabular-nums text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
            {v}
          </a>
        ) : (
          v
        )}
      </dd>
    </div>
  );
}
