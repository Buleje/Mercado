"use client";

/**
 * Empresa › Modelo de negocio (ADR-497): el lienzo de 9 bloques. En la
 * computadora va con la forma clásica (socios a la izquierda, clientes a la
 * derecha, costos e ingresos abajo); en el celular, uno debajo de otro en el
 * orden en que conviene llenarlo: primero a quién le vendes y qué le ofreces.
 * Cada bloque es una lista de notas cortas: se agregan con Enter.
 */
import { useState } from "react";
import { BlockTitle } from "@buleje/design-system";
import { X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { nuevoId, useSeccionPlan } from "@/hooks/use-plan-empresa";
import type { BloqueLienzo, DatosSeccion } from "@/lib/planificacion/secciones";
import { cn } from "@/lib/utils";
import { CabeceraSeccion } from "../comun/CabeceraSeccion";
import { BLOQUE_LIENZO } from "./textos-empresa";

type Nota = DatosSeccion<"lienzo">[BloqueLienzo][number];

/** Orden de llenado (y de lectura en el celular). */
const ORDEN: readonly BloqueLienzo[] = [
  "segmentos",
  "propuestaValor",
  "canales",
  "relacionClientes",
  "ingresos",
  "recursosClave",
  "actividadesClave",
  "sociosClave",
  "costos",
];

/** Lugar de cada bloque en la grilla de 10 columnas (clases literales para que Tailwind las vea). */
const LUGAR: Record<BloqueLienzo, string> = {
  sociosClave: "lg:col-start-1 lg:col-span-2 lg:row-start-1 lg:row-span-2",
  actividadesClave: "lg:col-start-3 lg:col-span-2 lg:row-start-1",
  recursosClave: "lg:col-start-3 lg:col-span-2 lg:row-start-2",
  propuestaValor: "lg:col-start-5 lg:col-span-2 lg:row-start-1 lg:row-span-2",
  relacionClientes: "lg:col-start-7 lg:col-span-2 lg:row-start-1",
  canales: "lg:col-start-7 lg:col-span-2 lg:row-start-2",
  segmentos: "lg:col-start-9 lg:col-span-2 lg:row-start-1 lg:row-span-2",
  costos: "lg:col-start-1 lg:col-span-5 lg:row-start-3",
  ingresos: "lg:col-start-6 lg:col-span-5 lg:row-start-3",
};

const MAX_NOTAS = 30;

export function LienzoNegocio() {
  const { datos, cambiar, puedeEditar } = useSeccionPlan("lienzo");
  const agregar = (b: BloqueLienzo, texto: string) =>
    cambiar((prev) => ({ ...prev, [b]: [...prev[b], { id: nuevoId(), texto }] }));
  const quitar = (b: BloqueLienzo, id: string) => cambiar((prev) => ({ ...prev, [b]: prev[b].filter((n) => n.id !== id) }));

  return (
    <section className="space-y-4" aria-label="Modelo de negocio">
      <CabeceraSeccion
        seccion="lienzo"
        titulo="Modelo de negocio"
        ayuda="El lienzo de 9 bloques: cómo tu negocio crea valor, a quién se lo entrega y cómo gana plata. Anota ideas cortas; cada bloque trae su pregunta en el ⓘ."
        ejemplo="Empieza por Segmentos de clientes y Propuesta de valor; el resto sale de ahí."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-10">
        {ORDEN.map((b) => (
          <Bloque
            key={b}
            bloque={b}
            notas={datos[b]}
            editable={puedeEditar}
            onAgregar={(t) => agregar(b, t)}
            onQuitar={(id) => quitar(b, id)}
          />
        ))}
      </div>
    </section>
  );
}

interface BloqueProps {
  bloque: BloqueLienzo;
  notas: Nota[];
  editable: boolean;
  onAgregar: (texto: string) => void;
  onQuitar: (id: string) => void;
}

function Bloque({ bloque, notas, editable, onAgregar, onQuitar }: BloqueProps) {
  const [texto, setTexto] = useState("");
  const { rotulo, pregunta, ejemplo } = BLOQUE_LIENZO[bloque];
  const lleno = notas.length >= MAX_NOTAS;
  const destacado = bloque === "propuestaValor";

  return (
    <div
      className={cn(
        "flex min-h-36 min-w-0 flex-col gap-2 rounded-xl border p-3",
        destacado ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--rule-base)] bg-[var(--surface-raised)]",
        LUGAR[bloque],
      )}
    >
      <div className="flex items-center gap-1">
        <BlockTitle>{rotulo}</BlockTitle>
        <InfoTip title={rotulo} what={pregunta} example={ejemplo} />
      </div>
      {notas.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {notas.map((n) => (
            <li
              key={n.id}
              className="flex items-start gap-1 rounded-lg bg-[var(--surface-sunken)] py-1.5 pr-1 pl-2.5 text-sm text-[var(--text-primary)]"
            >
              <span className="min-w-0 flex-1 break-words">{n.texto}</span>
              {editable ? (
                <button
                  type="button"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)] hover:text-[var(--data-error-ink)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
                  aria-label={`Quitar «${n.texto}» de ${rotulo}`}
                  title="Quitar"
                  onClick={() => onQuitar(n.id)}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : !editable ? (
        <span className="text-sm text-[var(--text-tertiary)]">Sin notas</span>
      ) : null}
      {editable && !lleno ? (
        <input
          aria-label={`Agregar a ${rotulo}`}
          className="mt-auto h-10 w-full rounded-lg border border-dashed border-[var(--rule-base)] bg-transparent px-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-solid focus:border-[var(--accent)] focus:bg-[var(--surface-raised)]"
          placeholder="Escribe y pulsa Enter"
          maxLength={600}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            const limpio = texto.trim();
            if (!limpio) return;
            onAgregar(limpio);
            setTexto("");
          }}
        />
      ) : null}
    </div>
  );
}
