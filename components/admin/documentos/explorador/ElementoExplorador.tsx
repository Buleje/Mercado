"use client";

/**
 * Un elemento del explorador del Archivo (carpeta o archivo) en íconos
 * grandes, medianos o lista. Como en Windows:
 *
 * - clic = sólo ése; Ctrl/⌘+clic lo suma o lo saca; Shift+clic, el tramo;
 * - doble clic = abre (entra a la carpeta o abre el archivo);
 * - arrastrar = mueve lo elegido; una carpeta recibe lo que le sueltas encima
 *   (y se pinta sólo si lo puede recibir);
 * - en el celular un toque abre y mantener presionado muestra las opciones;
 * - clic derecho = opciones.
 *
 * El teclado lo maneja `use-teclado-explorador`, que sabe cuál es el de al lado.
 */

import { useState, type DragEvent } from "react";
import { Check, Star } from "@buleje/design-system/icons";
import { CLASE_REGISTRADO, EtiquetaRegistrado, textoCodigoPuesto } from "../CodigoDocumento";
import { cn } from "@/lib/utils";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { formatBytes } from "../archivo-visual";
import { codigoFisicoPendiente, formatoCodigoDocumento } from "@/lib/documentos/codigo-documento";
import { arrastreActual, escribirCarga, fijarArrastre, hayCargaInterna, leerCarga, type CargaArrastre } from "./destino-soltar";
import IconoArchivo from "./IconoArchivo";
import IconoCarpeta from "./IconoCarpeta";
import MarcasCarpeta from "./MarcasCarpeta";
import { usePulsacionLarga } from "./use-pulsacion-larga";
import type { PuntoDeMenu } from "./ubicar-menu";
import type { Mods } from "./use-seleccion-explorador";
import type { VistaIconos } from "./vista-archivo";

type Objeto = { tipo: "carpeta"; carpeta: DbDocumentFolder } | { tipo: "doc"; doc: DbDocument };

interface Props {
  vista: VistaIconos;
  objeto: Objeto;
  clave: string;
  /** El que recibe el Tab (uno solo en toda la grilla). */
  enfocable: boolean;
  /** Resaltado: está en la selección (o es el último que tocaste). */
  elegido: boolean;
  /** Cortado (Ctrl+X): se ve apagado hasta que lo pegues. */
  cortado: boolean;
  onClic: (m: Mods) => void;
  onAbrir: () => void;
  onMenu: (punto: PuntoDeMenu) => void;
  onFoco: () => void;
  /** Lo que se lleva al arrastrar desde acá (lo elegido, o sólo éste). */
  cargaAlArrastrar: () => CargaArrastre;
  /** Carpetas: ¿lo que viene arrastrado puede entrar acá? */
  puedeSoltar?: () => boolean;
  onSoltar?: (carga: CargaArrastre) => void;
}

const TAM = { grandes: "grande", medianos: "mediano", lista: "chico" } as const;

