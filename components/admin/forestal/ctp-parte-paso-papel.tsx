"use client";

/**
 * Paso «Según el papel» de la ficha del Directorio: lo que pide cada papel
 * marcado y ningún otro — el precio del cliente, el registro MTC del
 * transportista, la licencia del conductor, la autorización del destino y, para
 * el proveedor, su título y sus permisos (`ctp-parte-paso-proveedor`).
 */

import { TIPOS_ESTABLECIMIENTO } from "@/lib/forestal/ctp-gtf-datos";
import { esTipoEstablecimiento } from "@/lib/forestal/directorio";
import { Field, I, Seccion } from "./ctp-shared";
import CtpPartePrecios from "./CtpPartePrecios";
import CtpPartePasoProveedor from "./ctp-parte-paso-proveedor";
import { PendientesDelPaso } from "./ctp-parte-salud";
import type { ParteFormEstado } from "./hooks/use-parte-form";

export default function CtpPartePasoPapel({ form }: { form: ParteFormEstado }) {
  const { b, set, esCliente, esTransportista, esConductor, esEstablecimiento, esProveedor, conAutorizacion, susVehiculos, tituloEnPermisos } = form;
  return (
    <>
      <PendientesDelPaso pendientes={form.pendientesDe("papel")} cubierto={esProveedor ? tituloEnPermisos : null} />
      <Seccion title="Según el papel">
        {/* El precio del pie de este cliente (ADR-430): va primero porque
            es lo que se viene a cargar cuando se marca «Cliente». */}
        {esCliente && (
          <>
            <span className="sm:col-span-12 text-sm font-bold text-[var(--text-primary)]">
              A cuánto se le cobra el pie
              <span className="ml-1.5 font-normal text-[var(--text-tertiary)]">· reemplaza a la tarifa de la planta, sin sus recargos</span>
            </span>
            <CtpPartePrecios parteId={b.id ?? null} onPendientes={form.setPreciosPendientes} />
          </>
        )}
        {esTransportista && (
          <>
            {susVehiculos.length > 0 && (
              <div className="col-span-12 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-2">
                <span className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Sus vehículos
                </span>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {susVehiculos.map((v) => (
                    <li
                      key={v.id}
                      className="rounded-lg bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--text-primary)]"
                      title={[v.marca, v.tipo, v.capacidadM3 ? `${v.capacidadM3} m³` : null].filter(Boolean).join(" · ")}
                    >
                      {v.placa}
                      {v.placaRemolque && <span className="text-[var(--text-tertiary)]"> + {v.placaRemolque}</span>}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  Se dan de alta en Directorio → Vehículos, que valida las placas repetidas.
                </p>
              </div>
            )}
            <Field label="Registro MTC" span={4} hint="Si es empresa de transporte">
              <input type="text" className={I} value={b.registroMtc ?? ""} onChange={(e) => set({ registroMtc: e.target.value })} />
            </Field>
          </>
        )}
        {conAutorizacion && (
          <Field
            label="N° de autorización"
            span={6}
            hint={
              esEstablecimiento
                ? "Formato 2024, casillero (18): el N° que la ARFFS le dio al depósito o centro de comercialización"
                : "Formato 2024, casillero (22): la autorización del CTP o depósito que recibe; vacío si es una persona"
            }
          >
            <input type="text" className={`${I} font-mono`} value={b.codigoCtp ?? ""} onChange={(e) => set({ codigoCtp: e.target.value })} />
          </Field>
        )}
        {esEstablecimiento && (
          <Field label="Tipo de establecimiento" span={6} hint="Formato 2024, casillero (19). Guardado acá, la guía lo llena sola al elegir este local (ADR-493)">
            <select
              className={I}
              value={b.tipoEstablecimiento ?? ""}
              onChange={(e) => set({ tipoEstablecimiento: esTipoEstablecimiento(e.target.value) ? e.target.value : "" })}
            >
              <option value="">Elige el tipo</option>
              {TIPOS_ESTABLECIMIENTO.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        )}
        {esConductor && (
          <Field label="Licencia de conducir" span={4} hint="Es lo que pide el puesto de control">
            <input type="text" className={`${I} font-mono`} value={b.licencia ?? ""} onChange={(e) => set({ licencia: e.target.value })} />
          </Field>
        )}
        {esProveedor && <CtpPartePasoProveedor form={form} />}
      </Seccion>
    </>
  );
}
