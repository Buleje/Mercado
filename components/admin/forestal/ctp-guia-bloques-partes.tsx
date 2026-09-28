"use client";

/**
 * Los bloques Destinatario y Transporte de la GTF, compartidos por las dos
 * guías que emite el sistema: la de salida del CTP (`CtpGuiaDatosTab`) y la del
 * bosque (Libro TH, «Despachar con guía», 28-09-2026).
 *
 * Son el mismo papel —casilleros (22) a (34) del formato SERFOR— y eligen de la
 * misma libreta. Vivían dentro de la pestaña del CTP; se mudaron sin cambiar
 * una línea de lo que dibujan para que la guía del bosque no fuera una copia
 * que se queda atrás el día que se toque una.
 */

import type { Dispatch, SetStateAction } from "react";
import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import type { Parte, RolParte } from "@/lib/forestal/directorio";
import type { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import CtpParteBarra, { CtpVehiculoBarra, type ValorParte } from "./CtpParteBarra";
import { Bloque, DocsDeParte, UbicacionDeParte } from "./ctp-guia-bloques";
import { CLASE_FALTA, CLASE_NO_APLICA, SubBloque } from "./ctp-guia-piezas";
import { Field, I } from "./ctp-shared";

type Directorio = ReturnType<typeof useDirectorioForestal>;
/** Claves de `GtfDatos` cuyo valor es un objeto plano — las que parchea `set`. */
export type SeccionObjeto = "propietario" | "destinatario" | "transportista" | "vehiculo" | "traslado";
/** Parche superficial de una sección de la guía. */
export type SetSeccion = <K extends SeccionObjeto>(k: K, v: Partial<GtfDatos[K]>) => void;

const vacio = (v: string | null | undefined) => !v?.trim();
const falta = (v: string | null | undefined) => (vacio(v) ? CLASE_FALTA : "");

interface PropsParte {
  datos: GtfDatos;
  set: SetSeccion;
  directorio: Directorio;
  onAnotarParte: (p: Parte) => void;
  onGuardarEnLibreta: (v: ValorParte, rol: RolParte) => Promise<void>;
  /** Lo que le falta al bloque para imprimir la guía. */
  faltan: readonly string[];
}

/** (22)–(28) A quién se le entrega la madera. */
export function BloqueDestinatario({ datos, set, directorio, onAnotarParte, onGuardarEnLibreta, faltan }: PropsParte) {
  return (
        <Bloque
          titulo="Destinatario"
          hint="A quién se le entrega el producto: el aserradero o comprador de destino."
          faltan={faltan}
          acciones={
            <CtpParteBarra
              rol="destinatario"
              valor={datos.destinatario}
              opciones={directorio.receptores()}
              onAplicar={(v) => set("destinatario", v)}
              onElegir={onAnotarParte}
              onGuardar={onGuardarEnLibreta}
            />
          }
        >
          <Field span={6} label="Nombre o razón social" required>
            <input type="text" className={`${I} ${falta(datos.destinatario.nombre)}`} value={datos.destinatario.nombre} onChange={(e) => set("destinatario", { nombre: e.target.value })} />
          </Field>
          <DocsDeParte parte={datos.destinatario} onChange={(v) => set("destinatario", v)} />
          <Field span={8} label="Domicilio" required hint="Punto de llegada que cotejan los controles">
            <input type="text" className={`${I} ${falta(datos.destinatario.direccion)}`} value={datos.destinatario.direccion} onChange={(e) => set("destinatario", { direccion: e.target.value })} />
          </Field>
          <UbicacionDeParte parte={datos.destinatario} onChange={(v) => set("destinatario", v)} conZona />
        </Bloque>
  );
}

/** (29)–(34) Transportista, conductor y vehículo. */
export function BloqueTransporte({
  datos,
  set,
  setDatos,
  directorio,
  onAnotarParte,
  onAnotarVehiculo,
  onGuardarEnLibreta,
  faltan,
}: PropsParte & {
  setDatos: Dispatch<SetStateAction<GtfDatos>>;
  /** Se llama al elegir una placa de la libreta: el uso se cuenta al guardar. */
  onAnotarVehiculo: (id: string) => void;
}) {
  const esFluvial = datos.vehiculo.modo === "fluvial";
  const setGuia = (v: Partial<GtfDatos["guia"]>) => setDatos((p) => ({ ...p, guia: { ...p.guia, ...v } }));
  const remolqueNoAplica = vacio(datos.vehiculo.placaRemolque);
  const remisionNoAplica = vacio(datos.guia.guiaRemisionNro);
  return (
        <Bloque titulo="Transporte" hint="Quién mueve la carga, quién maneja y en qué vehículo." faltan={faltan}>
          <SubBloque
            etiqueta="Transportista"
            acciones={
              <CtpParteBarra
                rol="transportista"
                valor={datos.transportista}
                opciones={directorio.porRol("transportista")}
                onAplicar={(v) => set("transportista", v)}
                onElegir={onAnotarParte}
                onGuardar={onGuardarEnLibreta}
              />
            }
          >
            <Field span={6} label="Nombre o razón social" required hint="Empresa o persona del traslado">
              <input type="text" className={`${I} ${falta(datos.transportista.nombre)}`} value={datos.transportista.nombre} onChange={(e) => set("transportista", { nombre: e.target.value })} />
            </Field>
            <Field span={6} label="Tipo de transporte">
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

          {/* El chofer se elige aparte: en la selva es común que la empresa
              ponga el camión y el chofer sea otro. De la libreta viene con su
              licencia, que es lo que pide el puesto de control. */}
          <SubBloque
            etiqueta={esFluvial ? "Patrón" : "Conductor"}
            acciones={
              <CtpParteBarra
                rol="conductor"
                valor={{ nombre: datos.vehiculo.conductor, docTipo: "DNI", docNumero: datos.vehiculo.conductorDni, direccion: "" }}
                opciones={directorio.porRol("conductor")}
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
            <Field span={6} label={esFluvial ? "Patrón de la embarcación" : "Nombre del conductor"} required>
              <input type="text" className={`${I} ${falta(datos.vehiculo.conductor)}`} value={datos.vehiculo.conductor} onChange={(e) => set("vehiculo", { conductor: e.target.value })} />
            </Field>
            <Field span={3} label="DNI">
              <input type="text" className={`${I} font-mono`} value={datos.vehiculo.conductorDni} onChange={(e) => set("vehiculo", { conductorDni: e.target.value })} />
            </Field>
            <Field span={3} label="N° de licencia">
              <input type="text" className={`${I} font-mono`} value={datos.vehiculo.licencia} onChange={(e) => set("vehiculo", { licencia: e.target.value })} />
            </Field>
          </SubBloque>

          <SubBloque
            etiqueta={esFluvial ? "Embarcación" : "Vehículo"}
            acciones={<CtpVehiculoBarra vehiculos={directorio.vehiculosActivos} onAplicar={(v) => set("vehiculo", v)} onElegir={onAnotarVehiculo} />}
          >
            <Field span={4} label="Modo de transporte" hint="Río, carretera o mixto">
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
              <Field span={4} label="Embarcación" required hint="Nombre de la embarcación">
                <input type="text" className={`${I} ${falta(datos.vehiculo.embarcacion)}`} value={datos.vehiculo.embarcacion} onChange={(e) => set("vehiculo", { embarcacion: e.target.value })} placeholder="Chata Doña Rosa" />
              </Field>
            ) : (
              <Field span={4} label="Tipo de vehículo" hint="Camión, tráiler…">
                <input type="text" className={I} value={datos.vehiculo.tipo} onChange={(e) => set("vehiculo", { tipo: e.target.value })} />
              </Field>
            )}
            <Field span={4} label={esFluvial ? "Matrícula" : "Placa"} required>
              <input type="text" className={`${I} font-mono uppercase ${falta(datos.vehiculo.placa)}`} value={datos.vehiculo.placa} onChange={(e) => set("vehiculo", { placa: e.target.value.toUpperCase() })} />
            </Field>
            <Field span={6} label="Placa del remolque" hint={remolqueNoAplica ? "No aplica: sólo si el camión lleva remolque" : undefined}>
              <input
                type="text"
                className={`${I} font-mono uppercase ${remolqueNoAplica ? CLASE_NO_APLICA : ""}`}
                placeholder={remolqueNoAplica ? "no aplica" : undefined}
                value={datos.vehiculo.placaRemolque ?? ""}
                onChange={(e) => set("vehiculo", { placaRemolque: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field
              span={6}
              label="Guía de remisión"
              casillero={29}
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
          </SubBloque>
        </Bloque>
  );
}
