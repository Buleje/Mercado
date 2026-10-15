"use client";

/**
 * El panel del campo elegido (X/Y, letra, ancho, alineación, si se imprime) y
 * la lista de todos los campos de la hoja, para prender los que el talonario
 * pide y elegir los que no se alcanzan con el mouse.
 */

import { AlertTriangle } from "@buleje/design-system/icons";
import { CATALOGO, entraEnUnaLinea, type Alineacion } from "@/lib/forestal/gtf-matricial-disposicion";
import type { EstadoGtfMatricial } from "./hooks/use-gtf-matricial";
import { Casilla, NumeroMm, Opciones } from "./gtf-matricial-controles";

const ALINEAS: ReadonlyArray<{ value: Alineacion; label: string }> = [
  { value: "izq", label: "Izquierda" },
  { value: "centro", label: "Centro" },
  { value: "der", label: "Derecha" },
];

const CAJA = "flex flex-col gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3";
const SUBTITULO = "text-sm font-bold text-[var(--text-primary)]";

function CampoElegido({ t }: { t: EstadoGtfMatricial }) {
  const hoja = t.hoja;
  const cat = CATALOGO[t.formato];
  if (!hoja || !t.sel) {
    return (
      <div className={CAJA}>
        <span className={SUBTITULO}>Campo elegido</span>
        <span className="text-sm text-[var(--text-secondary)]">
          Toca un valor en la hoja y arrástralo, o muévelo con las flechas (Shift: de 5 en 5 mm).
        </span>
      </div>
    );
  }
  if (t.sel.tipo === "columna") {
    const def = cat.columnas.find((c) => c.id === t.sel?.id);
    const pos = hoja.tabla.columnas[t.sel.id];
    if (!def || !pos) return null;
    const id = def.id;
    const tabla = hoja.tabla;
    return (
      <div className={CAJA}>
        <span className={SUBTITULO}>
          {cat.tablaLabel} · columna {def.label}
        </span>
        <div className="grid grid-cols-2 gap-2">
          <NumeroMm label="X" value={pos.x} onChange={(x) => t.cambiarColumna(id, { x })} />
          <NumeroMm label="Ancho" value={pos.anchoMm} min={1} onChange={(anchoMm) => t.cambiarColumna(id, { anchoMm })} />
        </div>
        <Opciones label="Alineación" value={pos.alinea} opciones={ALINEAS} onChange={(alinea) => t.cambiarColumna(id, { alinea })} />
        <Casilla label="Se imprime" checked={pos.visible} onChange={(visible) => t.cambiarColumna(id, { visible })} />
        <span className={`${SUBTITULO} border-t border-[var(--rule-base)] pt-3`}>Toda la tabla</span>
        <div className="grid grid-cols-2 gap-2">
          <NumeroMm label="Y de la 1.ª fila" value={tabla.y} onChange={(y) => t.cambiarTabla({ y })} />
          <NumeroMm label="Alto de fila" value={tabla.altoFilaMm} min={2} max={60} onChange={(altoFilaMm) => t.cambiarTabla({ altoFilaMm })} />
          <NumeroMm label="Filas por hoja" value={tabla.maxFilas} paso={1} min={1} max={200} sufijo="filas" entero onChange={(maxFilas) => t.cambiarTabla({ maxFilas })} />
          <NumeroMm label="Letra" value={tabla.letraPt} min={5} max={24} sufijo="pt" onChange={(letraPt) => t.cambiarTabla({ letraPt })} />
        </div>
      </div>
    );
  }
  const def = cat.campos.find((c) => c.id === t.sel?.id);
  const pos = hoja.campos[t.sel.id];
  if (!def || !pos) return null;
  const id = def.id;
  const valor = t.paginas[t.pagina]?.campos[id] ?? "";
  const noEntra = !!valor && !entraEnUnaLinea(valor, pos.anchoMm, pos.letraPt);
  return (
    <div className={CAJA}>
      <span className={SUBTITULO}>{def.label}</span>
      <span className="break-words font-mono text-sm text-[var(--text-secondary)]">
        {valor || "Vacío en esta guía: no se imprime nada."}
      </span>
      {noEntra && (
        <span className="flex items-start gap-1.5 text-sm font-semibold text-[var(--data-warning-ink)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          No entra en un renglón: ensancha el campo o baja la letra.
        </span>
      )}
      <div className="grid grid-cols-2 gap-2">
        <NumeroMm label="X" value={pos.x} onChange={(x) => t.cambiarCampo(id, { x })} />
        <NumeroMm label="Y" value={pos.y} onChange={(y) => t.cambiarCampo(id, { y })} />
        <NumeroMm label="Ancho máximo" value={pos.anchoMm} min={1} onChange={(anchoMm) => t.cambiarCampo(id, { anchoMm })} />
        <NumeroMm label="Letra" value={pos.letraPt} min={5} max={24} sufijo="pt" onChange={(letraPt) => t.cambiarCampo(id, { letraPt })} />
      </div>
      <Opciones label="Alineación" value={pos.alinea} opciones={ALINEAS} onChange={(alinea) => t.cambiarCampo(id, { alinea })} />
      <Casilla label="Se imprime" checked={pos.visible} onChange={(visible) => t.cambiarCampo(id, { visible })} />
    </div>
  );
}

