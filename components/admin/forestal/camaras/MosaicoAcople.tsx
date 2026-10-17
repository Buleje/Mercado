"use client";

/**
 * Las piezas visibles de «Al lado» (`use-acople-mosaico`): el menú de la
 * cabecera y el asa para estirar la franja de las cámaras.
 *
 * El menú junta las dos preguntas: DÓNDE van las cámaras (izquierda, derecha,
 * al centro como antes) y QUÉ abrir al otro lado. Los atajos son las pantallas
 * que se llenan mirando la cámara: la asistencia (quién llegó), el ingreso de
 * madera (el camión que entra), el despacho (el que sale) y las fotos de
 * personas del día. Elegir uno con el mosaico al centro lo acopla primero. Lo
 * demás del panel también funciona al otro lado: el menú son sólo atajos.
 */

import { useRef, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import {
  Columns2,
  LayoutGrid,
  PackageOpen,
  PanelLeft,
  PanelRight,
  Truck,
  UserCheck,
  Users,
} from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { cn } from "@/lib/utils";
import { navegarEnElPanel } from "./navegar-panel";
import { ANCHO_MAX, ANCHO_MIN, HREF_ASISTENCIA_HOY, limitarAncho, type AcopleMosaico } from "./use-acople-mosaico";

const AL_OTRO_LADO = [
  {
    id: "asistencia",
    label: "Asistencia de hoy",
    hint: "Marca quién llegó mientras miras la entrada",
    icon: UserCheck,
    href: HREF_ASISTENCIA_HOY,
  },
  {
    id: "ingresos",
    label: "Ingresos de madera",
    hint: "Recepciona la guía del camión que está entrando",
    icon: PackageOpen,
    href: "/admin?tab=ctp-libro-operaciones&vista=ingresos",
  },
  {
    id: "despacho",
    label: "Despacho",
    hint: "Anota lo que sale mientras lo cargan",
    icon: Truck,
    href: "/admin?tab=ctp-libro-operaciones&vista=despacho",
  },
  {
    id: "personas",
    label: "Personas de hoy",
    hint: "Las fotos del detector, para cruzarlas con la asistencia",
    icon: Users,
    href: "/admin?tab=camaras&vista=personas",
  },
] as const;

export function MenuAlLado({ acople }: { acople: AcopleMosaico }) {
  if (!acople.disponible) return null;
  const { lado } = acople;
  const acciones: MenuAccion[] = [
    {
      id: "izquierda",
      seccion: "Las cámaras",
      label: "A la izquierda",
      icon: PanelLeft,
      activo: lado === "izquierda",
      onSelect: () => acople.acoplar("izquierda"),
    },
    {
      id: "derecha",
      seccion: "Las cámaras",
      label: "A la derecha",
      icon: PanelRight,
      activo: lado === "derecha",
      onSelect: () => acople.acoplar("derecha"),
    },
    {
      id: "centro",
      seccion: "Las cámaras",
      label: "Al centro, sobre el panel",
      icon: LayoutGrid,
      activo: lado === null,
      onSelect: acople.centrar,
    },
    ...AL_OTRO_LADO.map(({ href, ...a }) => ({
      ...a,
      seccion: "Abrir al otro lado",
      onSelect: () => {
        if (!lado) acople.acoplar();
        navegarEnElPanel(href);
      },
    })),
  ];
  return (
    <ActionMenu
      label="Al lado"
      icon={Columns2}
      size="xs"
      actions={acciones}
      title="Las cámaras a un lado y el panel al otro (asistencia, ingresos…)"
      className={cn(lado && "border-[var(--accent)] text-[var(--accent-ink)] dark:text-[var(--accent)]")}
    />
  );
}

/**
 * El borde de adentro de la franja: se arrastra (o se mueve con las flechas)
 * para repartir la pantalla. Mientras se arrastra se toca sólo el estilo —el
 * panel y `--mosaico-ancho`— y se guarda al soltar: guardar en cada movimiento
 * re-pintaba el mosaico 60 veces por segundo.
 */
export function AsaAcople({
  acople,
  panel,
}: {
  acople: AcopleMosaico;
  panel: RefObject<HTMLDivElement | null>;
}) {
  const arrastre = useRef<number | null>(null);
  const { lado, ancho, setAncho, moverAncho } = acople;
  if (!lado) return null;

  const pintar = (n: number) => {
    const v = `${n}vw`;
    document.documentElement.style.setProperty("--mosaico-ancho", v);
    if (panel.current) panel.current.style.width = v;
  };
  const anchoEn = (x: number) =>
    limitarAncho(((lado === "derecha" ? window.innerWidth - x : x) / window.innerWidth) * 100);

  const bajar = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = ancho;
  };
  const mover = (e: PointerEvent<HTMLDivElement>) => {
    if (arrastre.current === null) return;
    arrastre.current = anchoEn(e.clientX);
    pintar(arrastre.current);
  };
  const soltar = () => {
    if (arrastre.current === null) return;
    setAncho(arrastre.current);
    arrastre.current = null;
  };
  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    const paso = e.shiftKey ? 10 : 2;
    /* La flecha apunta hacia donde se mueve el borde, no hacia «más» o «menos». */
    const crece = lado === "derecha" ? "ArrowLeft" : "ArrowRight";
    const achica = lado === "derecha" ? "ArrowRight" : "ArrowLeft";
    if (e.key !== crece && e.key !== achica) return;
    e.preventDefault();
    moverAncho(e.key === crece ? paso : -paso);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Ancho de las cámaras"
      aria-valuemin={ANCHO_MIN}
      aria-valuemax={ANCHO_MAX}
      aria-valuenow={ancho}
      aria-valuetext={`${ancho} % de la pantalla`}
      tabIndex={0}
      title="Arrastra para repartir la pantalla"
      onPointerDown={bajar}
      onPointerMove={mover}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      onKeyDown={teclas}
      className={cn(
        "group absolute inset-y-0 z-10 flex w-3 cursor-col-resize touch-none items-center justify-center outline-none",
        lado === "derecha" ? "left-0" : "right-0",
      )}
      data-asa-acople
    >
      <span className="h-12 w-1 rounded-full bg-[var(--rule-strong)] transition-colors group-hover:bg-[var(--accent)] group-focus-visible:bg-[var(--accent)]" />
    </div>
  );
}
