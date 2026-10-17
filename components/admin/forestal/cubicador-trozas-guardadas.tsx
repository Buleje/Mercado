"use client";

/**
 * La cuenta del patio (ADR-478): `useCuentaDelPatio` (guardar, ver guardadas,
 * la CUB de este lote y sus ventanas) y `BotonGuardarEnLaCuenta`, que va en la
 * cabecera de la tabla —el mismo lugar y el mismo botón (`AccionLote`) que el
 * «Guardar» del cubicador de aserrada; hasta el 15-10 vivía al fondo, debajo de
 * las referencias, y no se veía—. «Guardadas» va en el menú «Patio».
 *
 * Un modal a la vez: abrir una guardada CIERRA la lista (no se apilan).
 */
import { useEffect, useRef, useState } from "react";
import { FolderOpen, Loader2, Save } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { useMiRol } from "@/hooks/use-mi-rol";
import { formatCurrency } from "@/lib/currency";
import { fmtVolumen } from "@/lib/forestal/cubicacion-cuenta";
import { fechaConDia } from "@/lib/forestal/loth-tablero-reporte";
import type { DiametrosPorTroza, FormulaTrozas } from "@/lib/forestal/cubicacion-trozas-formula";
import type { MaterialCubicacion } from "@/lib/forestal/cubicacion-comercial-tipos";
import { AccionLote } from "./cubicador-acciones";
import { ActionToasts, useActionToasts } from "./cubicador-toasts";
import { BOTON_SECUNDARIO } from "./ctp-lotes-modal-marco";
import { cerrarAlNavegar } from "./enlace-cierra-ventana";
import type { FilaTroza } from "./cubicador-trozas-tabla";
import GuardarEnLaCuentaModal from "./cubicador-trozas-guardar";
import ValorizarCubicacionModal from "./cubicador-trozas-valorizar";
import { ESTADO_CUB, useCubicacionesTrozas, type CubicacionTrozas, type EstadoCubicacion } from "./hooks/use-cubicaciones-trozas";


interface Recuerdo { id: string; codigo: string }

/** Qué CUB salió de ESTE lote (por fórmula). Vaciar el patio lo olvida. */
function useRecuerdoDelLote(clave: string, filas: number) {
  const [recuerdo, setRecuerdo] = useState<Recuerdo | null>(null);
  const previo = useRef({ clave, filas });
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(clave) ?? "null") as Partial<Recuerdo> | null;
      setRecuerdo(v?.id && v.codigo ? { id: v.id, codigo: v.codigo } : null);
    } catch { setRecuerdo(null); }
  }, [clave]);
  useEffect(() => {
    /* Sólo un vaciado de verdad: el primer render llega con 0 filas (el lote se
       lee después) y cambiar de fórmula cambia la clave a la vez. */
    if (previo.current.clave === clave && previo.current.filas > 0 && filas === 0) {
      try { localStorage.removeItem(clave); } catch { /* ignore */ }
      setRecuerdo(null);
    }
    previo.current = { clave, filas };
  }, [clave, filas]);
  const recordar = (r: Recuerdo | null) => {
    setRecuerdo(r);
    try { if (r) localStorage.setItem(clave, JSON.stringify(r)); else localStorage.removeItem(clave); } catch { /* quota */ }
  };
  return { recuerdo, recordar };
}

/** Lo que la cabecera del patio necesita de la cuenta: acciones + sus ventanas. */
export interface CuentaDelPatio {
  guardar: () => void;
  verGuardadas: () => void;
  /** La CUB que salió de ESTE lote (si sigue viva), para reabrirla. */
  esteLote: { codigo: string; abrir: () => void } | null;
  hayFilas: boolean;
  /** Ventanas y avisos: se montan una vez, donde sea (van en portal). */
  ventanas: React.ReactNode;
}

export function useCuentaDelPatio({
  rows, formula, diametros, claveLote,
}: {
  rows: FilaTroza[];
  formula: FormulaTrozas;
  diametros: DiametrosPorTroza;
  /** La clave del lote abierto en localStorage (`claveLoteTrozas`). */
  claveLote: string;
}): CuentaDelPatio {
  const rol = useMiRol();
  const puedeAplicar = rol === "admin" || rol === "owner" || rol === "superadmin";
  const { toasts, push, dismiss } = useActionToasts();
  const { recuerdo, recordar } = useRecuerdoDelLote(`${claveLote}-cuenta`, rows.length);
  const [guardando, setGuardando] = useState(false);
  const [viendoLista, setViendoLista] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);

  const alGuardar = (c: CubicacionTrozas) => {
    setGuardando(false);
    recordar({ id: c.id, codigo: c.codigo });
    push({
      tono: "success",
      msg: `Guardada como ${c.codigo}`,
      detail: c.personaNombre ? `A la cuenta de ${c.personaNombre}` : undefined,
      accion: puedeAplicar ? { label: "Valorizar", onClick: () => setAbierta(c.id) } : undefined,
    });
  };

  const ventanas = (
    <>
      {guardando && (
        <GuardarEnLaCuentaModal
          rows={rows}
          formula={formula}
          diametros={diametros}
          previaId={recuerdo?.id ?? null}
          onGuardada={alGuardar}
          onCerrar={() => setGuardando(false)}
        />
      )}
      {viendoLista && (
        <ListaGuardadasModal onAbrir={(id) => { setViendoLista(false); setAbierta(id); }} onCerrar={() => setViendoLista(false)} />
      )}
      {abierta && (
        <ValorizarCubicacionModal
          id={abierta}
          puedeAplicar={puedeAplicar}
          onCambio={(c) => { if (recuerdo && (c === null ? abierta === recuerdo.id : c.estado === "anulada" && c.id === recuerdo.id)) recordar(null); }}
          onCerrar={() => setAbierta(null)}
        />
      )}
      <ActionToasts toasts={toasts} onDismiss={dismiss} />
    </>
  );

  return {
    guardar: () => setGuardando(true),
    verGuardadas: () => setViendoLista(true),
    esteLote: recuerdo && rows.length > 0 ? { codigo: recuerdo.codigo, abrir: () => setAbierta(recuerdo.id) } : null,
    hayFilas: rows.length > 0,
    ventanas,
  };
}

