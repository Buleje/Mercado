"use client";

/**
 * Pestaña «Trozas del bloque» del panel «Lotes» (03-10): «ahí mismo en la
 * página de trozas podré escoger e integrarlo en el lote» (Brandon).
 *
 *  · Bloque con lote abierto → se eligen piezas libres del patio de su especie
 *    (y permiso) y «Agregar al lote» las suma por la puerta del Libro
 *    (`agregarTrozas`: lock por troza, L-A1, ADR-393; devuelve las rechazadas
 *    con su motivo). Una pieza del lote se puede sacar («Quitar»).
 *  · Bloque sin lote (cargado a mano o traído del Libro) → «Crear su lote» con
 *    EXACTAMENTE las piezas elegidas (todo o nada, ADR-464).
 */

import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Loader2, PackagePlus, Plus, Scale } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { volumenLibre } from "@/lib/forestal/lotes-aserrio";
import {
  especiesLibres,
  m3DeIds,
  modoDelSelector,
  opcionesDeTrozas,
  permisosDe,
  reglaDePermiso,
  TOLERANCIA_M3,
  trozasLibresDeEspecie,
} from "@/lib/forestal/panel-lotes-reparto";
import type { PanelLotes } from "./hooks/use-panel-lotes";
import type { EstadoLotesAserrio } from "./hooks/use-lotes-aserrio";
import { Aviso, BTN, BTN_PRIMARIO, CAMPO } from "./reparto-panel-lotes-ui";
import { TrozasEnElLote, TrozasParaElegir } from "./reparto-trozas-lista";

type Estado = Pick<EstadoLotesAserrio, "lotes" | "trozas" | "cargando" | "patioTruncado">;
type Props = { panel: PanelLotes; bloques: BloqueRolliza[]; estado: Estado; bloqueId: string | null; onBloque: (id: string) => void };

const nombreBloque = (b: BloqueRolliza, code: string | null) =>
  `${b.etiqueta || "Sin etiqueta"} · ${b.especie || "sin especie"} · ${fmtM3(Number(b.m3) || 0)} m³ · ${code ? `lote ${code}` : "sin lote"}`;

export default function RepartoTrozasDelBloque({ panel, bloques, estado, bloqueId, onBloque }: Props) {
  const deRolliza = bloques.filter((b) => b.tipo !== "aserrada");
  const b = deRolliza.find((x) => x.id === bloqueId) ?? null;
  const enOtroBloque = useMemo(() => trozasDeOtrosBloques(bloques, bloqueId ?? ""), [bloques, bloqueId]);
  const codeDe = (id: string | null | undefined) => (id ? (estado.lotes.find((l) => l.id === id)?.code ?? null) : null);
  return (
    <section aria-label="Trozas del bloque" className="space-y-3">
      <div className="flex items-center gap-2">
        <CardTitle as="h4" className="text-sm font-bold text-[var(--text-primary)]">Elige las trozas de un bloque</CardTitle>
        <InfoTip
          title="Trozas reales para el lote"
          what="Eliges piezas libres del patio de la especie (y permiso) del bloque. Si el bloque tiene lote, se suman a ese lote; si no, se le crea uno con exactamente esas piezas."
          affects="El bloque recuerda sus trozas y sus jornadas se registran en el Libro. El volumen se descuenta al registrar la producción. Una troza sin permiso en su ingreso no entra: corrígelo en Ingresos."
          example="Bloque «Tornillo a mano» de 10 m³ → eliges 5 trozas (9.950 m³) → lote LA-2026-015 con esas 5."
        />
      </div>
      <select value={b?.id ?? ""} onChange={(e) => onBloque(e.target.value)} aria-label="Bloque" className={`${CAMPO} w-full`}>
        <option value="">Elige el bloque…</option>
        {deRolliza.map((x) => (
          <option key={x.id} value={x.id}>{nombreBloque(x, codeDe(x.loteId))}</option>
        ))}
      </select>
      {deRolliza.length === 0 && <p className="text-sm text-[var(--text-secondary)]">No hay bloques de rolliza en la tabla.</p>}
      {estado.patioTruncado && (
        <Aviso tono="aviso">El patio pasa el tope de lectura: se ven {estado.patioTruncado.leidas} de {estado.patioTruncado.hay} trozas.</Aviso>
      )}
      {b && <SelectorDelBloque key={b.id} panel={panel} bloque={b} estado={estado} enOtroBloque={enOtroBloque} />}
    </section>
  );
}

