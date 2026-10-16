"use client";

/**
 * La barra de herramientas encima de la hoja del talonario, en UN renglón:
 * qué hoja (guía o lista), la lupa, deshacer, los nombres de los campos y, en
 * el «⋯», lo menos usado (igualar ancho y letra, elegir todos, el imán).
 * Alinear y repartir viven con el campo elegido (bloque de la derecha). Cada
 * botón dice qué hace y un ejemplo al pasar el mouse; el ⓘ junta los atajos.
 *
 * Atajos de teclado (fuera de los campos de texto): Ctrl+Z deshace; Ctrl+Y o
 * Ctrl+Shift+Z rehace.
 */

import { useEffect } from "react";
import { ArrowLeftRight, Fullscreen, Magnet, Redo2, Rows3, Tags, Type, Undo2, X, ZoomIn, ZoomOut } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { PASOS_IMAN } from "@/lib/forestal/gtf-matricial-edicion";
import type { FormatoTalonario } from "@/lib/forestal/gtf-matricial-disposicion";
import { BotonIcono as Boton, fmtMm, Separador } from "./gtf-matricial-controles";
import type { EstadoGtfMatricial } from "./hooks/use-gtf-matricial";
import type { PanelesTalonario } from "./hooks/use-gtf-matricial-paneles";
import type { SeleccionTalonario } from "./hooks/use-gtf-matricial-seleccion";
import type { ZoomTalonario } from "./hooks/use-gtf-matricial-zoom";

/** Guía o lista: lo primero que se elige, siempre a la vista. */
function QueHoja({ t }: { t: EstadoGtfMatricial }) {
  const filas = t.entradas.filas.length;
  const opciones: ReadonlyArray<{ value: FormatoTalonario; label: string; title: string }> = [
    { value: "guia", label: "Guía", title: "La GTF" },
    { value: "lista", label: filas ? `Lista · ${filas}` : "Lista", title: filas ? `La lista de trozas: ${filas} troza${filas === 1 ? "" : "s"}` : "La lista de trozas" },
  ];
  return (
    <div role="radiogroup" aria-label="Hoja del talonario" className="flex shrink-0 gap-0.5 rounded-xl bg-[var(--surface-sunken)]">
      {opciones.map((o) => {
        const activa = t.formato === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={activa}
            title={o.title}
            onClick={() => t.elegirFormato(o.value)}
            className={`h-12 whitespace-nowrap rounded-xl px-3 text-sm font-bold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${
              activa
                ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm ring-1 ring-[var(--rule-base)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function BarraTalonario({ t, s, z, p }: { t: EstadoGtfMatricial; s: SeleccionTalonario; z: ZoomTalonario; p: PanelesTalonario }) {
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
    /* Un solo renglón que se desliza de lado si no entra: dos renglones de botones le quitaban alto a la hoja. */
    <div role="toolbar" aria-label="Herramientas de la hoja" className="flex shrink-0 items-center gap-0.5 overflow-x-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1">
      <QueHoja t={t} />
      <Separador />
      <Boton icon={ZoomOut} label="Alejar" ayuda="De a 25 % (también Ctrl + rueda del mouse)." onClick={z.alejar} disabled={!z.puedeAlejar} />
      <button
        type="button"
        onClick={z.tamanoReal}
        title={"Tamaño real (100 %)\nLa hoja a su medida en milímetros."}
        className="h-12 min-w-14 shrink-0 rounded-xl px-1.5 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
      >
        {z.pct} %
      </button>
      <Boton icon={ZoomIn} label="Acercar" ayuda="De a 25 % hasta 400 %, sobre el campo elegido." onClick={z.acercar} disabled={!z.puedeAcercar} />
      <Boton icon={Fullscreen} label="Ver hoja completa" ayuda="Entra la hoja entera, ancho y alto, para verla de un vistazo." onClick={z.hojaCompleta} activo={z.modo === "hoja"} />
      <Boton icon={ArrowLeftRight} label="Ajustar al ancho" ayuda="La hoja ocupa todo el ancho; se baja con la rueda." onClick={z.alAncho} activo={z.modo === "ancho"} />
      <Separador />
      <Boton icon={Undo2} label="Deshacer" ayuda="Ctrl + Z. Vuelve el último cambio (hasta 100)." onClick={deshacer} disabled={!t.puedeDeshacer} />
      <Boton icon={Redo2} label="Rehacer" ayuda="Ctrl + Y. Repite lo que deshiciste." onClick={rehacer} disabled={!t.puedeRehacer} />
      <Separador />
      <Boton
        icon={Tags}
        label="Ver nombres de los campos"
        ayuda="El nombre de cada campo encima de su valor, sólo en pantalla: nunca se imprime."
        onClick={p.alternarNombres}
        activo={p.nombres}
      />
      <ActionMenu label="Más herramientas" title="Más herramientas" actions={mas} soloIcono size="md" className="w-12!" />
      <span className="ml-auto flex shrink-0 items-center px-1">
        <InfoTip
          icono="ayuda"
          title="Atajos"
          what="Shift o Ctrl + clic suma o quita un campo. Con el mouse, arrastra sobre la hoja vacía para elegir con un recuadro. Arrastra cualquiera de los elegidos y se mueven todos; las flechas los corren 0,5 mm (con Shift, 5 mm)."
          affects="Alinear e igualar toman la medida del PRIMERO elegido (el del borde grueso). Al arrastrar, una línea avisa cuando un borde o un centro coincide con otro campo, y se pega."
          example="Elige (13), Shift + clic en (22) y (32), y «Alinear a la izquierda» (a la derecha): los tres en la misma X."
        />
      </span>
    </div>
  );
}
