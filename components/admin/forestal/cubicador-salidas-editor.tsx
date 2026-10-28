"use client";

/**
 * Un viaje de la madera (Brandon 28-10): fecha, a quién se entregó, en qué
 * vehículo, con qué GTF y cuánto se llevó —todo lo que quedaba o una parte,
 * en la tabla por especie × tipo—. Controlado: el borrador vive en quien lo
 * monta (la ventana de Salidas lo manda al guardar; «Guardar cubicación», al
 * guardar el lote).
 *
 * Los vacíos dicen en gris lo que se va a usar (el comprador de la ficha; en
 * el primer viaje, también su placa, chofer, GTF y destino).
 */
import type { ReactNode } from "react";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import type { SaldoCubicacion } from "@/lib/forestal/cubicacion-salidas";
import { CAMPO_CUENTA as CAMPO, ETIQUETA_CUENTA as ETIQUETA } from "./cubicacion-cuenta-persona";
import { lineasDelBorrador, totalDeLineas, type BorradorSalida, type CampoViaje, type ModoSalida, type RespaldoViaje } from "./cubicador-salidas-logica";
import { TablaDeLaParte } from "./cubicador-salidas-tabla";
import AvisoDeLaGuia from "./cubicador-guardar-aviso-guia";
import { useViajeDesdeGuia } from "./hooks/use-viaje-desde-guia";

/** Cómo se suele sacar la madera en Pucallpa (se puede escribir otro). */
const VEHICULOS = ["Camión", "Camión con carreta", "Furgón", "Camioneta", "Bote", "Chata"] as const;

export interface SugerenciasDeViaje {
  compradores: readonly string[];
  placas: readonly string[];
  choferes: readonly string[];
  destinos: readonly string[];
}

const MODOS: { value: ModoSalida; label: string }[] = [
  { value: "todo", label: "Todo lo que queda" },
  { value: "parte", label: "Una parte" },
];

function Campo({ id, etiqueta, ancho, children }: { id: string; etiqueta: string; ancho?: boolean; children: ReactNode }) {
  return (
    <div className={ancho ? "sm:col-span-2" : undefined}>
      <label htmlFor={id} className={ETIQUETA}>{etiqueta}</label>
      {children}
    </div>
  );
}

function Lista({ id, opciones }: { id: string; opciones: readonly string[] }) {
  if (opciones.length === 0) return null;
  return <datalist id={id}>{opciones.map((o) => <option key={o} value={o} />)}</datalist>;
}