/** El botón de la cabecera: el mismo `AccionLote` destacado que el «Guardar» de la aserrada, con su ⓘ. */
export function BotonGuardarEnLaCuenta({ cuenta }: { cuenta: CuentaDelPatio }) {
  return (
    <span className="inline-flex items-center gap-1" data-vista="cuenta-del-patio">
      <AccionLote label="Guardar en la cuenta" Icono={Save} destacado disabled={!cuenta.hayFilas}
        hint="Guardar el patio a la cuenta de una persona, con fecha y guía" onClick={cuenta.guardar} />
      <InfoTip
        what="Sube el patio con dueño: la persona de «Cuenta por persona», la fecha y la guía si vino con una. Las ya guardadas están en «Patio ▾ › Guardadas»."
        affects="Después el dueño o el admin le pone precio por especie y lo descuenta de su adelanto, el más antiguo primero."
        example="34 trozas de Wasaco · 2 140 PT × S/ 1,20 = S/ 2 568 menos en lo que te debe."
      />
    </span>
  );
}

const FILTROS: { valor: EstadoCubicacion | undefined; label: string }[] = [
  { valor: undefined, label: "Todas" },
  { valor: "borrador", label: "Sin descontar" },
  { valor: "aplicada", label: "Descontadas" },
  { valor: "anulada", label: "Anuladas" },
];

/** Las guardadas a cuenta; `material="aserrada"` = las del Cubicador de madera (y las comerciales de un despacho). */
export function ListaGuardadasModal({ onAbrir, onCerrar, material }: { onAbrir: (id: string) => void; onCerrar: () => void; material?: MaterialCubicacion }) {
  const [estado, setEstado] = useState<EstadoCubicacion | undefined>(undefined);
  const { lista, cargando, error } = useCubicacionesTrozas({ estado, ...(material ? { material } : {}) });
  return (
    <AdminModal open onClose={onCerrar} title={material === "aserrada" ? "Madera a cuenta" : "Cubicaciones guardadas"} icon={FolderOpen}
      claveVentana={material === "aserrada" ? "cubicador-madera-a-cuenta" : "cubicador-trozas-guardadas"}
      footer={<div className="flex justify-end"><button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar}>Cerrar</button></div>}>
      <div className={`space-y-3 ${MODAL_BODY}`} data-vista="cubicaciones-guardadas">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filtrar por estado">
          {FILTROS.map((f) => (
            <button key={f.label} type="button" role="tab" aria-selected={estado === f.valor} onClick={() => setEstado(f.valor)}
              className={`h-12 rounded-full px-3 text-sm font-semibold transition-colors ${estado === f.valor ? "bg-[var(--accent-dark)] text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
              {f.label}
            </button>
          ))}
        </div>
        {cargando ? (
          <p className="flex items-center gap-2 py-6 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>
        ) : error ? (
          <p role="alert" className="py-6 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>
        ) : !lista?.length ? (
          <p className="py-6 text-center text-sm text-[var(--text-tertiary)]">Todavía no guardaste ninguna{estado ? " así" : ""}.</p>
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)] rounded-2xl border border-[var(--rule-soft)]">
            {lista.map((c) => {
              const e = ESTADO_CUB[c.estado];
              return (
                <li key={c.id}>
                  {/* Fila clicable sin `<button>`: adentro va el enlace a la cuenta de la
                      persona, y un `<a>` dentro de un `<button>` no es válido. */}
                  <div role="button" tabIndex={0} onClick={() => onAbrir(c.id)}
                    onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onAbrir(c.id); } }}
                    className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
                    <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{c.codigo}</span>
                    <span className="text-sm text-[var(--text-secondary)]">{fechaConDia(c.fecha)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">
                      {c.personaNombre ? (
                        <EnlacePanel cosa="cuenta-adelantos" id={c.beneficiarioId ?? c.parteId} onClick={cerrarAlNavegar(onCerrar)}>
                          {c.personaNombre}
                        </EnlacePanel>
                      ) : "—"}
                    </span>
                    <span className="text-sm tabular-nums text-[var(--text-secondary)]">
                      {c.material === "aserrada" ? (c.nTrozas > 0 ? `${c.nTrozas} piezas · ` : "") : `${c.nTrozas} trozas · `}{fmtVolumen(c.volumen, c.formula)}
                      {c.monto != null && ` · ${formatCurrency(c.monto)}`}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${e.clase}`}>{e.label}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminModal>
  );
}
