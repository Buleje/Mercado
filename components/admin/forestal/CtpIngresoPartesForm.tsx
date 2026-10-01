"use client";

/**
 * El cuerpo de la guía de INGRESO: propietario del producto (13–19),
 * destinatario (22–28) y transportista/vehículo (29–34).
 *
 * Es la MISMA forma que la guía de salida (`GtfDatos`), pero al revés: acá el
 * propietario es el titular del bosque —o quien vendió— y el destinatario es
 * este CTP. Por eso no se reutiliza `CtpGtfDatosForm`: ese trae «el propietario
 * es el emisor» y llenaría los casilleros del titular con el RUC del CTP.
 *
 * Nada es obligatorio: la guía ya se registró; esto es transcribir lo que el
 * papel trae y el operador no cargó al recibir. Cada casillero que se toque
 * queda marcado «a mano» en la ficha (ADR-392).
 */

import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { Field, I } from "./ctp-shared";

type Parte = GtfDatos["propietario"] | GtfDatos["destinatario"];

function ParteFields({
  parte,
  onChange,
  desde,
}: {
  parte: Parte;
  onChange: (v: Partial<Parte>) => void;
  /** Primer casillero del bloque: 13 para el propietario, 22 para el destinatario. */
  desde: 13 | 22;
}) {
  const c = (n: number) => desde + n;
  return (
    <>
      <Field span={6} label="Nombre o razón social" casillero={c(0)}>
        <input
          type="text"
          className={I}
          value={parte.nombre}
          onChange={(e) => onChange({ nombre: e.target.value })}
        />
      </Field>
      <Field span={2} label="Doc.">
        <select
          className={I}
          value={parte.docTipo}
          onChange={(e) => onChange({ docTipo: e.target.value as Parte["docTipo"] })}
        >
          <option value="RUC">RUC</option>
          <option value="DNI">DNI</option>
          <option value="CE">CE</option>
          <option value="PASAPORTE">Pasaporte</option>
        </select>
      </Field>
      <Field span={4} label="N° de documento" casillero={desde === 13 ? 14 : 23}>
        <input
          type="text"
          className={`${I} font-mono`}
          value={parte.docNumero}
          onChange={(e) => onChange({ docNumero: e.target.value })}
        />
      </Field>
      <Field span={6} label="Dirección" casillero={c(3)}>
        <input
          type="text"
          className={I}
          value={parte.direccion}
          onChange={(e) => onChange({ direccion: e.target.value })}
        />
      </Field>
      <Field span={2} label="Departamento" casillero={c(4)}>
        <input
          type="text"
          className={I}
          value={parte.departamento}
          onChange={(e) => onChange({ departamento: e.target.value })}
        />
      </Field>
      <Field span={2} label="Provincia" casillero={c(5)}>
        <input
          type="text"
          className={I}
          value={parte.provincia}
          onChange={(e) => onChange({ provincia: e.target.value })}
        />
      </Field>
      <Field span={2} label="Distrito" casillero={c(6)}>
        <input
          type="text"
          className={I}
          value={parte.distrito}
          onChange={(e) => onChange({ distrito: e.target.value })}
        />
      </Field>
    </>
  );
}

export default function CtpIngresoPartesForm({
  datos,
  onChange,
}: {
  datos: GtfDatos;
  onChange: (d: GtfDatos) => void;
}) {
  const set = <K extends "propietario" | "destinatario" | "transportista" | "vehiculo" | "guia">(
    k: K,
    v: Partial<GtfDatos[K]>,
  ) => onChange({ ...datos, [k]: { ...datos[k], ...v } });
  const esFluvial = datos.vehiculo.modo === "fluvial";

  return (
    <>
      <div className="sm:col-span-12">
        <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Propietario del producto · casilleros (13) a (19)
        </p>
      </div>
      <ParteFields parte={datos.propietario} onChange={(v) => set("propietario", v)} desde={13} />

      <div className="sm:col-span-12 mt-2">
        <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Destinatario · casilleros (22) a (28)
        </p>
      </div>
      <ParteFields parte={datos.destinatario} onChange={(v) => set("destinatario", v)} desde={22} />

      <div className="sm:col-span-12 mt-2">
        <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Transportista y vehículo · casilleros (29) a (34)
        </p>
      </div>
      <Field span={4} label="Empresa de transporte">
        <input
          type="text"
          className={I}
          value={datos.transportista.nombre}
          onChange={(e) => set("transportista", { nombre: e.target.value })}
        />
      </Field>
      <Field span={2} label="Modo" casillero={30}>
        <select
          className={I}
          value={datos.vehiculo.modo}
          onChange={(e) =>
            set("vehiculo", { modo: e.target.value as GtfDatos["vehiculo"]["modo"] })
          }
        >
          <option value="terrestre">Terrestre</option>
          <option value="fluvial">Fluvial</option>
          <option value="multimodal">Multimodal</option>
        </select>
      </Field>
      <Field span={3} label="Tipo de vehículo" casillero={31}>
        <input
          type="text"
          className={I}
          value={datos.vehiculo.tipo}
          onChange={(e) => set("vehiculo", { tipo: e.target.value })}
          placeholder={esFluvial ? "Chata, bote…" : "Camión, tráiler…"}
        />
      </Field>
      <Field span={3} label={esFluvial ? "Matrícula / embarcación" : "Placa"} casillero={31}>
        <input
          type="text"
          className={`${I} font-mono uppercase`}
          value={
            esFluvial ? datos.vehiculo.embarcacion || datos.vehiculo.placa : datos.vehiculo.placa
          }
          onChange={(e) =>
            set(
              "vehiculo",
              esFluvial
                ? { embarcacion: e.target.value.toUpperCase() }
                : { placa: e.target.value.toUpperCase() },
            )
          }
        />
      </Field>
      <Field span={6} label={esFluvial ? "Patrón" : "Conductor"} casillero={32}>
        <input
          type="text"
          className={I}
          value={datos.vehiculo.conductor}
          onChange={(e) => set("vehiculo", { conductor: e.target.value })}
        />
      </Field>
      <Field span={3} label="DNI del conductor" casillero={33}>
        <input
          type="text"
          className={`${I} font-mono`}
          value={datos.vehiculo.conductorDni}
          onChange={(e) => set("vehiculo", { conductorDni: e.target.value })}
        />
      </Field>
      <Field span={3} label="Licencia" casillero={34}>
        <input
          type="text"
          className={`${I} font-mono`}
          value={datos.vehiculo.licencia}
          onChange={(e) => set("vehiculo", { licencia: e.target.value })}
        />
      </Field>

      <div className="sm:col-span-12 mt-2">
        <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Documentos que acompañan · casilleros (35) y (36)
        </p>
      </div>
      <Field
        span={6}
        label="N° de lista de trozas"
        casillero={35}
        hint="La del titular, si vino con la guía"
      >
        <input
          type="text"
          className={`${I} font-mono`}
          value={datos.guia.listaTrozasNro}
          onChange={(e) => set("guia", { listaTrozasNro: e.target.value })}
        />
      </Field>
      <Field
        span={6}
        label="GTF de origen"
        casillero={36}
        hint="Sólo si la madera ya venía de otro CTP"
      >
        <input
          type="text"
          className={`${I} font-mono`}
          value={datos.guia.gtfOrigenNro}
          onChange={(e) => set("guia", { gtfOrigenNro: e.target.value })}
        />
      </Field>
    </>
  );
}
