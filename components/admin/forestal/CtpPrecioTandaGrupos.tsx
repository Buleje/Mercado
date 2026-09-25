"use client";

/**
 * La lista de «Poner precio» en tanda: un renglón por proveedor, con un precio
 * por m³ que vale para todas sus especies, y —desplegado— un renglón por
 * especie para ponerle a cada una el suyo.
 *
 * Por qué el proveedor manda y la especie ajusta: el precio se acuerda con el
 * proveedor («Santos, S/ 180 el metro») pero el Tornillo no vale lo que el
 * Cachimbo. En el tenant real un proveedor trae 21 guías en 11 especies:
 * escribir un precio y retocar dos es el trabajo real; escribir once, no.
 */

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { GrupoEspecie, GrupoProveedor } from "@/lib/forestal/precio-en-tanda";
import { formatNumber } from "@/lib/format";

const m3 = (n: number) => `${formatNumber(n, 2)} m³`;
const guias = (n: number) => `${n} ${n === 1 ? "guía" : "guías"}`;

const CAMPO =
  "h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-8 pr-10 text-right font-mono text-base tabular-nums text-[var(--text-primary)] transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

/** El campo «S/ … /m³». `placeholder` muestra el precio heredado del proveedor. */
function CampoPrecio({
  valor,
  onCambio,
  etiqueta,
  placeholder,
}: {
  valor: string;
  onCambio: (v: string) => void;
  etiqueta: string;
  placeholder?: string;
}) {
  return (
    <label className="relative block w-40 shrink-0">
      <span className="sr-only">{etiqueta}</span>
      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-tertiary)]">
        S/
      </span>
      <input
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={placeholder ?? "0.00"}
        className={CAMPO}
      />
      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)]">
        /m³
      </span>
    </label>
  );
}

/** Los avisos de dedazo de un precio, en una línea + ⓘ con el detalle. */
export function AvisosDePrecio({ avisos }: { avisos: readonly string[] }) {
  if (avisos.length === 0) return null;
  return (
    <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0">{avisos[0]}</span>
      {avisos.length > 1 && (
        <InfoTip title="Más avisos de este precio" what={<span>{avisos.slice(1).join(" ")}</span>} />
      )}
    </p>
  );
}

/** Qué dice cada grupo, en una línea: permiso · guías · m³ · cuántas faltan. */
function Resumen({ g, esProveedor }: { g: GrupoProveedor | GrupoEspecie; esProveedor: boolean }) {
  const permisos = g.permisos;
  const e = esProveedor ? null : (g as GrupoEspecie);
  return (
    <p className="text-sm text-[var(--text-secondary)]">
      {permisos.length > 0 ? (
        <span className="font-mono text-[var(--text-primary)]">{permisos.join(" · ")}</span>
      ) : (
        <span className="italic">sin permiso atado</span>
      )}
      {" · "}
      {guias(g.filas)} · {m3(g.m3)}
      {" · "}
      <b className={g.sinPrecio > 0 ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-secondary)]"}>
        {g.sinPrecio > 0 ? `${g.sinPrecio} sin precio` : "todas con precio"}
      </b>
      {e?.precioActual && (
        <span>
          {" "}
          · ya tiene S/ {formatNumber(e.precioActual.min, 2)}
          {e.precioActual.max !== e.precioActual.min ? `–${formatNumber(e.precioActual.max, 2)}` : ""}/m³
        </span>
      )}
      {e && e.bloqueadas > 0 && <span> · {e.bloqueadas} en mes cerrado</span>}
    </p>
  );
}

export default function CtpPrecioTandaGrupos({
  grupos,
  precioProv,
  precioEsp,
  onPrecioProv,
  onPrecioEsp,
  avisosProv,
  avisosEsp,
}: {
  grupos: readonly GrupoProveedor[];
  precioProv: Record<string, string>;
  precioEsp: Record<string, string>;
  onPrecioProv: (clave: string, v: string) => void;
  onPrecioEsp: (clave: string, v: string) => void;
  /** Avisos de dedazo por proveedor (su precio aplicado a sus especies, sin repetir). */
  avisosProv: Record<string, string[]>;
  avisosEsp: Record<string, string[]>;
}) {
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set());
  const alternar = (clave: string) =>
    setAbiertos((s) => {
      const n = new Set(s);
      if (n.has(clave)) n.delete(clave);
      else n.add(clave);
      return n;
    });

  return (
    <ul className="space-y-2">
      {grupos.map((p) => {
        const abierto = abiertos.has(p.clave) || p.especies.length === 1;
        const variasEspecies = p.especies.length > 1;
        return (
          <li key={p.clave} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[12rem] flex-1">
                <p className="text-base font-bold text-[var(--text-primary)]">
                  {p.proveedor}
                  <span className="font-normal text-[var(--text-secondary)]">
                    {" · "}
                    {variasEspecies ? `${p.especies.length} especies` : p.especies[0]?.especie}
                  </span>
                </p>
                {/* Con una sola especie, el renglón del proveedor ES el de la
                    especie: se ven sus datos propios (precio ya cargado, mes cerrado). */}
                {variasEspecies || !p.especies[0] ? <Resumen g={p} esProveedor /> : <Resumen g={p.especies[0]} esProveedor={false} />}
              </div>
              <CampoPrecio
                valor={precioProv[p.clave] ?? ""}
                onCambio={(v) => onPrecioProv(p.clave, v)}
                etiqueta={`Precio por m³ para ${p.proveedor}${variasEspecies ? ", todas sus especies" : ""}`}
              />
            </div>
            <AvisosDePrecio avisos={avisosProv[p.clave] ?? []} />

            {variasEspecies && (
              <button
                type="button"
                onClick={() => alternar(p.clave)}
                aria-expanded={abierto}
                className="mt-2 inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
              >
                {abierto ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                {abierto ? "Ocultar especies" : `Precio por especie (${p.especies.length})`}
              </button>
            )}

            {abierto && variasEspecies && (
              <ul className="mt-2 space-y-1.5 border-l-2 border-[var(--rule-base)] pl-3">
                {p.especies.map((e) => (
                  <li key={e.clave}>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-[10rem] flex-1">
                        <p className="text-sm font-bold text-[var(--text-primary)]">{e.especie}</p>
                        <Resumen g={e} esProveedor={false} />
                      </div>
                      <CampoPrecio
                        valor={precioEsp[e.clave] ?? ""}
                        onCambio={(v) => onPrecioEsp(e.clave, v)}
                        etiqueta={`Precio por m³ de ${e.especie} de ${p.proveedor}`}
                        placeholder={precioProv[p.clave] || undefined}
                      />
                    </div>
                    <AvisosDePrecio avisos={avisosEsp[e.clave] ?? []} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
