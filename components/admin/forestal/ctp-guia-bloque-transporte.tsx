"use client";

/**
 * (25)–(31) Transportista, conductor y vehículo de la GTF, compartido por la
 * guía de salida del CTP (`CtpGuiaDatosTab`) y la del bosque (Libro TH). Se
 * mudó de `ctp-guia-bloques-partes` el 16-10-2026 sin cambiar lo que dibuja.
 *
 * Con `FormularioPapel` (sólo el Libro TH, Brandon 16-10: «que se parezca lo
 * más posible a esos formatos») el bloque sigue el orden del talonario 2024:
 * (25) guía de remisión y (26) tipo de transporte, (27) vehículo y (28) placa,
 * (29) conductor, (30) DNI y (31) licencia; el transportista, que el papel no
 * imprime, va al final. Fuera del papel, el orden y los rótulos de siempre.
 */

import type { Dispatch, SetStateAction } from "react";
import { casilleroGtf2024 } from "@/lib/forestal/ctp-gtf-formato";
import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { leerPlaca } from "@/lib/forestal/placa-peru";
import CtpParteBarra, { CtpVehiculoBarra } from "./CtpParteBarra";
import { Bloque, DocsDeParte } from "./ctp-guia-bloques";
import { CLASE_NO_APLICA, SubBloque } from "./ctp-guia-piezas";
import { falta, libretaDe, vacio, type PropsParte } from "./ctp-guia-partes-comun";
import { CampoPlaca } from "./ctp-campo-placa";
import { PlacaDelVehiculo } from "./ctp-guia-placa";
import { Field, I, useEstiloFormulario } from "./ctp-shared";

type PropsTransporte = PropsParte & {
  setDatos: Dispatch<SetStateAction<GtfDatos>>;
  /** Se llama al elegir una placa de la libreta: el uso se cuenta al guardar. */
  onAnotarVehiculo: (id: string) => void;
};

/** El transportista: nombre, si es privado o público, documento y registro MTC. */
function SubTransportista({ datos, set, directorio, onAnotarParte, onGuardarEnLibreta, papel }: PropsTransporte & { papel: boolean }) {
  return (
    <SubBloque
      etiqueta={papel ? "Transportista · no sale en el papel" : "Transportista"}
      acciones={
        <CtpParteBarra
          {...libretaDe(directorio, "transportista")}
          valor={datos.transportista}
          onAplicar={(v) => set("transportista", v)}
          onElegir={onAnotarParte}
          onGuardar={onGuardarEnLibreta}
        />
      }
    >
      <Field span={6} label="Nombre o razón social" required hint="Empresa o persona del traslado">
        <input type="text" className={`${I} ${falta(datos.transportista.nombre)}`} value={datos.transportista.nombre} onChange={(e) => set("transportista", { nombre: e.target.value })} />
      </Field>
      {/* En el papel, «Tipo de transporte» es el (26) (terrestre o fluvial). */}
      <Field span={6} label={papel ? "Privado o público" : "Tipo de transporte"}>
        <select
          className={I}
          value={datos.vehiculo.tipoTransporte ?? "privado"}
          onChange={(e) => set("vehiculo", { tipoTransporte: e.target.value as "privado" | "publico" })}
        >
          <option value="privado">Privado — vehículo del titular</option>
          <option value="publico">Público — empresa de transporte</option>
        </select>
      </Field>
      <DocsDeParte parte={datos.transportista} onChange={(v) => set("transportista", v)} span={4} />
      <Field span={4} label="Registro MTC" hint="Si es empresa">
        <input type="text" className={I} value={datos.transportista.registroMtc} onChange={(e) => set("transportista", { registroMtc: e.target.value })} />
      </Field>
    </SubBloque>
  );
}

/* El chofer se elige aparte: en la selva es común que la empresa ponga el
   camión y el chofer sea otro. De la libreta viene con su licencia, que es lo
   que pide el puesto de control. */
function SubConductor({ datos, set, directorio, onAnotarParte, onGuardarEnLibreta, papel }: PropsTransporte & { papel: boolean }) {
  const esFluvial = datos.vehiculo.modo === "fluvial";
  const n = (clave: string) => (papel ? casilleroGtf2024(clave) : undefined);
  return (
    <SubBloque
      etiqueta={esFluvial ? "Patrón" : "Conductor"}
      acciones={
        <CtpParteBarra
          {...libretaDe(directorio, "conductor")}
          valor={{ nombre: datos.vehiculo.conductor, docTipo: "DNI", docNumero: datos.vehiculo.conductorDni, direccion: "", licencia: datos.vehiculo.licencia }}
          onAplicar={(v) =>
            set("vehiculo", {
              ...(v.nombre === undefined ? {} : { conductor: v.nombre }),
              ...(v.docNumero === undefined ? {} : { conductorDni: v.docNumero }),
            })
          }
          onElegir={(p) => {
            onAnotarParte(p);
            if (p.licencia) set("vehiculo", { licencia: p.licencia });
          }}
          onGuardar={(v) => onGuardarEnLibreta({ ...v, docTipo: "DNI" }, "conductor")}
        />
      }
    >
      <Field span={6} label={esFluvial ? "Patrón de la embarcación" : "Nombre del conductor"} casillero={n("32")} required>
        <input type="text" className={`${I} ${falta(datos.vehiculo.conductor)}`} value={datos.vehiculo.conductor} onChange={(e) => set("vehiculo", { conductor: e.target.value })} />
      </Field>
      <Field span={3} label={papel ? "DNI N°" : "DNI"} casillero={n("33")}>
        <input type="text" className={`${I} font-mono`} value={datos.vehiculo.conductorDni} onChange={(e) => set("vehiculo", { conductorDni: e.target.value })} />
      </Field>
      <Field span={3} label={papel ? "Lic. Conducir N.º" : "N° de licencia"} casillero={n("34")}>
        <input type="text" className={`${I} font-mono`} value={datos.vehiculo.licencia} onChange={(e) => set("vehiculo", { licencia: e.target.value })} />
      </Field>
    </SubBloque>
  );
}