/** Las trozas que ya están en OTRO bloque de la tabla → su etiqueta. Elegirlas repetiría madera (revisión 03-10). */
function trozasDeOtrosBloques(bloques: readonly BloqueRolliza[], bloqueId: string): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const x of bloques) {
    if (x.id === bloqueId) continue;
    for (const t of x.trozaIds ?? []) out.set(t, x.etiqueta || "sin etiqueta");
  }
  return out;
}

function SelectorDelBloque({ panel, bloque: b, estado, enOtroBloque }: {
  panel: PanelLotes;
  bloque: BloqueRolliza;
  estado: Estado;
  enOtroBloque: ReadonlyMap<string, string>;
}) {
  const modo = modoDelSelector(b, estado.lotes, !estado.cargando);
  const lote = modo.modo === "agregar" ? modo.lote : null;
  const [especieElegida, setEspecieElegida] = useState("");
  const especie = lote ? lote.speciesCommon : b.especie.trim() || especieElegida;
  const libres = useMemo(() => trozasLibresDeEspecie(estado.trozas, especie), [estado.trozas, especie]);
  const permisos = useMemo(() => permisosDe(libres), [libres]);
  const [permisoSel, setPermisoSel] = useState<string | null>(null);
  const delBloque = b.permiso?.trim() || null;
  const permisoElegido =
    permisoSel && permisos.includes(permisoSel) ? permisoSel : delBloque && permisos.includes(delBloque) ? delBloque : (permisos[0] ?? null);
  const regla = modo.modo === "no" ? null : reglaDePermiso(modo, permisoElegido);
  const [busqueda, setBusqueda] = useState("");
  const hayRegla = regla !== null;
  const reglaPermiso = regla?.permiso ?? null;
  const reglaExige = regla?.exige ?? false;
  const opciones = useMemo(
    () =>
      (hayRegla ? opcionesDeTrozas(libres, { permiso: reglaPermiso, exige: reglaExige }, busqueda) : []).map((o) => {
        const otro = enOtroBloque.get(o.id);
        return otro && !o.motivo ? { ...o, motivo: `Es del bloque «${otro}»` } : o;
      }),
    [hayRegla, libres, reglaPermiso, reglaExige, busqueda, enOtroBloque],
  );
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set(modo.modo === "crear" ? (b.trozaIds ?? []) : []));
  const [ocupado, setOcupado] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<{ tono: "ok" | "aviso" | "error"; texto: string }[]>([]);

  const m3De = useMemo(() => new Map(libres.map((t) => [t.id, Number(t.volumenM3) || 0])), [libres]);
  const validas = useMemo(() => new Set(opciones.filter((o) => !o.motivo).map((o) => o.id)), [opciones]);
  const ids = [...seleccion].filter((id) => validas.has(id));
  const elegidoM3 = m3DeIds(ids, m3De);
  const loteM3 = lote ? volumenLibre(lote) : 0;
  const bloqueM3 = Number(b.m3) || 0;
  const tendra = lote ? loteM3 : elegidoM3;

  if (modo.modo === "no") return <Aviso tono="aviso">{modo.motivo}</Aviso>;

  const correr = async (fn: () => Promise<{ tono: "ok" | "aviso" | "error"; texto: string }[]>) => {
    if (ocupado) return;
    setOcupado(true);
    setMensajes([]);
    try {
      setMensajes(await fn());
    } catch (e) {
      setMensajes([{ tono: "error", texto: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setOcupado(false);
    }
  };

  const agregar = () =>
    correr(async () => {
      if (!lote) return [];
      const r = await panel.agregarAlLote(b.id, lote, ids);
      setSeleccion(new Set(r.rechazadas.map((x) => x.id)));
      return [
        ...(r.agregadas > 0 ? [{ tono: "ok" as const, texto: `Entraron ${r.agregadas} ${r.agregadas === 1 ? "troza" : "trozas"} al lote ${lote.code}.` }] : []),
        ...r.rechazadas.map((x) => ({ tono: "aviso" as const, texto: `${x.codigo ?? "Una troza"}: ${x.motivo}.` })),
      ];
    });

  const crear = () =>
    correr(async () => {
      const r = await panel.crearLoteDelBloque(b.id, ids);
      const c = r.creados[0];
      if (c) {
        setSeleccion(new Set());
        return [{ tono: "ok" as const, texto: `Lote ${c.code} creado con ${c.trozas} trozas (${fmtM3(c.m3)} m³): el bloque ya lo tiene.` }];
      }
      return r.noCreados.map((n) => ({ tono: "aviso" as const, texto: n.motivo }));
    });

  const quitar = async (trozaId: string) => {
    if (!lote || quitando) return;
    setQuitando(trozaId);
    setMensajes([]);
    try {
      await panel.quitarDelLote(b.id, lote, trozaId);
    } catch (e) {
      setMensajes([{ tono: "error", texto: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setQuitando(null);
    }
  };

  return (
    <div className="space-y-3">
      {!lote && !b.especie.trim() && (
        <select value={especieElegida} onChange={(e) => setEspecieElegida(e.target.value)} aria-label="Especie de las trozas" className={`${CAMPO} w-full`}>
          <option value="">El bloque no dice su especie: elige una…</option>
          {especiesLibres(estado.trozas).map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      )}
      {modo.modo === "crear" && permisos.length > 1 && (
        <select value={permisoElegido ?? ""} onChange={(e) => setPermisoSel(e.target.value || null)} aria-label="Permiso del lote" className={`${CAMPO} w-full`}>
          {permisos.map((p) => <option key={p} value={p}>Permiso {p}</option>)}
        </select>
      )}

      {lote && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            En el lote {lote.code}{regla?.permiso ? ` · permiso ${regla.permiso}` : ""}
          </p>
          <TrozasEnElLote lote={lote} onQuitar={(id) => void quitar(id)} quitando={quitando} />
        </div>
      )}

      {especie && (
        <>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Libres en el patio · {especie}</p>
          <TrozasParaElegir opciones={opciones} seleccion={seleccion} onSeleccion={setSeleccion} busqueda={busqueda} onBusqueda={setBusqueda} disabled={ocupado} />
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--rule-soft)] pt-3">
        <p className="text-sm tabular-nums text-[var(--text-secondary)]">
          Elegidas: <b className="text-[var(--text-primary)]">{ids.length} · {fmtM3(elegidoM3)} m³</b>
          {lote ? ` · el lote tiene ${fmtM3(loteM3)} m³` : ""} · el bloque dice {fmtM3(bloqueM3)} m³
        </p>
        <div className="flex flex-wrap gap-2">
          {tendra > 0 && Math.abs(tendra - bloqueM3) > TOLERANCIA_M3 && (lote || ids.length > 0) && (
            <button type="button" onClick={() => panel.igualarM3(b.id, tendra)} className={BTN} title="Cambia la cifra del bloque en la tabla (guárdala después)">
              <Scale className="h-4 w-4" aria-hidden /> Poner {fmtM3(tendra)} m³ en el bloque
            </button>
          )}
          {lote ? (
            <button type="button" onClick={agregar} disabled={ids.length === 0 || ocupado} className={BTN_PRIMARIO}>
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
              {ids.length === 0 ? "Elige trozas" : `Agregar ${ids.length} al lote ${lote.code}`}
            </button>
          ) : (
            <button type="button" onClick={crear} disabled={ids.length === 0 || ocupado} className={BTN_PRIMARIO}>
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PackagePlus className="h-4 w-4" aria-hidden />}
              {ids.length === 0 ? "Elige trozas" : `Crear su lote con ${ids.length} ${ids.length === 1 ? "troza" : "trozas"}`}
            </button>
          )}
        </div>
      </div>
      {mensajes.map((m, i) => <Aviso key={`${i}-${m.texto}`} tono={m.tono}>{m.texto}</Aviso>)}
    </div>
  );
}
