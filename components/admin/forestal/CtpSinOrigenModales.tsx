"use client";

/**
 * Los modales que YA existen, abiertos desde una línea de «¿De qué trozas
 * salió?» (ADR-447). No hay un formulario nuevo: cada arreglo es el de siempre,
 * con sus reglas y su confirmación —corregir la llegada con motivo (ADR-434),
 * recibir en bloque, acomodar trozas (ADR-435), declarar apertura (ADR-394),
 * el editor de la corrida (ADR-401) y el día pieza por pieza—.
 *
 * Al terminar, `onCambio` con una frase: la bandeja y la tabla releen y la
 * lista se recalcula sola.
 */
import dynamic from "next/dynamic";
import { useState } from "react";
import AdminModal from "@/components/admin/shared/AdminModal";
import { nTrozas } from "@/lib/forestal/acomodar-trozas";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { formatNumber } from "@/lib/format";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import type { DiagnosticoCorrida } from "@/lib/forestal/vincular-trozas";
import { Btn, ModalBody } from "./ctp-shared";
import type { ArregloAbierto } from "./hooks/use-abrir-arreglo";

const CtpCorregirRecepcionModal = dynamic(() => import("./CtpCorregirRecepcionModal"), { ssr: false });
const CtpRecepcionBloqueModal = dynamic(() => import("./CtpRecepcionBloqueModal"), { ssr: false });
const CtpAcomodarTrozasModal = dynamic(() => import("./CtpAcomodarTrozasModal"), { ssr: false });
const DeclararAperturaModal = dynamic(() => import("./saldos/DeclararAperturaModal"), { ssr: false });
const CtpEditarLineaModal = dynamic(() => import("./CtpEditarLineaModal"), { ssr: false });
const CtpDiaDeProduccionModal = dynamic(() => import("./CtpDiaDeProduccionModal"), { ssr: false });

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** «N.º 12 · jueves 10/09 · Tacho · 0.530 m³». */
export function lineaDeCorrida(c: Pick<DiagnosticoCorrida, "lineNo" | "fecha" | "especie" | "m3Producido">): string {
  return `N.º ${c.lineNo ?? "—"} · ${etiquetaLarga(c.fecha)} · ${c.especie} · ${formatNumber(c.m3Producido, 3)} m³`;
}

/** Las corridas de antes del libro, cada una con su «Declarar apertura». */
function Aperturas({ corridas, onCerrar, onCambio }: { corridas: DiagnosticoCorrida[]; onCerrar: () => void; onCambio: (m: string) => void }) {
  const [de, setDe] = useState<DiagnosticoCorrida | null>(null);
  const [hechas, setHechas] = useState<ReadonlySet<string>>(new Set());
  const quedan = corridas.filter((c) => !hechas.has(c.corridaId));
  return (
    <>
      {/* La lista se esconde mientras la apertura está arriba: apilar dos
          Radix deja el de abajo con los clics apagados. */}
      <AdminModal
        open={!de}
        onClose={onCerrar}
        title="Madera de antes del libro"
        description="Declara cada una como apertura."
        variant="default"
      >
        <ModalBody>
          {quedan.length === 0 ? (
            <p className="text-base text-[var(--text-secondary)]">Ya no queda ninguna.</p>
          ) : (
            <ul className="space-y-2">
              {quedan.map((c) => (
                <li key={c.corridaId} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-base)] px-3 py-2">
                  <span className="min-w-0 flex-1 basis-[14rem] text-sm tabular-nums text-[var(--text-primary)]">{lineaDeCorrida(c)}</span>
                  <Btn variant="secondary" onClick={() => setDe(c)} className="max-sm:w-full">
                    Declarar apertura
                  </Btn>
                </li>
              ))}
            </ul>
          )}
        </ModalBody>
      </AdminModal>
      {de && (
        <DeclararAperturaModal
          corridaId={de.corridaId}
          lote={de.lineNo != null ? `N.º ${de.lineNo}` : null}
          onClose={() => setDe(null)}
          onListo={() => {
            setHechas((prev) => new Set([...prev, de.corridaId]));
            setDe(null);
            onCambio(`N.º ${de.lineNo ?? "—"} quedó como madera de apertura.`);
          }}
        />
      )}
    </>
  );
}

export default function CtpSinOrigenModales({
  abierto,
  onCerrar,
  onCambio,
}: {
  abierto: ArregloAbierto | null;
  onCerrar: () => void;
  /** Algo cambió en el libro: releer y decirlo. */
  onCambio: (mensaje: string) => void;
}) {
  if (!abierto) return null;
  const cambio = (m: string) => {
    invalidarCtp();
    onCambio(m);
  };

  switch (abierto.tipo) {
    case "corregir_llegada":
      return (
        <CtpCorregirRecepcionModal
          guias={abierto.guias}
          marcadas={abierto.marcadas}
          onClose={onCerrar}
          onListo={(r) => {
            onCerrar();
            const ok = r.corregidas.length;
            const fallas = r.fallaron.map((f) => `${f.gtfNumber}: ${f.motivo}`).join(" · ");
            if (ok === 0 && r.fallaron.length === 0) return;
            cambio(
              ok === 0
                ? `No se corrigió ninguna llegada. ${fallas}`
                : `Se ${plural(ok, "corrigió la llegada de 1 guía", `corrigieron las llegadas de ${ok} guías`)}${fallas ? ` · no: ${fallas}` : "."}`,
            );
          }}
        />
      );
    case "recibir_guia":
      return (
        <CtpRecepcionBloqueModal
          guias={abierto.guias}
          preseleccion={abierto.preseleccion}
          onClose={onCerrar}
          onListo={(r) => {
            onCerrar();
            const ok = r.recibidas.length;
            const fallas = r.fallaron.map((f) => `${f.gtfNumber}: ${f.motivo}`).join(" · ");
            cambio(
              ok === 0
                ? `No se recibió ninguna guía. ${fallas}`
                : `Se ${plural(ok, "recibió 1 guía", `recibieron ${ok} guías`)}${fallas ? ` · no: ${fallas}` : "."}`,
            );
          }}
        />
      );
    case "acomodar_trozas":
      return (
        <CtpAcomodarTrozasModal
          alcance={{ woodEntryIds: abierto.woodEntryIds }}
          descripcion={abierto.descripcion}
          aboveModals
          onClose={onCerrar}
          onAcomodado={(r) => cambio(`${nTrozas(r.movidas)} ${r.movidas === 1 ? "pasó" : "pasaron"} a la fila de su especie.`)}
        />
      );
    case "declarar_apertura":
      return <Aperturas corridas={abierto.corridas} onCerrar={onCerrar} onCambio={cambio} />;
    case "editar_corrida":
      return (
        <CtpEditarLineaModal
          linea={abierto.linea}
          onCerrar={onCerrar}
          onListo={(resumen) => {
            onCerrar();
            cambio(resumen || `N.º ${abierto.linea.lineNo ?? "—"} corregida.`);
          }}
        />
      );
    case "ver_dia":
      return <CtpDiaDeProduccionModal dia={abierto.dia} onClose={onCerrar} onEditado={() => cambio(`Se guardó un cambio del ${etiquetaLarga(abierto.dia)}.`)} />;
  }
}
