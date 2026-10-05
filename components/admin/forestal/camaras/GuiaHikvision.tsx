"use client";

/**
 * Cómo conectar la Hikvision DS-2CFSP4/4G (solar + 4G) para que mande cada
 * detección al sistema — paso a paso, con los valores de ESTA cámara para
 * copiar y la prueba al final (2026-10-05).
 *
 * Con chip 4G la cámara no tiene página web alcanzable (CGNAT) y la ficha
 * oficial no trae navegador web («Client: Hik-Connect»): se configura desde
 * la PC con iVMS-4200, entrando con la cuenta Hik-Connect. Fuentes y lo que
 * no está verificado: `hik-connect.ts`.
 *
 * Abierta, recarga las cámaras cada 20 s: el «último aviso» cambia solo
 * mientras Brandon configura en la otra ventana.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  CheckCircle2,
  Globe,
  HelpCircle,
  Monitor,
  Settings,
} from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { CHIP_BASE, CHIP_TONO, type EstadoDireccion } from "./camaras-ui";
import type { CamaraConConexion } from "./conexion-camara";
import { FUENTES_GUIA } from "./hik-connect";
import ProbarRecepcion from "./ProbarRecepcion";
import { lineaDeAviso } from "./ultimo-aviso";
import { useAhora } from "./use-plataforma";
import ValoresHttpListening from "./ValoresHttpListening";

const RECARGA_MS = 20_000;
const ENLACE = "font-bold text-[var(--accent-ink)] underline underline-offset-2";
const RUTA =
  "rounded bg-[var(--surface-sunken)] px-1 py-0.5 text-xs font-semibold text-[var(--text-primary)]";

function Paso({
  n,
  icono: Icono,
  titulo,
  children,
}: {
  n: number;
  icono: typeof Bell;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-2.5">
      <span
        aria-hidden
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent-ink)]"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="flex items-center gap-1.5 font-bold text-[var(--text-primary)]">
          <Icono className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          <span className="sr-only">Paso {n}: </span>
          {titulo}
        </p>
        {children}
      </div>
    </li>
  );
}

interface Props {
  camaras: CamaraConConexion[];
  estado: EstadoDireccion;
  direccionParaCamara: (token: string) => string;
  onRecargar: () => void;
  onErrorCopia: () => void;
}

export default function GuiaHikvision({
  camaras,
  estado,
  direccionParaCamara,
  onRecargar,
  onErrorCopia,
}: Props) {
  /* Sin tocarla, abierta mientras ninguna cámara avisó (es lo que falta hacer);
     las cámaras llegan después del primer dibujo, por eso se deriva hasta el
     primer cambio. */
  const [tocada, setTocada] = useState<boolean | null>(null);
  const abierta = tocada ?? (camaras.length > 0 && camaras.every((c) => !c.ultimoAviso));
  const recargarRef = useRef(onRecargar);
  const [elegida, setElegida] = useState<string | null>(null);
  const ahora = useAhora();
  const camara = camaras.find((c) => c.id === elegida) ?? camaras[0] ?? null;
  const direccion = camara ? direccionParaCamara(camara.token) : "";

  useEffect(() => {
    recargarRef.current = onRecargar;
  }, [onRecargar]);
  useEffect(() => {
    if (!abierta) return;
    const t = setInterval(() => recargarRef.current(), RECARGA_MS);
    return () => clearInterval(t);
  }, [abierta]);

  return (
    <details
      open={abierta}
      /* Cualquier cambio queda fijo —también el que hizo la derivación—: si la
         cámara avisa por primera vez con la guía abierta, la guía no se cierra
         sola debajo de quien está mirando el paso 5. */
      onToggle={(e) => setTocada(e.currentTarget.open)}
      className="mt-3 rounded-xl border border-[var(--rule-base)] px-3 py-2"
      data-testid="guia-hikvision"
    >
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-[var(--text-secondary)]">
        <HelpCircle className="h-4 w-4 shrink-0" aria-hidden /> Conectar la Hikvision DS-2CFSP4/4G:
        que mande cada persona o vehículo
      </summary>

      <div className="mt-3 space-y-3 text-sm text-[var(--text-secondary)]">
        <p className="flex items-start gap-1.5">
          <span>
            La cámara manda cada detección con su foto a esta dirección. Con chip 4G no tiene página
            web: se configura desde la PC con <b>iVMS-4200</b> y tu cuenta <b>Hik-Connect</b>.
          </span>
          {/* Sin `shrink-0` el párrafo largo lo aplastaba a un punto a 400 px. */}
          <span className="shrink-0">
            <InfoTip
              title="De dónde salen estos pasos"
              side="left"
              what={
                <span>
                  <a
                    href={FUENTES_GUIA.ficha}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={ENLACE}
                  >
                    Ficha oficial
                  </a>
                  : API ISAPI, cliente Hik-Connect, detección de persona y vehículo, vinculación
                  «notificar al centro de vigilancia».{" "}
                  <a
                    href={FUENTES_GUIA.httpListening}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={ENLACE}
                  >
                    Hikvision: HTTP Listening
                  </a>
                  : cada evento con vinculación se sube a ese host.
                </span>
              }
              affects="Hikvision no publica el manual de este modelo: los nombres del menú pueden cambiar un poco según el firmware."
              example="Manual de iVMS-4200 v3.6, §3.2.4 «Agregar dispositivo por Hik-Connect» y §3.5 «Configuración remota»."
            />
          </span>
        </p>

        {camaras.length > 1 && (
          <label className="flex flex-wrap items-center gap-2">
            <span className="font-bold">Cámara:</span>
            <select
              value={camara?.id ?? ""}
              onChange={(e) => setElegida(e.target.value)}
              className="h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)]"
            >
              {camaras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        <ol className="space-y-3">
          <Paso
            n={1}
            icono={Monitor}
            titulo="Agrega la cámara a iVMS-4200 con tu cuenta Hik-Connect"
          >
            <p>
              <span className={RUTA}>Gestión de dispositivos → Dispositivo → Agregar</span>, modo{" "}
              <b>Hik-Connect</b>. Entra con la misma cuenta del celular: la cámara aparece en la
              lista.{" "}
              <a
                href={FUENTES_GUIA.ivms}
                target="_blank"
                rel="noopener noreferrer"
                className={ENLACE}
              >
                Descargar iVMS-4200
              </a>
            </p>
          </Paso>
          <Paso n={2} icono={Settings} titulo="Abre su configuración remota">
            <p>
              El engranaje de la columna <b>Operación</b> en la fila de la cámara.
            </p>
          </Paso>
          <Paso n={3} icono={Globe} titulo="Dile a dónde mandar">
            <p>
              <span className={RUTA}>Red → Configuración avanzada → HTTP Listening</span> (en
              firmwares nuevos se llama <b>Servidor de alarma</b>). Copia esto y guarda:
            </p>
            <ValoresHttpListening
              direccion={direccion}
              estado={estado}
              conToken={Boolean(camara?.token)}
              onErrorCopia={onErrorCopia}
            />
          </Paso>
          <Paso n={4} icono={Bell} titulo="Que avise por persona o vehículo">
            <p>
              <span className={RUTA}>Evento → Detección de movimiento</span>: actívala y marca{" "}
              <b>Persona</b> y <b>Vehículo</b> como objetivo. En <b>Método de vinculación</b> marca{" "}
              <b>Notificar al centro de vigilancia</b> (y <b>Capturar</b> si aparece). Sin eso, la
              cámara no manda nada aunque el paso 3 esté bien.
            </p>
          </Paso>
          <Paso n={5} icono={CheckCircle2} titulo="Comprueba">
            <ProbarRecepcion
              camaraId={camara?.id ?? null}
              bloqueo={camara?.token ? null : "Solo admin o dueño"}
            />
            {camara && (
              <p data-testid="guia-ultimo-aviso">
                <b className="text-[var(--text-primary)]">{camara.nombre}:</b>{" "}
                {lineaDeAviso(camara, ahora)}. Camina frente a la cámara: en menos de un minuto
                cambia y la foto aparece en «Fotos».
              </p>
            )}
          </Paso>
        </ol>

        <p
          className={cn(CHIP_BASE, CHIP_TONO.info, "whitespace-normal py-1.5 text-sm font-normal")}
        >
          <span>
            <b>Si en el paso 3 no aparece «HTTP Listening» ni «Servidor de alarma»</b>, esta cámara
            a batería no deja mandar al sistema por Hik-Connect. Lo que ya funciona: el{" "}
            <b>puente desde la PC</b> (botón «Conexión» de la cámara) o{" "}
            <b>Más → Subir desde la galería</b> con una captura de Hik-Connect.
          </span>
        </p>
      </div>
    </details>
  );
}
