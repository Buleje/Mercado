"use client";
import { AlertCircle, CheckCircle, ExternalLink, Save } from "@buleje/design-system/icons";
import { useMarketplaceTienda } from "@/components/admin/marketplace/hooks/use-marketplace-tienda";
import { Spinner } from "@/components/admin/marketplace/shared";
import { useAccionesDeVista } from "@/components/admin/marketplace/acciones-de-vista";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { button } from "@/components/ui-system/button-variants";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import CategoryZonePicker from "@/components/admin/unified/marketplace/CategoryZonePicker";
import { TiendaHero } from "@/components/admin/marketplace/tienda/TiendaHero";
import { ListaParaPublicar } from "@/components/admin/marketplace/tienda/ListaParaPublicar";
import { TiendaIdentidad } from "@/components/admin/marketplace/tienda/TiendaIdentidad";
import { TiendaHorario } from "@/components/admin/marketplace/tienda/TiendaHorario";
import { TiendaComisionImagen } from "@/components/admin/marketplace/tienda/TiendaComisionImagen";
import { TiendaAside } from "@/components/admin/marketplace/tienda/TiendaAside";

// ─────────────────────────────────────────────
// Sub-tab: Mi Tienda Personal — la ficha de tu tienda DENTRO del marketplace
// (modelo Store: nombre, descripción, logo, categoría, zonas, horario,
// vacaciones, publicada). No es Tienda online › Apariencia: esa edita los
// colores y la portada de tu web propia (/t/tu-negocio).
//
// 11-10: de 4 pantallas a secciones (`?sub=`): Datos (identidad + logo),
// Categoría y zonas, Horario. La vista previa y el estado quedan a la derecha
// en las tres; «Guardar» guarda las tres juntas.
// ─────────────────────────────────────────────
const SECCIONES = ["datos", "categoria", "horario"] as const;
type Seccion = (typeof SECCIONES)[number];
const ROTULO: Record<Seccion, string> = { datos: "Datos y logo", categoria: "Categoría y zonas", horario: "Horario" };
const SECCION_DEL_ANCLA: Record<string, Seccion> = { "tienda-imagen": "datos", "tienda-horario": "horario" };
const ID_PANEL = "marketplace-tienda-seccion";

export function MarketplaceTiendaTab() {
  const { store, setStore, loading, saving, error, saved, handleSave, listaPublicar } = useMarketplaceTienda();
  const { vista: seccion, irA } = useSubvistaModulo<Seccion>("marketplace-tienda-secciones", SECCIONES, "datos");
  useAccionesDeVista(
    store.slug
      ? [{ id: "ver-tienda", label: "Ver mi tienda pública", hint: `/marketplace/${store.slug}, en otra pestaña`, icon: ExternalLink, onSelect: () => window.open(`/marketplace/${store.slug}`, "_blank", "noopener,noreferrer") }]
      : [],
  );

  if (loading) return <Spinner />;

  const barra = (
    <BarraDeSecciones
      secciones={SECCIONES.map((clave) => ({ clave, rotulo: ROTULO[clave] }))}
      activa={seccion}
      onCambiar={irA}
      etiqueta="Secciones de tu tienda"
      idPanel={ID_PANEL}
    />
  );

  return (
    <div className="space-y-4 pb-24">
      {error && (
        <p className="flex items-center gap-2 rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/10 p-3 text-sm font-semibold text-[var(--data-error-ink)]" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <TiendaHero store={store} secciones={barra} />

      {/* Lo que falta para publicar, primero (se pliega y se recuerda). */}
      {listaPublicar && (
        <ListaParaPublicar
          lista={listaPublicar}
          publicada={store.isActive}
          publicando={saving}
          onPublicar={() => void handleSave({ isActive: true })}
          onUsarUbicacion={() => void handleSave()}
          onAbrirAncla={(ancla) => {
            const destino = SECCION_DEL_ANCLA[ancla];
            if (destino) irA(destino);
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div
          role="tabpanel"
          id={ID_PANEL}
          aria-labelledby={idPestanaDeSeccion(ID_PANEL, seccion)}
          className="space-y-4 lg:col-span-8"
        >
          {seccion === "datos" && (
            <>
              <TiendaIdentidad store={store} setStore={setStore} />
              <TiendaComisionImagen store={store} setStore={setStore} />
            </>
          )}
          {seccion === "categoria" && (
            <CategoryZonePicker
              value={{
                category: store.category ?? "",
                subcategory: store.subcategory ?? null,
                coverageZones: store.coverageZones ?? [],
                customCategories: store.customCategories ?? [],
              }}
              onChange={(next) =>
                setStore((p) => ({
                  ...p,
                  category: next.category,
                  subcategory: next.subcategory,
                  coverageZones: next.coverageZones,
                  customCategories: next.customCategories,
                  // Mantiene `zone` legacy en sync con el 1er coverageZone marcado.
                  zone: next.coverageZones[0] ?? p.zone,
                }))
              }
            />
          )}
          {seccion === "horario" && <TiendaHorario store={store} setStore={setStore} />}
        </div>

        {/* Vista previa + estado (publicada, vacaciones), a la derecha en las tres secciones. */}
        <TiendaAside store={store} setStore={setStore} />
      </div>

      {/* Guardar, siempre a mano: guarda las tres secciones juntas. */}
      <div className="sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]/95 px-4 py-2 shadow-[var(--shadow-lg)] backdrop-blur">
        <p className="hidden text-sm text-[var(--text-tertiary)] sm:block">Los cambios se ven en tu tienda pública apenas guardas.</p>
        <div className="ml-auto flex items-center gap-3">
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--data-success-ink)]" role="status">
              <CheckCircle className="h-4 w-4" aria-hidden /> Guardado
            </span>
          )}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className={button({ variant: "primary", className: "h-12 gap-2 rounded-xl px-5" })}
          >
            {saving ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
            ) : (
              <Save className="h-4 w-4" aria-hidden />
            )}
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
