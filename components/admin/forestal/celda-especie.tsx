"use client";

/**
 * La celda Especie de la tabla del lote, navegable con el teclado como las de
 * número (Brandon 24-10: «hoy la flecha → desde Cant. salta Especie y hay que
 * usar el mouse»).
 *
 * Sigue siendo un `<select>` (con el mouse se elige de la lista de siempre),
 * pero el teclado lo maneja la planilla:
 * - `←` `→` `↑` `↓` se mueven de celda (`useTecladoGrilla`) y NUNCA cambian la
 *   opción: un `<select>` del navegador la cambia con las flechas, y recorrer
 *   la tabla iba pisando especies sin que nadie lo notara.
 * - Letras: eligen por el comienzo («t» Tornillo, «cu» Cumala), como un combo.
 *   Lo elegido es un BORRADOR: `Enter` lo confirma y baja a la fila siguiente;
 *   salir de la celda (flecha, Tab, clic afuera) también lo confirma, como en
 *   Excel; `Escape` vuelve a la especie que tenía.
 * - `Supr` deja la fila sin especie (también se deshace con `Escape`).
 */
import { useRef, useState } from "react";
import { especiePorComienzo } from "@/lib/forestal/especie-por-comienzo";

/** Tiempo entre letras para que sigan siendo la misma búsqueda («c»+«u» = «cu»). */
const PAUSA_ENTRE_LETRAS_MS = 900;
const FLECHAS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

export default function CeldaEspecie({
  valor,
  opciones,
  onCommit,
  fila,
  col,
  onTeclaGrilla,
  etiqueta = "Especie de la pieza",
}: {
  valor: string;
  /** Las especies que se ofrecen, en su orden (el del catálogo). */
  opciones: readonly string[];
  onCommit: (especie: string) => void;
  fila: number;
  col: number;
  /** El `onKeyDown` de la grilla (`useTecladoGrilla`): flechas y Enter. */
  onTeclaGrilla: (e: React.KeyboardEvent<HTMLSelectElement>) => void;
  etiqueta?: string;
}) {
  /* El borrador vive en un ref además del estado: al confirmar con Enter el
     foco se mueve en el mismo evento y el `blur` llega antes del re-render —
     con sólo el estado, la pieza se escribía dos veces. */
  const [borrador, setBorrador] = useState<string | null>(null);
  const borradorRef = useRef<string | null>(null);
  const escrito = useRef({ texto: "", hasta: 0 });

  const poner = (v: string | null) => {
    borradorRef.current = v;
    setBorrador(v);
  };
  const confirmar = () => {
    const b = borradorRef.current;
    poner(null);
    escrito.current = { texto: "", hasta: 0 };
    if (b !== null && b !== valor) onCommit(b);
  };

  /* Una especie que el catálogo ya no ofrece se conserva como opción: sin ella
     el <select> se vería vacío y el primer toque la borraría. */
  const visible = borrador ?? valor;
  const extras = [valor, visible].filter((v, i, a) => v && !opciones.includes(v) && a.indexOf(v) === i);

  const onKeyDown = (e: React.KeyboardEvent<HTMLSelectElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) { onTeclaGrilla(e); return; }
    if (FLECHAS.has(e.key)) {
      e.preventDefault();
      onTeclaGrilla(e);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      confirmar();
      onTeclaGrilla(e);
      return;
    }
    if (e.key === "Escape") {
      if (borradorRef.current !== null && borradorRef.current !== valor) {
        e.preventDefault();
        e.stopPropagation();
        poner(null);
        escrito.current = { texto: "", hasta: 0 };
        return;
      }
      onTeclaGrilla(e);
      return;
    }
    if (e.key === "Delete") {
      e.preventDefault();
      poner("");
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      const corto = escrito.current.texto.slice(0, -1);
      escrito.current = { texto: corto, hasta: Date.now() + PAUSA_ENTRE_LETRAS_MS };
      poner(corto ? especiePorComienzo(opciones, corto) ?? borradorRef.current : "");
      return;
    }
    // Una letra (o un espacio en medio de «cedro rosado»): busca por el comienzo.
    const enBusqueda = escrito.current.texto !== "" && Date.now() < escrito.current.hasta;
    if (e.key.length === 1 && (e.key !== " " || enBusqueda)) {
      e.preventDefault();
      const texto = (enBusqueda ? escrito.current.texto : "") + e.key;
      escrito.current = { texto, hasta: Date.now() + PAUSA_ENTRE_LETRAS_MS };
      const hallada = especiePorComienzo(opciones, texto);
      if (hallada) poner(hallada);
    }
  };

  return (
    <select
      value={visible}
      data-fila={fila}
      data-col={col}
      aria-label={etiqueta}
      onChange={(e) => { poner(e.target.value); confirmar(); }}
      onKeyDown={onKeyDown}
      onBlur={confirmar}
      className={`max-w-[110px] rounded-xl border bg-transparent px-1 py-0.5 text-xs font-bold text-[var(--text-secondary)] outline-none focus:border-[var(--accent)] focus:bg-[var(--surface-canvas)] focus:ring-2 focus:ring-[var(--accent)]/25 ${
        borrador !== null && borrador !== valor ? "border-[var(--accent)]" : "border-[var(--rule-base)]"
      }`}
    >
      <option value="">—</option>
      {opciones.map((s) => <option key={s} value={s}>{s}</option>)}
      {extras.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}
