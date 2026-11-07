"use client";

/**
 * Empresa › Licencias (ADR-497): los papeles del negocio con su vencimiento.
 * Arriba lo vencido y lo que vence; «Agregar las típicas» trae la lista de
 * cada rubro (sólo las que faltan) para no empezar de cero.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BadgeStatus, DataTable } from "@buleje/design-system";
import { Eye, ListChecks, Pencil, Plus, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { button } from "@/components/ui-system/button-variants";
import { nuevoId, useSeccionPlan } from "@/hooks/use-plan-empresa";
import { estadoLicencia } from "@/lib/planificacion/calculos";
import { RUBROS_PLANTILLA, licenciasQueFaltan, type RubroPlantilla } from "@/lib/planificacion/plantillas-empresa";
import { limaDateKey } from "@/lib/utils";
import { CabeceraSeccion } from "../comun/CabeceraSeccion";
import { fechaCorta } from "./campos-plan";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna, type AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { LicenciaModal } from "./LicenciaModal";
import { chipLicencia, ordenarLicencias, type Licencia } from "./licencias-util";

const ddmm = (v: number | string) => String(v).split("-").reverse().slice(0, 2).join("/");
const ROTULO_ESTADO = { pendiente: "Por tramitar", vencida: "Vencida", "por-vencer": "Por vencer", vigente: "Vigente", "sin-vencimiento": "No vence" } as const;

/** La lista de licencias es corta y llega entera: se filtra en el cliente. */
function columnasDe(hoy: string): { columnas: readonly ColumnaFiltro<Licencia>[]; orden: Record<string, AccesorOrden<Licencia>> } {
  const estado = (l: Licencia) => ROTULO_ESTADO[estadoLicencia(l, hoy).estado];
  return {
    columnas: [
      { id: "licencia", label: "Licencia", tipo: "texto", valor: (l) => [l.nombre, l.numero ?? ""] },
      { id: "entidad", label: "Entidad", tipo: "multi", valor: (l) => l.entidad || "", soloConVarios: true },
      { id: "vence", label: "Vence", tipo: "fecha", numero: (l) => l.vence || null, formatearValor: ddmm },
      { id: "estado", label: "Estado", tipo: "multi", valor: estado, soloConVarios: true },
    ],
    orden: {
      licencia: { valor: (l) => l.nombre, texto: true },
      entidad: { valor: (l) => l.entidad, texto: true },
      numero: { valor: (l) => l.numero, texto: true },
      vence: { valor: (l) => l.vence || null, texto: true },
      estado: { valor: estado, texto: true },
    },
  };
}

