"use client";

/**
 * Qué hay disponible, separado en rolliza y aserrada.
 *
 * Las dos son madera pero no son lo mismo: una está en el patio esperando la
 * sierra y la otra en el depósito esperando un camión. Mezclarlas en una sola
 * lista respondía «tengo 90 m³» a alguien que necesitaba saber cuánto podía
 * aserrar el lunes.
 *
 * La barra de cada fila muestra su peso en el total, así el volumen se compara
 * de un vistazo sin leer los números uno por uno.
 *
 * ── Lo que este bloque NO puede hacer: esconder lo que está en rojo ─────────
 * El gate era «¿hay una fila con saldo positivo?». Con una especie
 * sobreconsumida —saldo −81.81 m³ y 57 trozas paradas en el patio— la respuesta
 * es no, y la sección entera se reemplazaba por «No hay rolliza en el patio en
 * este período». Tres cosas mal en una línea: desaparecía la única fila que hay
 * que corregir, afirmaba un patio vacío que el bloque de Antigüedad de la MISMA
 * pantalla contradice, y dejaba al operador sin la tabla justo cuando más la
 * necesita. Ahora la tabla se dibuja siempre que haya filas; lo que se apaga es
 * el reparto —que sí necesita volumen positivo para tener sentido— y con su
 * motivo escrito.
 */

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import {
  filasDeAserrada,
  filasDeTrozas,
  paraGrafico,
  resumir,
  type ResumenDeSaldo,
  type SaldoEspecie,
  type SaldoProducto,
} from "@/lib/forestal/ctp-saldos-vista";
import { formatNumber } from "@/lib/format";
import DetalleDisponible from "./DetalleDisponible";
import Pestanas from "./Pestanas";
import RepartoDisponible from "./RepartoDisponible";

const n3 = (v: number) => formatNumber(v, 3);
const nf = (v: number) => formatNumber(v);

type Vista = "trozas" | "aserrada";
type Panel = "reparto" | "detalle";

const idTab = (v: Vista) => `disponible-tab-${v}`;
const idPanel = (v: Vista) => `disponible-panel-${v}`;
const idSubTab = (p: Panel) => `disponible-subtab-${p}`;
const idSubPanel = (p: Panel) => `disponible-subpanel-${p}`;

const TIPOS: { id: Vista; titulo: string; sub: string; unidad: [string, string] }[] = [
  {
    id: "trozas",
    titulo: "Rolliza en patio",
    sub: "Lo que se puede aserrar",
    unidad: ["especie", "especies"],
  },
  /* «Madera disponible» en minúscula: con mayúscula chocaba con la pestaña
     «Disponibles» del libro, que es otra cosa (paquetes por cliente). */
  {
    id: "aserrada",
    titulo: "Madera disponible",
    sub: "Lo que se puede vender",
    unidad: ["producto", "productos"],
  },
];

/** Lo que dice cada pestaña de tipo: su total, para comparar sin cambiar de vista. */
function CabezaTipo({ t, res }: { t: (typeof TIPOS)[number]; res: ResumenDeSaldo }) {
  const rolliza = t.id === "trozas";
  return (
    <>
      <span className="block text-base font-extrabold text-[var(--text-primary)]">{t.titulo}</span>
      <span className="block text-xl font-extrabold tabular-nums text-[var(--text-primary)]">
        {n3(res.disponibleM3)} m³
      </span>
      <span className="block text-sm text-[var(--text-secondary)]">
        {t.sub}
        {res.conStock > 0 && (
          <>
            {" · "}
            {res.conStock} {res.conStock === 1 ? t.unidad[0] : t.unidad[1]}
            {res.piezas > 0 && ` · ${nf(res.piezas)} pza`}
            {res.guias > 0 && ` · ${res.guias} ${res.guias === 1 ? "guía" : "guías"}`}
          </>
        )}
      </span>
      {/* Un «0.000 m³» a secas sobre un patio con piezas hace desconfiar del
          tablero entero: el m³ del libro y el conteo físico son dos cuentas. */}
      {res.conStock === 0 && res.piezasTotales > 0 && (
        <span className="mt-0.5 block text-sm font-semibold text-[var(--data-warning-ink)]">
          saldo en negativo · {nf(res.piezasTotales)}{" "}
          {rolliza
            ? res.piezasTotales === 1
              ? "troza sigue en el patio"
              : "trozas siguen en el patio"
            : res.piezasTotales === 1
              ? "pieza sigue en depósito"
              : "piezas siguen en depósito"}
        </span>
      )}
    </>
  );
}

