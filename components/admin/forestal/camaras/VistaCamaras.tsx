"use client";

/**
 * Vista «Cámaras»: dar de alta, copiar la dirección, avisos, pila y los
 * chalecos del personal — lo que se configura una vez y se toca poco. Vive en
 * su pestaña para que las fotos y el día del patio no tengan que bajar media
 * pantalla de formularios antes de mostrarse.
 */

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Camera, Hash, Loader2, Plus } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import CamaraFila from "./CamaraFila";
import GuiaHikvision from "./GuiaHikvision";
import { DireccionAviso } from "./AvisosCamaras";
import { direccionLocal, type DatosCamaras } from "./use-camaras";
import type { useConexionDirecta } from "./use-conexion-directa";
import {
  BLOQUE,
  BTN,
  CHIP_BASE,
  CHIP_TONO,
  nombreCorto,
  porQueNoSeCopia,
  type EstadoDireccion,
} from "./camaras-ui";

const CAMPO =
  "mt-1 h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

interface Props {
  datos: DatosCamaras;
  conexion: ReturnType<typeof useConexionDirecta>;
  estadoDireccion: EstadoDireccion;
  direccionParaCamara: (token: string) => string;
  onConectar: (id: string) => void;
  onAbrirChalecos: () => void;
}

export default function VistaCamaras({
  datos: d,
  conexion,
  estadoDireccion,
  direccionParaCamara,
  onConectar,
  onAbrirChalecos,
}: Props) {
  const [nombre, setNombre] = useState("");
  const [lugar, setLugar] = useState("");
  const crear = async () => {
    if (await d.crear(nombre, lugar)) {
      setNombre("");
      setLugar("");
    }
  };
  const asignados = Object.entries(d.chalecos).sort(([a], [b]) =>
    a.localeCompare(b, "es", { numeric: true }),
  );

  return (
    <div className="space-y-4">
      <DireccionAviso estado={estadoDireccion} />

      <section className={BLOQUE} aria-labelledby="camaras-lista-titulo">
        <div className="mb-3 flex items-center gap-1.5">
          <Camera className="h-4 w-4 text-[var(--accent-ink)]" aria-hidden />
          <CardTitle as="h3" id="camaras-lista-titulo" className="text-base font-bold">
            Cámaras del patio ({d.camaras.length})
          </CardTitle>
          <InfoTip
            title="Cámaras del patio"
            what="La cámara manda la foto cuando detecta algo, con su hora."
            affects="Si el panel la alcanza por la red, además se la puede ver ahora mismo con «Conectar»."
            example="Con panel solar y datos móviles conviene lo primero: transmitir todo el día vacía la batería."
          />
        </div>
        <form
          className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void crear();
          }}
        >
          <label className="block">
            <span className="text-sm font-bold text-[var(--text-secondary)]">Cámara nueva</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Portón de entrada"
              className={CAMPO}
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-[var(--text-secondary)]">
              Qué mira (opcional)
            </span>
            <input
              value={lugar}
              onChange={(e) => setLugar(e.target.value)}
              placeholder="Patio de trozas"
              className={CAMPO}
            />
          </label>
          <button
            type="submit"
            disabled={d.guardando || !nombre.trim()}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-600,var(--accent))] px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            {d.guardando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-4 w-4" aria-hidden />
            )}
            Agregar
          </button>
        </form>

        <ul className="mt-3 space-y-2">
          {d.camaras.map((c) => (
            <CamaraFila
              key={c.id}
              camara={c}
              direccion={direccionParaCamara(c.token)}
              motivoSinDireccion={porQueNoSeCopia(estadoDireccion)}
              direccionLocal={direccionLocal(c.token)}
              guardando={d.guardando}
              subiendo={d.subiendo === c.id}
              onConectar={() => onConectar(c.id)}
              onProbar={() => void conexion.probarDeNuevo(c)}
              onMover={(x, y, zoom) => conexion.moverCamara(c, x, y, zoom)}
              onSubir={(f) => void d.subirAMano(c, f)}
              onRotar={() => void d.rotar(c.id)}
              onQuitar={() => void d.quitar(c.id)}
              onGuardarAvisos={(whatsapp, cuando) => d.guardarAvisos(c.id, whatsapp, cuando)}
              onVigilarPila={(activa) => void d.vigilarPila(c.id, activa)}
              onFotoGuardada={() => void d.cargar({ silenciosa: true })}
              onErrorCopia={() =>
                d.setError("El navegador no dejó copiar. Selecciona la dirección a mano.")
              }
            />
          ))}
          {d.camaras.length === 0 && !d.cargando && (
            <li className="px-1 py-3 text-sm text-[var(--text-tertiary)]">
              Todavía no hay ninguna. Agrega la primera, copia su dirección y sigue la guía de
              abajo.
            </li>
          )}
        </ul>
        <GuiaHikvision />
      </section>

      <section className={BLOQUE} aria-labelledby="camaras-chalecos-titulo">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto flex items-center gap-1.5">
            <Hash className="h-4 w-4 text-[var(--accent-ink)]" aria-hidden />
            <CardTitle as="h3" id="camaras-chalecos-titulo" className="text-base font-bold">
              Chalecos del personal ({asignados.length})
            </CardTitle>
            <InfoTip
              title="Chalecos del personal"
              what="Cada número de chaleco o casco es de una persona: así la foto dice quién está en el patio."
              affects="La IA lee el número, no la cara. Con el número asignado, el día del patio cruza con la asistencia."
              example="N° 3 → Juan Pérez: la foto dice «N° 3 · Juan Pérez · marcó 07:58»."
            />
          </span>
          <button type="button" onClick={onAbrirChalecos} className={BTN}>
            <Hash className="h-4 w-4" aria-hidden /> Asignar chalecos
          </button>
        </div>
        {asignados.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {asignados.map(([n, a]) => (
              <span key={n} className={`${CHIP_BASE} ${CHIP_TONO.neutro}`}>
                <span className="font-mono font-bold">N° {n}</span>{" "}
                {nombreCorto(a.nombre) || "dado de baja"}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-[var(--text-tertiary)]">
            Ningún chaleco asignado: las fotos muestran el número sin nombre.
          </p>
        )}
      </section>
    </div>
  );
}
