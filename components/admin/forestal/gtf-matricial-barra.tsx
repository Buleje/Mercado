"use client";

/**
 * La barra de herramientas encima de la hoja del talonario: lupa, deshacer,
 * elegir la fila o la columna, alinear, repartir parejo y, en el «⋯», lo menos
 * usado (igualar ancho y letra, elegir todos, el imán). Cada botón dice qué
 * hace y un ejemplo al pasar el mouse; el ⓘ junta los atajos.
 *
 * Atajos de teclado (fuera de los campos de texto): Ctrl+Z deshace; Ctrl+Y o
 * Ctrl+Shift+Z rehace.
 */

import { useEffect } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  ArrowLeftRight,
  Columns3,
  Fullscreen,
  Magnet,
  Redo2,
  Rows3,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { PASOS_IMAN, type ModoAlinear } from "@/lib/forestal/gtf-matricial-edicion";
import { fmtMm } from "./gtf-matricial-controles";
import type { EstadoGtfMatricial } from "./hooks/use-gtf-matricial";
import type { SeleccionTalonario } from "./hooks/use-gtf-matricial-seleccion";
import type { ZoomTalonario } from "./hooks/use-gtf-matricial-zoom";

function Boton({ icon: Icono, label, ayuda, onClick, disabled, activo }: { icon: LucideIcon; label: string; ayuda: string; onClick: () => void; disabled?: boolean; activo?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={`${label}\n${ayuda}`}
      aria-pressed={activo}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 disabled:cursor-not-allowed disabled:opacity-35 ${
        activo ? "bg-[var(--accent-muted)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
      }`}
    >
      <Icono className="h-5 w-5" aria-hidden />
    </button>
  );
}

const Separador = () => <span aria-hidden className="mx-1 h-8 w-px shrink-0 bg-[var(--rule-base)]" />;

const ALINEAR: ReadonlyArray<{ modo: ModoAlinear; icon: LucideIcon; label: string; ayuda: string }> = [
  { modo: "arriba", icon: AlignStartHorizontal, label: "Alinear arriba", ayuda: "Todos a la Y del primero elegido. Ej.: (13), (14) y (15) en el mismo renglón." },
  { modo: "medio", icon: AlignCenterHorizontal, label: "Alinear al medio", ayuda: "Centro de cada uno a la altura del centro del primero. Ej.: letras de distinto tamaño en una fila." },
  { modo: "abajo", icon: AlignEndHorizontal, label: "Alinear abajo", ayuda: "El pie de todos al pie del primero. Ej.: valores apoyados en la línea del casillero." },
  { modo: "izq", icon: AlignStartVertical, label: "Alinear a la izquierda", ayuda: "Todos a la X del primero. Ej.: (13), (16) y (19) en la misma columna." },
  { modo: "centro", icon: AlignCenterVertical, label: "Centrar en columna", ayuda: "El centro de todos sobre el centro del primero. Ej.: fechas en una columna angosta." },
  { modo: "der", icon: AlignEndVertical, label: "Alinear a la derecha", ayuda: "El borde derecho de todos al del primero. Ej.: totales y volúmenes." },
];

export default function BarraTalonario({ t, s, z }: { t: EstadoGtfMatricial; s: SeleccionTalonario; z: ZoomTalonario }) {
  const n = s.elegidos.length;
  const { deshacer, rehacer } = t;

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable=true]")) return;
      const tecla = e.key.toLowerCase();
      if (tecla === "z" && !e.shiftKey) {
        e.preventDefault();
        deshacer();
      } else if (tecla === "y" || (tecla === "z" && e.shiftKey)) {
        e.preventDefault();
        rehacer();
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [deshacer, rehacer]);

  const mas: MenuAccion[] = [
    { id: "ancho", label: "Igualar el ancho", hint: "El ancho máximo del primero para todos los elegidos", icon: ArrowLeftRight, disabled: n < 2, onSelect: () => s.igualar("ancho") },
    { id: "letra", label: "Igualar la letra", hint: "El tamaño de letra del primero para todos", icon: Type, disabled: n < 2, onSelect: () => s.igualar("letra") },
    { id: "todo", label: "Elegir todos", hint: "Todos los valores que se imprimen en esta hoja", icon: Rows3, onSelect: s.elegirTodo },
    { id: "nada", label: "Quitar la selección", hint: "Ninguno elegido", icon: X, disabled: n === 0, onSelect: s.quitarSeleccion },
    ...PASOS_IMAN.map((p): MenuAccion => ({
      id: `iman-${p}`,
      label: p === 0 ? "Imán apagado" : `Imán a ${fmtMm(p)} mm`,
      hint: p === 0 ? "Se arrastra libre (décimas de mm)" : `Al arrastrar, cada posición cae en múltiplos de ${fmtMm(p)} mm`,
      icon: Magnet,
      activo: s.iman === p,
      onSelect: () => s.setIman(p),
    })),
  ];

  return (
    /* En el celular, un solo renglón que se desliza de lado: tres renglones de botones empujaban la hoja fuera de la vista. */
    <div role="toolbar" aria-label="Herramientas de la hoja" className="flex items-center gap-0.5 overflow-x-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1 sm:flex-wrap">
      <Boton icon={ZoomOut} label="Alejar" ayuda="De a 25 % (también Ctrl + rueda del mouse)." onClick={z.alejar} disabled={!z.puedeAlejar} />
      <button
        type="button"
        onClick={z.tamanoReal}
        title={"Tamaño real (100 %)\nLa hoja a su medida en milímetros."}
        className="h-12 min-w-16 shrink-0 rounded-xl px-2 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
      >
        {z.pct} %
      </button>
      <Boton icon={ZoomIn} label="Acercar" ayuda="De a 25 % hasta 400 %, sobre el campo elegido." onClick={z.acercar} disabled={!z.puedeAcercar} />
      <Boton icon={ArrowLeftRight} label="Ajustar al ancho" ayuda="La hoja ocupa todo el ancho; se baja con la rueda." onClick={z.alAncho} activo={z.modo === "ancho"} />
      <Boton icon={Fullscreen} label="Ver hoja completa" ayuda="Entra la hoja entera, ancho y alto, para verla de un vistazo." onClick={z.hojaCompleta} activo={z.modo === "hoja"} />
      <Separador />
      <Boton icon={Undo2} label="Deshacer" ayuda="Ctrl + Z. Vuelve el último cambio (hasta 100)." onClick={deshacer} disabled={!t.puedeDeshacer} />
      <Boton icon={Redo2} label="Rehacer" ayuda="Ctrl + Y. Repite lo que deshiciste." onClick={rehacer} disabled={!t.puedeRehacer} />
      <Separador />
      <Boton icon={Rows3} label="Elegir la fila" ayuda="Suma los campos a ±2 mm de la Y del elegido. Ej.: toda la fila del destinatario." onClick={s.elegirFila} disabled={n === 0} />
      <Boton icon={Columns3} label="Elegir la columna" ayuda="Suma los campos a ±2 mm de la X del elegido. Ej.: la columna de la izquierda." onClick={s.elegirColumna} disabled={n === 0} />
      <Separador />
      {ALINEAR.map((a) => (
        <Boton key={a.modo} icon={a.icon} label={a.label} ayuda={a.ayuda} onClick={() => s.alinear(a.modo)} disabled={n < 2} />
      ))}
      <Separador />
      <Boton icon={AlignHorizontalSpaceAround} label="Repartir a lo ancho" ayuda="Mismo espacio entre campos; quedan fijos los de las puntas. Ej.: las casillas del (5)." onClick={() => s.repartir("h")} disabled={n < 3} />
      <Boton icon={AlignVerticalSpaceAround} label="Repartir a lo alto" ayuda="Mismo espacio entre renglones; quedan fijos el de arriba y el de abajo." onClick={() => s.repartir("v")} disabled={n < 3} />
      <ActionMenu label="Más herramientas" title="Más herramientas" actions={mas} soloIcono size="md" />
      <span className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2 text-sm font-semibold text-[var(--text-secondary)]">
        {n > 0 ? `${n} elegido${n === 1 ? "" : "s"}` : "Ninguno elegido"}
        <InfoTip
          icono="ayuda"
          title="Atajos"
          what="Shift o Ctrl + clic suma o quita un campo. Con el mouse, arrastra sobre la hoja vacía para elegir con un recuadro. Arrastra cualquiera de los elegidos y se mueven todos; las flechas los corren 0,5 mm (con Shift, 5 mm)."
          affects="Alinear e igualar toman la medida del PRIMERO elegido (el del borde grueso). Al arrastrar, una línea avisa cuando un borde o un centro coincide con otro campo, y se pega."
          example="Elige (13), Shift + clic en (22) y (32), y «Alinear a la izquierda»: los tres en la misma X."
        />
      </span>
    </div>
  );
}
