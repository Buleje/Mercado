"use client";

/**
 * Cifras que se copian con un clic (Brandon, 2026-10-19: «todas las piezas, m³
 * etc tengan un botón para copiar: con simple hacer click copiaré ese dato, sea
 * pieza y m³ (no apliques a pies)»).
 *
 * La cifra misma es el botón: no suma un ícono por celda ni ensancha la tabla.
 * Al copiar sale un «Copiado» encima por un segundo. Donde la celda es un campo
 * que se escribe, va el ícono chico al lado (`soloIcono`).
 *
 * Se copia SIN separador de miles y con punto decimal: «1234.567», no
 * «1,234.567». Así se pega en Excel o en el formulario de SERFOR como número;
 * con la coma de miles, Excel lo toma como texto. Los m³ van con sus 3
 * decimales siempre (0.500 ≠ 0.5 en un acta).
 */

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Copy } from "@buleje/design-system/icons";
import { fmtM3, fmtPiezas } from "@/lib/forestal/cubicacion-formato";

export type TipoCifra = "m3" | "piezas";

/** Lo que llega al portapapeles: número pelado, sin miles. */
export function textoParaCopiar(valor: number, tipo: TipoCifra): string {
  if (tipo === "m3") return valor.toFixed(3);
  return Number.isInteger(valor) ? String(valor) : String(Math.round(valor * 100) / 100);
}

async function aPortapapeles(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    /* sin permiso o sin https: va el respaldo */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = texto;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

const CIFRA =
  "-mx-1 cursor-copy whitespace-nowrap rounded px-1 tabular-nums transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]";
const ICONO =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-primary/10 hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

export function Copiable({
  texto,
  etiqueta,
  children,
  className = "",
  soloIcono = false,
}: {
  /** Lo que se copia. */
  texto: string;
  /** Cómo se dice al lector de pantalla: «Copiar {etiqueta}». */
  etiqueta: string;
  children?: ReactNode;
  className?: string;
  soloIcono?: boolean;
}) {
  const [estado, setEstado] = useState<"ok" | "error" | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (reloj.current) clearTimeout(reloj.current);
  }, []);

  const copiar = (ev: MouseEvent) => {
    /* Dentro de una fila que se tilda con el clic: copiar no tilda. */
    ev.stopPropagation();
    ev.preventDefault();
    void aPortapapeles(texto).then((ok) => {
      setEstado(ok ? "ok" : "error");
      if (reloj.current) clearTimeout(reloj.current);
      reloj.current = setTimeout(() => setEstado(null), 1200);
    });
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={copiar}
        aria-label={`Copiar ${etiqueta}`}
        title={`Copiar ${etiqueta}`}
        data-copiable={texto}
        data-copiado={estado ?? undefined}
        className={`${soloIcono ? ICONO : CIFRA} ${className}`}
      >
        {soloIcono ? <Copy className="size-3.5" aria-hidden /> : children}
      </button>
      <span aria-live="polite" className="sr-only">
        {estado === "ok" ? `Copiado: ${texto}` : estado === "error" ? "No se pudo copiar" : ""}
      </span>
      {estado && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--accent-dark)] px-1.5 py-0.5 font-sans text-xs font-bold text-white shadow-[var(--shadow-sm)]"
        >
          {estado === "ok" ? "Copiado" : "No se pudo copiar"}
        </span>
      )}
    </span>
  );
}

/** Una cifra de piezas o m³ que se copia con un clic. Pie tablar no lleva. */
export function CifraCopiable({ valor, tipo, className }: { valor: number; tipo: TipoCifra; className?: string }) {
  const visible = tipo === "m3" ? fmtM3(valor) : fmtPiezas(valor);
  const unidad = tipo === "m3" ? "m³" : valor === 1 ? "pieza" : "piezas";
  return (
    <Copiable texto={textoParaCopiar(valor, tipo)} etiqueta={`${visible} ${unidad}`} className={className}>
      {visible}
    </Copiable>
  );
}

/** El código de la línea («1-03»), también copiable. */
export function CodigoCopiable({ codigo }: { codigo: string | null | undefined }) {
  if (!codigo) return <span className="text-[var(--text-tertiary)]">—</span>;
  return (
    <Copiable texto={codigo} etiqueta={`código ${codigo}`} className="font-mono text-xs font-bold text-[var(--text-secondary)]">
      {codigo}
    </Copiable>
  );
}