export default function DisponiblePorTipo({
  especies,
  productos,
  onKardex,
}: {
  especies: readonly SaldoEspecie[];
  productos: readonly SaldoProducto[];
  /** Abre el movimiento fila por fila de una especie (el kardex). */
  onKardex?: (especie: string) => void;
}) {
  /* Arranca en la pestaña que TIENE algo; se calcula una sola vez: después
     manda la elección del operador. */
  const [vista, setVista] = useState<Vista>(() => {
    const hayRolliza = especies.some((e) => e.saldoM3 > 0 || (e.piezasDisponibles ?? 0) > 0);
    return hayRolliza || !productos.some((p) => p.stock > 0) ? "trozas" : "aserrada";
  });
  /* Arranca en «Detalle» cuando la pestaña con la que se ABRE no tiene volumen
     positivo: repartir cero no dibuja nada y la fila en rojo vive del otro lado. */
  const [panel, setPanel] = useState<Panel>(() =>
    (vista === "trozas" ? especies.some((e) => e.saldoM3 > 0) : productos.some((p) => p.stock > 0))
      ? "reparto"
      : "detalle",
  );
  const [soloConAlgo, setSoloConAlgo] = useState(false);

  const filas = vista === "trozas" ? filasDeTrozas(especies) : filasDeAserrada(productos);
  const r = resumir(filas);
  const res: Record<Vista, ResumenDeSaldo> = {
    trozas: resumir(filasDeTrozas(especies)),
    aserrada: resumir(filasDeAserrada(productos)),
  };

  return (
    <section aria-labelledby="disponible-titulo" className="space-y-4">
      <CardTitle as="h3" id="disponible-titulo" className="text-base font-bold">
        Cuánta madera hay y de qué
      </CardTitle>
      <Pestanas
        items={TIPOS.map((t) => ({ id: t.id, contenido: <CabezaTipo t={t} res={res[t.id]} /> }))}
        activa={vista}
        onCambiar={setVista}
        etiqueta="Tipo de madera"
        idTab={idTab}
        idPanel={idPanel}
        className="grid gap-2 sm:grid-cols-2"
        claseBoton={(sel) =>
          `rounded-xl border-2 px-4 py-2 text-left transition-colors ${
            sel
              ? "border-primary bg-primary/10"
              : "border-[var(--rule-base)] hover:border-primary/50"
          }`
        }
      />

      <div role="tabpanel" id={idPanel(vista)} aria-labelledby={idTab(vista)} className="space-y-3">
        {filas.length > 0 ? (
          <>
            <Pestanas
              items={[
                {
                  id: "reparto" as const,
                  contenido: (
                    <>
                      Reparto<span className="sr-only">: dónde está el volumen</span>
                    </>
                  ),
                },
                {
                  id: "detalle" as const,
                  contenido: (
                    <>
                      Detalle ({filas.length})<span className="sr-only">: fila por fila</span>
                    </>
                  ),
                },
              ]}
              activa={panel}
              onCambiar={setPanel}
              etiqueta="Qué mirar"
              idTab={idSubTab}
              idPanel={idSubPanel}
              className="flex flex-wrap gap-1 border-b border-[var(--rule-base)]"
              claseBoton={(sel) =>
                `-mb-px min-h-11 border-b-2 px-4 text-base font-bold transition-colors ${
                  sel
                    ? "border-primary text-[var(--text-primary)]"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`
              }
            />
            <div role="tabpanel" id={idSubPanel(panel)} aria-labelledby={idSubTab(panel)}>
              {panel === "reparto" ? (
                <RepartoDisponible vista={vista} resumen={r} grafico={paraGrafico(filas)} />
              ) : (
                <DetalleDisponible
                  vista={vista}
                  filas={filas}
                  resumen={r}
                  onKardex={onKardex}
                  soloConAlgo={soloConAlgo}
                  onSoloConAlgo={setSoloConAlgo}
                />
              )}
            </div>
          </>
        ) : (
          <p className="rounded-xl bg-[var(--surface-sunken)] p-4 text-base text-[var(--text-secondary)]">
            {vista === "trozas"
              ? "Ninguna especie tuvo movimiento de rolliza en este período: no hay ingreso ni consumo que mostrar."
              : "Todavía no se declaró producción aserrada en este período."}
          </p>
        )}
      </div>
    </section>
  );
}
