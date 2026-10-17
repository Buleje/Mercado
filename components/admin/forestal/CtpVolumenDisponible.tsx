"use client";

/**
 * «Volumen disponible» — cuánta madera hay para trabajar (Brandon 2026-10-03).
 *
 * Pedido: «unificá Trozas y Productos disponibles en una sola pestaña, con
 * chips para cambiar de formato: trozas, productos, el volumen que sobra en los
 * lotes y el de los ingresos por recepcionar; y una opción que sume todo para
 * saber cuánto se puede aprovechar. Que se filtre por permiso y que se puedan
 * elegir solo 2, 3 o 4».
 *
 * · UNA pila elegida → su detalle completo. Trozas y Productos son las vistas
 *   de siempre (con todas sus acciones: apartar, despachar, cubicar, Excel),
 *   recortadas a su pila y al permiso de arriba; Lotes y Por recepcionar son
 *   tablas nuevas que llevan a su pestaña de trabajo.
 * · Dos o más → la vista SUMADA: el total, de qué pila sale y su reparto por
 *   permiso y por especie.
 *
 * Cada m³ está en UNA sola pila (`lib/forestal/volumen-disponible`): la suma
 * de «Todo» no cuenta dos veces la troza que está en un lote.
 */

import { useCallback, useMemo, useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import { AlertTriangle, FileDown } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import {
  clavePermiso,
  permisoDeCorrida,
  type CorridaDisponible,
} from "@/lib/forestal/productos-disponibles-resumen";
import {
  alternarFuente,
  entraPorEspecie,
  entraPorPermiso,
  fuenteDeTroza,
  type FuentesPedidas,
  type UnidadVolumen,
} from "@/lib/forestal/volumen-disponible";
import CtpAvisoAlcancePermiso from "./CtpAvisoAlcancePermiso";
import CtpProductosDisponibles from "./CtpProductosDisponibles";
import CtpTrozasDisponibles from "./CtpTrozasDisponibles";
import { useFuentesElegidas, useVolumenDisponible } from "./hooks/use-volumen-disponible";
import { FiltroDeChips, SelectorDePilas } from "./volumen-disponible-chips";
import { VolumenCombinado } from "./volumen-disponible-combinado";
import { PilaLotes, PilaPorRecepcionar } from "./volumen-disponible-pilas";

export default function CtpVolumenDisponible({
  period,
  onIr,
  fuentesPedidas = null,
  onFuentesUsadas,
  onAbrirLote,
}: {
  period: CtpPeriod;
  onIr?: (vista: string) => void;
  /** Un salto desde otra pantalla que pide una pila («Ver trozas disponibles →»). */
  fuentesPedidas?: FuentesPedidas | null;
  onFuentesUsadas?: () => void;
  /** Clic en un lote de aserrío: abre su historia (Trazabilidad › Historia del lote). */
  onAbrirLote?: (loteId: string) => void;
}) {
  const [permisos, setPermisos] = useState<string[]>([]);
  const [especies, setEspecies] = useState<string[]>([]);
  /* Un salto desde otra pantalla (la ficha de un paquete, una reserva vencida)
     busca algo puntual: arrastrar los filtros de antes lo escondería. */
  const [fuentes, setFuentes] = useFuentesElegidas(fuentesPedidas, () => {
    setPermisos([]);
    setEspecies([]);
    onFuentesUsadas?.();
  });
  const v = useVolumenDisponible(period, fuentes, permisos, especies);
  const [errorExcel, setErrorExcel] = useState<string | null>(null);
  /* m³ o pies tablares (Brandon 03-10): se recuerda por dispositivo. */
  const [unidad, setUnidad] = useLocalStorage<UnidadVolumen>("ctp-volumen-disponible:unidad", "m3");
  const una = fuentes.length === 1 ? fuentes[0] : null;

  /* Las vistas de adentro, recortadas a su pila y al permiso de arriba.
     Identidad estable: cambiarla recalcula toda la vista de abajo. */
  const recorteTrozas = useCallback(
    (t: TrozaConsumible) =>
      fuenteDeTroza(t) === "trozas" &&
      entraPorPermiso(clavePermiso(t.permiso), permisos) &&
      entraPorEspecie(claveEspecie(t.especieComun), especies),
    [permisos, especies],
  );
  const recorteProductos = useMemo(
    () =>
      permisos.length > 0 || especies.length > 0
        ? (c: CorridaDisponible) =>
            entraPorPermiso(permisoDeCorrida(c), permisos) &&
            entraPorEspecie(claveEspecie(c.especie), especies)
        : undefined,
    [permisos, especies],
  );
  const alternarEn = (set: typeof setPermisos) => (clave: string) =>
    set((p) => (p.includes(clave) ? p.filter((x) => x !== clave) : [...p, clave]));
  const alternarPermiso = useCallback((clave: string) => alternarEn(setPermisos)(clave), []);
  const alternarEspecie = useCallback((clave: string) => alternarEn(setEspecies)(clave), []);
  const nombres = (elegidos: string[], opciones: typeof v.opcionesPermiso) =>
    elegidos.map((k) => opciones.find((o) => o.clave === k)?.etiqueta ?? k);
  const filtrosEscritos = [
    ...(permisos.length ? [`Permiso: ${nombres(permisos, v.opcionesPermiso).join(" o ")}`] : []),
    ...(especies.length ? [`Especie: ${nombres(especies, v.opcionesEspecie).join(" o ")}`] : []),
  ];

  return (
    <div className="space-y-4" data-vista-volumen>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 flex min-w-0 items-center gap-1.5">
            <SectionTitle as="h2">Volumen disponible</SectionTitle>
            <InfoTip
              title="Volumen disponible"
              what="Cuánta madera hay para trabajar, en cuatro pilas que no se pisan: trozas libres, lo que sobra en los lotes, lo por recepcionar y los productos aserrados."
              affects="Un chip muestra su pila con todo su detalle. Dos o más se suman. «Todo» suma las cuatro."
              example="Elige Trozas y Lotes para ver toda la madera en troza que puede ir a la sierra."
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <SegmentedControl<UnidadVolumen>
              value={unidad}
              onChange={setUnidad}
              size="lg"
              label="Ver el volumen en"
              options={[
                { value: "m3", label: "m³" },
                { value: "pt", label: "pt" },
              ]}
            />
          {!una && (
            <button
              type="button"
              onClick={async () => setErrorExcel(await v.descargarExcel(filtrosEscritos))}
              disabled={v.resumen.total.m3 === 0 || v.descargando}
              title="Resumen por pila, por permiso, por especie y qué se exportó"
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-2xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] disabled:opacity-50"
            >
              <FileDown className="h-4 w-4" aria-hidden />
              {v.descargando ? "Generando…" : "Excel"}
            </button>
          )}
          </div>
        </div>
        <SelectorDePilas
          fuentes={fuentes}
          porPila={v.porPila}
          unidad={unidad}
          cargando={v.sinDatosAun}
          onAlternar={(f) => setFuentes(alternarFuente(fuentes, f))}
        />
        <FiltroDeChips
          titulo="Permiso"
          todos="Todos"
          opciones={v.opcionesPermiso}
          elegidos={permisos}
          onAlternar={alternarPermiso}
          onTodos={() => setPermisos([])}
        />
        <FiltroDeChips
          titulo="Especie"
          todos="Todas"
          opciones={v.opcionesEspecie}
          elegidos={especies}
          onAlternar={alternarEspecie}
          onTodos={() => setEspecies([])}
        />
      </div>

      {/* Trozas y Productos traen su propio aviso de alcance y sus errores. */}
      {una !== "trozas" && una !== "productos" && (
        <>
          {v.contratoFiltro && v.codigoPermisoActivo && (
            <CtpAvisoAlcancePermiso
              codigo={v.codigoPermisoActivo}
              acotado={["las pilas", "el total", "las tablas"]}
            />
          )}
          {v.truncado && (
            <p role="status" className="flex items-center gap-2 rounded-2xl border-2 border-[var(--data-warning-500)] px-4 py-3 text-sm text-[var(--text-primary)]">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
              El patio no se leyó entero: las cifras de troza son de lo leído.
            </p>
          )}
          {(v.error || errorExcel) && (
            <p role="alert" className="rounded-2xl border-2 border-[var(--data-error-500)] px-4 py-3 text-sm font-bold text-[var(--text-primary)]">
              {v.error ?? `No se pudo bajar el Excel: ${errorExcel}`}
            </p>
          )}
        </>
      )}

      {una === "trozas" ? (
        <CtpTrozasDisponibles onIr={onIr} recorte={recorteTrozas} />
      ) : una === "productos" ? (
        <CtpProductosDisponibles period={period} recorte={recorteProductos} />
      ) : una === "lotes" ? (
        <PilaLotes
          filas={v.filasLotes}
          cargando={v.cargando}
          onIrLotes={onIr ? () => onIr("lotes") : undefined}
          onAbrirLote={onAbrirLote}
        />
      ) : una === "recepcion" ? (
        <PilaPorRecepcionar
          filas={v.filasRecepcion}
          cargando={v.cargando}
          onIrIngresos={onIr ? () => onIr("ingresos") : undefined}
        />
      ) : (
        <VolumenCombinado
          v={v}
          fuentes={fuentes}
          unidad={unidad}
          permisos={permisos}
          especies={especies}
          onSolo={(f) => setFuentes([f])}
          onElegirPermiso={alternarPermiso}
          onElegirEspecie={alternarEspecie}
        />
      )}
    </div>
  );
}
