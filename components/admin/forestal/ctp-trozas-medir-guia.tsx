"use client";

/**
 * «Traer de la guía (SERFOR)» dentro de «Anotar D1 y D2» (Brandon 05-10: «las
 * columnas D1 y D2 se ponen automáticas porque esos están en la guía»).
 *
 * Agrupa por guía las piezas de la planilla que no tienen NINGUNA punta (el
 * servidor sólo llena ésas) y pregunta una sola vez cuáles traen la ficha
 * guardada: ésas se previsualizan solas; las otras piden el N° de registro o
 * el QR de la guía de papel («Escanear QR»).
 *
 * «Guía tras guía» (05-10, «Completar Blas con el QR»): al guardar una, el foco
 * pasa a la siguiente pendiente sin cerrar la planilla, con la cuenta «3 de 7
 * guías completas» (todas las guías que pasaron por la lista desde que se
 * abrió; completa = guardada acá o sin piezas pendientes). Un QR que resultó
 * ser de otra guía de la lista se lleva a esa guía con un toque.
 */

import { useEffect, useMemo, useState } from "react";
import { FileCheck } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { siguienteGuiaPendiente, type EstadoGuiaMedidas } from "@/lib/forestal/medidas-desde-guia";
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
  /* Abierta de entrada: con el QR, cada guía está a un toque (antes se abría sólo con fichas guardadas). */
  const [abierto, setAbierto] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hechas, setHechas] = useState<ReadonlySet<string>>(() => new Set());
  const [activa, setActiva] = useState<string | null>(null);
  const [entregas, setEntregas] = useState<Record<string, { registro: string; n: number }>>({});
  /* Todas las guías que pasaron por la lista (las completas se van al releer el
     patio): estado derivado ajustado en el render, sin efecto. */
  const [vistas, setVistas] = useState<string[]>([]);
  const nuevas = grupos.filter((g) => !vistas.includes(g.gtf));
  if (nuevas.length > 0) setVistas([...vistas, ...nuevas.map((g) => g.gtf)]);

  /* Una sola lectura para todas las guías; se repite sólo si cambia el conjunto. */
  useEffect(() => {
    const gtfs = clave ? clave.split("|") : [];
    if (gtfs.length === 0) return;
    let vivo = true;
    leerEstadoGuias(gtfs)
      .then((lista) => {
        if (!vivo) return;
        setEstados(new Map(lista.map((e) => [e.gtfNumber, e])));
      })
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No se pudo leer el estado de las guías."));
    return () => { vivo = false; };
  }, [clave]);

  if (grupos.length === 0 && !aviso) return null;
  const conFicha = grupos.filter((g) => estados.get(g.gtf)?.fichaGuardada).length;
  const pendientes = new Set(grupos.map((g) => g.gtf));
  const completas = vistas.filter((g) => hechas.has(g) || !pendientes.has(g)).length;
  const porHacer = grupos.map((g) => g.gtf).filter((g) => !hechas.has(g));

  const terminar = (gtf: string, mensaje: string) => {
    const ya = new Set(hechas).add(gtf);
    setHechas(ya);
    const sig = siguienteGuiaPendiente(grupos.map((g) => g.gtf), gtf, ya);
    setActiva(sig);
    setAviso(`${mensaje} ${sig ? `Sigue la guía ${sig}.` : "No quedan guías por traer en la lista."}`);
    onGuardado();
  };

  const llevarA = (gtf: string, registroOEnlace: string) => {
    setEntregas((prev) => ({ ...prev, [gtf]: { registro: registroOEnlace, n: (prev[gtf]?.n ?? 0) + 1 } }));
    setActiva(gtf);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Btn onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
          <FileCheck className="h-4 w-4" aria-hidden="true" /> Traer de la guía (SERFOR)
        </Btn>
        <span className="text-sm text-[var(--text-secondary)]" role="status">
          <b className="text-[var(--text-primary)]">
            {completas} de {vistas.length} {vistas.length === 1 ? "guía completa" : "guías completas"}
          </b>
          {conFicha > 0 ? ` · ${conFicha} con la ficha guardada` : ""}
        </span>
        <InfoTip
          title="De dónde salen"
          what="La GTF de SERFOR trae la lista de trozas con su código y sus medidas (D1 × D2 × largo). Se cruza por el código de cada pieza y sólo se llenan las que no tienen ninguna punta."
          affects="Nunca pisa lo anotado. No se llena si el código choca con dos, si el largo difiere más de 30 cm o si el mes está cerrado. Si el ingreso no declara el título habilitante, se toma el de la ficha (sólo admin o dueño). La ficha consultada queda guardada en el ingreso: la próxima vez va sola."
          example="Guía 010-001-0000014: toca «Escanear QR» y apunta al QR de la guía de papel (o escribe 1-19-0313629) → «3 de 3 coinciden» · Título 19-SEC/PER-FMC-2024-008 → Guardar las 3 y el título → pasa sola a la siguiente guía."
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
              activo={activa === g.gtf}
              hecha={hechas.has(g.gtf)}
              otras={porHacer.filter((x) => x !== g.gtf)}
              entrega={entregas[g.gtf] ?? null}
              onLlevarA={llevarA}
              onGuardado={(m) => terminar(g.gtf, m)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