export function LicenciasTabla() {
  const { datos, cambiar, puedeEditar } = useSeccionPlan("licencias");
  const { confirm } = useConfirm();
  /** `undefined` = cerrado; `null` = nueva. */
  const [editando, setEditando] = useState<Licencia | null | undefined>(undefined);
  const hoy = limaDateKey();
  const todas = useMemo(() => ordenarLicencias(datos.items, hoy), [datos.items, hoy]);
  const { columnas, orden } = useMemo(() => columnasDe(hoy), [hoy]);
  const f = useFiltrosTabla(todas, columnas);
  const ord = useOrdenColumna(orden);
  const filas = ord.ordenar(f.filtradas);

  const guardar = (l: Licencia) =>
    cambiar((prev) => {
      const existe = prev.items.some((x) => x.id === l.id);
      return { ...prev, items: existe ? prev.items.map((x) => (x.id === l.id ? l : x)) : [...prev.items, l] };
    });

  const quitar = async (l: Licencia) => {
    const ok = await confirm({
      title: `¿Quitar «${l.nombre}»?`,
      description: "Sale de la lista del plan. Puedes recuperarla desde Versiones anteriores.",
      confirmLabel: "Quitar",
      intent: "danger",
    });
    if (ok) cambiar((prev) => ({ ...prev, items: prev.items.filter((x) => x.id !== l.id) }));
  };

  const agregarTipicas = (rubro: RubroPlantilla) => {
    const nuevas = licenciasQueFaltan(datos.items, rubro, nuevoId);
    if (nuevas.length === 0) return toast.info("Ya tienes todas las típicas de ese rubro.");
    cambiar((prev) => ({ ...prev, items: [...prev.items, ...nuevas] }));
    toast.success(`${nuevas.length} ${nuevas.length === 1 ? "licencia agregada" : "licencias agregadas"} como pendientes`);
  };

  const tipicas: MenuAccion[] = RUBROS_PLANTILLA.map((r) => ({
    id: `tipicas-${r.id}`,
    label: r.rotulo,
    hint: r.detalle,
    icon: ListChecks,
    seccion: "Agregar las típicas",
    onSelect: () => agregarTipicas(r.id),
  }));

  return (
    <section className="space-y-3" aria-label="Licencias y permisos">
      <CabeceraSeccion
        seccion="licencias"
        titulo="Licencias y permisos"
        ayuda="Los papeles que el negocio necesita para funcionar, con su número y cuándo vencen. Te avisamos en el Resumen 30 días antes."
        ejemplo="Las típicas de cada rubro son una guía: confirma con tu municipalidad o la entidad cuáles te piden."
        acciones={puedeEditar ? tipicas : []}
      >
        {puedeEditar ? (
          <button type="button" className={button({ variant: "primary" })} onClick={() => setEditando(null)}>
            <Plus className="h-4 w-4" aria-hidden />
            Agregar
          </button>
        ) : null}
      </CabeceraSeccion>

      {todas.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-[var(--rule-base)] p-6">
          <span className="text-sm text-[var(--text-secondary)]">Todavía no anotas licencias.</span>
          {puedeEditar ? <ActionMenu label="Agregar las típicas" icon={ListChecks} actions={tipicas} /> : null}
        </div>
      ) : (
        <>
        <BarraFiltrosTabla excel="Licencias" vistas="licencias" f={f} />
        <DataTable aria-label="Licencias y permisos">
          <thead>
            <tr>
              <ThColumna label="Licencia" ids={["licencia"]} f={f} orden={ord} ordenId="licencia" />
              <ThColumna label="Entidad" ids={["entidad"]} f={f} orden={ord} ordenId="entidad" />
              <ThColumna label="Número" orden={ord} ordenId="numero" />
              <ThColumna label="Vence" ids={["vence"]} f={f} className="whitespace-nowrap" orden={ord} ordenId="vence" />
              <ThColumna label="Estado" ids={["estado"]} f={f} orden={ord} ordenId="estado" />
              <th className="w-12">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <SinCoincidenciasFila colSpan={6} />}
            {filas.map((l) => {
              const { estado, dias } = estadoLicencia(l, hoy);
              const chip = chipLicencia(estado, dias);
              const acciones: MenuAccion[] = [
                ...(puedeEditar ? [{ id: "editar", label: "Editar", icon: Pencil, onSelect: () => setEditando(l) }] : []),
                ...(l.archivoUrl
                  ? [{ id: "ver", label: "Ver el papel", icon: Eye, onSelect: () => window.open(l.archivoUrl, "_blank", "noopener") }]
                  : []),
                ...(puedeEditar
                  ? [{ id: "quitar", label: "Quitar", icon: Trash2, tone: "danger" as const, onSelect: () => void quitar(l) }]
                  : []),
              ];
              return (
                <tr key={l.id}>
                  <td className="font-medium">{l.nombre}</td>
                  <td>{l.entidad || "—"}</td>
                  <td>{l.numero || "—"}</td>
                  <td className="whitespace-nowrap">{fechaCorta(l.vence, hoy)}</td>
                  <td>
                    <BadgeStatus variant={chip.variant} label={chip.label} size="sm" />
                  </td>
                  <td className="text-right">
                    {acciones.length > 0 ? (
                      <ActionMenu label={`Opciones de ${l.nombre}`} actions={acciones} soloIcono size="sm" />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
        </>
      )}

      {editando !== undefined ? (
        <LicenciaModal
          key={editando?.id ?? "nueva"}
          abierto
          inicial={editando}
          onCerrar={() => setEditando(undefined)}
          onGuardar={guardar}
        />
      ) : null}
    </section>
  );
}
