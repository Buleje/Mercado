"use client";

/**
 * Vista «Cámaras»: dar de alta, copiar la dirección, avisos, pila y los
 * chalecos del personal — lo que se configura una vez y se toca poco. Vive en
 * su pestaña para que las fotos y el día del patio no tengan que bajar media
 * pantalla de formularios antes de mostrarse.
 */

import { useCallback } from "react";
import { CardTitle } from "@buleje/design-system";
import { Camera, Hash, Plus } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import CamaraFila from "./CamaraFila";
import LecturaUltimaFoto from "./LecturaUltimaFoto";
import MosaicoNubeBoton from "./MosaicoNubeBoton";
import { camposPuente, ultimaCapturaDe } from "./puente-pc";
import { useRecargaPuente } from "./use-puente-pc";
import RetencionPersonas from "./RetencionPersonas";
import GuiaHikvision from "./GuiaHikvision";
import VincularHikConnect from "./VincularHikConnect";
import { direccionLocal, type DatosCamaras } from "./use-camaras";
import type { useConexionDirecta } from "./use-conexion-directa";
import {
  BLOQUE,
  BTN,
  CHIP_BASE,
  CHIP_TONO,
  nombreCorto,
  porQueNoSeCopia,
  SOLO_ADMIN_DIRECCION,
  type EstadoDireccion,
} from "./camaras-ui";

interface Props {
  datos: DatosCamaras;
  conexion: ReturnType<typeof useConexionDirecta>;
  estadoDireccion: EstadoDireccion;
  direccionParaCamara: (token: string) => string;
  onConectar: (id: string) => void;
  onAbrirChalecos: () => void;
  /** «Agregar cámara»: el alta vive en un modal (la acción principal de la cabecera). */
  onAgregar: () => void;
  /** Tocar un chaleco sin dueño en la lectura del puente: abre la asignación con ese número. */
  onAsignarChaleco: (numero: string) => void;
}

export default function VistaCamaras({
  datos: d,
  conexion,
  estadoDireccion,
  direccionParaCamara,
  onConectar,
  onAbrirChalecos,
  onAgregar,
  onAsignarChaleco,
}: Props) {
  const { cargar } = d;
  const recargarCamaras = useCallback(() => void cargar({ silenciosa: true }), [cargar]);
  const esPuente = (c: (typeof d.camaras)[number]) => camposPuente(c).fuente === "puente_pc";
  useRecargaPuente(d.camaras.some(esPuente), () => void d.cargar({ silenciosa: true }));
  const asignados = Object.entries(d.chalecos).sort(([a], [b]) =>
    a.localeCompare(b, "es", { numeric: true }),
  );

  return (
    <div className="space-y-4">
      <section className={BLOQUE} aria-labelledby="camaras-lista-titulo">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Camera className="h-4 w-4 text-[var(--accent-ink)]" aria-hidden />
          <CardTitle as="h3" id="camaras-lista-titulo" className="text-sm font-bold">
            Cámaras del patio ({d.camaras.length})
          </CardTitle>
          <InfoTip
            title="Cámaras del patio"
            what="La cámara manda la foto cuando detecta algo, con su hora."
            affects="Si el panel la alcanza por la red, además se la puede ver ahora mismo con «Conectar»."
            example="Con panel solar y datos móviles conviene lo primero: transmitir todo el día vacía la batería."
          />
          <MosaicoNubeBoton camaras={d.camaras} />
        </div>

        <ul className="space-y-2">
          {d.camaras.map((c) => (
            <CamaraFila
              key={c.id}
              camara={c}
              direccion={direccionParaCamara(c.token)}
              motivoSinDireccion={c.token ? porQueNoSeCopia(estadoDireccion) : SOLO_ADMIN_DIRECCION}
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
              ultimaFoto={ultimaCapturaDe(d.capturas, c.id)}
              lecturaPuente={
                esPuente(c) ? (
                  <LecturaUltimaFoto
                    captura={ultimaCapturaDe(d.capturas, c.id)}
                    chalecosVivos={d.chalecos}
                    onConfirmar={d.confirmarCruce}
                    onAsignarChaleco={onAsignarChaleco}
                  />
                ) : undefined
              }
            />
          ))}
          {d.camaras.length === 0 && !d.cargando && (
            <li className="flex flex-wrap items-center gap-2 px-1 py-3 text-sm text-[var(--text-tertiary)]">
              Todavía no hay ninguna.
              <button type="button" onClick={onAgregar} className={BTN}>
                <Plus className="h-4 w-4" aria-hidden /> Agregar la primera
              </button>
            </li>
          )}
        </ul>
        <GuiaHikvision
          camaras={d.camaras}
          estado={estadoDireccion}
          direccionParaCamara={direccionParaCamara}
          onRecargar={recargarCamaras}
          onErrorCopia={() =>
            d.setError("El navegador no dejó copiar. Selecciona el valor a mano.")
          }
        />
      </section>

      <VincularHikConnect camaras={d.camaras} onCrear={(nombre) => d.crear(nombre, "")} />

      <section className={BLOQUE} aria-labelledby="camaras-chalecos-titulo">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto flex items-center gap-1.5">
            <Hash className="h-4 w-4 text-[var(--accent-ink)]" aria-hidden />
            <CardTitle as="h3" id="camaras-chalecos-titulo" className="text-sm font-bold">
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

      <RetencionPersonas />
    </div>
  );
}
