"use client";

/**
 * AlquilerCamposLocal — los dos primeros bloques de la ventana de un alquiler:
 * el inmueble (dirección, partida, Mz/Lt, m², ubigeo) y las partes (dueño,
 * inquilino y qué papel cumplimos). Sólo dibuja.
 */
import { CardTitle } from "@buleje/design-system";
import { Field } from "@/components/admin/shared/Field";
import { CAMPO_ALTO } from "@/components/admin/planificacion/piezas/clases";
import { ESTADOS_ALQUILER, NUESTRO_PAPEL, type EstadoAlquiler, type NuestroPapel } from "@/lib/admin/fichas-tramites-alquileres";
import type { Parte } from "@/lib/forestal/directorio";
import { ElegirFicha } from "../comun/ElegirFicha";
import { ESTADO_ALQUILER_UI, PAPEL_UI } from "./alquileres-ui";
import type { BorradorAlquiler, CambiarAlquiler } from "./use-alquiler-form";

export const BLOQUE = "space-y-3 border-t border-[var(--rule-soft)] pt-4";
export const FILA = "grid gap-3 sm:grid-cols-2";

interface Props {
  b: BorradorAlquiler;
  cambiar: CambiarAlquiler;
  partes: readonly Parte[];
  duenoNombre: string | null;
  inquilinoNombre: string | null;
}

export function AlquilerCamposLocal({ b, cambiar, partes, duenoNombre, inquilinoNombre }: Props) {
  return (
    <>
      <div className={FILA}>
        <Field label="Nombre del local" required>
          <input type="text" className={CAMPO_ALTO} value={b.nombre} placeholder="Ej.: local de Constitución" onChange={(e) => cambiar("nombre", e.target.value)} />
        </Field>
        <Field label="Estado">
          <select className={CAMPO_ALTO} value={b.estado} onChange={(e) => cambiar("estado", e.target.value as EstadoAlquiler)}>
            {ESTADOS_ALQUILER.map((x) => (
              <option key={x} value={x}>
                {ESTADO_ALQUILER_UI[x].texto}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <section className={BLOQUE} aria-label="Inmueble">
        <CardTitle as="h3">Inmueble</CardTitle>
        <Field label="Dirección">
          <input type="text" className={CAMPO_ALTO} value={b.direccion} placeholder="Ej.: Av. Principal 123, Ciudad Constitución" onChange={(e) => cambiar("direccion", e.target.value)} />
        </Field>
        <div className={FILA}>
          <Field label="Partida SUNARP">
            <input type="text" className={CAMPO_ALTO} value={b.partidaSunarp} inputMode="numeric" placeholder="Ej.: P43000519" onChange={(e) => cambiar("partidaSunarp", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Manzana">
              <input type="text" className={CAMPO_ALTO} value={b.manzana} onChange={(e) => cambiar("manzana", e.target.value)} />
            </Field>
            <Field label="Lote">
              <input type="text" className={CAMPO_ALTO} value={b.lote} onChange={(e) => cambiar("lote", e.target.value)} />
            </Field>
          </div>
          <Field label="Área (m²)">
            <input type="text" className={CAMPO_ALTO} value={b.areaM2} inputMode="decimal" placeholder="Ej.: 120" onChange={(e) => cambiar("areaM2", e.target.value)} />
          </Field>
          <Field label="Ubigeo" hint="Los 6 dígitos del distrito">
            <input type="text" className={CAMPO_ALTO} value={b.ubigeo} inputMode="numeric" maxLength={6} placeholder="Ej.: 190305" onChange={(e) => cambiar("ubigeo", e.target.value)} />
          </Field>
        </div>
      </section>

      <section className={BLOQUE} aria-label="Partes">
        <CardTitle as="h3">Partes</CardTitle>
        <div className={FILA}>
          <ElegirFicha label="Dueño" valor={b.dueno} nombreFicha={duenoNombre} partes={partes} onCambiar={(v) => cambiar("dueno", v)} />
          <ElegirFicha label="Inquilino" valor={b.inquilino} nombreFicha={inquilinoNombre} partes={partes} onCambiar={(v) => cambiar("inquilino", v)} />
        </div>
        <Field label="Nuestro papel">
          <select className={CAMPO_ALTO} value={b.nuestroPapel} onChange={(e) => cambiar("nuestroPapel", e.target.value as NuestroPapel | "")}>
            <option value="">Sin elegir</option>
            {NUESTRO_PAPEL.map((x) => (
              <option key={x} value={x}>
                {PAPEL_UI[x]}
              </option>
            ))}
          </select>
        </Field>
      </section>
    </>
  );
}
