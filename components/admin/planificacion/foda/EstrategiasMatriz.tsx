"use client";

/**
 * EstrategiasMatriz — el cruce del FODA en una matriz 2×2 (ADR-497):
 * FO crecer · DO mejorar / FA defender · DA protegerte. Cada estrategia dice
 * qué puntos usa y se convierte en objetivo con un toque (crea el objetivo,
 * lo enlaza y abre Objetivos con ese objetivo a la vista).
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { undoToast } from "@buleje/design-system";
import { Plus, Sparkles } from "@buleje/design-system/icons";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { Button } from "@/components/ui-system/Button";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { nuevoId, useSeccionPlan } from "@/hooks/use-plan-empresa";
import { cn } from "@/lib/utils";
import { CabeceraSeccion } from "../comun/CabeceraSeccion";
import { enlaceObjetivo, objetivoNuevo } from "../objetivos/objetivos-config";
import { EstadoVacio } from "../piezas/EstadoVacio";
import { EstrategiaModal } from "./EstrategiaModal";
import { TarjetaEstrategia } from "./TarjetaEstrategia";
import { CUADRANTE, ORDEN_MATRIZ, TIPO, indicePuntos, masFuerte, type Estrategia, type TipoEstrategia } from "./foda-config";

const MAX_ESTRATEGIAS = 80;
const MAX_OBJETIVOS = 100;

const borrador = (tipo: TipoEstrategia, usa: string[] = []): Estrategia => ({ id: nuevoId(), tipo, texto: "", usa, estado: "idea", objetivoId: "" });

export function EstrategiasMatriz({ irAFoda }: { irAFoda: () => void }) {
  const estrategias = useSeccionPlan("estrategias");
  const { datos: foda } = useSeccionPlan("foda");
  const objetivos = useSeccionPlan("objetivos");
  const { puedeEditar } = estrategias;
  const [modal, setModal] = useState<{ inicial: Estrategia; esNueva: boolean } | null>(null);

  const puntos = useMemo(() => indicePuntos(foda), [foda]);
  const tituloObjetivo = useMemo(() => new Map(objetivos.datos.items.map((o) => [o.id, o.titulo])), [objetivos.datos.items]);
  const items = estrategias.datos.items;
  const hayFoda = puntos.size > 0;
  const lleno = items.length >= MAX_ESTRATEGIAS;

  const sugerencia = useMemo(() => {
    for (const tipo of ORDEN_MATRIZ) {
      const [interno, externo] = TIPO[tipo].cruza;
      const a = masFuerte(foda[interno]);
      const b = masFuerte(foda[externo]);
      if (a && b) return { tipo, a, b };
    }
    return null;
  }, [foda]);

  const guardar = (e: Estrategia) =>
    estrategias.cambiar((prev) => ({
      ...prev,
      items: prev.items.some((x) => x.id === e.id) ? prev.items.map((x) => (x.id === e.id ? e : x)) : [...prev.items, e],
    }));

  const borrar = (e: Estrategia) => {
    const indice = items.findIndex((x) => x.id === e.id);
    estrategias.cambiar((prev) => ({ ...prev, items: prev.items.filter((x) => x.id !== e.id) }));
    undoToast({
      message: "Borraste la estrategia",
      description: e.texto.slice(0, 80),
      onUndo: () =>
        estrategias.cambiar((prev) => {
          if (prev.items.some((x) => x.id === e.id)) return prev;
          const lista = [...prev.items];
          lista.splice(Math.min(indice, lista.length), 0, e);
          return { ...prev, items: lista };
        }),
    });
  };

  const convertir = (e: Estrategia) => {
    if (objetivos.datos.items.length >= MAX_OBJETIVOS) {
      toast.error(`Ya tienes ${MAX_OBJETIVOS} objetivos: borra o junta alguno antes.`);
      return;
    }
    const id = nuevoId();
    objetivos.cambiar((prev) => ({ ...prev, items: [...prev.items, objetivoNuevo(id, { titulo: e.texto.slice(0, 160), estrategiaId: e.id })] }));
    estrategias.cambiar((prev) => ({ ...prev, items: prev.items.map((x) => (x.id === e.id ? { ...x, objetivoId: id } : x)) }));
    irAEnlace(enlaceObjetivo(id));
  };

  return (
    <div className="space-y-3">
      <CabeceraSeccion
        seccion="estrategias"
        titulo="Estrategias"
        ayuda="Qué vas a hacer, cruzando los puntos de tu FODA. Cada estrategia se puede convertir en un objetivo con fechas y acciones."
        ejemplo={TIPO.FO.ejemplo}
      >
        {puedeEditar && hayFoda && (
          <Button onClick={() => setModal({ inicial: borrador("FO"), esNueva: true })} disabled={lleno}>
            <Plus className="size-4" aria-hidden />
            Nueva estrategia
          </Button>
        )}
      </CabeceraSeccion>

      {!hayFoda ? (
        <EstadoVacio frase="Las estrategias salen de cruzar tu FODA: primero escribe sus puntos.">
          <Button variant="secondary" onClick={irAFoda}>
            Ir al FODA
          </Button>
        </EstadoVacio>
      ) : (
        <>
          {items.length === 0 && sugerencia && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-3">
              <Sparkles className="size-5 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
              <p className="min-w-0 flex-1 text-sm text-[var(--text-primary)]">
                Empieza por {TIPO[sugerencia.tipo].nombre.toLowerCase()}: cruza «{sugerencia.a.texto.slice(0, 60)}» con «{sugerencia.b.texto.slice(0, 60)}».
              </p>
              {puedeEditar && (
                <Button variant="secondary" onClick={() => setModal({ inicial: borrador(sugerencia.tipo, [sugerencia.a.id, sugerencia.b.id]), esNueva: true })}>
                  Escribir esa estrategia
                </Button>
              )}
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {ORDEN_MATRIZ.map((tipo) => {
              const info = TIPO[tipo];
              const Icono = info.icono;
              const deTipo = items.filter((x) => x.tipo === tipo);
              return (
                <section key={tipo} aria-label={`${tipo}: ${info.nombre}`} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Icono className="size-5 shrink-0 text-[var(--text-secondary)]" aria-hidden />
                    <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{tipo}</span>
                    <span className="text-base font-bold text-[var(--text-primary)]">{info.nombre}</span>
                    <span className="text-sm text-[var(--text-tertiary)] tabular-nums">{deTipo.length}</span>
                    <InfoTip
                      title={`${tipo} · ${info.nombre}`}
                      what={info.significado}
                      affects={`Cruza ${CUADRANTE[info.cruza[0]].nombre.toLowerCase()} con ${CUADRANTE[info.cruza[1]].nombre.toLowerCase()}.`}
                      example={info.ejemplo}
                    />
                    {puedeEditar && (
                      <button
                        type="button"
                        className={cn(button({ variant: "ghost", size: "icon" }), "ml-auto")}
                        aria-label={`Nueva estrategia ${tipo}`}
                        title={`Nueva estrategia ${tipo}`}
                        disabled={lleno}
                        onClick={() => setModal({ inicial: borrador(tipo), esNueva: true })}
                      >
                        <Plus className="size-5" aria-hidden />
                      </button>
                    )}
                  </div>
                  {deTipo.length === 0 ? (
                    <p className="px-1 py-2 text-sm text-[var(--text-tertiary)]">Sin estrategias para {info.nombre.toLowerCase()}.</p>
                  ) : (
                    <ul className="space-y-2">
                      {deTipo.map((e) => {
                        const titulo = e.objetivoId ? tituloObjetivo.get(e.objetivoId) : undefined;
                        return (
                          <TarjetaEstrategia
                            key={e.id}
                            estrategia={e}
                            puntos={puntos}
                            objetivo={titulo ?? null}
                            puedeEditar={puedeEditar}
                            onEditar={() => setModal({ inicial: e, esNueva: false })}
                            onConvertir={() => convertir(e)}
                            onVerObjetivo={() => irAEnlace(enlaceObjetivo(e.objetivoId))}
                            onBorrar={() => borrar(e)}
                          />
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      {modal && (
        <EstrategiaModal
          key={modal.inicial.id}
          abierto
          inicial={modal.inicial}
          esNueva={modal.esNueva}
          foda={foda}
          onCerrar={() => setModal(null)}
          onGuardar={guardar}
        />
      )}
    </div>
  );
}
