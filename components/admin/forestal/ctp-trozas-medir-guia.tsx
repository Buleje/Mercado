"use client";

/**
 * «Traer de la guía (SERFOR)» dentro de «Anotar D1 y D2» (Brandon 05-10: «las
 * columnas D1 y D2 se ponen automáticas porque esos están en la guía»).
 *
 * Agrupa por guía las piezas de la planilla que no tienen NINGUNA punta (el
 * servidor sólo llena ésas) y pregunta una sola vez cuáles traen la ficha
 * guardada: ésas se previsualizan solas; las otras piden el N° de registro.
 * Se abre solo si alguna guía ya tiene su ficha.
 */

import { useEffect, useMemo, useState } from "react";
import { FileCheck } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { EstadoGuiaMedidas } from "@/lib/forestal/medidas-desde-guia";
import { Btn } from "./ctp-shared";
import CtpTrozasMedirGuiaBloque from "./ctp-trozas-medir-guia-bloque";
import { leerEstadoGuias } from "./hooks/use-medidas-trozas";
import type { TrozaPatioAPI } from "./hooks/use-trozas-patio";

/** Piezas sin D1 ni D2, agrupadas por guía (en el orden en que aparecen). */
export function guiasSinMedidas(piezas: readonly TrozaPatioAPI[]): { gtf: string; codigos: string[] }[] {
  const por = new Map<string, string[]>();
  for (const t of piezas) {
    const gtf = (t.gtfNumber ?? "").trim();
    if (!gtf || t.d1Cm != null || t.d2Cm != null) continue;
    const cod = t.codificacion?.trim() || t.codigoPlanta?.trim() || "(sin código)";
    const l = por.get(gtf);
    if (l) l.push(cod);
    else por.set(gtf, [cod]);
  }
  return [...por].map(([gtf, codigos]) => ({ gtf, codigos }));
}

export default function CtpTrozasMedirGuia({
  piezas, onGuardado,
}: {
  piezas: readonly TrozaPatioAPI[];
  /** Releer el patio: las piezas llenadas salen de la planilla. */
  onGuardado: () => void;
}) {
  const grupos = useMemo(() => guiasSinMedidas(piezas), [piezas]);
  const clave = grupos.map((g) => g.gtf).join("|");
  const [estados, setEstados] = useState<Map<string, EstadoGuiaMedidas>>(new Map());
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* Una sola lectura para todas las guías; se repite sólo si cambia el conjunto. */
  useEffect(() => {
    const gtfs = clave ? clave.split("|") : [];
    if (gtfs.length === 0) return;
    let vivo = true;
    leerEstadoGuias(gtfs)
      .then((lista) => {
        if (!vivo) return;
        setEstados(new Map(lista.map((e) => [e.gtfNumber, e])));
        if (lista.some((e) => e.fichaGuardada)) setAbierto(true);
      })
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No se pudo leer el estado de las guías."));
    return () => { vivo = false; };
  }, [clave]);

  if (grupos.length === 0 && !aviso) return null;
  const conFicha = grupos.filter((g) => estados.get(g.gtf)?.fichaGuardada).length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Btn onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
          <FileCheck className="h-4 w-4" aria-hidden="true" /> Traer de la guía (SERFOR)
        </Btn>
        <span className="text-sm text-[var(--text-secondary)]">
          {grupos.length} {grupos.length === 1 ? "guía" : "guías"}
          {conFicha > 0 ? ` · ${conFicha} con la ficha guardada` : ""}
        </span>
        <InfoTip
          title="De dónde salen"
          what="La GTF de SERFOR trae la lista de trozas con su código y sus medidas (D1 × D2 × largo). Se cruza por el código de cada pieza y sólo se llenan las que no tienen ninguna punta."
          affects="Nunca pisa lo anotado. No se llena si el código choca con dos, si el largo difiere más de 30 cm o si el mes está cerrado. La ficha consultada queda guardada en el ingreso: la próxima vez va sola."
          example="Guía 010-001-0000014: pega el enlace del QR o escribe 1-19-0313629 → «3 de 3 coinciden» → Guardar las 3 de la guía."
        />
        {aviso && <span className="text-sm font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" role="status">{aviso}</span>}
      </div>
      {error && <p className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" role="alert">{error}</p>}
      {abierto && grupos.length > 0 && (
        <ul className="space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-2">
          {grupos.map((g) => (
            <CtpTrozasMedirGuiaBloque
              key={g.gtf}
              gtfNumber={g.gtf}
              codigos={g.codigos}
              estado={estados.get(g.gtf)}
              onGuardado={(m) => { setAviso(m); onGuardado(); }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
