"use client";

/**
 * Pestaña 1 · «Datos de la Guía de Transporte Forestal».
 *
 * Reproduce, bloque por bloque, la pantalla con la que se registra una GTF en el
 * LO-CTP del SNIFFS: la guía y su vigencia, la instancia que registra (este CTP,
 * que el sistema ya conoce), el propietario del producto, el destinatario y el
 * transportista con su vehículo. Abajo, el traslado y los títulos que amparan el
 * origen — sin eso la guía no se puede imprimir (`faltantesGtf`).
 *
 * Todo lo que se tipea acá vive en `gtfDatos` (JSONB validado por Zod): es el
 * cuerpo del documento, uno solo para las N líneas de producto que viajan.
 */

import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { CardTitle } from "@buleje/design-system";
import { TIPOS_DOCUMENTO_LOCTP } from "@/lib/forestal/loctp-campos";
import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import type { FichaCtp } from "@/hooks/use-ficha-ctp";
import type { Parte, RolParte } from "@/lib/forestal/directorio";
import type { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import CtpParteBarra, { CtpVehiculoBarra, type ValorParte } from "./CtpParteBarra";
import { Bloque, CampoSoloLectura, DocsDeParte, UbicacionDeParte } from "./ctp-guia-bloques";
import { Field, I } from "./ctp-shared";

type Directorio = ReturnType<typeof useDirectorioForestal>;
/** Claves de `GtfDatos` cuyo valor es un objeto plano — las que parchea `set`. */
type SeccionObjeto = "propietario" | "destinatario" | "transportista" | "vehiculo" | "traslado";

const direccionDe = (f: FichaCtp | null) =>
  [f?.direccion, f?.distrito, f?.provincia, f?.region].filter(Boolean).join(", ");

export default function CtpGuiaDatosTab({
  datos,
  setDatos,
  ficha,
  directorio,
  emision,
  onEmision,
  gtfNumber,
  onGtfNumber,
  docType,
  onDocType,
  onAnotarParte,
  onAnotarVehiculo,
  onGuardarEnLibreta,
  slotVerificacion,
  llevaCites = false,
}: {
  /** Si lo que sale incluye especie protegida: sin eso, el permiso no aplica. */
  llevaCites?: boolean;
  datos: GtfDatos;
  setDatos: Dispatch<SetStateAction<GtfDatos>>;
  ficha: FichaCtp | null;
  directorio: Directorio;
  /** Fecha de emisión = fecha de la línea del libro (`entryDate`). */
  emision: string;
  onEmision: (v: string) => void;
  gtfNumber: string;
  onGtfNumber: (v: string) => void;
  docType: string;
  onDocType: (v: string) => void;
  onAnotarParte: (p: Parte) => void;
  /** Se llama al elegir una placa de la libreta: el uso se cuenta al guardar. */
  onAnotarVehiculo: (id: string) => void;
  onGuardarEnLibreta: (v: ValorParte, rol: RolParte) => Promise<void>;
  /** Verificación de la guía contra SERFOR: va con el número, que es lo que verifica. */
  slotVerificacion?: React.ReactNode;
}) {
  const esFluvial = datos.vehiculo.modo === "fluvial";

  /** Parche superficial de una sección; el resto de los campos no se toca. */
  function set<K extends SeccionObjeto>(k: K, v: Partial<GtfDatos[K]>) {
    setDatos((p) => ({ ...p, [k]: { ...p[k], ...v } }));
  }
  function setGuia(v: Partial<GtfDatos["guia"]>) {
    setDatos((p) => ({ ...p, guia: { ...p.guia, ...v } }));
  }

  /** El CTP como propietario: su identidad sale de la Ficha. Destildar limpia,
   *  para que no quede el RUC del CTP a nombre de un tercero. */
  function propietarioEsElEmisor(esElCtp: boolean) {
    set(
      "propietario",
      esElCtp
        ? {
            esElCtp,
            nombre: ficha?.razonSocial || ficha?.nombreCtp || "",
            docTipo: "RUC",
            docNumero: ficha?.ruc ?? "",
            direccion: direccionDe(ficha),
            departamento: ficha?.region ?? "",
            provincia: ficha?.provincia ?? "",
            distrito: ficha?.distrito ?? "",
          }
        : { esElCtp, nombre: "", docNumero: "", direccion: "", departamento: "", provincia: "", distrito: "" },
    );
  }

  /** Los títulos de la Ficha, para elegir cuál ampara ESTE viaje. */
  const titulosFicha = useMemo(() => (ficha?.titulos ?? []).filter((t) => t.codigo?.trim()), [ficha]);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-2 xl:items-start">
        <Bloque titulo="Datos de la guía de transporte" hint="Vigencia y número del documento con el que sale el producto">
          <Field span={3} label="Fe. de emisión" required>
            <input type="date" className={I} value={emision} onChange={(e) => onEmision(e.target.value)} />
          </Field>
          <Field span={3} label="Fe. de vencimiento" hint="La fija la ARFFS">
            <input type="date" className={I} value={datos.traslado.fechaFin} onChange={(e) => set("traslado", { fechaFin: e.target.value })} />
          </Field>
          <Field span={3} label="Tipo de documento" casillero={3}>
            <select className={I} value={docType} onChange={(e) => onDocType(e.target.value)}>
              {TIPOS_DOCUMENTO_LOCTP.map((t) => (
                <option key={t.valor} value={t.valor}>{t.label}</option>
              ))}
            </select>
          </Field>
          {/* El N° NO se tipea (ADR-374): lo asigna el servidor al emitir, con un
              lock sobre los despachos del tenant. Es lo único que garantiza una
              serie sin huecos ni repetidos cuando dos tablets emiten a la vez.
              Se muestra igual —vacío mientras es borrador— porque es el
              casillero (4) del formato y quien cotea contra el papel lo busca. */}
          <Field
            span={3}
            label="Número de GTF"
            casillero={4}
            hint={gtfNumber ? undefined : "Se asigna solo al emitir la guía"}
          >
            <input
              type="text"
              className={`${I} font-mono`}
              placeholder="se asigna al emitir"
              value={gtfNumber}
              readOnly
              aria-readonly
            />
          </Field>
          <Field span={6} label="Autoridad que la ampara" casillero={2} hint="ARFFS competente">
            <input type="text" className={I} value={datos.guia.autoridad} onChange={(e) => setGuia({ autoridad: e.target.value })} placeholder={ficha?.arffs || "GORE · DRSAFFS"} />
          </Field>
          {/* La verificación en SERFOR comparte fila con la autoridad: es del
              mismo acto (de qué papel estamos hablando), no un bloque aparte. */}
          {slotVerificacion && <div className="sm:col-span-6">{slotVerificacion}</div>}
        </Bloque>

        <Bloque titulo="Datos de la instancia que hace el registro" hint="Sale de la Ficha del CTP: no se tipea en cada guía">
          <CampoSoloLectura span={3} label="Número de RUC" valor={ficha?.ruc ?? ""} falta="Cargalo en la pestaña Ficha CTP" />
          <CampoSoloLectura span={3} label="Razón social" valor={ficha?.razonSocial || ficha?.nombreCtp || ""} falta="Cargala en la pestaña Ficha CTP" />
          <CampoSoloLectura span={3} label="Código de CTP" valor={ficha?.codigoCtp ?? ""} falta="Lo asigna la ARFFS" />
          <CampoSoloLectura span={3} label="Domicilio de la planta" valor={direccionDe(ficha)} falta="Cargalo en la pestaña Ficha CTP" />
        </Bloque>
      </div>

      {/**
       * De a dos por fila.
       *
       * Los seis bloques iban apilados y el modal medía 2.4 pantallas de scroll:
       * el formato tiene sesenta casilleros y ninguno cabe con los otros a la
       * vista. Emparejados —propietario con destinatario, transportista con
       * traslado— el alto lo fija el más alto de cada par, no la suma.
       */}
      <div className="grid gap-3 xl:grid-cols-2 xl:items-start">
      <Bloque
        titulo="Propietario del producto"
        hint="Puede no ser el CTP: la norma distingue al dueño de la madera del titular del centro"
        acciones={
          !datos.propietario.esElCtp ? (
            <CtpParteBarra
              rol="proveedor"
              valor={datos.propietario}
              opciones={directorio.porRol("proveedor")}
              onAplicar={(v) => set("propietario", v)}
              onElegir={onAnotarParte}
              onGuardar={onGuardarEnLibreta}
            />
          ) : undefined
        }
      >
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)] sm:col-span-12 sm:-mb-1">
          <input
            type="checkbox"
            checked={datos.propietario.esElCtp}
            onChange={(e) => propietarioEsElEmisor(e.target.checked)}
            className="h-4 w-4 accent-[var(--brand-ink)]"
          />
          El propietario es el emisor (este CTP)
        </label>
        <Field span={6} label="Nombre o razón social" required>
          <input type="text" className={I} value={datos.propietario.nombre} onChange={(e) => set("propietario", { nombre: e.target.value })} />
        </Field>
        <DocsDeParte parte={datos.propietario} onChange={(v) => set("propietario", v)} />
        <Field span={6} label="Domicilio">
          <input type="text" className={I} value={datos.propietario.direccion} onChange={(e) => set("propietario", { direccion: e.target.value })} />
        </Field>
        <UbicacionDeParte parte={datos.propietario} onChange={(v) => set("propietario", v)} />
        {/* La GTF ampara el traslado; el comprobante, la operación. El control
            pide los dos, así que van juntos en el bloque del propietario. */}
        <Field span={6} label="Tipo comprobante de compra o venta" casillero={20}>
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
        <Field span={6} label="Número de comprobante" casillero={21}>
          <input
            type="text"
            className={`${I} font-mono`}
            placeholder="F001-00001234"
            value={datos.comprobante.numero}
            onChange={(e) => setDatos((p) => ({ ...p, comprobante: { ...p.comprobante, numero: e.target.value } }))}
          />
        </Field>
      </Bloque>

        <Bloque
          titulo="Destinatario · aserradero de destino"
          hint="A quién se le entrega el producto"
          acciones={
            <CtpParteBarra
              rol="destinatario"
              valor={datos.destinatario}
              opciones={directorio.porRol("destinatario")}
              onAplicar={(v) => set("destinatario", v)}
              onElegir={onAnotarParte}
              onGuardar={onGuardarEnLibreta}
            />
          }
        >
          <Field span={6} label="Nombre o razón social" required>
            <input type="text" className={I} value={datos.destinatario.nombre} onChange={(e) => set("destinatario", { nombre: e.target.value })} />
          </Field>
          <DocsDeParte parte={datos.destinatario} onChange={(v) => set("destinatario", v)} span={6} />
          <Field span={6} label="Domicilio" required hint="Punto de llegada que cotejan los controles">
            <input type="text" className={I} value={datos.destinatario.direccion} onChange={(e) => set("destinatario", { direccion: e.target.value })} />
          </Field>
          <UbicacionDeParte parte={datos.destinatario} onChange={(v) => set("destinatario", v)} conZona />
        </Bloque>
      </div>

      <div className="grid gap-3 xl:grid-cols-2 xl:items-start">
        <Bloque
          titulo="Transportista"
          hint="Quién mueve la carga y con qué vehículo"
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
          <Field span={6} label="Transportista" required hint="Empresa o persona del traslado">
            <input type="text" className={I} value={datos.transportista.nombre} onChange={(e) => set("transportista", { nombre: e.target.value })} />
          </Field>
          <Field span={3} label="Tipo de transporte">
            <select
              className={I}
              value={datos.vehiculo.tipoTransporte ?? "privado"}
              onChange={(e) => set("vehiculo", { tipoTransporte: e.target.value as "privado" | "publico" })}
            >
              <option value="privado">Privado — vehículo del titular</option>
              <option value="publico">Público — empresa de transporte</option>
            </select>
          </Field>
          <DocsDeParte parte={datos.transportista} onChange={(v) => set("transportista", v)} span={3} />
          <Field span={3} label="Registro MTC" hint="Si es empresa">
            <input type="text" className={I} value={datos.transportista.registroMtc} onChange={(e) => set("transportista", { registroMtc: e.target.value })} />
          </Field>

          {/* El chofer se elige aparte: en la selva es común que la empresa
              ponga el camión y el chofer sea otro. De la libreta viene con su
              licencia, que es lo que pide el puesto de control. */}
          <div className="sm:col-span-6">
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
          </div>
          <Field span={6} label={esFluvial ? "Patrón de la embarcación" : "Conductor"} required>
            <input type="text" className={I} value={datos.vehiculo.conductor} onChange={(e) => set("vehiculo", { conductor: e.target.value })} />
          </Field>
          <Field span={3} label="DNI">
            <input type="text" className={`${I} font-mono`} value={datos.vehiculo.conductorDni} onChange={(e) => set("vehiculo", { conductorDni: e.target.value })} />
          </Field>
          <Field span={3} label="Nro licencia">
            <input type="text" className={`${I} font-mono`} value={datos.vehiculo.licencia} onChange={(e) => set("vehiculo", { licencia: e.target.value })} />
          </Field>

          <Field span={3} label="Modo de transporte" hint="Río, carretera o mixto">
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
            <Field span={3} label="Nombre de la embarcación" required>
              <input type="text" className={I} value={datos.vehiculo.embarcacion} onChange={(e) => set("vehiculo", { embarcacion: e.target.value })} placeholder="Chata Doña Rosa" />
            </Field>
          ) : (
            <Field span={3} label="Tipo vehículo" hint="Camión, tráiler…">
              <input type="text" className={I} value={datos.vehiculo.tipo} onChange={(e) => set("vehiculo", { tipo: e.target.value })} />
            </Field>
          )}
          <div className="sm:col-span-6">
            <CtpVehiculoBarra vehiculos={directorio.vehiculosActivos} onAplicar={(v) => set("vehiculo", v)} onElegir={onAnotarVehiculo} />
          </div>
          <Field span={4} label={esFluvial ? "Matrícula" : "Nro placa"} required>
            <input type="text" className={`${I} font-mono uppercase`} value={datos.vehiculo.placa} onChange={(e) => set("vehiculo", { placa: e.target.value.toUpperCase() })} />
          </Field>
          <Field
            span={4}
            label="Nro placa remolque"
            noAplica={datos.vehiculo.placaRemolque?.trim() ? undefined : "sólo si el camión lleva remolque"}
          >
            <input
              type="text"
              className={`${I} font-mono uppercase`}
              value={datos.vehiculo.placaRemolque ?? ""}
              onChange={(e) => set("vehiculo", { placaRemolque: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field
            span={4}
            label="Nro guía de remisión"
            casillero={29}
            hint="La del transportista — no es el comprobante"
            noAplica={datos.guia.guiaRemisionNro?.trim() ? undefined : "sólo si el transportista la emitió"}
          >
            <input type="text" className={`${I} font-mono`} value={datos.guia.guiaRemisionNro} onChange={(e) => setGuia({ guiaRemisionNro: e.target.value })} />
          </Field>
        </Bloque>

        <Bloque titulo="Traslado y títulos habilitantes" hint="La ruta que se autoriza y con qué título sale la madera">
        <Field span={6} label="Punto de partida" required>
          <input type="text" className={I} value={datos.traslado.puntoPartida} onChange={(e) => set("traslado", { puntoPartida: e.target.value })} />
        </Field>
        <Field span={6} label="Punto de llegada" required>
          <input type="text" className={I} value={datos.traslado.puntoLlegada} onChange={(e) => set("traslado", { puntoLlegada: e.target.value })} />
        </Field>
        <Field span={12} label="Ruta declarada" hint="Los puestos de control la cotejan">
          <input type="text" className={I} value={datos.traslado.ruta} onChange={(e) => set("traslado", { ruta: e.target.value })} />
        </Field>
        <Field span={6} label="Título habilitante" required hint="Acredita el origen legal de la madera">
          {titulosFicha.length > 0 ? (
            <select
              className={I}
              value={datos.titulos[0] ?? ""}
              onChange={(e) => setDatos((p) => ({ ...p, titulos: e.target.value ? [e.target.value] : [] }))}
            >
              <option value="">Elegí el título</option>
              {titulosFicha.map((t) => (
                <option key={t.codigo} value={t.codigo}>{t.codigo}{t.planManejo ? ` · ${t.planManejo}` : ""}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              className={I}
              value={datos.titulos.join(", ")}
              onChange={(e) => setDatos((p) => ({ ...p, titulos: e.target.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10) }))}
            />
          )}
        </Field>
        <Field
          span={6}
          label="N° de permiso CITES"
          hint="Si la especie es protegida — es legal CON permiso"
          noAplica={llevaCites ? undefined : "ninguna especie de esta guía es protegida"}
        >
          <input type="text" className={I} value={datos.citesPermiso} onChange={(e) => setDatos((p) => ({ ...p, citesPermiso: e.target.value }))} />
        </Field>
        <div className="sm:col-span-12">
          <CardTitle as="p" className="text-xs text-[var(--text-tertiary)]">
            Sale en original y dos copias, como manda la RDE 122-2015 (art. 5). Lo que falte se puede completar después desde la ficha del despacho.
          </CardTitle>
        </div>
      </Bloque>
      </div>
    </div>
  );
}
