"use client";

/**
 * «Datos de la guía» del despacho con guía del Libro TH — los casilleros de la
 * GTF en el orden del papel, con los MISMOS bloques que la guía del CTP.
 *
 * Izquierda: el documento (1)(2)(3)(4), el título habilitante (5)–(12) y el
 * propietario (13)–(21). Derecha: el destinatario (22)–(28), el transporte
 * (29)–(34) y el traslado con (35)(36)(38). Casi todo llega ya escrito: el
 * título sale del plan de las trozas, el propietario es el titular y el
 * transporte se hereda de la guía anterior. Lo que el libro no sabe queda
 * vacío con «Falta» — nunca se rellena por rellenar.
 */

import { useMemo } from "react";
import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { faltantesGtf } from "@/lib/forestal/ctp-gtf-datos";
import { ORIGENES } from "@/lib/forestal/ctp-gtf-formato";
import { huecosDelTitulo } from "@/lib/forestal/loth-guia-despacho";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import CtpUbigeoSelects from "./CtpUbigeoSelects";
import { Bloque } from "./ctp-guia-bloques";
import { BloqueDestinatario, BloqueTransporte } from "./ctp-guia-bloques-partes";
import { CLASE_FALTA, ResumenDatos } from "./ctp-guia-piezas";
import { Btn, Field, FormularioClaro, I } from "./ctp-shared";
import { BloquePropietarioLoth, BloqueTrasladoLoth, parcheDe, type PropsGuiaLoth } from "./LothGuiaBloques";
import LothDestinoCtp from "./LothDestinoCtp";

const vacio = (v: string | null | undefined) => !v?.trim();
const falta = (v: string | null | undefined) => (vacio(v) ? CLASE_FALTA : "");


export default function LothGuiaDatos(props: PropsGuiaLoth) {
  const { g, directorio, onAnotarParte, onAnotarVehiculo, onGuardarEnLibreta } = props;
  const { datos, setDatos } = g;
  const set = parcheDe(setDatos);
  const faltanGtf = useMemo(
    () => faltantesGtf({ ...datos, traslado: { ...datos.traslado, fechaInicio: datos.traslado.fechaInicio || g.emision } }),
    [datos, g.emision],
  );
  const de = (...s: string[]) => faltanGtf.filter((f) => s.includes(f.seccion)).map((f) => f.campo);

  return (
    <FormularioClaro>
      <div data-guia-datos className="grid gap-3 xl:grid-cols-2 xl:items-start">
        <div className="grid gap-3">
          <BloqueDocumento g={g} />
          <BloqueTitulo g={g} faltaTitulo={de("titulos")} />
          <BloquePropietarioLoth {...props} faltan={de("propietario")} />
        </div>
        <div className="grid gap-3">
          <BloqueDestinatario
            datos={datos}
            set={set}
            directorio={directorio}
            onAnotarParte={onAnotarParte}
            onGuardarEnLibreta={onGuardarEnLibreta}
            faltan={de("destinatario")}
          />
          <LothDestinoCtp g={g} />
          <BloqueTransporte
            datos={datos}
            set={set}
            setDatos={setDatos}
            directorio={directorio}
            onAnotarParte={onAnotarParte}
            onAnotarVehiculo={onAnotarVehiculo}
            onGuardarEnLibreta={onGuardarEnLibreta}
            faltan={de("transportista", "vehiculo")}
          />
          <BloqueTrasladoLoth g={g} faltan={de("traslado")} />
        </div>
      </div>
    </FormularioClaro>
  );
}