/** Vehículo o embarcación, la placa con «Buscar», el remolque y la guía de remisión. */
function SubVehiculo({ datos, set, setDatos, directorio, onAnotarVehiculo, papel }: PropsTransporte & { papel: boolean }) {
  const esFluvial = datos.vehiculo.modo === "fluvial";
  const n = (clave: string) => (papel ? casilleroGtf2024(clave) : undefined);
  const setGuia = (v: Partial<GtfDatos["guia"]>) => setDatos((p) => ({ ...p, guia: { ...p.guia, ...v } }));
  // «-» y «/ -» también son «no hay remolque» (así viene de SERFOR).
  const remolqueNoAplica = leerPlaca(datos.vehiculo.placaRemolque).estado === "vacia";
  const remisionNoAplica = vacio(datos.guia.guiaRemisionNro);
  const remision = (
    <Field
      span={6}
      label={papel ? "N.º Guía de Remisión de Transportista" : "Guía de remisión"}
      casillero={casilleroGtf2024("29")}
      hint={`${remisionNoAplica ? "No aplica: sólo si el transportista la emitió. " : ""}Es la guía del transportista, no el comprobante.`}
    >
      <input
        type="text"
        className={`${I} font-mono ${remisionNoAplica ? CLASE_NO_APLICA : ""}`}
        placeholder={remisionNoAplica ? "no aplica" : undefined}
        value={datos.guia.guiaRemisionNro}
        onChange={(e) => setGuia({ guiaRemisionNro: e.target.value })}
      />
    </Field>
  );
  return (
    <SubBloque
      etiqueta={esFluvial ? "Embarcación" : "Vehículo"}
      acciones={
        <CtpVehiculoBarra
          vehiculos={directorio.vehiculosActivos}
          partes={directorio.partes.filter((p) => p.activo)}
          borrador={datos.vehiculo}
          onAplicar={(v) => set("vehiculo", v)}
          onElegir={onAnotarVehiculo}
          onGuardarVehiculo={directorio.guardarVehiculo}
          onGuardarParte={directorio.guardarParte}
        />
      }
    >
      {papel && remision}
      <Field span={papel ? 6 : 4} label={papel ? "Tipo de Transporte" : "Modo de transporte"} casillero={n("30")} hint="Río, carretera o mixto">
        <select
          className={I}
          value={datos.vehiculo.modo}
          onChange={(e) => set("vehiculo", { modo: e.target.value as "terrestre" | "fluvial" | "multimodal" })}
        >
          <option value="terrestre">Terrestre</option>
          <option value="fluvial">Fluvial</option>
          <option value="multimodal">Multimodal (río + carretera)</option>
        </select>
      </Field>
      {esFluvial ? (
        <Field span={4} label="Embarcación" casillero={n("31")} required hint="Nombre de la embarcación">
          <input type="text" className={`${I} ${falta(datos.vehiculo.embarcacion)}`} value={datos.vehiculo.embarcacion} onChange={(e) => set("vehiculo", { embarcacion: e.target.value })} placeholder="Chata Doña Rosa" />
        </Field>
      ) : (
        <Field span={4} label="Tipo de vehículo" casillero={n("31")} hint="Camión, tráiler…">
          <input type="text" className={I} value={datos.vehiculo.tipo} onChange={(e) => set("vehiculo", { tipo: e.target.value })} />
        </Field>
      )}
      {/* Por río el casillero lleva la MATRÍCULA de la embarcación, que no
          sigue el formato de la placa: ahí no se formatea ni se valida. */}
      {esFluvial ? (
        <Field span={4} label="Matrícula" casillero={n("31p")} required>
          <input type="text" className={`${I} font-mono uppercase ${falta(datos.vehiculo.placa)}`} value={datos.vehiculo.placa} onChange={(e) => set("vehiculo", { placa: e.target.value.toUpperCase() })} />
        </Field>
      ) : (
        <PlacaDelVehiculo datos={datos} set={set} span={4} casillero={n("31p")} />
      )}
      <CampoPlaca
        label="Placa del remolque"
        casillero={n("31p")}
        span={papel ? 4 : 6}
        opcional
        validar={!esFluvial}
        hint={remolqueNoAplica ? "No aplica: sólo si el camión lleva remolque" : undefined}
        valor={datos.vehiculo.placaRemolque ?? ""}
        onCambio={(v) => set("vehiculo", { placaRemolque: v })}
      />
      {!papel && remision}
    </SubBloque>
  );
}

/** (25)–(31) Transportista, conductor y vehículo. */
export function BloqueTransporte(props: PropsTransporte) {
  const papel = useEstiloFormulario() === "papel";
  const transportista = <SubTransportista {...props} papel={papel} />;
  return (
    <Bloque
      titulo="Transporte"
      tituloPapel="Datos del transportista"
      hint="Quién mueve la carga, quién maneja y en qué vehículo."
      faltan={props.faltan}
    >
      {!papel && transportista}
      {papel && <SubVehiculo {...props} papel />}
      <SubConductor {...props} papel={papel} />
      {!papel && <SubVehiculo {...props} papel={false} />}
      {papel && transportista}
    </Bloque>
  );
}
