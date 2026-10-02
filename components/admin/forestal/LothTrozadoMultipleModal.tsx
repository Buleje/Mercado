"use client";

/**
 * LothTrozadoMultipleModal — trozar un árbol en una sola pantalla.
 *
 * Un fuste se corta en cinco o seis trozas; registrarlas era abrir cinco veces
 * el formulario completo y volver a tipear árbol, especie y fecha cada vez. Acá
 * se elige el árbol una vez y se agregan renglones: el código sigue a lo que el
 * libro ya trozó (A-D asentadas → E, F, G…), el volumen sale por Smalian
 * renglón por renglón y lo que queda se compara **contra la tala del árbol,
 * restando también lo ya trozado** (el trozado no puede superar la tala: T4).
 *
 * Igual que el Trozado de a una (Brandon 28-09: «Trozado múltiple igual»): la
 * misma ficha lateral (`LothFichaTrozado` con `lote`), las dos formas de
 * anotar el Ø con la elección fijada en el equipo, y las flechas/Enter para
 * moverse entre las medidas. En una plantación (ADR-459) la ficha habla del
 * árbol «sin marcar», no de «no está en el censo».
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { usePanelTokens } from "@/components/admin/shared/use-panel-tokens";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { Scissors, X } from "@buleje/design-system/icons";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { FormaMedicion } from "@/lib/forestal/loth-forma-medicion";
import {
  calcularRenglones,
  renglonesEnForma,
  renglonVacio,
  restanteDeLote,
  trozasParaAsentar,
  type RenglonTroza,
  type TrozaParaAsentar,
} from "@/lib/forestal/loth-trozado-multiple";
import { useArbolDelCenso } from "./hooks/use-arbol-del-censo";
import { olvidarArbolEnElLibro, useArbolEnElLibro } from "./hooks/use-arbol-en-el-libro";
import { useFormaMedicion } from "./hooks/use-forma-medicion";
import { usePlanesDePlantacion } from "./hooks/use-registro-plantacion";
import LothFichaTrozado from "./LothFichaTrozado";
import { SelectorFormaMedicion } from "./LothMedicionPartes";
import LothTrozadoMultiplePie from "./LothTrozadoMultiplePie";
import LothTrozasRenglones from "./LothTrozasRenglones";

const RENGLONES_INICIALES = () => [renglonVacio(0), renglonVacio(1)];

export default function LothTrozadoMultipleModal({
  open,
  talas,
  onClose,
  onGuardar,
}: {
  open: boolean;
  /** Talas registradas: de acá sale el árbol, su especie y su volumen tumbado. */
  talas: LothEntryDTO[];
  onClose: () => void;
  onGuardar: (arbol: LothEntryDTO, trozas: TrozaParaAsentar[]) => Promise<{ creadas: number; errores: string[] }>;
}) {
  /* Sin esto el foco se queda atrás del modal: Tab se va a la pantalla
     de abajo y Escape no cierra (hook medido en el módulo, 2026-09-09). */
  /* `activo: open` no es decorativo: el componente NO se desmonta al
     cerrarse —sólo su contenido— así que sin esto el efecto corre una vez
     con el ref vacío y no vuelve a mirar cuando el modal aparece. */
  const cajaRef = useRef<HTMLDivElement>(null);
  const [arbolId, setArbolId] = useState<string>("");
  const [renglones, setRenglones] = useState<RenglonTroza[]>(RENGLONES_INICIALES);
  const sigId = useRef(2);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ creadas: number; errores: string[]; intentadas: number } | null>(null);
  const [forma, setForma] = useFormaMedicion();
  /* En portal, como AdminModal: dentro del panel, `.admin-mobile-cards`
     volvía tarjetas a 400 px la tablita de «Lo que queda» de la ficha
     (medido 28-09). Fuera del panel hay que traer sus tokens. */
  const tokens = usePanelTokens(open);
  useModalAccesible(cajaRef, { onCerrar: guardando ? undefined : onClose, activo: open });
  /**
   * Ventana: se mueve, se achica y se fija (ADR-420).
   *
   * Los renglones se copian de la libreta de campo, pero el árbol y su volumen
   * talado están en la tabla del libro, detrás. Con seis trozas cargadas el
   * modal tapa justo la fila contra la que hay que cotejar; corrido a un lado
   * se tipea mirando el dato, sin cerrar y perder los renglones a medio llenar.
   * Clave nueva con la ficha: una ventana recordada a 52rem apretaba la columna.
   */
  const ventana = useVentanaDeModal(open, {
    ref: cajaRef,
    aplicarTranslate: true,
    claveMemoria: "loth-trozado-multiple-ficha",
  });

  /* Asentado lo anterior, abrir de nuevo arranca limpio (antes volvía el
     «Entraron 3 de 3» de la vez pasada). A medio llenar, no se pierde nada. */
  useEffect(() => {
    if (!open || !resultado) return;
    setResultado(null);
    setRenglones(RENGLONES_INICIALES());
    // Sólo al abrir: `resultado` cambia al asentar, con el modal abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const arbol = useMemo(() => talas.find((t) => t.id === arbolId) ?? null, [talas, arbolId]);
  const code = open && arbol?.treeCode ? arbol.treeCode.trim() : "";
  const libro = useArbolEnElLibro(code);
  const censo = useArbolDelCenso(code);
  /** El plan de la tala es una plantación: el árbol no tiene por qué estar marcado. */
  const plantaciones = usePlanesDePlantacion(open);
  const plantacion = arbol?.planId != null && plantaciones.has(arbol.planId);

  const calculadas = calcularRenglones(renglones, forma, code, libro.datos?.trozas ?? []);
  const listas = trozasParaAsentar(calculadas, forma);
  const aMedias = calculadas.filter((r) => r.aMedias);
  const lote = calculadas.map((r) => ({ codigo: r.codigo, volumenM3: r.volumenM3 }));
  const resto = libro.datos ? restanteDeLote(libro.datos, lote.map((t) => ({ trozaCode: t.codigo, volumeM3: t.volumenM3 }))) : null;
  const totalM3 = listas.reduce((s, t) => s + t.volumeM3, 0);

  if (!open) return null;

  const elegirForma = (f: FormaMedicion) => {
    setRenglones((rs) => renglonesEnForma(rs, f));
    setForma(f);
  };
  const cambiar = (id: number, cambio: (r: RenglonTroza) => RenglonTroza) =>
    setRenglones((rs) => rs.map((r) => (r.id === id ? cambio(r) : r)));

  const guardar = async () => {
    // Sin el libro los códigos repetirían los asentados (ver el pie).
    if (!arbol || !libro.datos) return;
    setGuardando(true);
    try {
      const r = await onGuardar(arbol, listas);
      setResultado({ ...r, intentadas: listas.length });
      // La próxima ficha de este árbol lee el libro de nuevo, con estas trozas.
      olvidarArbolEnElLibro();
    } finally {
      setGuardando(false);
    }
  };

  return createPortal(
    <div
      style={tokens}
      className="modal-backdrop fixed inset-0 z-modal-2 flex items-center justify-center bg-black/50 p-2 backdrop-blur-sm sm:p-4"
      /* El velo es decorativo: el diálogo es la caja de adentro. Cerrar tocando
         afuera es un atajo —Escape y la X hacen lo mismo con teclado. */
      role="presentation"
      onClick={(e) => {
        /* Fijado quiere decir «lo dejo abierto para mirar el libro de atrás»:
           el clic afuera deja de cerrar. La X y Escape siguen cerrando. */
        if (e.target === e.currentTarget && !ventana.fijado) onClose();
      }}
    >
      {/* El diálogo en sí: acá viven el foco, el arrastre y el tamaño —
          el velo de atrás no se mueve. Mismo ancho que «Nueva línea · Trozado». */}
      <div
        ref={cajaRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Trozar un árbol"
        /* `relative`: el tirador de redimensión se ancla a esta esquina. */
        className="relative flex max-h-[92vh] w-full max-w-[44rem] flex-col overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)] lg:max-w-[62rem]"
      >
        {/* Cabecera — y asa para arrastrar la ventana. */}
        <header {...ventana.asaProps} className="flex items-start justify-between gap-3 border-b-2 border-[var(--rule-base)] px-4 py-3 sm:px-5">
          <div className="flex items-center gap-1.5">
            <p className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-[var(--text-secondary)]">
              <Scissors className="h-4 w-4" /> Trozar un árbol
            </p>
            <InfoTip
              title="Trozar un árbol"
              what="Todas las trozas del mismo fuste, de una vez."
              affects="El código sigue a lo que el libro ya trozó de ese árbol (A-D asentadas → E) y el volumen (Smalian) sale solo por renglón."
              example="Eliges el árbol 85-TOR y cargas sus trozas sin volver a tipear especie ni fecha. Flechas y Enter te llevan de medida en medida."
            />
          </div>
          {/* `ml-auto`: la cabecera reparte con `justify-between`, así que sin
              esto los controles quedarían flotando en el medio. */}
          <span className="ml-auto flex items-center gap-1">
            <ControlesDeVentana ventana={ventana} />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-5">
          {resultado ? (
            <div className="rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-500)]/10 p-4">
              <p className="text-base font-bold text-[var(--text-primary)]">
                Entraron {resultado.creadas} de {resultado.intentadas} trozas
              </p>
              {resultado.errores.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                  {resultado.errores.map((e, i) => (
                    <li key={i}>· {e}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            /* Tres hijos, como «Nueva línea»: [árbol] · [ficha, a la derecha
               desde lg] · [trozas]. En el celular salen en ese orden. */
            <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:grid-rows-[auto_1fr] lg:gap-x-5 lg:gap-y-4 lg:space-y-0">
              <label className="block lg:col-start-1 lg:row-start-1">
                <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Árbol talado</span>
                <select
                  value={arbolId}
                  onChange={(e) => setArbolId(e.target.value)}
                  className="mt-1 h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-base font-bold text-[var(--text-primary)] outline-none"
                >
                  <option value="">Elige el árbol a trozar…</option>
                  {talas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.treeCode} · {t.speciesCommon ?? "sin especie"} · {t.volumeM3 ? `${fmtM3(Number(t.volumeM3))} m³` : "sin volumen"}
                    </option>
                  ))}
                </select>
              </label>

              <aside
                aria-label="Ficha del árbol"
                className="lg:sticky lg:top-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-h-[calc(92vh-10rem)] lg:self-start lg:overflow-y-auto"
              >
                <LothFichaTrozado arbol={censo.arbol} cargandoCenso={censo.cargando} codigo={code} libro={libro} lote={lote} plantacion={plantacion} />
              </aside>

              {arbol && (
                <div className="space-y-3 lg:col-start-1 lg:row-start-2">
                  <SelectorFormaMedicion forma={forma} onForma={elegirForma} />
                  <LothTrozasRenglones
                    forma={forma}
                    renglones={calculadas}
                    onMedidas={(id, medidas) => cambiar(id, (r) => ({ ...r, medidas }))}
                    onRama={(id, isRama) => cambiar(id, (r) => ({ ...r, isRama }))}
                    onQuitar={(id) => setRenglones((rs) => rs.filter((r) => r.id !== id))}
                    onAgregar={() => {
                      const id = sigId.current++;
                      setRenglones((rs) => [...rs, renglonVacio(id)]);
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <LothTrozadoMultiplePie
          hayResultado={resultado != null}
          hayArbol={arbol != null}
          libro={{ leido: libro.datos != null, error: libro.error }}
          resto={resto}
          aMedias={aMedias.map((r) => r.codigo)}
          listas={listas.length}
          totalM3={totalM3}
          guardando={guardando}
          onCerrar={onClose}
          onAsentar={guardar}
        />

        <TiradorDeVentana ventana={ventana} />
      </div>
    </div>,
    document.body,
  );
}
