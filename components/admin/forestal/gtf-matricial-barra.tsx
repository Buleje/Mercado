"use client";

/**
 * La barra de herramientas encima de la hoja del talonario, en UN renglón:
 * qué hoja (guía o lista), la lupa, deshacer, los nombres de los campos,
 * «Sólo valores» (la hoja como sale el papel, Brandon 16-10) y, en
 * el «⋯», lo menos usado (ajustar al ancho, igualar ancho y letra, elegir
 * todos, el imán). «Posiciones» abre la tabla de X, Y y ancho en mm.
 * Alinear y repartir viven con el campo elegido (bloque de la derecha). Cada
 * botón dice qué hace y un ejemplo al pasar el mouse; el ⓘ junta los atajos.
 *
 * Atajos de teclado (fuera de los campos de texto): Ctrl+Z deshace; Ctrl+Y o
 * Ctrl+Shift+Z rehace.
 */

import { useEffect } from "react";
import { ArrowLeftRight, Fullscreen, LayoutList, Magnet, Redo2, Rows3, ScanText, Tags, Type, Undo2, X, ZoomIn, ZoomOut } from "@buleje/design-system/icons";
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

/** «Sólo valores»: vive con el fondo (`useFondoTalonario`), recordado por hoja. */
export interface VistaSoloValores {
  soloValores: boolean;
  alternar: () => void;
}

export default function BarraTalonario({
  t, s, z, p, v, onPosiciones,
}: {
  t: EstadoGtfMatricial;
  s: SeleccionTalonario;
  z: ZoomTalonario;
  p: PanelesTalonario;
  v: VistaSoloValores;
  /** Abre «Posición de cada campo»: X, Y y ancho de cada valor en mm (Brandon 16-10). */
  onPosiciones: () => void;
}) {
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
    { id: "posiciones", label: "Posición de cada campo", hint: "X, Y y ancho de cada campo en mm; copiar y pegar con Excel", icon: LayoutList, onSelect: onPosiciones },
    /* Vivía en la barra; salió al «⋯» para que entre «Posiciones» a 1280 (la barra mide 694 px con el panel abierto). */
    { id: "al-ancho", label: "Ajustar al ancho", hint: "La hoja ocupa todo el ancho; se baja con la rueda", icon: ArrowLeftRight, activo: z.modo === "ancho", onSelect: z.alAncho },
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
    <div role="toolbar" aria-label="Herramientas de la hoja" className="@container/barra flex shrink-0 items-center gap-0.5 overflow-x-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1">
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
      <Separador />
      <Boton icon={Undo2} label="Deshacer" ayuda="Ctrl + Z. Vuelve el último cambio (hasta 100)." onClick={deshacer} disabled={!t.puedeDeshacer} />
      <Boton icon={Redo2} label="Rehacer" ayuda="Ctrl + Y. Repite lo que deshiciste." onClick={rehacer} disabled={!t.puedeRehacer} />
      <Separador />
      <Boton
        icon={Tags}
        label="Ver nombres de los campos"
        ayuda="El nombre de cada campo encima de su valor, sólo en pantalla: nunca se imprime. Con el formato impreso, al pasar el mouse."
        onClick={p.alternarNombres}
        activo={p.nombres && !v.soloValores}
        disabled={v.soloValores}
      />
      <Boton
        icon={ScanText}
        label="Sólo valores"
        ayuda="La hoja como sale de la matricial: sólo los valores, sin el formato dibujado, la foto, la cuadrícula, los casilleros vacíos ni los nombres. Otro clic y vuelve todo."
        onClick={v.alternar}
        activo={v.soloValores}
      />
      <button
        type="button"
        onClick={onPosiciones}
        data-qa="talonario-posiciones"
        title={"Posición de cada campo\nX, Y y ancho de cada valor en milímetros, en una tabla. Ejemplo: (2) Autoridad Regional en X 95, Y 38."}
        aria-label="Posición de cada campo"
        className="flex h-12 min-w-12! shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
      >
        <LayoutList className="h-5 w-5 shrink-0" aria-hidden />
        {/* El rótulo sólo si la barra tiene lugar (panel cerrado o pantalla ancha): a 1280 con el panel abierto entra justo con el ícono. */}
        <span aria-hidden className="hidden @min-[50rem]/barra:inline">Posiciones</span>
      </button>
      {/* Sin el envoltorio quieto, en la barra llena el «⋯» se encogía a 0 px (medido 16-10). */}
      <div className="shrink-0">
        <ActionMenu label="Más herramientas" title="Más herramientas" actions={mas} soloIcono size="md" className="w-12!" />
      </div>
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
