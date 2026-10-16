"use client";

/**
 * Los dos bloques de la guía del bosque que NO son iguales a los del CTP:
 *
 *   · Propietario (13)–(21): en el bosque el dueño de la madera es el TITULAR
 *     del título habilitante, no la planta. «Es el titular» lo resume; se
 *     destilda cuando la madera ya es de un comprador.
 *   · Traslado (35)(36)(38): vive en `LothGuiaTraslado.tsx` (la ruta, la
 *     lista numerada y el origen). La partida, en `LothGuiaPartida.tsx`
 *     (15-10-2026, formato 2024); la llegada es el destinatario.
 *
 * 16-10-2026: con la cara del talonario — «DATOS DEL PROPIETARIO DEL
 * PRODUCTO» y las filas del papel: (12); (13) + (14a); (14b)(14c)(14d); (15) +
 * (16). El resumen del titular se lee sobre el renglón punteado.
 */

import { casilleroGtf2024 } from "@/lib/forestal/ctp-gtf-formato";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import type { Parte } from "@/lib/forestal/directorio";
import type { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { propietarioTitular } from "@/lib/forestal/loth-guia-despacho";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import CtpParteBarra from "./CtpParteBarra";
import type { GuardarEnLibreta } from "@/lib/forestal/libreta";
import { Bloque, DocsDeParte, UbicacionDeParte } from "./ctp-guia-bloques";
import { falta, libretaDe, type SeccionObjeto } from "./ctp-guia-partes-comun";
import { Btn, Field, I } from "./ctp-shared";
import { DatoDelPapel, rotuloGtf2024 } from "./loth-guia-papel-piezas";

type Directorio = ReturnType<typeof useDirectorioForestal>;

export interface PropsGuiaLoth {
  g: DespachoGuiaLoth;
  directorio: Directorio;
  onAnotarParte: (p: Parte) => void;
  onAnotarVehiculo: (id: string) => void;
  onGuardarEnLibreta: GuardarEnLibreta;
}

/** Parche superficial de una sección; lo demás no se toca. */
export function parcheDe(setDatos: Dispatch<SetStateAction<GtfDatos>>) {
  return <K extends SeccionObjeto>(k: K, v: Partial<GtfDatos[K]>) => setDatos((p) => ({ ...p, [k]: { ...p[k], ...v } }));
}

/** El número y el rótulo del papel 2024 del campo de clave interna `clave`. */
const n = (clave: string) => casilleroGtf2024(clave);
const R = (clave: string) => rotuloGtf2024(n(clave) ?? "");

/** (12)–(16) El dueño de la madera que viaja. */
export function BloquePropietarioLoth({ g, directorio, onAnotarParte, onGuardarEnLibreta, faltan }: PropsGuiaLoth & { faltan: string[] }) {
  const { datos, setDatos } = g;
  const set = parcheDe(setDatos);
  const prop = datos.propietario;
  const [editar, setEditar] = useState(false);
  const resumido = prop.esElCtp && !editar;

  function esElTitular(si: boolean) {
    setEditar(false);
    if (si && g.identidad) set("propietario", propietarioTitular(g.identidad));
    else set("propietario", { esElCtp: false, nombre: "", docNumero: "", direccion: "", departamento: "", provincia: "", distrito: "" });
  }

  return (
    <Bloque
      titulo="Propietario del producto"
      tituloPapel="Datos del propietario del producto"
      hint="Casilleros (12) a (16). Es el dueño de la madera que viaja: casi siempre el titular del permiso. Si ya se la vendió a alguien, destilda y elígelo del Directorio."
      faltan={faltan}
      acciones={
        <>
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-[var(--gtf-linea)] bg-[var(--surface-raised)] px-2.5 text-sm font-medium text-[var(--text-primary)]">
            <input type="checkbox" checked={prop.esElCtp} onChange={(e) => esElTitular(e.target.checked)} className="h-4 w-4 accent-[var(--brand-ink)]" />
            Es el titular
          </label>
          {prop.esElCtp ? (
            <Btn size="sm" variant="ghost" aria-pressed={editar} onClick={() => setEditar((v) => !v)}>
              {editar ? "Ver resumen" : "Editar"}
            </Btn>
          ) : (
            <CtpParteBarra
              {...libretaDe(directorio, "proveedor")}
              titulo="Propietario del producto"
              valor={prop}
              onAplicar={(v) => set("propietario", v)}
              onElegir={onAnotarParte}
              onGuardar={onGuardarEnLibreta}
            />
          )}
        </>
      }
    >
      {/* «Es el titular»: los datos salen del plan y la carátula, sobre el
          renglón del papel; «Editar» los abre en cajas. */}
      {resumido ? (
        <>
          <DatoDelPapel span={12} label={R("13")} casillero={n("13")} valor={prop.nombre} falta="en el plan de manejo" />
          <DatoDelPapel span={4} label={R("14")} casillero={n("14")} valor={prop.docNumero} mono falta="en la carátula" />
          <DatoDelPapel span={8} label={R("16")} casillero={n("16")} valor={prop.direccion} falta="en la carátula del libro" />
          <DatoDelPapel span={4} label={R("17")} casillero={n("17")} valor={prop.departamento} falta="en la carátula" />
          <DatoDelPapel span={4} label={R("18")} casillero={n("18")} valor={prop.provincia} falta="en la carátula" />
          <DatoDelPapel span={4} label={R("19")} casillero={n("19")} valor={prop.distrito} falta="en la carátula" />
        </>
      ) : (
        <>
          <Field span={12} label={R("13")} casillero={n("13")} required>
            <input type="text" className={`${I} ${falta(prop.nombre)}`} value={prop.nombre} onChange={(e) => set("propietario", { nombre: e.target.value })} />
          </Field>
          <DocsDeParte parte={prop} onChange={(v) => set("propietario", v)} casillero={n("14")} />
          <Field span={6} label={R("16")} casillero={n("16")}>
            <input type="text" className={I} value={prop.direccion} onChange={(e) => set("propietario", { direccion: e.target.value })} />
          </Field>
          <UbicacionDeParte parte={prop} onChange={(v) => set("propietario", v)} casilleros={[n("17"), n("18"), n("19")]} />
        </>
      )}
      <Field span={6} label={R("20")} casillero={n("20")} hint="Comprobante de la venta: la guía ampara el traslado y el comprobante, la operación.">
        <select
          className={I}
          value={datos.comprobante.tipo}
          onChange={(e) => setDatos((p) => ({ ...p, comprobante: { ...p.comprobante, tipo: e.target.value as GtfDatos["comprobante"]["tipo"] } }))}
        >
          <option value="ninguno">Seleccionar</option>
          <option value="factura">Factura</option>
          <option value="boleta">Boleta de venta</option>
          <option value="guia_remision">Guía de remisión</option>
          <option value="otro">Otro</option>
        </select>
      </Field>
      <Field span={6} label={R("21")} casillero={n("21")}>
        <input
          type="text"
          className={`${I} font-mono`}
          placeholder="F001-00001234"
          value={datos.comprobante.numero}
          onChange={(e) => setDatos((p) => ({ ...p, comprobante: { ...p.comprobante, numero: e.target.value } }))}
        />
      </Field>
    </Bloque>
  );
}