function ListaDeCampos({ t }: { t: EstadoGtfMatricial }) {
  const hoja = t.hoja;
  if (!hoja) return null;
  const cat = CATALOGO[t.formato];
  const pagina = t.paginas[t.pagina];
  const grupos = [...new Set(cat.campos.map((c) => c.grupo))];
  const visibles = cat.campos.filter((c) => hoja.campos[c.id]?.visible).length;
  const fila = (id: string, label: string, visible: boolean, valor: string, tipo: "campo" | "columna", alternar: (v: boolean) => void) => (
    <li key={`${tipo}-${id}`} className="flex items-center gap-2">
      <input
        type="checkbox"
        aria-label={`Imprimir ${label}`}
        checked={visible}
        onChange={(e) => alternar(e.target.checked)}
        className="h-5 w-5 shrink-0 accent-[var(--accent-dark)]"
      />
      <button
        type="button"
        onClick={() => t.setSel({ tipo, id })}
        className={`flex min-h-12 min-w-0 flex-1 flex-col justify-center rounded-lg px-2 text-left hover:bg-[var(--surface-sunken)] ${
          t.sel?.tipo === tipo && t.sel.id === id ? "bg-[var(--accent-muted)]" : ""
        }`}
      >
        <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{label}</span>
        <span className="truncate font-mono text-xs text-[var(--text-tertiary)]">{valor || "vacío"}</span>
      </button>
    </li>
  );
  return (
    <details className={CAJA}>
      <summary className={`${SUBTITULO} flex min-h-12 cursor-pointer items-center`}>
        Campos de la hoja · {visibles} de {cat.campos.length} se imprimen
      </summary>
      {grupos.map((g) => (
        <div key={g} className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{g}</span>
          <ul className="flex flex-col">
            {cat.campos
              .filter((c) => c.grupo === g)
              .map((c) =>
                fila(c.id, c.label, !!hoja.campos[c.id]?.visible, pagina?.campos[c.id] ?? "", "campo", (visible) =>
                  t.cambiarCampo(c.id, { visible }),
                ),
              )}
          </ul>
        </div>
      ))}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{cat.tablaLabel}</span>
        <ul className="flex flex-col">
          {cat.columnas.map((c) =>
            fila(c.id, c.label, !!hoja.tabla.columnas[c.id]?.visible, pagina?.filas[0]?.[c.id] ?? "", "columna", (visible) =>
              t.cambiarColumna(c.id, { visible }),
            ),
          )}
        </ul>
      </div>
    </details>
  );
}

export default function PanelTalonario({ t }: { t: EstadoGtfMatricial }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <CampoElegido t={t} />
      <ListaDeCampos t={t} />
    </div>
  );
}
