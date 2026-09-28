"use client";

/**
 * Los dos bloques de la guía del bosque que NO son iguales a los del CTP:
 *
 *   · Propietario (13)–(21): en el bosque el dueño de la madera es el TITULAR
 *     del título habilitante, no la planta. «Es el titular» lo resume; se
 *     destilda cuando la madera ya es de un comprador.
 *   · Traslado (35)(36)(38): sale de la parcela de corta; la lista de trozas
 *     lleva el N° de la guía y no hay GTF de origen (madera del bosque).
 */

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import type { Parte, RolParte } from "@/lib/forestal/directorio";
import type { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { propietarioTitular } from "@/lib/forestal/loth-guia-despacho";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import CtpParteBarra, { type ValorParte } from "./CtpParteBarra";
import { Bloque, DocsDeParte, UbicacionDeParte } from "./ctp-guia-bloques";
import { CLASE_FALTA, CLASE_NO_APLICA, ResumenDatos } from "./ctp-guia-piezas";
import type { SeccionObjeto } from "./ctp-guia-bloques-partes";
import { Btn, Field, I } from "./ctp-shared";

type Directorio = ReturnType<typeof useDirectorioForestal>;

export interface PropsGuiaLoth {
  g: DespachoGuiaLoth;
  directorio: Directorio;
  onAnotarParte: (p: Parte) => void;
  onAnotarVehiculo: (id: string) => void;
  onGuardarEnLibreta: (v: ValorParte, rol: RolParte) => Promise<void>;
}

/** Parche superficial de una sección; lo demás no se toca. */
export function parcheDe(setDatos: Dispatch<SetStateAction<GtfDatos>>) {
  return <K extends SeccionObjeto>(k: K, v: Partial<GtfDatos[K]>) => setDatos((p) => ({ ...p, [k]: { ...p[k], ...v } }));
}

const vacio = (v: string | null | undefined) => !v?.trim();
const falta = (v: string | null | undefined) => (vacio(v) ? CLASE_FALTA : "");

const TEXTAREA =
  "w-full rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] placeholder:text-[var(--text-tertiary)]";

/** (13)–(21) El dueño de la madera que viaja. */
export function BloquePropietarioLoth({ g, directorio, onAnotarParte, onGuardarEnLibreta, faltan }: PropsGuiaLoth & { faltan: string[] }) {
  const { datos, setDatos } = g;
  const set = parcheDe(setDatos);
  const prop = datos.propietario;
  const [editar, setEditar] = useState(false);
  const resumido = prop.esElCtp && !editar;
  const ubic = [prop.distrito, prop.provincia, prop.departamento].filter((x) => x?.trim()).join(", ");
  const domicilio = [prop.direccion, ubic].filter((x) => x.trim()).join(" · ");

  function esElTitular(si: boolean) {
    setEditar(false);
    if (si && g.identidad) set("propietario", propietarioTitular(g.identidad));
    else set("propietario", { esElCtp: false, nombre: "", docNumero: "", direccion: "", departamento: "", provincia: "", distrito: "" });
  }

  return (
    <Bloque
      titulo="Propietario del producto"
      hint="Casilleros (13) a (21). Es el dueño de la madera que viaja: casi siempre el titular del permiso. Si ya se la vendió a alguien, destilda y elígelo del Directorio."
      faltan={faltan}
      acciones={
        <>
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm font-medium text-[var(--text-primary)]">
            <input type="checkbox" checked={prop.esElCtp} onChange={(e) => esElTitular(e.target.checked)} className="h-4 w-4 accent-[var(--brand-ink)]" />
            Es el titular
          </label>
          {prop.esElCtp ? (
            <Btn size="sm" variant="ghost" aria-pressed={editar} onClick={() => setEditar((v) => !v)}>
              {editar ? "Ver resumen" : "Editar"}
            </Btn>
          ) : (
            <CtpParteBarra
              rol="proveedor"
              valor={prop}
              opciones={directorio.porRol("proveedor")}
              onAplicar={(v) => set("propietario", v)}
              onElegir={onAnotarParte}
              onGuardar={onGuardarEnLibreta}
            />
          )}
        </>
      }
    >
      {resumido ? (
        <ResumenDatos
          datos={[
            { etiqueta: "Nombre o razón social", valor: prop.nombre, ancho: 3, falta: "en el plan de manejo" },
            { etiqueta: prop.docTipo === "RUC" ? "RUC" : prop.docTipo, valor: prop.docNumero, mono: true, falta: "en la carátula" },
            { etiqueta: "Domicilio", valor: domicilio, ancho: 4, falta: "en la carátula del libro" },
          ]}
        />
      ) : (
        <>
          <Field span={6} label="Nombre o razón social" required>
            <input type="text" className={`${I} ${falta(prop.nombre)}`} value={prop.nombre} onChange={(e) => set("propietario", { nombre: e.target.value })} />
          </Field>
          <DocsDeParte parte={prop} onChange={(v) => set("propietario", v)} />
          <Field span={12} label="Domicilio">
            <input type="text" className={I} value={prop.direccion} onChange={(e) => set("propietario", { direccion: e.target.value })} />
          </Field>
          <UbicacionDeParte parte={prop} onChange={(v) => set("propietario", v)} />
        </>
      )}
      <Field span={6} label="Tipo de comprobante" casillero={20} hint="Comprobante de la venta: la guía ampara el traslado y el comprobante, la operación.">
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
      <Field span={6} label="N° de comprobante" casillero={21}>
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

/** Partida, llegada y ruta; (35) lista de trozas, (36) GTF de origen y (38) observaciones. */
export function BloqueTrasladoLoth({ g, faltan }: { g: DespachoGuiaLoth; faltan: string[] }) {
  const { datos, setDatos } = g;
  const set = parcheDe(setDatos);
  const setGuia = (v: Partial<GtfDatos["guia"]>) => setDatos((p) => ({ ...p, guia: { ...p.guia, ...v } }));
  const llevaCites = g.piezas.some((p) => p.cites);
  const origenNoAplica = vacio(datos.guia.gtfOrigenNro);
  return (
    <Bloque
      titulo="Traslado y detalle"
      hint="La ruta que se autoriza y los casilleros (35), (36) y (38)."
      nota="Sale en original y dos copias, como manda la RDE 122-2015 (art. 5), con la lista de trozas como anexo."
      faltan={faltan}
    >
      <Field span={6} label="Punto de partida" required hint="La parcela de corta y dónde queda el bosque. Sale del plan de manejo.">
        <input type="text" className={`${I} ${falta(datos.traslado.puntoPartida)}`} value={datos.traslado.puntoPartida} onChange={(e) => set("traslado", { puntoPartida: e.target.value })} />
      </Field>
      <Field span={6} label="Punto de llegada" required>
        <input type="text" className={`${I} ${falta(datos.traslado.puntoLlegada)}`} value={datos.traslado.puntoLlegada} onChange={(e) => set("traslado", { puntoLlegada: e.target.value })} />
      </Field>
      <Field span={12} label="Ruta declarada" hint="Los puestos de control la cotejan">
        <input type="text" className={I} value={datos.traslado.ruta} onChange={(e) => set("traslado", { ruta: e.target.value })} />
      </Field>
      <Field span={6} label="N° de la lista de trozas" casillero={35} hint="Vacío = la lista lleva el mismo N° de la guía, que es lo habitual.">
        <input
          type="text"
          className={`${I} font-mono`}
          placeholder={g.gtfNumber.trim() || "el N° de la guía"}
          value={datos.guia.listaTrozasNro}
          onChange={(e) => setGuia({ listaTrozasNro: e.target.value })}
        />
      </Field>
      <Field span={6} label="GTF de origen" casillero={36} hint={origenNoAplica ? "No aplica: la madera sale del bosque, ninguna guía anterior la ampara." : undefined}>
        <input
          type="text"
          className={`${I} font-mono ${origenNoAplica ? CLASE_NO_APLICA : ""}`}
          placeholder={origenNoAplica ? "no aplica" : undefined}
          value={datos.guia.gtfOrigenNro}
          onChange={(e) => setGuia({ gtfOrigenNro: e.target.value })}
        />
      </Field>
      <Field span={4} label="Permiso CITES" hint={llevaCites ? "Una troza es de especie protegida: va el N° de permiso CITES." : "No aplica: ninguna troza de esta guía es de especie protegida."}>
        <input
          type="text"
          className={`${I} ${llevaCites ? falta(datos.citesPermiso) : CLASE_NO_APLICA}`}
          placeholder={llevaCites ? undefined : "no aplica"}
          value={datos.citesPermiso}
          onChange={(e) => setDatos((p) => ({ ...p, citesPermiso: e.target.value }))}
        />
      </Field>
      <Field span={8} label="Observaciones" casillero={38}>
        <textarea
          rows={2}
          className={TEXTAREA}
          value={datos.observaciones}
          onChange={(e) => setDatos((p) => ({ ...p, observaciones: e.target.value }))}
        />
      </Field>
    </Bloque>
  );
}