/** (1)(2)(3)(4): el número del talonario, las fechas y la autoridad. */
function BloqueDocumento({ g }: { g: DespachoGuiaLoth }) {
  const { datos, setDatos } = g;
  const talonario = g.prep?.talonario;
  const propuesta = talonario?.propuesta ?? null;
  const ultimo = talonario?.ultimo ?? null;
  const ayudaNumero = ultimo
    ? `Sigue al ${ultimo.numero}${ultimo.fecha ? ` del ${etiquetaLarga(ultimo.fecha)}` : ""}. Confírmalo con el talonario que tienes en la mano.`
    : "Es la primera guía de este libro: escribe el N° de tu talonario. Las siguientes se proponen solas.";
  const faltan = [vacio(g.gtfNumber) ? "N° de GTF" : "", vacio(g.emision) ? "Fecha de expedición" : ""].filter(Boolean);
  return (
    <Bloque
      titulo="Documento"
      hint="El número del talonario del titular, las fechas y la autoridad que ampara la guía."
      faltan={faltan}
      acciones={
        propuesta && propuesta !== g.gtfNumber.trim() ? (
          <Btn size="sm" variant="ghost" onClick={() => g.setGtfNumber(propuesta)}>
            Usar el que sigue: <b className="font-mono tabular-nums">{propuesta}</b>
          </Btn>
        ) : null
      }
    >
      <Field span={4} label="N° de GTF" required hint={ayudaNumero}>
        <input
          type="text"
          className={`${I} font-mono tabular-nums ${falta(g.gtfNumber)}`}
          value={g.gtfNumber}
          onChange={(e) => g.setGtfNumber(e.target.value)}
          placeholder="019-0000001"
        />
      </Field>
      <Field span={4} label="Fecha de expedición" casillero={3} required>
        <input type="date" className={`${I} ${falta(g.emision)}`} value={g.emision} onChange={(e) => g.setEmision(e.target.value)} />
      </Field>
      <Field span={4} label="Vencimiento" casillero={4} hint="La fija la ARFFS por ruta y distancia. Se propone la de siempre y se corrige acá.">
        <input
          type="date"
          className={I}
          value={datos.traslado.fechaFin}
          onChange={(e) => setDatos((p) => ({ ...p, traslado: { ...p.traslado, fechaFin: e.target.value } }))}
        />
      </Field>
      <Field span={12} label="Autoridad forestal" casillero={2} hint="La ARFFS competente. Sale del plan de manejo de las trozas.">
        <input
          type="text"
          className={`${I} ${falta(datos.guia.autoridad)}`}
          value={datos.guia.autoridad}
          onChange={(e) => setDatos((p) => ({ ...p, guia: { ...p.guia, autoridad: e.target.value } }))}
          placeholder="ATFFS Selva Central"
        />
      </Field>
    </Bloque>
  );
}

/** (5)–(12): el título habilitante, tal como sale del plan y la carátula. */
function BloqueTitulo({ g, faltaTitulo }: { g: DespachoGuiaLoth; faltaTitulo: string[] }) {
  const { datos, setDatos } = g;
  const guia = datos.guia;
  const setGuia = (v: Partial<GtfDatos["guia"]>) => setDatos((p) => ({ ...p, guia: { ...p.guia, ...v } }));
  const huecos = huecosDelTitulo(datos);
  const f = g.identidad?.fuentes;
  const procedencia = [
    g.plan ? `el plan ${[g.plan.planNumber || g.plan.planType, g.plan.parcelaCorta].filter(Boolean).join(" · ")}` : "",
    f?.caratula ? "la carátula del libro" : "",
    f?.permiso ? "el permiso cargado" : "",
  ].filter(Boolean);
  return (
    <Bloque
      titulo="Título habilitante"
      hint={`Casilleros (5) a (12). Salen de ${procedencia.length ? procedencia.join(", ") : "lo que cargues acá"}: no se tipean en cada guía.`}
      nota="Lo que el libro no sabe queda en blanco en el papel, para llenarlo a mano sobre el talonario. Se corrige en el plan de manejo y sale bien en la próxima."
      faltan={[...faltaTitulo, ...huecos]}
    >
      <ResumenDatos
        datos={[
          { etiqueta: "(7) Titular", valor: g.identidad?.titular ?? "", ancho: 4, falta: "en el plan de manejo" },
        ]}
      />
      <Field span={6} label="Tipo de título" casillero={5} hint="La casilla que se cruza en el papel.">
        <select className={`${I} ${falta(guia.origenRecurso)}`} value={guia.origenRecurso} onChange={(e) => setGuia({ origenRecurso: e.target.value })}>
          <option value="">Sin marcar</option>
          {ORIGENES.map((o) => (
            <option key={o.clave} value={o.clave}>{o.label}</option>
          ))}
        </select>
      </Field>
      <Field span={6} label="N° del título habilitante" casillero={6} required>
        <input
          type="text"
          className={`${I} font-mono ${falta(datos.titulos[0])}`}
          value={datos.titulos[0] ?? ""}
          onChange={(e) => setDatos((p) => ({ ...p, titulos: e.target.value ? [e.target.value] : [] }))}
        />
      </Field>
      <Field span={6} label="Representante legal" hint="Va bajo el casillero (7) cuando el titular es una empresa o una comunidad.">
        <input type="text" className={I} value={guia.representanteLegal} onChange={(e) => setGuia({ representanteLegal: e.target.value })} />
      </Field>
      <Field span={6} label="N° de resolución" casillero={8}>
        <input type="text" className={`${I} ${falta(guia.resolucion)}`} value={guia.resolucion} onChange={(e) => setGuia({ resolucion: e.target.value })} />
      </Field>
      <Field span={12} label="Plan de manejo (tipo)" casillero={9}>
        <input type="text" className={`${I} ${falta(guia.planManejoTipo)}`} value={guia.planManejoTipo} onChange={(e) => setGuia({ planManejoTipo: e.target.value })} />
      </Field>
      <CtpUbigeoSelects
        span={4}
        valor={{ departamento: guia.departamento, provincia: guia.provincia, distrito: guia.distrito }}
        onChange={(v) => setGuia(v)}
      />
    </Bloque>
  );
}