export default function ElementoExplorador({
  vista, objeto, clave, enfocable, elegido, cortado, onClic, onAbrir, onMenu, onFoco, cargaAlArrastrar, puedeSoltar, onSoltar,
}: Props) {
  const pulsacion = usePulsacionLarga(onMenu);
  const [sobre, setSobre] = useState(false);
  // Arrastrar para mover, sólo con mouse: en el celular mantener presionado
  // es el menú, y un `draggable` lo convertiría en arrastre.
  const [conMouse] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(hover: hover)").matches);
  const esCarpeta = objeto.tipo === "carpeta";
  const nombre = esCarpeta ? objeto.carpeta.name : objeto.doc.name;
  const n = esCarpeta ? objeto.carpeta.documentCount ?? 0 : 0;
  // ADR-516 — el código del papel: en la lista, al lado del nombre; en íconos grandes, en la meta.
  const codigo = esCarpeta ? null : formatoCodigoDocumento(objeto.doc.codigo);
  const codigoPendiente = !esCarpeta && codigoFisicoPendiente(objeto.doc);
  const meta = esCarpeta
    ? `${n} ${n === 1 ? "archivo" : "archivos"}`
    : codigo ? `${codigo} · ${formatBytes(objeto.doc.size)}` : formatBytes(objeto.doc.size);

  const origen = conMouse
    ? {
        draggable: true,
        onDragStart: (e: DragEvent) => {
          const carga = cargaAlArrastrar();
          escribirCarga(e.dataTransfer, carga);
          fijarArrastre(carga);
        },
        onDragEnd: () => fijarArrastre(null),
      }
    : {};

  const destino = esCarpeta && onSoltar
    ? {
        onDragOver: (e: DragEvent) => {
          if (!hayCargaInterna([...e.dataTransfer.types])) return;
          // Sobre sí misma o una de las que se mueven: no se pinta ni se acepta.
          if (puedeSoltar && !puedeSoltar()) { e.dataTransfer.dropEffect = "none"; return; }
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
          setSobre(true);
        },
        onDragLeave: () => setSobre(false),
        onDrop: (e: DragEvent) => {
          if (!hayCargaInterna([...e.dataTransfer.types])) return;
          e.preventDefault();
          e.stopPropagation();
          setSobre(false);
          const carga = leerCarga(e.dataTransfer) ?? arrastreActual();
          fijarArrastre(null);
          if (carga) onSoltar(carga);
        },
      }
    : {};

  const lista = vista === "lista";
  return (
    <div
      role="option"
      aria-selected={elegido}
      aria-label={esCarpeta ? `Carpeta ${nombre}, ${meta}` : nombre}
      tabIndex={enfocable ? 0 : -1}
      data-clave={clave}
      data-qa={esCarpeta ? "explorador-carpeta" : "explorador-archivo"}
      data-cortado={cortado || undefined}
      title={codigo ? `${nombre} · ${codigo}${codigoPendiente ? " (por registrar)" : " (registrado)"}` : nombre}
      {...pulsacion.handlers}
      {...origen}
      {...destino}
      // Sólo el foco del teclado (Tab) marca: con el mouse lo decide el clic
      // (si no, Ctrl+clic sacaría lo que el foco acaba de marcar).
      onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) onFoco(); }}
      onClick={(e) => {
        if (pulsacion.yaDisparo()) return;
        const ctrl = e.ctrlKey || e.metaKey;
        if (pulsacion.esTactil() && !ctrl) { onAbrir(); return; }
        onClic({ ctrl, shift: e.shiftKey });
      }}
      onDoubleClick={() => { if (!pulsacion.esTactil()) onAbrir(); }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (pulsacion.yaDisparo()) return;
        pulsacion.marcarDisparo();
        // El foco vuelve acá al cerrar el menú con Escape (el clic derecho no enfoca solo).
        e.currentTarget.focus({ preventScroll: true });
        onMenu({ x: e.clientX, y: e.clientY });
      }}
      className={cn(
        "group relative flex cursor-default select-none rounded-lg border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        lista ? "min-h-12 flex-row items-center gap-2.5 px-2" : "flex-col items-center gap-1 px-1 pb-1.5 pt-2 text-center",
        elegido
          ? "border-[var(--accent)]/45 bg-[var(--accent)]/12"
          : "border-transparent hover:border-[var(--accent)]/20 hover:bg-[var(--accent)]/6",
        sobre && "border-[var(--accent)] bg-[var(--accent)]/15 ring-2 ring-[var(--accent)]",
        cortado && "opacity-50",
      )}
    >
      {lista ? (
        esCarpeta ? <IconoCarpeta carpeta={objeto.carpeta} tam="chico" /> : <IconoArchivo doc={objeto.doc} tam="chico" />
      ) : (
        <span className={cn("relative flex shrink-0 items-center justify-center", vista === "grandes" ? "aspect-square w-full max-w-36" : "h-14 w-14")}>
          {esCarpeta ? <IconoCarpeta carpeta={objeto.carpeta} tam={TAM[vista]} /> : <IconoArchivo doc={objeto.doc} tam={TAM[vista]} />}
          {!esCarpeta && objeto.doc.favorite && (
            <Star className="absolute right-0 top-0 h-4 w-4 fill-yellow-400 text-yellow-500" aria-label="Favorito" />
          )}
          {/* ADR-516 — registrado: el visto verde sobre el ícono (la etiqueta con texto no cabe). */}
          {codigo && !codigoPendiente && !esCarpeta && (
            <span
              data-qa="etiqueta-registrado"
              title={textoCodigoPuesto(objeto.doc)}
              role="img"
              aria-label={textoCodigoPuesto(objeto.doc)}
              className={cn("absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--rule-base)]", CLASE_REGISTRADO)}
            >
              <Check className="h-3.5 w-3.5" aria-hidden />
            </span>
          )}
          {/* Sobre el ícono, no al lado del nombre: el nombre sigue con sus 3 líneas. */}
          {esCarpeta && (
            <MarcasCarpeta
              carpeta={objeto.carpeta}
              className="absolute bottom-0 right-0 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-1 py-0.5"
            />
          )}
        </span>
      )}
      <span
        className={cn(
          "min-w-0 text-[var(--text-primary)]",
          lista ? "flex-1 truncate text-sm font-semibold" : "line-clamp-3 w-full break-words leading-tight",
          vista === "grandes" ? "text-sm font-semibold" : vista === "medianos" ? "text-xs font-medium" : "",
        )}
      >
        {nombre}
      </span>
      {lista && esCarpeta && <MarcasCarpeta carpeta={objeto.carpeta} />}
      {lista && codigo && (
        <span
          data-qa="codigo-doc"
          data-pendiente={codigoPendiente || undefined}
          className={cn(
            "shrink-0 font-mono text-xs font-bold tabular-nums",
            codigoPendiente ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-tertiary)]",
          )}
        >
          {codigo}
        </span>
      )}
      {lista && !esCarpeta && <EtiquetaRegistrado doc={objeto.doc} />}
      {vista === "grandes" && <span className="text-xs tabular-nums text-[var(--text-tertiary)]">{meta}</span>}
    </div>
  );
}
