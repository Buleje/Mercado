"use client";

/**
 * Políticas › Políticas (ADR-497): las reglas del negocio agrupadas por
 * categoría, con buscador cuando son muchas, «Revisar» cuando llega su fecha
 * y «Copiar para WhatsApp». «Agregar las típicas» trae las del rubro que
 * todavía no tienes.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { undoToast } from "@buleje/design-system";
import { ListChecks, Plus, Search } from "@buleje/design-system/icons";
import { Button } from "@/components/ui-system/Button";
import { nuevoId, useSeccionPlan } from "@/hooks/use-plan-empresa";
import { normalizarTitulo, politicasTipicas, type PlantillaPolitica, type RubroPlantilla } from "@/lib/planificacion/plantillas-politicas";
import { CATEGORIAS_POLITICA } from "@/lib/planificacion/secciones";
import { cn, limaDateKey } from "@/lib/utils";
import { CabeceraSeccion } from "../comun/CabeceraSeccion";
import { AgregarTipicasModal } from "../piezas/AgregarTipicasModal";
import { CAMPO_ALTO } from "../piezas/clases";
import { EstadoVacio } from "../piezas/EstadoVacio";
import { useCopiar } from "../piezas/use-copiar";
import { useRubroPlan } from "../piezas/use-rubro-plan";
import { PoliticaModal } from "./PoliticaModal";
import { MAX_POLITICAS, coincide, politicaNueva, textoWhatsApp, tieneHuecos, tocaRevisar, yaEstan, type Politica } from "./politicas-config";
import { TarjetaPolitica } from "./TarjetaPolitica";

const BUSCAR_DESDE = 7;

export function PoliticasLista() {
  const { datos, cambiar, puedeEditar } = useSeccionPlan("politicas");
  const rubro = useRubroPlan();
  const { copiado, copiar } = useCopiar();
  const [modal, setModal] = useState<{ inicial: Politica; esNueva: boolean } | null>(null);
  const [tipicas, setTipicas] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const hoy = limaDateKey();
  const { items } = datos;
  const lleno = items.length >= MAX_POLITICAS;
  const porRevisar = items.filter((p) => tocaRevisar(p, hoy)).length;

  const grupos = useMemo(() => {
    const visibles = items.filter((p) => coincide(busqueda, p.titulo, p.texto));
    return CATEGORIAS_POLITICA.map((categoria) => ({ categoria, lista: visibles.filter((p) => p.categoria === categoria) })).filter((g) => g.lista.length > 0);
  }, [items, busqueda]);
  const visibles = grupos.reduce((n, g) => n + g.lista.length, 0);

  const guardar = (p: Politica) =>
    cambiar((prev) => ({ ...prev, items: prev.items.some((x) => x.id === p.id) ? prev.items.map((x) => (x.id === p.id ? p : x)) : [...prev.items, p] }));

  const borrar = (p: Politica) => {
    const indice = items.findIndex((x) => x.id === p.id);
    cambiar((prev) => ({ ...prev, items: prev.items.filter((x) => x.id !== p.id) }));
    undoToast({
      message: `Borraste la política ${p.titulo}`,
      onUndo: () =>
        cambiar((prev) => {
          if (prev.items.some((x) => x.id === p.id)) return prev;
          const lista = [...prev.items];
          lista.splice(Math.min(indice, lista.length), 0, p);
          return { ...prev, items: lista };
        }),
    });
  };

  const copiarPolitica = async (p: Politica) => {
    if ((await copiar(p.id, textoWhatsApp(p.titulo, p.texto))) && tieneHuecos(p.texto)) toast.warning("Copiada, pero tiene partes por completar entre corchetes.");
  };

  const faltan = (r: RubroPlantilla) => {
    const estan = yaEstan(items.map((p) => p.titulo));
    return politicasTipicas(r)
      .filter((t) => !estan.has(normalizarTitulo(t.titulo)))
      .map((t) => ({ titulo: t.titulo, detalle: t.texto, etiqueta: t.categoria, dato: t }));
  };

  const agregarTipicas = (elegidas: PlantillaPolitica[]) => {
    cambiar((prev) => {
      const estan = yaEstan(prev.items.map((p) => p.titulo));
      const nuevas = elegidas
        .filter((t) => !estan.has(normalizarTitulo(t.titulo)))
        .map((t) => ({ ...politicaNueva(nuevoId(), t.categoria), titulo: t.titulo, texto: t.texto }));
      return { ...prev, items: [...prev.items, ...nuevas].slice(0, MAX_POLITICAS) };
    });
    toast.success(`${elegidas.length} ${elegidas.length === 1 ? "política agregada" : "políticas agregadas"}: completa lo que está entre corchetes.`);
  };

  return (
    <div className="space-y-4">
      <CabeceraSeccion
        seccion="politicas"
        titulo="Políticas"
        ayuda="Las reglas del negocio por escrito: cambios, fiado, delivery, horario, personal. Así todos responden igual y las puedes mandar por WhatsApp."
        ejemplo="Cambios y devoluciones: dentro de los 7 días, con boleta y el producto sin abrir."
        acciones={puedeEditar ? [{ id: "tipicas", label: "Agregar las típicas", hint: "Las de tu rubro que todavía no tienes", icon: ListChecks, onSelect: () => setTipicas(true) }] : []}
      >
        {puedeEditar && items.length > 0 && (
          <Button onClick={() => setModal({ inicial: politicaNueva(nuevoId()), esNueva: true })} disabled={lleno}>
            <Plus className="size-4" aria-hidden />
            Nueva política
          </Button>
        )}
      </CabeceraSeccion>

      {items.length === 0 ? (
        <EstadoVacio frase="Sin políticas: empieza con las típicas de tu rubro y ajústalas a tu negocio.">
          {puedeEditar && (
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setTipicas(true)}>
                <ListChecks className="size-4" aria-hidden />
                Agregar las típicas
              </Button>
              <Button variant="secondary" onClick={() => setModal({ inicial: politicaNueva(nuevoId()), esNueva: true })}>
                <Plus className="size-4" aria-hidden />
                Escribir una
              </Button>
            </div>
          )}
        </EstadoVacio>
      ) : (
        <>
          {(items.length >= BUSCAR_DESDE || porRevisar > 0) && (
            <div className="flex flex-wrap items-center gap-3">
              {items.length >= BUSCAR_DESDE && (
                <label className="relative w-full sm:w-72">
                  <span className="sr-only">Buscar política</span>
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
                  <input type="search" className={cn(CAMPO_ALTO, "pl-9")} value={busqueda} placeholder="Buscar política" onChange={(e) => setBusqueda(e.target.value)} />
                </label>
              )}
              <span className="text-sm text-[var(--text-secondary)]" aria-live="polite">
                {busqueda ? `${visibles} de ${items.length}` : `${items.length} políticas`}
                {porRevisar > 0 && ` · ${porRevisar} por revisar`}
              </span>
            </div>
          )}
          {grupos.length === 0 ? (
            <EstadoVacio frase={`Ninguna política dice «${busqueda}».`} />
          ) : (
            grupos.map((g) => (
              <section key={g.categoria} aria-label={g.categoria} className="space-y-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
                  {g.categoria}
                  <span className="text-xs font-normal text-[var(--text-tertiary)] tabular-nums">{g.lista.length}</span>
                </span>
                <ul className="grid gap-3 md:grid-cols-2">
                  {g.lista.map((p) => (
                    <TarjetaPolitica
                      key={p.id}
                      politica={p}
                      hoy={hoy}
                      puedeEditar={puedeEditar}
                      copiada={copiado === p.id}
                      onCopiar={() => void copiarPolitica(p)}
                      onEditar={() => setModal({ inicial: p, esNueva: false })}
                      onBorrar={() => borrar(p)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}

      {modal && <PoliticaModal key={modal.inicial.id} abierto inicial={modal.inicial} esNueva={modal.esNueva} onCerrar={() => setModal(null)} onGuardar={guardar} />}
      {tipicas && (
        <AgregarTipicasModal
          abierto
          titulo="Agregar las políticas típicas"
          yaTodas="Ya tienes todas las políticas típicas de este rubro."
          rubroInicial={rubro}
          faltan={faltan}
          lugar={MAX_POLITICAS - items.length}
          onCerrar={() => setTipicas(false)}
          onAgregar={agregarTipicas}
        />
      )}
    </div>
  );
}
