"use client";

import { useCallback, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { presentacionSugerida, productoDelTipoComercial } from "@/lib/forestal/loctp-catalogos";
import { sugerirCodigoPaquete } from "@/lib/forestal/produccion-paquetes";
import { registrarJornadas, type ResumenJornadas } from "@/lib/forestal/registrar-jornadas";
import type { Jornada } from "@/lib/forestal/consumo-en-jornadas";
import type { EstadoLotesAserrio } from "./use-lotes-aserrio";

/**
 * use-registrar-jornadas — el cableado entre el reparto y el libro (ADR-373).
 *
 * La política de qué hacer cuando una escritura falla vive en
 * `registrar-jornadas.ts` (pura, con tests). Acá sólo se arman los cuerpos:
 * consumir las trozas del día y declarar sus paquetes.
 *
 * Los códigos de paquete se piden **una vez** antes de empezar y se van
 * reservando en memoria: pedirlos por jornada devolvería el mismo número dos
 * veces —el anterior todavía no está escrito— y el servidor rechazaría la
 * segunda por código duplicado.
 */

async function codigosExistentes(): Promise<string[]> {
  try {
    const r = await fetch("/api/admin/forestal/ctp?codigosPaquete=1", { credentials: "include" });
    if (!r.ok) return [];
    const j = (await r.json()) as { codigos?: string[] };
    return j.codigos ?? [];
  } catch {
    /* Sin la lista se arranca una serie nueva: es peor no poder registrar. */
    return [];
  }
}

export function useRegistrarJornadas(estado: EstadoLotesAserrio) {
  const [avance, setAvance] = useState<{ hechas: number; total: number } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const registrar = useCallback(
    async (jornadas: readonly Jornada[], opts: { loteId: string; observaciones?: string | null }): Promise<ResumenJornadas> => {
      setOcupado(true);
      setAvance({ hechas: 0, total: jornadas.length });
      const existentes = await codigosExistentes();
      const reservados: string[] = [];
      try {
        return await registrarJornadas(jornadas, {
          onAvance: (hechas, total) => setAvance({ hechas, total }),
          consumir: async (j) => {
            const r = await estado.consumirEnPatio({
              loteId: opts.loteId,
              trozaIds: j.trozaIds,
              fecha: j.fecha,
              observaciones: opts.observaciones ?? `Jornada ${j.dia} del turno cubicado`,
            });
            return r.corrida;
          },
          declarar: async (corridaId, j) => {
            const paquetes = j.grupos.map((g) => {
              const codigo = sugerirCodigoPaquete(existentes, { hoy: new Date(`${j.fecha}T12:00:00`), ocupados: reservados });
              reservados.push(codigo);
              /* Una medida por grupo es lo común; con varias se declara la
                 primera y el resto queda en la observación, porque el paquete
                 del libro tiene UN juego de medidas. */
              const m = g.medidas[0];
              /* El libro se escribe con el nombre del CATÁLOGO, no con el del
                 patio: «Comercial» entraba tal cual y la presentación quedaba
                 vacía porque el catálogo busca «MADERA ASERRADA (COMERCIAL)». */
              const producto = productoDelTipoComercial(g.label) ?? g.label;
              return {
                codigo,
                productType: producto,
                presentacion: presentacionSugerida(producto),
                cantidad: g.piezas,
                volumenM3: g.m3,
                espesorCm: m?.espesor ?? null,
                anchoCm: m?.ancho ?? null,
                largoM: m?.largo ?? null,
                observations:
                  g.medidas.length > 1
                    ? `Medidas: ${g.medidas.map((x) => `${x.medida} (${x.piezas})`).join(", ")}`
                    : null,
              };
            });
            const r = await fetch("/api/admin/forestal/ctp", {
              method: "PATCH",
              headers: csrfHeaders({ "Content-Type": "application/json" }),
              credentials: "include",
              body: JSON.stringify({
                action: "declarar_produccion",
                id: corridaId,
                quantity: j.m3,
                unit: "m3",
                observations: `Jornada ${j.dia} de ${jornadas.length} · cubicación repartida`,
                pieces: j.piezas,
                productType: paquetes[0]?.productType ?? null,
                presentacion: paquetes[0]?.presentacion ?? null,
                codigoProducto: paquetes[0]?.codigo ?? null,
                paquetes,
              }),
            });
            if (!r.ok) {
              const j2 = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
              throw new Error(j2.message ?? j2.error ?? `El servidor respondió ${r.status}`);
            }
          },
        });
      } finally {
        invalidarCtp("/forestal/");
        await estado.recargar();
        setOcupado(false);
        setAvance(null);
      }
    },
    [estado],
  );

  return { registrar, avance, ocupado };
}