export function EditorDeViaje({ borrador, actualizar, saldo, conModo, respaldo, primerViaje, sugerencias, idBase, aviso }: {
  borrador: BorradorSalida;
  actualizar: (fn: (b: BorradorSalida) => BorradorSalida) => void;
  /** El saldo SIN este viaje (al corregir uno, sus piezas cuentan como disponibles). */
  saldo: SaldoCubicacion;
  /** Muestra «Todo lo que queda | Una parte» (en «Guardar» lo elige su propia pregunta). */
  conModo: boolean;
  respaldo: RespaldoViaje;
  primerViaje: boolean;
  sugerencias: SugerenciasDeViaje;
  idBase: string;
  /** Lo que falta para poder guardarlo (lo dice quien lo monta). */
  aviso?: string | null;
}) {
  const id = (k: string) => `${idBase}-${k}`;
  const guia = useViajeDesdeGuia(borrador, actualizar);
  const poner = (k: CampoViaje) => (e: { target: { value: string } }) => {
    const v = e.target.value;
    actualizar((b) => (k === "cliente" ? { ...b, cliente: v, clienteParteId: undefined } : { ...b, [k]: v }));
  };
  const deLaFicha = (k: "placa" | "chofer" | "gtf" | "destino") => (primerViaje && respaldo[k] ? `${respaldo[k]} (de la ficha)` : undefined);
  const todo = totalDeLineas(lineasDelBorrador({ modo: "todo", filas: {} }, saldo));

  return (
    <div className="space-y-4" data-editor-viaje={borrador.id ?? "nuevo"}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo id={id("fecha")} etiqueta="Fecha del viaje">
          <input id={id("fecha")} type="date" className={CAMPO} value={borrador.fecha} onChange={(e) => actualizar((b) => ({ ...b, fecha: e.target.value }))} />
        </Campo>
        <Campo id={id("cliente")} etiqueta="A quién se entregó">
          <input id={id("cliente")} className={CAMPO} value={borrador.cliente} onChange={poner("cliente")} list={id("l-compradores")}
            placeholder={respaldo.cliente ? `${respaldo.cliente} (el comprador)` : "Nombre"} maxLength={120} />
          <Lista id={id("l-compradores")} opciones={sugerencias.compradores} />
        </Campo>
        <Campo id={id("placa")} etiqueta="Placa">
          <input id={id("placa")} className={CAMPO} value={borrador.placa} onChange={poner("placa")} list={id("l-placas")}
            placeholder={deLaFicha("placa") ?? "ABC-123"} maxLength={120} />
          <Lista id={id("l-placas")} opciones={sugerencias.placas} />
        </Campo>
        <Campo id={id("vehiculo")} etiqueta="Vehículo">
          <input id={id("vehiculo")} className={CAMPO} value={borrador.vehiculo} onChange={poner("vehiculo")} list={id("l-vehiculos")}
            placeholder="Camión, furgón, bote…" maxLength={120} />
          <Lista id={id("l-vehiculos")} opciones={VEHICULOS} />
        </Campo>
        <Campo id={id("chofer")} etiqueta="Chofer">
          <input id={id("chofer")} className={CAMPO} value={borrador.chofer} onChange={poner("chofer")} list={id("l-choferes")}
            placeholder={deLaFicha("chofer") ?? "Nombre"} maxLength={120} />
          <Lista id={id("l-choferes")} opciones={sugerencias.choferes} />
        </Campo>
        <Campo id={id("gtf")} etiqueta="N° de GTF de salida">
          <input id={id("gtf")} className={CAMPO} value={borrador.gtf} onChange={poner("gtf")} placeholder={deLaFicha("gtf") ?? "Sin guía"} maxLength={60}
            onBlur={(e) => void guia.buscar(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void guia.buscar(e.currentTarget.value); } }} />
          <div className="mt-1.5"><AvisoDeLaGuia aviso={guia.aviso} onDeshacer={guia.deshacer} /></div>
        </Campo>
        <Campo id={id("destino")} etiqueta="Destino">
          <input id={id("destino")} className={CAMPO} value={borrador.destino} onChange={poner("destino")} list={id("l-destinos")}
            placeholder={deLaFicha("destino") ?? "Lima, aserradero…"} maxLength={120} />
          <Lista id={id("l-destinos")} opciones={sugerencias.destinos} />
        </Campo>
        <Campo id={id("notas")} etiqueta="Notas">
          <input id={id("notas")} className={CAMPO} value={borrador.notas} onChange={poner("notas")} placeholder="Opcional" maxLength={600} />
        </Campo>
      </div>

      {conModo && (
        <div className="flex flex-wrap items-center gap-3">
          <span className={ETIQUETA}>¿Cuánto se lleva?</span>
          <SegmentedControl value={borrador.modo} onChange={(modo) => actualizar((b) => ({ ...b, modo }))} options={MODOS} size="xl" label="Cuánto se lleva" />
        </div>
      )}

      {borrador.modo === "todo" ? (
        <p className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5 text-sm text-[var(--text-secondary)]" data-salida="todo">
          {todo.piezas > 0 || todo.pt > 0 ? (
            <>Se lleva todo lo que queda: <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{fmtPiezas(todo.piezas)} pzas · {fmtM3(todo.m3)} m³</span> ({fmtPt(todo.pt)} PT)</>
          ) : "Ya no queda madera de esta cubicación."}
        </p>
      ) : (
        <TablaDeLaParte grupos={saldo.grupos} filas={borrador.filas} idBase={id("t")}
          onFila={(clave, fila) => actualizar((b) => ({ ...b, filas: { ...b.filas, [clave]: fila } }))} />
      )}

      {aviso && <p className="text-sm font-semibold text-[var(--data-warning-ink)]" data-aviso="viaje-incompleto">{aviso}</p>}
    </div>
  );
}
