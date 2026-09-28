"use client";

/**
 * Las dos puertas de «Guías sin registrar» (ADR-446):
 *
 *  · `BarraDeudaConGuias` — la barra de deuda del libro. En Despacho le suma
 *    la pastilla «N guías sin registrar» (en Blas, 9 guías que el libro daba
 *    por 0 salidas); en las demás secciones es la `BarraDeuda` de siempre.
 *  · `BotonGuiasSinRegistrar` — el botón de la bandeja de anexos emitidos.
 *    Sólo aparece si hay alguna: sin guías pendientes no ocupa lugar.
 *
 * Las dos montan el hook de datos acá afuera, así que cerrar el modal no
 * pierde lo elegido ni corta un registro en curso.
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileStack } from "@buleje/design-system/icons";
import BarraDeuda, { type DeudaItem } from "@/components/admin/shared/BarraDeuda";
import { useGuiasSinRegistrar, type EstadoGuiasSinRegistrar } from "@/hooks/use-guias-sin-registrar";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

const CtpGuiasSinRegistrarModal = dynamic(() => import("./CtpGuiasSinRegistrarModal"), { ssr: false });
/* El cubicador entero: sólo baja si se va a anotar una producción. */
const CtpProducirSinLoteModal = dynamic(() => import("./CtpProducirSinLoteModal"), { ssr: false });

/**
 * Mientras el modal está arriba, ninguna tecla sube a `window`.
 *
 * Dos oyentes de `window` actuaban por debajo: el del Anexo 04 (un modal a
 * mano que se cierra con Escape en `window`: Escape se llevaba las DOS capas)
 * y los atajos de la tabla de Despacho (`n` abría una línea nueva detrás, `r`
 * recargaba). Radix y `useModalAccesible` escuchan en `document` en captura, y
 * React en su raíz: todos ya corrieron cuando el evento llega al corte.
 *
 * Por qué marca-y-corta y no un oyente que se prende con el modal: el Escape
 * de Radix cierra el modal DENTRO del mismo evento, React vuelca ese render
 * (y sus efectos) entre un oyente y el siguiente, y un oyente atado al
 * «abierto» ya no estaba cuando el evento subía a `document` (medido 28-09:
 * el Anexo 04 se cerraba igual). La marca se pone en la captura de `window`,
 * que corre antes que nadie, con el modal todavía abierto.
 */
function useTeclasQuedanAdentro(activo: boolean) {
  const activoRef = useRef(activo);
  useEffect(() => {
    activoRef.current = activo;
  }, [activo]);
  useEffect(() => {
    const marcados = new WeakSet<Event>();
    const marcar = (e: KeyboardEvent) => {
      if (activoRef.current) marcados.add(e);
    };
    const cortar = (e: KeyboardEvent) => {
      if (marcados.has(e)) e.stopPropagation();
    };
    window.addEventListener("keydown", marcar, true);
    document.addEventListener("keydown", cortar);
    return () => {
      window.removeEventListener("keydown", marcar, true);
      document.removeEventListener("keydown", cortar);
    };
  }, []);
}

/**
 * Abrir relee la lista: la pastilla se calculó al entrar a Despacho y el libro
 * pudo cambiar desde entonces. Mientras vuelve, el modal muestra lo que ya
 * tenía con el indicador de «actualizando» (no una pantalla vacía).
 */
function useAbrirReleyendo(estado: EstadoGuiasSinRegistrar) {
  const [abierto, setAbierto] = useState(false);
  /* Radix devuelve el foco a su `Dialog.Trigger`, y AdminModal se abre por
     estado, sin trigger: al cerrar el foco caía en <body> (medido 28-09) y con
     teclado había que volver a recorrer la página. Se devuelve a mano. */
  const disparador = useRef<HTMLElement | null>(null);
  const { cargar, registrando, fila } = estado;
  const ocupado = registrando != null || fila != null;
  const abrir = useCallback(() => {
    disparador.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAbierto(true);
    /* Con un registro en curso no: la lista se relee sola al terminar. */
    if (!ocupado) void cargar();
  }, [cargar, ocupado]);
  const cerrar = useCallback(() => {
    setAbierto(false);
    const el = disparador.current;
    /* Después del cierre de Radix, que corre en un `setTimeout` propio. */
    window.setTimeout(() => {
      if (el?.isConnected) el.focus();
    }, 0);
  }, []);
  return { abierto, abrir, cerrar };
}

