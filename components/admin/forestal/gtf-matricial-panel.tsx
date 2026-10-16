"use client";

/**
 * El campo elegido, en el bloque de la derecha: X/Y, letra, ancho,
 * alineación, si se imprime, y con varios elegidos alinear y repartir (antes
 * en la barra: se mudaron acá para que la barra entre en un renglón y la hoja
 * gane alto). Con varios elegidos, lo que se cambia acá vale para todos.
 *
 * La lista de todos los campos vive en el bloque de la izquierda
 * (`gtf-matricial-campos.tsx`).
 */

import {
  AlertTriangle,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  Columns3,
  Rows3,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { CATALOGO, entraEnUnaLinea, type Alineacion, type DisposicionHoja } from "@/lib/forestal/gtf-matricial-disposicion";
import { elementoDeClave, type ModoAlinear } from "@/lib/forestal/gtf-matricial-edicion";
import type { EstadoGtfMatricial } from "./hooks/use-gtf-matricial";
import type { SeleccionTalonario } from "./hooks/use-gtf-matricial-seleccion";
import { BotonIcono, Casilla, NumeroMm, Opciones } from "./gtf-matricial-controles";

const ALINEAS: ReadonlyArray<{ value: Alineacion; label: string; title: string }> = [
  { value: "izq", label: "Izq.", title: "Texto a la izquierda" },
  { value: "centro", label: "Centro", title: "Texto centrado" },
  { value: "der", label: "Der.", title: "Texto a la derecha" },
];

export const CAJA = "flex flex-col gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2.5";
export const SUBTITULO = "min-w-0 truncate text-sm font-bold text-[var(--text-primary)]";

type Herramienta = { id: string; icon: LucideIcon; label: string; ayuda: string; minimo: number; hacer: (s: SeleccionTalonario) => void };
const alinear = (modo: ModoAlinear) => (s: SeleccionTalonario) => s.alinear(modo);

/** En dos filas de cuatro: la fila (arriba/medio/abajo + repartir a lo ancho) y la columna (izq/centro/der + repartir a lo alto). */
const HERRAMIENTAS: readonly Herramienta[] = [
  { id: "arriba", icon: AlignStartHorizontal, label: "Alinear arriba", ayuda: "Todos a la Y del primero elegido. Ej.: (13), (14) y (15) en el mismo renglón.", minimo: 2, hacer: alinear("arriba") },
  { id: "medio", icon: AlignCenterHorizontal, label: "Alinear al medio", ayuda: "Centro de cada uno a la altura del centro del primero. Ej.: letras de distinto tamaño en una fila.", minimo: 2, hacer: alinear("medio") },
  { id: "abajo", icon: AlignEndHorizontal, label: "Alinear abajo", ayuda: "El pie de todos al pie del primero. Ej.: valores apoyados en la línea del casillero.", minimo: 2, hacer: alinear("abajo") },
  { id: "rep-h", icon: AlignHorizontalSpaceAround, label: "Repartir a lo ancho", ayuda: "Mismo espacio entre campos; quedan fijos los de las puntas. Ej.: las casillas del (5).", minimo: 3, hacer: (s) => s.repartir("h") },
  { id: "izq", icon: AlignStartVertical, label: "Alinear a la izquierda", ayuda: "Todos a la X del primero. Ej.: (13), (16) y (19) en la misma columna.", minimo: 2, hacer: alinear("izq") },
  { id: "centro", icon: AlignCenterVertical, label: "Centrar en columna", ayuda: "El centro de todos sobre el centro del primero. Ej.: fechas en una columna angosta.", minimo: 2, hacer: alinear("centro") },
  { id: "der", icon: AlignEndVertical, label: "Alinear a la derecha", ayuda: "El borde derecho de todos al del primero. Ej.: totales y volúmenes.", minimo: 2, hacer: alinear("der") },
  { id: "rep-v", icon: AlignVerticalSpaceAround, label: "Repartir a lo alto", ayuda: "Mismo espacio entre renglones; quedan fijos el de arriba y el de abajo.", minimo: 3, hacer: (s) => s.repartir("v") },
];

/** Sumar a la selección los de su fila o su columna: del campo elegido, no de la hoja. */
function SumarFilaColumna({ s }: { s: SeleccionTalonario }) {
  return (
    <span className="flex shrink-0">
      <BotonIcono icon={Rows3} label="Elegir la fila" ayuda="Suma los campos a ±2 mm de la Y del elegido. Ej.: toda la fila del destinatario." onClick={s.elegirFila} />
      <BotonIcono icon={Columns3} label="Elegir la columna" ayuda="Suma los campos a ±2 mm de la X del elegido. Ej.: la columna de la izquierda." onClick={s.elegirColumna} />
    </span>
  );
}

/** Lo mismo a todos los elegidos: campos y columnas (la letra de una columna es la de su tabla). */
function aTodos(h: DisposicionHoja, claves: readonly string[], p: { anchoMm?: number; letraPt?: number; alinea?: Alineacion; visible?: boolean }): DisposicionHoja {
  const campos = { ...h.campos };
  const columnas = { ...h.tabla.columnas };
  let letraTabla = h.tabla.letraPt;
  for (const k of claves) {
    const e = elementoDeClave(k);
    if (e.tipo === "campo" && campos[e.id]) campos[e.id] = { ...campos[e.id], ...p };
    if (e.tipo === "columna" && columnas[e.id]) {
      const { letraPt, ...resto } = p;
      columnas[e.id] = { ...columnas[e.id], ...resto };
      if (letraPt != null) letraTabla = letraPt;
    }
  }
  return { ...h, campos, tabla: { ...h.tabla, letraPt: letraTabla, columnas } };
}

function GrupoElegido({ t, s }: { t: EstadoGtfMatricial; s: SeleccionTalonario }) {
  const hoja = t.hoja;
  const ref = elementoDeClave(s.elegidos[0] ?? "");
  if (!hoja) return null;
  const pos = ref.tipo === "campo" ? hoja.campos[ref.id] : hoja.tabla.columnas[ref.id];
  if (!pos) return null;
  const n = s.elegidos.length;
  const letra = ref.tipo === "campo" ? hoja.campos[ref.id].letraPt : hoja.tabla.letraPt;
  /* Una clave por dato: las flechas del número seguidas son un solo paso de deshacer. */
  const fijar = (p: Parameters<typeof aTodos>[2]) => t.editar((h) => aTodos(h, s.elegidos, p), `panel:${Object.keys(p).join(",")}`);
  return (
    <div className={CAJA}>
      <div className="flex items-center gap-1">
        <span className={`${SUBTITULO} flex-1`}>{n} elegidos</span>
        <SumarFilaColumna s={s} />
      </div>
      <div role="group" aria-label="Alinear y repartir" className="grid grid-cols-4 justify-items-center gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
        {HERRAMIENTAS.map((h) => (
          <BotonIcono key={h.id} icon={h.icon} label={h.label} ayuda={h.ayuda} onClick={() => h.hacer(s)} disabled={n < h.minimo} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumeroMm label="Ancho" value={pos.anchoMm} min={1} onChange={(anchoMm) => fijar({ anchoMm })} />
        <NumeroMm label="Letra" value={letra} min={5} max={24} sufijo="pt" onChange={(letraPt) => fijar({ letraPt })} />
      </div>
      <Opciones label="Texto" value={pos.alinea} opciones={ALINEAS} onChange={(alinea) => fijar({ alinea })} />
      <Casilla label="Se imprimen" checked={pos.visible} onChange={(visible) => fijar({ visible })} />
    </div>
  );
}

function ColumnaElegida({ t, s, id }: { t: EstadoGtfMatricial; s: SeleccionTalonario; id: string }) {
  const hoja = t.hoja;
  const cat = CATALOGO[t.formato];
  const def = cat.columnas.find((c) => c.id === id);
  const pos = hoja?.tabla.columnas[id];
  if (!hoja || !def || !pos) return null;
  const tabla = hoja.tabla;
  return (
    <div className={CAJA}>
      <div className="flex items-center gap-1">
        <span className={`${SUBTITULO} flex-1`} title={`${cat.tablaLabel} · columna ${def.label}`}>
          Columna {def.label}
        </span>
        <SumarFilaColumna s={s} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumeroMm label="X" value={pos.x} onChange={(x) => t.cambiarColumna(id, { x })} />
        <NumeroMm label="Ancho" value={pos.anchoMm} min={1} onChange={(anchoMm) => t.cambiarColumna(id, { anchoMm })} />
      </div>
      <Opciones label="Texto" value={pos.alinea} opciones={ALINEAS} onChange={(alinea) => t.cambiarColumna(id, { alinea })} />
      <Casilla label="Se imprime" checked={pos.visible} onChange={(visible) => t.cambiarColumna(id, { visible })} />
      <span className={`${SUBTITULO} border-t border-[var(--rule-base)] pt-2`}>Toda la tabla</span>
      <div className="grid grid-cols-2 gap-2">
        <NumeroMm label="Y 1.ª fila" value={tabla.y} onChange={(y) => t.cambiarTabla({ y })} />
        <NumeroMm label="Alto fila" value={tabla.altoFilaMm} min={2} max={60} onChange={(altoFilaMm) => t.cambiarTabla({ altoFilaMm })} />
        <NumeroMm label="Filas" value={tabla.maxFilas} paso={1} min={1} max={200} sufijo="filas" entero onChange={(maxFilas) => t.cambiarTabla({ maxFilas })} />
        <NumeroMm label="Letra" value={tabla.letraPt} min={5} max={24} sufijo="pt" onChange={(letraPt) => t.cambiarTabla({ letraPt })} />
      </div>
    </div>
  );
}

export default function PanelTalonario({ t, s }: { t: EstadoGtfMatricial; s: SeleccionTalonario }) {
  const hoja = t.hoja;
  const cat = CATALOGO[t.formato];
  if (!hoja || s.elegidos.length === 0) {
    return (
      <div className={CAJA}>
        <span className="flex items-center gap-1.5">
          <span className={SUBTITULO}>Campo elegido</span>
          <InfoTip
            title="Cómo se mueve un campo"
            what="Toca un valor en la hoja (o en la lista de la izquierda) y arrástralo, o muévelo con las flechas: 0,5 mm (con Shift, 5 mm)."
            affects="Shift o Ctrl + clic suma otro: con varios elegidos aparecen alinear y repartir."
            example="Elige (13) Propietario y bájalo con la flecha hasta que caiga en su casillero."
          />
        </span>
        <span className="text-sm text-[var(--text-secondary)]">Toca un valor en la hoja.</span>
      </div>
    );
  }
  if (s.elegidos.length > 1) return <GrupoElegido t={t} s={s} />;
  const sel = elementoDeClave(s.elegidos[0]);
  if (sel.tipo === "columna") return <ColumnaElegida t={t} s={s} id={sel.id} />;
  const def = cat.campos.find((c) => c.id === sel.id);
  const pos = hoja.campos[sel.id];
  if (!def || !pos) return null;
  const id = def.id;
  const valor = t.paginas[t.pagina]?.campos[id] ?? "";
  const noEntra = !!valor && !entraEnUnaLinea(valor, pos.anchoMm, pos.letraPt);
  return (
    <div className={CAJA}>
      <div className="flex items-center gap-1">
        <span className={`${SUBTITULO} flex-1`} title={def.label}>
          {def.label}
        </span>
        <SumarFilaColumna s={s} />
      </div>
      <span className="line-clamp-2 break-words font-mono text-sm text-[var(--text-secondary)]" title={valor || undefined}>
        {valor || "Vacío en esta guía: no se imprime."}
      </span>
      {noEntra && (
        <span className="flex items-start gap-1.5 text-sm font-semibold text-[var(--data-warning-ink)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          No entra en un renglón.
          <InfoTip title="No entra en un renglón" what="El valor es más largo que el ancho máximo del campo." affects="Ensancha el campo o baja la letra." />
        </span>
      )}
      <div className="grid grid-cols-2 gap-2">
        <NumeroMm label="X" value={pos.x} onChange={(x) => t.cambiarCampo(id, { x })} />
        <NumeroMm label="Y" value={pos.y} onChange={(y) => t.cambiarCampo(id, { y })} />
        <NumeroMm label="Ancho máx." value={pos.anchoMm} min={1} onChange={(anchoMm) => t.cambiarCampo(id, { anchoMm })} />
        <NumeroMm label="Letra" value={pos.letraPt} min={5} max={24} sufijo="pt" onChange={(letraPt) => t.cambiarCampo(id, { letraPt })} />
      </div>
      <Opciones label="Texto" value={pos.alinea} opciones={ALINEAS} onChange={(alinea) => t.cambiarCampo(id, { alinea })} />
      <Casilla label="Se imprime" checked={pos.visible} onChange={(visible) => t.cambiarCampo(id, { visible })} />
    </div>
  );
}
