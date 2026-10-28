"use client";

/**
 * «Salidas» de una cubicación guardada (Guardadas, Brandon 28-10): cuánto se
 * llevó y cuánto queda, los viajes anotados y uno nuevo. Cada viaje se guarda
 * apenas se toca «Guardar viaje» (PATCH) y la tarjeta se actualiza con la
 * guardada que devuelve el servidor; quitar uno pregunta antes.
 */
import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, Loader2, Plus, Save, Truck } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import type { SalidaCubicacion } from "@/lib/forestal/cubicacion-salidas";
import { button } from "@/components/ui-system/button-variants";
import { fechaDeLaGuardada } from "./cubicador-guardadas-fecha";
import { BarraDeSaldo } from "./cubicador-salidas-barra";
import { EditorDeViaje, type SugerenciasDeViaje } from "./cubicador-salidas-editor";
import { ListaDeViajes } from "./cubicador-salidas-lista";
import {
  borradorDeSalida, borradorNuevo, entradaDelBorrador, respaldoDeGuardada, saldoDeGuardada, saldoParaEditar,
  type BorradorSalida,
} from "./cubicador-salidas-logica";
import { useLibretaDeLaFicha } from "./hooks/use-libreta-de-la-ficha";
import { useSalidasDeCubicacion } from "./hooks/use-salidas-de-cubicacion";

export function SalidasDeLaCubicacionModal({ c, aboveModals, onClose, onGuardada }: {
  c: CubicacionRegistro;
  aboveModals?: boolean;
  onClose: () => void;
  /** La guardada que devolvió el servidor (ya con el viaje). */
  onGuardada: (c: CubicacionRegistro) => void;
}) {
  const salidas = c.salidas ?? [];
  const saldo = useMemo(() => saldoDeGuardada(c), [c]);
  /* Sin viajes, la ventana abre directo en el primero. */
  const [borrador, setBorrador] = useState<BorradorSalida | null>(() => (salidas.length ? null : borradorNuevo("parte")));
  const [intento, setIntento] = useState(false);
  const editandoId = borrador?.id;
  const saldoEditor = useMemo(() => saldoParaEditar(c.piezas, c.salidas, editandoId, c.precioPt), [c, editandoId]);
  const respaldo = useMemo(() => respaldoDeGuardada(c), [c]);
  const primerViaje = saldoEditor.viajes === 0;
  const resultado = borrador ? entradaDelBorrador(borrador, saldoEditor, respaldo, primerViaje) : null;
  const libreta = useLibretaDeLaFicha(true);
  const sugerencias: SugerenciasDeViaje = {
    compradores: libreta.nombresCompradores, placas: libreta.placas, choferes: libreta.choferes, destinos: libreta.nombresDestinos,
  };
  const { confirm } = useConfirm();
  const { enviando, error, setError, anotar, quitar } = useSalidasDeCubicacion(c.id, onGuardada);
  const numero = editandoId ? salidas.findIndex((s) => s.id === editandoId) + 1 : 0;

  const abrir = (b: BorradorSalida | null) => { setBorrador(b); setIntento(false); setError(null); };
  const guardar = async () => {
    setIntento(true);
    if (!resultado?.ok || enviando) return;
    if (await anotar(resultado.entrada)) abrir(null);
  };
  const pedirQuitar = async (s: SalidaCubicacion) => {
    const ok = await confirm({
      title: `¿Quitar el viaje del ${fechaDeLaGuardada(s.fecha)}?`,
      description: "Lo que se llevó en ese viaje vuelve a contar como madera en el patio.",
      intent: "danger",
      confirmLabel: "Sí, quitar",
    });
    if (ok && (await quitar(s.id)) && editandoId === s.id) abrir(null);
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      size="xl"
      title={`Salidas de «${c.nombre}»`}
      description="Cuánto se llevó, en qué viajes y cuánto queda en el patio"
      icon={Truck}
      claveVentana="cubicador-salidas"
      aboveModals={aboveModals}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {borrador ? (<>
            <button type="button" className={button({ variant: "secondary", className: "px-4" })} onClick={() => (salidas.length ? abrir(null) : onClose())}>
              {salidas.length ? "Cancelar el viaje" : "Cerrar"}
            </button>
            <button type="button" className={button({ className: "gap-2 px-4" })} disabled={enviando !== null} onClick={() => void guardar()} data-accion="guardar-viaje">
              {enviando === "viaje" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
              {enviando === "viaje" ? "Guardando…" : editandoId ? "Guardar cambios" : "Guardar viaje"}
            </button>
          </>) : (<>
            <button type="button" className={button({ variant: "secondary", className: "px-4" })} onClick={onClose}>Cerrar</button>
            <button type="button" className={button({ className: "gap-2 px-4" })} onClick={() => abrir(borradorNuevo(saldo.estado === "sin-salidas" ? "parte" : "todo"))} data-accion="anotar-viaje">
              <Plus className="h-4 w-4" aria-hidden /> Anotar un viaje
            </button>
          </>)}
        </div>
      }
    >
      <div className={`${MODAL_BODY} space-y-5`} data-vista="cubicador-salidas">
        <BarraDeSaldo saldo={saldo} />
        <ListaDeViajes
          salidas={salidas}
          compradorDeLaFicha={c.cliente}
          guardada={c}
          partes={libreta.partes}
          editandoId={editandoId}
          quitandoId={enviando !== "viaje" ? enviando : null}
          onEditar={(s) => abrir(borradorDeSalida(s, saldo.grupos))}
          onQuitar={(s) => void pedirQuitar(s)}
        />
        {borrador && (
          <section className="space-y-3" aria-label="Viaje">
            <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
              {editandoId ? `Corregir el viaje ${numero}` : salidas.length ? `Viaje ${salidas.length + 1}` : "Primer viaje"}
            </CardTitle>
            <EditorDeViaje
              borrador={borrador}
              actualizar={(fn) => setBorrador((b) => (b ? fn(b) : b))}
              saldo={saldoEditor}
              conModo
              respaldo={respaldo}
              primerViaje={primerViaje}
              sugerencias={sugerencias}
              idBase="cub-salida"
              aviso={intento && resultado && !resultado.ok ? resultado.mensaje : null}
            />
          </section>
        )}
        {error && (
          <p role="alert" className="flex items-start gap-1.5 text-sm font-semibold text-[var(--data-error-ink)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
          </p>
        )}
      </div>
    </AdminModal>
  );
}
