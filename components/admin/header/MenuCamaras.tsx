"use client";

/**
 * El botón de Cámaras de la barra de accesos, con su menú (Brandon
 * 2026-10-15: «al pasar el mouse muestre diferentes opciones para escoger más
 * rápido: ver todas en vivo… visitantes del día»).
 *
 * - Con mouse se abre AL PASAR (120 ms, para no abrirse al cruzar la
 *   cabecera) y se cierra al salir (280 ms, para llegar al menú). Abierto así
 *   no roba el foco (si escribías en otro lado, sigues escribiendo); un clic
 *   en el botón lo deja fijo.
 * - Con clic, toque, Enter, Espacio o flecha abajo se abre como cualquier
 *   menú (Radix: flechas, Escape y el foco vuelve al botón).
 * - Las opciones son las de `opcionesCamaras` (las mismas del panel «Accesos»
 *   en celular).
 */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Fragment, useEffect, useRef, useState, type PointerEvent } from "react";
import { usePanelTokens } from "@/components/admin/shared/use-panel-tokens";
import { cn } from "@/lib/utils";
import type { AccesoRapido } from "./accesos-rapidos";
import { ContadorAvisos, FilaOpcion, FONDO_AVISO } from "./AvisosCamarasUI";
import { opcionesCamaras, type OpcionCamaras } from "./opciones-camaras";
import type { CamarasCabecera } from "./use-camaras-cabecera";

const ABRIR_MS = 120;
const CERRAR_MS = 280;

const ITEM_CAMARAS =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm outline-none transition-colors data-[highlighted]:bg-[var(--surface-sunken)] data-[disabled]:cursor-wait";

/** Abrir al pasar el mouse, fijar con un clic. */
function useAbrirAlPasar() {
  const [abierto, setAbierto] = useState(false);
  /** Lo abrió el mouse al pasar (no un clic): se cierra al salir. */
  const alPasar = useRef(false);
  /** Se cierra por salir del mouse: el foco NO vuelve al botón. */
  const sinFocoAlCerrar = useRef(false);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limpiar = () => {
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = null;
  };
  useEffect(() => limpiar, []);

  const entrar = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    limpiar();
    if (abierto) return;
    reloj.current = setTimeout(() => {
      alPasar.current = true;
      setAbierto(true);
    }, ABRIR_MS);
  };
  const salir = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    limpiar();
    if (!alPasar.current) return;
    reloj.current = setTimeout(() => {
      alPasar.current = false;
      sinFocoAlCerrar.current = true;
      setAbierto(false);
    }, CERRAR_MS);
  };
  /* Clic en el botón: si lo había abierto el mouse, queda fijo (sin esto,
     Radix lo cerraba: su clic alterna). Un abrir pendiente se descarta. */
  const fijar = (e: PointerEvent) => {
    limpiar();
    if (abierto && alPasar.current) {
      e.preventDefault();
      alPasar.current = false;
    }
  };
  const cambiar = (v: boolean) => {
    limpiar();
    if (!v) alPasar.current = false;
    setAbierto(v);
  };
  return { abierto, alPasar, sinFocoAlCerrar, entrar, salir, fijar, cambiar, quedarse: limpiar };
}

interface Props {
  acceso: AccesoRapido;
  cam: CamarasCabecera;
  /** Clases del botón (tamaño y foco). */
  className: string;
  /** Tono cerrado (cabecera clara u oscura). Abierto va como «Accesos» abierto. */
  tono: string;
}

export default function MenuCamaras({ acceso, cam, className, tono }: Props) {
  const m = useAbrirAlPasar();
  /* El menú va en portal (fuera del panel): sin esto «advertencia» salía coral de la tienda y no ámbar. */
  const tokens = usePanelTokens(m.abierto);
  const boton = useRef<HTMLButtonElement>(null);
  const opciones = opcionesCamaras(cam);
  const n = cam.sinVer;
  const Icono = acceso.icon;

  const etiqueta = [
    acceso.label,
    n > 0 ? `${n} ${n === 1 ? "aviso" : "avisos"} sin ver` : null,
    cam.pausado ? "en pausa" : null,
  ]
    .filter(Boolean)
    .join(", ");

  /* El foco vuelve al botón ANTES de abrir una ventana: así ella lo devuelve ahí al cerrar. */
  const elegir = (o: OpcionCamaras) => {
    boton.current?.focus();
    o.accion();
  };

  /* Radix no publica `onOpenAutoFocus` en el menú, pero lo respeta: abierto
     al pasar el mouse, el foco se queda donde estaba. */
  const sinRobarFoco = {
    onOpenAutoFocus: (e: Event) => {
      if (m.alPasar.current) e.preventDefault();
    },
  } as Record<string, unknown>;

  return (
    <DropdownMenu.Root open={m.abierto} onOpenChange={m.cambiar} modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          ref={boton}
          type="button"
          aria-label={etiqueta}
          onPointerEnter={m.entrar}
          onPointerLeave={m.salir}
          onPointerDown={m.fijar}
          data-menu-camaras={m.abierto ? (m.alPasar.current ? "al-pasar" : "fijo") : "cerrado"}
          className={cn(
            className,
            "relative",
            m.abierto ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : tono,
          )}
        >
          <Icono className="h-5 w-5" aria-hidden />
          <ContadorAvisos n={n} />
          {cam.pausado && (
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-[var(--data-warning-500)] ring-2 ring-[var(--surface-raised)]"
            />
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onPointerEnter={m.quedarse}
          onPointerLeave={m.salir}
          onCloseAutoFocus={(e) => {
            if (!m.sinFocoAlCerrar.current) return;
            m.sinFocoAlCerrar.current = false;
            e.preventDefault();
          }}
          {...sinRobarFoco}
          aria-label="Opciones de Cámaras"
          data-menu-camaras-contenido
          style={tokens}
          className="z-50 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-xl)]"
        >
          <DropdownMenu.Label className="px-2.5 pb-1 pt-1.5 text-sm font-bold text-[var(--text-primary)]">
            {acceso.label}
          </DropdownMenu.Label>
          {opciones.map((o) => (
            <Fragment key={o.id}>
              {o.separar && <DropdownMenu.Separator className="mx-1 my-1 h-px bg-[var(--rule-base)]" />}
              <DropdownMenu.Item
                disabled={o.ocupado}
                onSelect={() => elegir(o)}
                aria-haspopup={o.abreVentana ? "dialog" : undefined}
                data-opcion-camaras={o.id}
                className={cn(ITEM_CAMARAS, o.aviso && FONDO_AVISO)}
              >
                <FilaOpcion o={o} />
              </DropdownMenu.Item>
            </Fragment>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
