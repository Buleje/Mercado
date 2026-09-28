"use client";

/**
 * «Talar varios árboles» — la jornada de tala en un solo guardado.
 *
 * Pedido de Brandon (28-09): «marcas en “Ver censo” los árboles que tumbaste y
 * llenas sus medidas en una sola planilla, con los datos del censo ya puestos.
 * La jornada de 8 árboles entra en un solo guardado». Antes cada tala era abrir
 * el formulario, elegir el árbol y tipear fecha, motosierrista y hora otra vez
 * (el 28-09 fueron 4, una por una).
 *
 * Una línea de tala por fila, por la MISMA ruta del libro que la tala de a una:
 * T3 (ya talado), T8 (bajo el DMC) y el mes cerrado se validan igual. Si una
 * fila falla, las demás entran y la fallida queda marcada con su motivo; al
 * terminar ofrece «Trozar estos árboles».
 */

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { Plus, ShieldAlert, TreePine } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { pideJustificacion, type FilaTala } from "@/lib/forestal/loth-tala-tanda";
import { useCensoDeTala } from "./hooks/use-censo-de-tala";
import { useMotosierristas, useTalaEnTanda, type TandaTalaInicial } from "./hooks/use-tala-en-tanda";
import LothCensoElegirModal from "./LothCensoElegirModal";
import LothTalaTandaComunes from "./LothTalaTandaComunes";
import LothTalaTandaPie from "./LothTalaTandaPie";
import LothTalaTandaPlanilla from "./LothTalaTandaPlanilla";

export default function LothTalaTandaModal({
  inicial,
  caratulaId,
  onClose,
  onGuardadas,
  onTrozar,
}: {
  inicial: TandaTalaInicial;
  caratulaId: string | null;
  onClose: () => void;
  /** Recargar el libro después de asentar. */
  onGuardadas: () => Promise<void> | void;
  /** «Trozar estos árboles»: los códigos que entraron. */
  onTrozar: (codigos: string[]) => void;
}) {
  const censo = useCensoDeTala(inicial.planId, true);
  const recargarCenso = censo.recargar;
  const alGuardar = useCallback(async () => {
    await onGuardadas();
    recargarCenso();
  }, [onGuardadas, recargarCenso]);
  const t = useTalaEnTanda({ inicial, caratulaId, onGuardadas: alGuardar });
  const motosierristas = useMotosierristas();
  const idLista = useId();
  const guardarRef = useRef<HTMLButtonElement>(null);
  const [agregando, setAgregando] = useState(false);
  /** Lo que se abrió o cerró a mano; si no, se abre sola la que tiene algo que corregir. */
  const [abiertas, setAbiertas] = useState<ReadonlyMap<string, boolean>>(new Map());
  const guardando = t.avance != null;

  const abiertaDe = (f: FilaTala) => abiertas.get(f.id) ?? (f.resultado?.estado === "fallida" || (pideJustificacion(f) && f.resultado?.estado !== "guardada"));
  const alternar = (id: string) => {
    const f = t.filas.find((x) => x.id === id);
    if (!f) return;
    setAbiertas((m) => new Map(m).set(id, !abiertaDe(f)));
  };

  /** Los que el regente (o el DMC) dice que no se tumban y todavía no entraron. */
  const conReparo = useMemo(
    () => t.filas.filter((f) => f.arbol.reparo?.nivel === "infraccion" && f.resultado?.estado !== "guardada"),
    [t.filas],
  );
  const enPlanilla = useMemo(() => new Set(t.filas.map((f) => f.id)), [t.filas]);
  const guardadas = t.filas.filter((f) => f.resultado?.estado === "guardada").map((f) => f.arbol.treeCode);

  const guardar = async () => {
    await t.guardar();
    // Se abrió sola la que falló: llevarla a la vista para corregirla.
    requestAnimationFrame(() => document.querySelector('[data-fila-tala] [role="alert"]')?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };

  return (
    <AdminModal
      open
      onClose={guardando ? () => {} : onClose}
      variant="wide"
      icon={TreePine}
      title="Talar varios árboles"
      description={inicial.planLabel ?? "Sección 1 · Tala"}
      claveVentana="loth-tala-tanda"
      // La planilla pide ancho: árbol, fecha, 3 a 5 medidas y el resultado en
      // una fila. Debajo de lg cada árbol es una tarjeta.
      className="sm:max-w-[44rem] lg:max-w-[66rem]"
      footer={
        <LothTalaTandaPie
          ref={guardarRef}
          totales={t.totales}
          avance={t.avance}
          recargando={t.recargando}
          onCerrar={onClose}
          onGuardar={() => void guardar()}
          onTrozar={guardadas.length > 0 ? () => onTrozar(guardadas) : null}
        />
      }
    >
      <div className="space-y-4 px-5 py-4 sm:px-6">
        <LothTalaTandaComunes
          comunes={t.comunes}
          onComunes={t.setComunes}
          forma={t.forma}
          onForma={t.elegirForma}
          motosierristas={motosierristas}
          idLista={idLista}
          bloqueada={guardando}
        />

        {conReparo.length > 0 && (
          <div role="note" className="flex flex-wrap items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)]/60 bg-[var(--data-error-50)] px-3 py-2.5 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="min-w-0 flex-1">
              <b>{conReparo.length === 1 ? "Un árbol no se debería talar" : `${conReparo.length} árboles no se deberían talar`}:</b>{" "}
              {conReparo.map((f) => `${f.arbol.treeCode} (${f.arbol.reparo?.titulo.toLowerCase()})`).join(" · ")}.
            </p>
            <button
              type="button"
              disabled={guardando}
              onClick={() => conReparo.forEach((f) => t.quitar(f.id))}
              className="inline-flex h-9 items-center rounded-lg border-2 border-current px-3 text-sm font-bold disabled:opacity-50"
            >
              {conReparo.length === 1 ? "Quitarlo" : "Quitarlos"}
            </button>
          </div>
        )}

        <LothTalaTandaPlanilla
          filas={t.filas}
          calc={t.calc}
          forma={t.forma}
          comunes={t.comunes}
          abiertaDe={abiertaDe}
          onAbrir={alternar}
          bloqueada={guardando}
          motosierristas={motosierristas}
          idLista={idLista}
          onEditar={t.editar}
          onQuitar={t.quitar}
          alTerminar={() => {
            const b = guardarRef.current;
            if (!b || b.disabled) return false;
            b.focus();
            return true;
          }}
        />

        <button
          type="button"
          onClick={() => setAgregando(true)}
          disabled={guardando || !inicial.planId}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-dashed border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)] disabled:opacity-50 dark:hover:text-[var(--accent)]"
        >
          <Plus className="h-4 w-4" /> Agregar del censo
        </button>
      </div>

      {motosierristas.length > 0 && (
        <datalist id={idLista}>
          {motosierristas.map((c) => (
            <option key={c.id} value={c.nombre}>
              {c.puesto?.nombre ?? ""}
            </option>
          ))}
        </datalist>
      )}

      <LothCensoElegirModal
        open={agregando}
        onClose={() => setAgregando(false)}
        censo={censo}
        planLabel={inicial.planLabel}
        elegido=""
        posicion={null}
        enPlanilla={enPlanilla}
        onElegir={(a) => {
          t.agregar([a]);
          setAgregando(false);
        }}
        onElegirVarios={{
          etiqueta: (n) => `Agregar ${n === 1 ? "1 árbol" : `${n} árboles`} a la planilla`,
          onElegir: (arboles) => {
            t.agregar(arboles);
            setAgregando(false);
          },
        }}
      />
    </AdminModal>
  );
}
