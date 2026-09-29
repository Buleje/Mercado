"use client";

/**
 * LothMapaPlanResultado — lo que propuso el planificador, en tarjetas cortas:
 * árboles, patio, campamento, trochas, camino de salida y zonas no aptas. A la
 * vista, la cifra; el POR QUÉ de cada una, en su ⓘ. Debajo, «Agregar al
 * plano» / «Descartar» (o «Deshacer» si ya se agregó) y el orden de tala
 * plegable.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Mountain, Route, Tent, TreePine, Truck, Undo2, Warehouse, type LucideIcon } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { textoDistancia } from "@/lib/forestal/loth-mapa-arboles";
import { formatNumber } from "@/lib/format";
import { haNoAptas, type RespuestaPlan } from "./loth-mapa-plan";
import type { AgregadoAlPlano } from "./hooks/use-loth-planificador";

interface Props {
  respuesta: RespuestaPlan;
  agregado: AgregadoAlPlano | null;
  guardando: boolean;
  /** Recalculando (el patio se movió): lo que se ve todavía no es lo que se guardaría. */
  cargando: boolean;
  /** El patio lo movió el usuario: se ofrece volver al que elige el planificador. */
  patioMovido: boolean;
  onAgregar: () => void;
  onDeshacer: () => void;
  onDescartar: () => void;
  onSoltarPatio: () => void;
}

const TARJETA = "min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2.5 py-2";
const BTN =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 disabled:opacity-50";
const BTN_SEC = `${BTN} border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--rule-strong)]`;

function Tarjeta({ icono: Icono, titulo, cifra, detalle, porQue, extra }: { icono: LucideIcon; titulo: string; cifra: string; detalle?: string; porQue: string; extra?: string }) {
  return (
    <div className={TARJETA}>
      <p className="flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)]">
        <Icono className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
        <span className="truncate">{titulo}</span>
        <InfoTip title={titulo} what={porQue} affects={extra} ancho="w-80" />
      </p>
      <p className="mt-0.5 text-sm font-black tabular-nums text-[var(--text-primary)]">{cifra}</p>
      {detalle && <p className="truncate text-xs tabular-nums text-[var(--text-secondary)]">{detalle}</p>}
    </div>
  );
}

const plural = (n: number, uno: string, varios: string) => `${formatNumber(n)} ${n === 1 ? uno : varios}`;