function Flujo({
  estado,
  abierto,
  onCerrar,
  conProduccion,
}: {
  estado: EstadoGuiasSinRegistrar;
  abierto: boolean;
  onCerrar: () => void;
  /**
   * Abre «Producir sin lote» acá mismo. Sólo desde Despacho: dentro del Anexo
   * 04 (que también vive en el cubicador suelto) sería un cubicador dentro de
   * otro, y su Escape en `window` cerraría el anexo de abajo.
   */
  conProduccion: boolean;
}) {
  const [anotando, setAnotando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  /* Con el cubicador abierto NO: sus atajos (Escape de la tabla ampliada, los
     menús) escuchan en `window`. */
  useTeclasQuedanAdentro(abierto && !anotando);
  if (!abierto) return null;
  return (
    <>
      <CtpGuiasSinRegistrarModal
        /* Mientras se anota, se oculta (no se apila): el cubicador es un modal
           a mano y Radix le apagaría los clics y le robaría el foco. */
        open={!anotando}
        onClose={onCerrar}
        estado={estado}
        aviso={aviso}
        onAnotarProduccion={
          conProduccion
            ? () => {
                setAviso(null);
                setAnotando(true);
              }
            : undefined
        }
      />
      {anotando &&
        createPortal(
          <CtpProducirSinLoteModal
            onCerrar={() => setAnotando(false)}
            onListo={(msg) => {
              setAnotando(false);
              setAviso(msg);
              void estado.cargar();
            }}
          />,
          document.body,
        )}
    </>
  );
}

/** La barra de deuda del libro; en Despacho, con las guías que sólo viven como Anexo 04. */
export function BarraDeudaConGuias({
  items,
  section,
  onCambio,
}: {
  items: DeudaItem[];
  section: string;
  /** Se registró algo: la tabla de Despacho relee. */
  onCambio?: () => void;
}) {
  if (section !== "despacho") return <BarraDeuda items={items} />;
  return <BarraDeDespacho items={items} onCambio={onCambio} />;
}

function BarraDeDespacho({ items, onCambio }: { items: DeudaItem[]; onCambio?: () => void }) {
  const estado = useGuiasSinRegistrar({ cargarAlMontar: true, onCambio });
  const { abierto, abrir, cerrar } = useAbrirReleyendo(estado);
  const guias = estado.datos?.tanda.guias.length ?? 0;
  const m3 = estado.datos?.tanda.resumen.totalM3 ?? 0;
  const todos = useMemo<DeudaItem[]>(
    () =>
      guias > 0
        ? [
            {
              key: "guias-sin-registrar",
              valor: guias,
              label: guias === 1 ? "guía sin registrar" : "guías sin registrar",
              hint: `${fmtM3(m3)} m³ sólo en su Anexo 04`,
              tono: "warning",
              title: "Salieron con su Anexo 04 y el libro no las tiene en Despacho. Toca para revisarlas y registrarlas una por una.",
              onClick: abrir,
            },
            ...items,
          ]
        : items,
    [guias, m3, items, abrir],
  );
  return (
    <>
      <BarraDeuda items={todos} />
      <Flujo estado={estado} abierto={abierto} onCerrar={cerrar} conProduccion />
    </>
  );
}

/** Botón de la bandeja de anexos emitidos: sólo si hay guías por registrar. */
export function BotonGuiasSinRegistrar() {
  const estado = useGuiasSinRegistrar({ cargarAlMontar: true });
  const { abierto, abrir, cerrar } = useAbrirReleyendo(estado);
  const guias = estado.datos?.tanda.guias.length ?? 0;
  /* Registrar la última no esconde el botón con el modal abierto. */
  if (guias === 0 && !abierto) return null;
  return (
    <>
      <button
        type="button"
        onClick={abrir}
        title="Guías que salieron con su Anexo 04 y el libro no tiene en Despacho: revísalas y regístralas una por una"
        /* `shrink-0 whitespace-nowrap`: en la columna de 19 rem del Anexo 04
           partía «Al / libro» en dos renglones (medido 28-09). */
        className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10 px-2 text-xs font-bold text-[var(--data-warning-ink)] hover:border-[var(--data-warning-500)]"
      >
        <FileStack aria-hidden className="h-3.5 w-3.5" /> Al libro
        {guias > 0 && <span className="tabular-nums">{guias}</span>}
      </button>
      <Flujo estado={estado} abierto={abierto} onCerrar={cerrar} conProduccion={false} />
    </>
  );
}
