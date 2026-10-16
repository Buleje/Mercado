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
 *
 * 15-10-2026: cada libreta abre su ventana (`LibretaModal`) con las partes de
 * ese papel, las demás de la libreta abajo (elegir una le suma el papel) y
 * «Agregar nuevo», que guarda la ficha completa en el Directorio (`libretaDe`).
 * Con `llegada`, el destinatario es además el punto de llegada (formato 2024,
 * RDE D000014-2024-MIDAGRI-SERFOR-DE: no hay un bloque de llegada aparte).
 */

import type { Dispatch, SetStateAction } from "react";
import { componerPunto, llegadaDelDestinatario, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { ordenarPorUso, parteAInput, type Parte, type RolParte } from "@/lib/forestal/directorio";
import { leerPlaca } from "@/lib/forestal/placa-peru";
import type { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import CtpParteBarra, { CtpVehiculoBarra, type ValorParte } from "./CtpParteBarra";
import { Bloque, DocsDeParte, UbicacionDeParte } from "./ctp-guia-bloques";
import { CLASE_FALTA, CLASE_NO_APLICA, SubBloque } from "./ctp-guia-piezas";
import { CampoPlaca } from "./ctp-campo-placa";
import { PlacaDelVehiculo } from "./ctp-guia-placa";
import { Field, I } from "./ctp-shared";

type Directorio = ReturnType<typeof useDirectorioForestal>;
/** Claves de `GtfDatos` cuyo valor es un objeto plano — las que parchea `set`. */
export type SeccionObjeto = "propietario" | "destinatario" | "transportista" | "vehiculo" | "traslado";
/** Parche superficial de una sección de la guía. */
export type SetSeccion = <K extends SeccionObjeto>(k: K, v: Partial<GtfDatos[K]>) => void;

const vacio = (v: string | null | undefined) => !v?.trim();
const falta = (v: string | null | undefined) => (vacio(v) ? CLASE_FALTA : "");

/**
 * Lo que la libreta de un bloque necesita: las partes con ese papel, las demás
 * (activas, por uso: elegir una le suma el papel) y el alta completa en el
 * Directorio. Se arma igual en todos los bloques de la guía.
 */
export function libretaDe(directorio: Directorio, rol: RolParte, opciones: Parte[] = directorio.porRol(rol)) {
  const ya = new Set(opciones.map((p) => p.id));
  return {
    rol,
    opciones,
    otras: ordenarPorUso(directorio.partes.filter((p) => p.activo && !ya.has(p.id))),
    onCrear: directorio.guardarParte,
    onSumarRol: async (p: Parte, r: RolParte) => {
      await directorio.guardarParte({ ...parteAInput(p), roles: [...new Set([...p.roles, r])] });
    },
  };
}

interface PropsParte {
  datos: GtfDatos;
  set: SetSeccion;
  directorio: Directorio;
  onAnotarParte: (p: Parte) => void;
  onGuardarEnLibreta: (v: ValorParte, rol: RolParte) => Promise<void>;
  /** Lo que le falta al bloque para imprimir la guía. */
  faltan: readonly string[];
}

/**
 * (22)–(28) A quién se le entrega la madera. Con `llegada` (guía del Libro TH,
 * formato 2024): (21) nombre, (22) N° de autorización, (23) DNI/RUC y (24) la
 * dirección hacia donde va la carga, que es el punto de llegada.
 */
export function BloqueDestinatario({
  datos,
  set,
  directorio,
  onAnotarParte,
  onGuardarEnLibreta,
  faltan,
  llegada,
}: PropsParte & { llegada?: boolean }) {
  const d = datos.destinatario;
  const autorizacionNoAplica = vacio(d.autorizacion);
  const punto = llegada ? componerPunto(llegadaDelDestinatario(datos)) : "";
  return (
        <Bloque
          titulo={llegada ? "Destinatario y punto de llegada" : "Destinatario"}
          hint={
            llegada
              ? "A quién se le entrega el producto y a dónde va. En el formato 2024 (RDE D000014-2024-MIDAGRI-SERFOR-DE) la llegada es la dirección del destinatario: no hay otro bloque."
              : "A quién se le entrega el producto: el aserradero o comprador de destino."
          }
          faltan={faltan}
          acciones={
            <CtpParteBarra
              {...libretaDe(directorio, "destinatario", directorio.receptores())}
              titulo={llegada ? "Destinatario y llegada" : undefined}
              valor={d}
              onAplicar={(v) => set("destinatario", v)}
              onElegir={(p) => {
                onAnotarParte(p);
                if (llegada) set("destinatario", { autorizacion: p.codigoCtp ?? "" });
              }}
              onGuardar={onGuardarEnLibreta}
            />
          }
        >
          <Field span={llegada ? 8 : 6} label="Nombre o razón social" required>
            <input type="text" className={`${I} ${falta(d.nombre)}`} value={d.nombre} onChange={(e) => set("destinatario", { nombre: e.target.value })} />
          </Field>
          {llegada && (
            <Field
              span={4}
              label="N° de autorización"
              hint="Formato 2024, casillero (22): la autorización del CTP o depósito que recibe. Si es una persona sin establecimiento, «No aplica»."
            >
              <input
                type="text"
                className={`${I} font-mono ${autorizacionNoAplica ? CLASE_NO_APLICA : ""}`}
                placeholder={autorizacionNoAplica ? "no aplica" : undefined}
                value={d.autorizacion}
                onChange={(e) => set("destinatario", { autorizacion: e.target.value })}
              />
            </Field>
          )}
          <DocsDeParte parte={d} onChange={(v) => set("destinatario", v)} span={llegada ? 6 : 3} />
          <Field
            span={8}
            label={llegada ? "Dirección de llegada" : "Domicilio"}
            required
            hint={llegada ? "Formato 2024, casillero (24): la dirección hacia donde se dirige la carga." : "Punto de llegada que cotejan los controles"}
          >
            <input type="text" className={`${I} ${falta(d.direccion)}`} value={d.direccion} onChange={(e) => set("destinatario", { direccion: e.target.value })} />
          </Field>
          <UbicacionDeParte parte={d} onChange={(v) => set("destinatario", v)} conZona />
          {llegada && (
            <p className="text-xs text-[var(--text-secondary)] sm:col-span-12">
              Llegada en la guía: <b className="text-[var(--text-primary)]">{punto || "falta la dirección y el ubigeo"}</b>
            </p>
          )}
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
  // «-» y «/ -» también son «no hay remolque» (así viene de SERFOR).
  const remolqueNoAplica = leerPlaca(datos.vehiculo.placaRemolque).estado === "vacia";
  const remisionNoAplica = vacio(datos.guia.guiaRemisionNro);
  return (
        <Bloque titulo="Transporte" hint="Quién mueve la carga, quién maneja y en qué vehículo." faltan={faltan}>
          <SubBloque
            etiqueta="Transportista"
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
                {...libretaDe(directorio, "conductor")}
                valor={{ nombre: datos.vehiculo.conductor, docTipo: "DNI", docNumero: datos.vehiculo.conductorDni, direccion: "" }}
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
            acciones={
              <CtpVehiculoBarra
                vehiculos={directorio.vehiculosActivos}
                borrador={datos.vehiculo}
                onAplicar={(v) => set("vehiculo", v)}
                onElegir={onAnotarVehiculo}
                onGuardarVehiculo={directorio.guardarVehiculo}
              />
            }
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
            {/* Por río el casillero lleva la MATRÍCULA de la embarcación, que no
                sigue el formato de la placa: ahí no se formatea ni se valida. */}
            {esFluvial ? (
              <Field span={4} label="Matrícula" required>
                <input type="text" className={`${I} font-mono uppercase ${falta(datos.vehiculo.placa)}`} value={datos.vehiculo.placa} onChange={(e) => set("vehiculo", { placa: e.target.value.toUpperCase() })} />
              </Field>
            ) : (
              <PlacaDelVehiculo datos={datos} set={set} span={4} />
            )}
            <CampoPlaca
              label="Placa del remolque"
              span={6}
              opcional
              validar={!esFluvial}
              hint={remolqueNoAplica ? "No aplica: sólo si el camión lleva remolque" : undefined}
              valor={datos.vehiculo.placaRemolque ?? ""}
              onCambio={(v) => set("vehiculo", { placaRemolque: v })}
            />
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
