"use client";

import { TriangleAlert } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { porcentaje } from "@/lib/admin/inicio/formato-tablero";
import { valorConDato } from "@/lib/admin/inicio/hay-datos";
import type { PermisoInicio } from "@/lib/forestal/inicio-forestal";
import { cn } from "@/lib/utils";
import { TarjetaTablero } from "./resumen/TarjetaTablero";
import { Anillo, BarraCrece, LOTH, m3, plural, PuntoLeyenda, TINTA, TONO_VIGENCIA } from "./forestal/comun";
import { permisoConDato } from "./use-forestal-inicio";

const pct = (parte: number, base: number) => (base > 0 ? Math.min(100, Math.max(0, (parte / base) * 100)) : 0);
const tipoDe = (t: string) => (t === "PLANTACION" ? "Plantación" : t);
const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/**
 * Los permisos vigentes del LO-TH (2026-10-31: una ficha por permiso en el
 * tablero denso). Cada ficha es el TOTAL de la cascada de Control del permiso
 * (`cascadaDelPlan` sobre el balance del plan) desde que el permiso empezó —no
 * se recorta al período de arriba: un saldo a medias no dice cuánto queda—, más
 * su vigencia (`estadoVigencia`, la de la cabecera del plan) y la raya del
 * plazo que ya corrió (`avanceDelPeriodo`).
 *
 * Un permiso sin volumen ni tala no es una ficha en cero: es un nombre en la
 * línea de abajo, con su vigencia. Sin permisos, no se dibuja.
 */
export function ForestalPermisos({ permisos, className }: { permisos: PermisoInicio[]; className?: string }) {
  if (permisos.length === 0) return null;
  const conDato = permisos.filter(permisoConDato);
  const sinVolumen = permisos.filter((p) => !permisoConDato(p));
  const conPlazo = conDato.some((p) => p.avanceTiempoPct != null && p.baseM3 > 0);

  return (
    <TarjetaTablero
      id="forestal-permisos"
      titulo="Permisos vigentes"
      ayuda="Del Libro TH, «Control del permiso»: lo autorizado (o lo registrado, si es plantación) y cuánto se taló y se despachó de eso, desde que empezó el permiso y no sólo en el período de arriba. La raya negra es el plazo del permiso que ya corrió. Ejemplo: autorizado 320 m³ y talado 80 m³ = 25 %, quedan 240 m³ en pie; con la raya al 60 %, va más lento que el plazo."
      cifra={plural(permisos.length, "permiso", "permisos")}
      className={className}
      pie={
        <EnlacePanel href={`${LOTH}&vista=tablero`} className="inline-flex min-h-11 items-center">
          Ver control del permiso
        </EnlacePanel>
      }
    >
      {conDato.length > 0 && (
        <>
          <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Qué es cada color">
            <PuntoLeyenda color={TINTA.entra} texto="Talado" />
            <PuntoLeyenda color={TINTA.sale} texto="Despachado" />
            {conPlazo && (
              <li className="inline-flex items-center gap-2">
                <span className="h-3.5 w-0.5 shrink-0 bg-[var(--text-primary)]" aria-hidden />
                <span className="font-bold text-[var(--text-primary)]">Plazo corrido</span>
              </li>
            )}
          </ul>
          <ul className="grid gap-3 @xl:grid-cols-2 @5xl:grid-cols-3">
            {conDato.map((p, i) => (
              <FichaPermiso key={p.id} p={p} orden={i} />
            ))}
          </ul>
        </>
      )}
      {sinVolumen.length > 0 && (
        <p
          className={cn(
            "text-sm text-[var(--text-tertiary)]",
            conDato.length > 0 && "mt-3 border-t border-[var(--rule-soft)] pt-3 dark:border-[var(--rule-base)]",
          )}
        >
          Todavía sin volumen ni tala:{" "}
          <span className="font-semibold text-[var(--text-secondary)]">
            {sinVolumen
              .map((p) => `${p.numero} (${tipoDe(p.tipo)}${p.vigencia ? ` · ${minuscula(p.vigencia.texto)}` : ""})`)
              .join(" · ")}
          </span>
        </p>
      )}
    </TarjetaTablero>
  );
}

function FichaPermiso({ p, orden }: { p: PermisoInicio; orden: number }) {
  const base = p.tipo === "PLANTACION" ? "registrado" : "autorizado";
  const conBase = p.baseM3 > 0;
  const talado = valorConDato(p.taladoM3);
  const despachado = valorConDato(p.despachadoM3);
  const v = p.vigencia;
  const tono = TONO_VIGENCIA[v?.tono ?? "neutral"];
  const plazo = conBase ? (p.avanceTiempoPct ?? null) : null;
  const filas = [
    { label: "Talado", valor: talado ? m3(p.taladoM3) : null },
    { label: "Despachado", valor: despachado ? m3(p.despachadoM3) : null },
    { label: "En pie", valor: conBase ? m3(p.enPieM3) : null },
    { label: base === "registrado" ? "Registrado" : "Autorizado", valor: conBase ? m3(p.baseM3) : null },
  ].filter((f) => f.valor != null);

  return (
    <li data-permiso={p.numero} className="flex min-w-0 flex-col gap-3 border border-[var(--rule-base)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 truncate text-base font-bold text-[var(--text-primary)]" title={p.numero}>
          {p.numero}
          <span className="ml-2 text-xs font-semibold text-[var(--text-tertiary)]">{tipoDe(p.tipo)}</span>
        </p>
        {v && (
          <span className={cn("inline-flex items-center gap-1.5 text-xs font-bold", tono.texto)}>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tono.punto }} aria-hidden />
            {v.texto}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <Anillo pct={conBase && p.pctTalado != null ? p.pctTalado : 0} color={TINTA.entra}>
          {conBase && talado && p.pctTalado != null ? (
            <>
              <span className="block text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                {porcentaje(p.pctTalado, p.pctTalado < 10 ? 1 : 0)}
              </span>
              <span className="block text-xs text-[var(--text-tertiary)]">talado</span>
            </>
          ) : (
            <span className="block px-1 text-xs font-semibold text-[var(--text-tertiary)]">
              {conBase ? "sin talar" : `sin ${base}`}
            </span>
          )}
        </Anillo>
        <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm tabular-nums">
          {filas.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-[var(--text-tertiary)]">{f.label}</dt>
              <dd className="text-right font-bold text-[var(--text-primary)]">{f.valor}</dd>
            </div>
          ))}
        </dl>
      </div>

      {conBase && (
        <div className="space-y-1">
          <BarraCrece pct={pct(p.taladoM3, p.baseM3)} color={TINTA.entra} marca={plazo} retraso={orden * 0.06} />
          <BarraCrece pct={pct(p.despachadoM3, p.baseM3)} color={TINTA.sale} alto="h-1.5" retraso={orden * 0.06 + 0.05} />
          {plazo != null && (
            <p className="text-xs text-[var(--text-tertiary)]">Corrió el {porcentaje(plazo)} del plazo</p>
          )}
        </div>
      )}

      {(p.excedido || p.taladoSinRegistrarM3 > 0) && (
        <p className="flex items-start gap-1.5 text-sm font-semibold text-[var(--data-warning-ink)]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {p.excedido
            ? `Se taló o despachó más de lo ${base}.`
            : `${m3(p.taladoSinRegistrarM3)} talados de especies que el permiso no tiene cargadas.`}
        </p>
      )}
    </li>
  );
}
