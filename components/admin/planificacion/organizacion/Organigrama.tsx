"use client";

/**
 * Organigrama — áreas en chips y cargos en árbol (ADR-497). Borrar un cargo
 * sube a sus reportes un nivel; borrar un área deja a sus cargos sin área.
 * Ambos se pueden deshacer.
 */
import { useMemo, useState } from "react";
import { undoToast } from "@buleje/design-system";
import { Plus, Wand2 } from "@buleje/design-system/icons";
import { Button } from "@/components/ui-system/Button";
import { nuevoId, useSeccionPlan } from "@/hooks/use-plan-empresa";
import { CabeceraSeccion } from "../comun/CabeceraSeccion";
import { EstadoVacio } from "../piezas/EstadoVacio";
import { ArbolCargos } from "./ArbolCargos";
import { AreasChips } from "./AreasChips";
import { CargoModal } from "./CargoModal";
import { construirArbol, organigramaTipico, quitarCargo, type Cargo } from "./organigrama-arbol";

const MAX_CARGOS = 120;

const cargoVacio = (reportaA: string, areaId = ""): Cargo => ({ id: nuevoId(), nombre: "", areaId, reportaA, persona: "", funciones: [] });

export function Organigrama() {
  const { datos, cambiar, puedeEditar } = useSeccionPlan("organizacion");
  const [modal, setModal] = useState<{ inicial: Cargo; esNuevo: boolean } | null>(null);
  const { areas, cargos } = datos;
  const raices = useMemo(() => construirArbol(cargos), [cargos]);
  const cuenta = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cargos) if (c.areaId) m.set(c.areaId, (m.get(c.areaId) ?? 0) + 1);
    return m;
  }, [cargos]);
  const nombreArea = (id: string) => areas.find((a) => a.id === id)?.nombre ?? "";
  const lleno = cargos.length >= MAX_CARGOS;

  const guardar = (c: Cargo) =>
    cambiar((prev) => ({ ...prev, cargos: prev.cargos.some((x) => x.id === c.id) ? prev.cargos.map((x) => (x.id === c.id ? c : x)) : [...prev.cargos, c] }));

  const borrarCargo = (c: Cargo) => {
    const reportes = new Set(cargos.filter((x) => x.reportaA === c.id).map((x) => x.id));
    cambiar((prev) => ({ ...prev, cargos: quitarCargo(prev.cargos, c.id) }));
    undoToast({
      message: `Borraste el cargo ${c.nombre}`,
      onUndo: () =>
        cambiar((prev) =>
          prev.cargos.some((x) => x.id === c.id)
            ? prev
            : { ...prev, cargos: [...prev.cargos.map((x) => (reportes.has(x.id) && x.reportaA === c.reportaA ? { ...x, reportaA: c.id } : x)), c] },
        ),
    });
  };

  const borrarArea = (id: string) => {
    const area = areas.find((a) => a.id === id);
    if (!area) return;
    const indice = areas.indexOf(area);
    const suyos = new Set(cargos.filter((c) => c.areaId === id).map((c) => c.id));
    cambiar((prev) => ({
      areas: prev.areas.filter((a) => a.id !== id),
      cargos: prev.cargos.map((c) => (c.areaId === id ? { ...c, areaId: "" } : c)),
    }));
    if (!area.nombre.trim()) return;
    undoToast({
      message: `Borraste el área ${area.nombre}`,
      onUndo: () =>
        cambiar((prev) => {
          if (prev.areas.some((a) => a.id === id)) return prev;
          const lista = [...prev.areas];
          lista.splice(Math.min(indice, lista.length), 0, area);
          return { areas: lista, cargos: prev.cargos.map((c) => (suyos.has(c.id) && !c.areaId ? { ...c, areaId: id } : c)) };
        }),
    });
  };

  const empezarTipico = () => {
    const t = organigramaTipico(nuevoId);
    cambiar((prev) => ({ areas: [...prev.areas, ...t.areas], cargos: [...prev.cargos, ...t.cargos] }));
  };

  // Lo nuevo reporta a la cabeza si hay una sola.
  const cabezaUnica = raices.length === 1 ? raices[0].cargo.id : "";

  return (
    <div className="space-y-4">
      <CabeceraSeccion
        seccion="organizacion"
        titulo="Organigrama"
        ayuda="Quién hace qué y a quién reporta. Las áreas agrupan los cargos; cada cargo dice quién lo ocupa y sus funciones."
        ejemplo="Gerente general → Administración, Ventas y Almacén."
        acciones={
          puedeEditar && cargos.length === 0
            ? [{ id: "tipico", label: "Empezar con uno típico", hint: "Gerencia, administración, ventas y almacén, para editar", icon: Wand2, onSelect: empezarTipico }]
            : []
        }
      >
        {puedeEditar && cargos.length > 0 && (
          <Button onClick={() => setModal({ inicial: cargoVacio(cabezaUnica), esNuevo: true })} disabled={lleno}>
            <Plus className="size-4" aria-hidden />
            Nuevo cargo
          </Button>
        )}
      </CabeceraSeccion>

      <AreasChips
        areas={areas}
        cuenta={cuenta}
        puedeEditar={puedeEditar}
        onAgregar={(nombre) => cambiar((prev) => ({ ...prev, areas: [...prev.areas, { id: nuevoId(), nombre }] }))}
        onRenombrar={(id, nombre) => cambiar((prev) => ({ ...prev, areas: prev.areas.map((a) => (a.id === id ? { ...a, nombre } : a)) }))}
        onBorrar={borrarArea}
      />

      {cargos.length === 0 ? (
        <EstadoVacio frase="Sin cargos todavía: agrega la cabeza del negocio o empieza con un organigrama típico.">
          {puedeEditar && (
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setModal({ inicial: cargoVacio(""), esNuevo: true })}>
                <Plus className="size-4" aria-hidden />
                Nuevo cargo
              </Button>
              <Button variant="secondary" onClick={empezarTipico}>
                <Wand2 className="size-4" aria-hidden />
                Empezar con uno típico
              </Button>
            </div>
          )}
        </EstadoVacio>
      ) : (
        <ArbolCargos
          raices={raices}
          puedeEditar={puedeEditar}
          nombreArea={nombreArea}
          onEditar={(c) => setModal({ inicial: c, esNuevo: false })}
          onAgregarReporte={(c) => !lleno && setModal({ inicial: cargoVacio(c.id, c.areaId), esNuevo: true })}
          onBorrar={borrarCargo}
        />
      )}

      {modal && (
        <CargoModal
          key={modal.inicial.id}
          abierto
          inicial={modal.inicial}
          esNuevo={modal.esNuevo}
          cargos={cargos}
          areas={areas}
          onCerrar={() => setModal(null)}
          onGuardar={guardar}
        />
      )}
    </div>
  );
}