export default function LothMapaPlanResultado({ respuesta, agregado, guardando, cargando, patioMovido, onAgregar, onDeshacer, onDescartar, onSoltarPatio }: Props) {
  const [ordenAbierto, setOrdenAbierto] = useState(false);
  const listaRef = useRef<HTMLOListElement>(null);
  // Abierta al pie del panel quedaba fuera de la vista: se trae al abrirla.
  useEffect(() => {
    if (ordenAbierto) listaRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [ordenAbierto]);
  const p = respuesta.propuesta;
  const [patio, ...alternativas] = p.patios;
  const excl = respuesta.arboles.excluidos;
  const nExcl = excl.reduce((s, e) => s + e.n, 0);
  const t = p.trochas;
  const c = p.caminoSalida;
  const camp = p.campamento;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        <Tarjeta
          icono={TreePine}
          titulo="Árboles"
          cifra={plural(p.resumen.arboles, "árbol", "árboles")}
          detalle={`${formatNumber(p.resumen.m3, 1)} m³${nExcl ? ` · ${nExcl} no entran` : ""}`}
          porQue={
            nExcl
              ? `No entran: ${excl.map((e) => `${e.motivo.toLowerCase()} (${e.n}: ${e.codigos.slice(0, 8).join(", ")}${e.n > 8 ? "…" : ""})`).join("; ")}.`
              : "Todos los árboles del plan con coordenadas y madera por sacar."
          }
          extra={p.resumen.enFaja ? `${plural(p.resumen.enFaja, "árbol queda", "árboles quedan")} dentro de una faja marginal.` : undefined}
        />
        {patio && (
          <Tarjeta
            icono={Warehouse}
            titulo={patio.fijadoPorUsuario ? "Patio (lo moviste)" : "Patio"}
            cifra={`${textoDistancia(patio.distanciaMediaM)} de arrastre`}
            detalle={[patio.pendientePct != null ? `${Math.round(patio.pendientePct)} %` : null, patio.distanciaCaminoM != null ? `camino a ${textoDistancia(patio.distanciaCaminoM)}` : "sin camino cerca"]
              .filter(Boolean)
              .join(" · ")}
            porQue={patio.porQue}
            extra={alternativas.length ? `En el mapa, los aros son otras opciones: ${alternativas.map((a, i) => `opción ${i + 2}, ${a.porQue.split(". ").at(-1)}`).join(" ")}` : undefined}
          />
        )}
        <Tarjeta
          icono={Tent}
          titulo="Campamento"
          cifra={camp ? `a ${textoDistancia(camp.distanciaPatioM)} del patio` : "Sin lugar plano"}
          detalle={camp ? (camp.agua ? `agua a ${textoDistancia(camp.agua.distanciaM)}` : "sin agua cerca") : undefined}
          porQue={camp?.porQue ?? "No hay un punto plano cerca del patio fuera de la faja marginal."}
        />
        <Tarjeta
          icono={Route}
          titulo="Trochas"
          cifra={textoDistancia(t.largoTotalM)}
          detalle={`arrastre medio ${textoDistancia(t.distanciaMediaArrastreM)}`}
          porQue={t.porQue}
        />
        <Tarjeta
          icono={Truck}
          titulo="Salida"
          cifra={c ? (c.largoM > 0 ? textoDistancia(c.largoM) : "Sobre el camino") : "Sin camino conocido"}
          detalle={c ? `al camino${c.pendienteMaxPct != null ? ` · máx. ${Math.round(c.pendienteMaxPct)} %` : ""}` : undefined}
          porQue={c?.porQue ?? "No se conocen caminos en la zona: dibuja la vía de acceso en el mapa (Dibujar → Vía o río) y vuelve a proponer."}
        />
        <Tarjeta
          icono={Mountain}
          titulo="No aptas"
          cifra={p.zonasNoAptas.length ? `≈ ${formatNumber(Math.round(haNoAptas(p)))} ha` : "Ninguna"}
          detalle={`más de ${p.parametros.pendienteMaxArrastrePct} % de pendiente`}
          porQue={
            p.zonasNoAptas.length
              ? `${plural(p.zonasNoAptas.length, "celda", "celdas")} de la grilla de altitud (unos 100 m de lado) con más de ${p.parametros.pendienteMaxArrastrePct} % de pendiente: ahí no entra el tractor. En el mapa van en rojo claro.`
              : "Sin datos de altitud o sin laderas fuertes en la zona."
          }
        />
      </div>

      {agregado ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-success-500)]/50 bg-[var(--data-success-500)]/10 px-2.5 py-1.5" role="status">
          <p className="min-w-0 flex-1 text-xs font-semibold text-[var(--text-primary)]">
            En el plano: {plural(agregado.referencias, "referencia", "referencias")} y {plural(agregado.vias, "vía", "vías")}
            {agregado.omitidas.length > 0 && <InfoTip title="Lo que no se dibujó" what={agregado.omitidas.join(" ")} />}
          </p>
          <button type="button" onClick={onDeshacer} disabled={guardando} className={BTN_SEC}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Undo2 className="h-4 w-4" aria-hidden="true" />}
            Deshacer
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAgregar}
            disabled={guardando || cargando || !respuesta.puedeGuardar}
            className={`${BTN} flex-1 bg-[var(--accent)] text-white hover:brightness-95`}
            title={
              respuesta.puedeGuardar
                ? "Guarda el patio, el campamento, las trochas y el camino como referencias y vías del plano"
                : "Tu rol puede proponer; guardar en el plano lo hace un administrador"
            }
          >
            {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Agregar al plano
          </button>
          {!respuesta.puedeGuardar && (
            <InfoTip title="Agregar al plano" what="Tu rol puede proponer; guardar en el plano lo hace un administrador." example="Muéstrale la propuesta al administrador o al dueño y que la agregue desde su cuenta." />
          )}
          <button type="button" onClick={onDescartar} disabled={guardando} className={BTN_SEC}>
            Descartar
          </button>
          {patioMovido && (
            <button type="button" onClick={onSoltarPatio} disabled={guardando} className={BTN_SEC} title="Vuelve al patio que elige el planificador">
              Patio sugerido
            </button>
          )}
        </div>
      )}

      {p.ordenTala.length > 0 && (
        <div className="rounded-xl border border-[var(--rule-base)]">
          {/* El ⓘ va al lado del botón, no adentro: un botón dentro de otro es HTML inválido. */}
          <div className="flex items-center gap-1 pr-2.5">
            <button
              type="button"
              onClick={() => setOrdenAbierto((v) => !v)}
              aria-expanded={ordenAbierto}
              className="flex h-10 min-w-0 flex-1 items-center gap-1.5 pl-2.5 text-left text-sm font-bold text-[var(--text-primary)]"
            >
              <ChevronDown className={`h-4 w-4 flex-none transition-transform ${ordenAbierto ? "rotate-180" : ""}`} aria-hidden="true" />
              Orden de tala
              <span className="font-semibold tabular-nums text-[var(--text-tertiary)]">· {p.ordenTala.length}</span>
            </button>
            <InfoTip title="Orden de tala" what={p.porQueOrden} />
          </div>
          {ordenAbierto && (
            <ol ref={listaRef} className="max-h-56 overflow-y-auto border-t border-[var(--rule-soft)] px-2.5 py-1.5">
              {p.ordenTala.map((o) => (
                <li key={o.id} className="flex items-baseline gap-2 py-0.5 text-xs tabular-nums text-[var(--text-secondary)]">
                  <span className="w-6 flex-none text-right font-bold text-[var(--text-tertiary)]">{o.orden}.</span>
                  <b className="font-bold text-[var(--text-primary)]">{o.codigo}</b>
                  <span className="truncate">{o.ramal}</span>
                  <span className="ml-auto flex-none">{textoDistancia(o.distanciaRedM)}</span>
                  <span className="w-16 flex-none text-right">{o.accion === "arrastrar" ? "arrastrar" : "talar"}</span>
                  {(o.enFaja || o.fueraDelPredio) && (
                    <span className="flex-none font-bold text-[var(--data-warning-ink)]" title={o.enFaja ? "Dentro de la faja marginal" : "Fuera del área dibujada"}>
                      !
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
