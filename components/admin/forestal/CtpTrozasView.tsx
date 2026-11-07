"use client";

/**
 * CtpTrozasView — el patio del aserradero, pieza por pieza.
 *
 * La diferencia con Consumos, que es la confusión que esta pantalla existía para
 * causar: **Consumos cuenta metros cúbicos por guía** (cuánto de qué GTF entró a
 * qué corrida, con sus invariantes I1–I6) y mira un período. Acá la unidad es
 * **el tronco** y no hay período: es lo que hay parado HOY, con el estado de
 * cada pieza y hace cuánto está ahí. Nadie en el patio señala un porcentaje de
 * una guía; señala una troza.
 *
 * Tres lecturas, una sola carga de datos (`use-trozas-patio`) para que el
 * resumen de arriba y las filas de abajo nunca cuenten cosas distintas:
 *   1. el panorama — cuánto hay, qué se puede aserrar hoy, qué está envejeciendo;
 *   2. la lista filtrable — la pieza concreta, con sus medidas y su guía;
 *   3. el buscador del fiscalizador — pregunta al servidor, sin el tope de 5.000.
 *
 * ## Compacta (Brandon 05-10 y 17-10)
 *
 * Un solo título, que dentro del libro se calla: el riel ya dice dónde estás y
 * recibe ⓘ, «Indicadores», «Sin título declarado», «Plan del día», el último
 * conteo y actualizar (`CtpTrozasCabecera`). La vista arranca en el escáner y
 * «Buscar en el libro»; «Sin título» abre su tabla en un modal y D1/D2 se
 * anotan desde la tabla cuando ninguna fuente los trae. También es el apartado
 * «Por troza» de Volumen disponible (19-10): con `alcance`, lista sólo las
 * trozas que suman al volumen elegido y su permiso/especie son los de Volumen.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Search } from "@buleje/design-system/icons";
import { SIN_TITULO, type EstadoTroza } from "@/lib/forestal/trozas-patio";
import { faltanMedidas, piezasSinTitulo } from "@/lib/forestal/trozas-patio-medidas";
import { escribirTrozaEnUrl, trozaDeUrl } from "@/lib/forestal/ctp-troza-etiquetas";
import CtpApartarEnLoteModal from "./CtpApartarEnLoteModal";
import { CtpArmarLoteEscaneoSuelto } from "./CtpArmarLoteEscaneoModal";
import CtpCodigosDuplicados from "./CtpCodigosDuplicados";
import CtpEtiquetasTrozasModal from "./CtpEtiquetasTrozasModal";
import CtpTrozasCabecera from "./CtpTrozasCabecera";
import CtpTrozaFichaModal from "./CtpTrozaFichaModal";
import CtpTrozasPlanAserrioModal from "./CtpTrozasPlanAserrioModal";
import EscanerTrozas from "./EscanerTrozas";
import CtpTrozasBuscador from "./CtpTrozasBuscador";
import CtpTrozasLista from "./CtpTrozasLista";
import CtpTrozasMedirModal from "./CtpTrozasMedirModal";
import { useIndicadoresPatio } from "./CtpTrozasPatio";
import CtpTrozasSinTituloModal from "./CtpTrozasSinTituloModal";
import { usePlantaUbicacion } from "./hooks/use-planta-ubicacion";
import { useTrozasPatio } from "./hooks/use-trozas-patio";
import { AvisoFueraDelVolumen, useTrozasEnVolumen, type AlcanceVolumen } from "./trozas-en-volumen";

/** El escáner de fichas no marca nada: todas se pueden volver a mirar. */
const SIN_MARCAR: ReadonlySet<string> = new Set();

export default function CtpTrozasView({ alcance }: { alcance?: AlcanceVolumen } = {}) {
  /* `trozas` = todo el patio (escáner, sin título, plan del día); `vista` = lo
     que muestran la lista y los indicadores, recortada por Volumen si viene. */
  const { trozas, meta, cargando, error, recargar } = useTrozasPatio(alcance?.contratoId);
  /* Los filtros viven acá porque los tocan las dos pantallas (el panel de
     arriba y la lista); listas, no un valor suelto: «libre Y apartada» es la
     pregunta de todos los días (Brandon, 2026-09-10). Especie, guía y título
     también recortan el panorama (ADR-400); estado y tramo no: son su desglose. */
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoTroza[]>([]);
  const [tramoFiltro, setTramoFiltro] = useState<string[]>([]);
  const { trozas: vista, especie, setEspecie, titulo, setTitulo, ...fuera } = useTrozasEnVolumen(trozas, alcance);
  const [guia, setGuia] = useState<string[]>([]);
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  /**
   * La pieza cuya historia se está mirando. Arranca con `?troza=<id>` si la
   * URL lo trae (ADR-436): así el QR de una etiqueta pegada en el patio abre
   * directo la ficha, sin pasar por la lista. `escribirTrozaEnUrl` mantiene la
   * URL sincronizada mientras se abre y se cierra, para que el link se pueda
   * compartir y un refresh no reabra una ficha ya cerrada.
   */
  const [ficha, setFichaState] = useState<string | null>(() => trozaDeUrl());
  const abrirFicha = (id: string | null) => {
    setFichaState(id);
    escribirTrozaEnUrl(id);
  };
  /** El orden de la tabla (filtrada) al abrir la ficha: lo recorren ‹ › y ←/→. */
  const [ordenFicha, setOrdenFicha] = useState<readonly string[]>([]);
  const vecinosFicha = useMemo(() => {
    const i = ficha ? ordenFicha.indexOf(ficha) : -1;
    return i < 0 ? undefined : { anterior: ordenFicha[i - 1] ?? null, siguiente: ordenFicha[i + 1] ?? null };
  }, [ficha, ordenFicha]);
  /** Las piezas que van camino a un lote. */
  const [apartando, setApartando] = useState<{ id: string; codigo: string | null; especie: string | null }[] | null>(null);
  /**
   * La troza desde cuya ficha se abrió «Armar un lote» (2026-09-26): arranca en
   * la pila y se siguen escaneando las demás. La ficha se cierra antes: un
   * modal encima de otro es el que se monta detrás.
   */
  const [armandoCon, setArmandoCon] = useState<string | null>(null);
  const [verSinTitulo, setVerSinTitulo] = useState(false);
  /** La planilla «Anotar D1 y D2»: qué piezas y cuál primero. */
  const [medir, setMedir] = useState<{ ids: string[]; inicial?: string } | null>(null);
  /** «Plan del día»: qué trozas mandar hoy a la sierra. */
  const [verPlan, setVerPlan] = useState(false);
  /** Etiquetas QR de las piezas del patio que no tienen (tarjeta «Con etiqueta QR»). */
  const [etiquetando, setEtiquetando] = useState<string[] | null>(null);
  const canchas = usePlantaUbicacion();
  const hoy = useMemo(() => new Date(), [trozas]); // eslint-disable-line react-hooks/exhaustive-deps

  const { boton: botonKpis, panel: panelKpis } = useIndicadoresPatio({
    trozas: vista, meta, cargando, estadoFiltro, onEstadoFiltro: setEstadoFiltro,
    tramoFiltro, onTramoFiltro: setTramoFiltro, especie, guia, titulo,
    onImprimirEtiquetas: setEtiquetando,
    onAnotarMedidas: (ids) => setMedir({ ids }),
    onVerSinTitulo: () => setTitulo([SIN_TITULO]),
    onRecargar: () => void recargar(),
  });
  /* Del patio ENTERO, no del recorte: es deuda de todo el libro y el botón
     está en la cabecera de la vista, no dentro de los indicadores. */
  const sinTitulo = useMemo(() => piezasSinTitulo(trozas), [trozas]);
  const m3SinTitulo = sinTitulo.reduce((a, t) => a + (t.volumenM3 ?? 0), 0);
  /* En vivo: al guardar, las anotadas salen solas de la planilla. */
  const piezasMedir = useMemo(
    () => (medir ? trozas.filter((t) => medir.ids.includes(t.id) && faltanMedidas(t)) : []),
    [medir, trozas],
  );

  return (
    <div data-vista-trozas className="space-y-2.5">
      {botonKpis}
      <CtpTrozasCabecera
        sinTitulo={sinTitulo.length}
        m3SinTitulo={m3SinTitulo}
        cargando={cargando}
        onVerSinTitulo={() => setVerSinTitulo(true)}
        onVerPlan={() => setVerPlan(true)}
        onRecargar={() => void recargar()}
        sinInfo={Boolean(alcance)}
      />

      {panelKpis && (
        <section aria-label="Indicadores del patio" className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
          {panelKpis}
        </section>
      )}

      {error && (
        <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> No se pudo leer el patio: {error}
        </p>
      )}

      {/* Va arriba de todo y no en una pestaña aparte: dos piezas con el mismo
          código rompen justamente lo que esta pantalla promete —pedir una troza
          por su código—. Se esconde solo cuando no queda ninguno (ADR-336) y
          entra en una línea: el problema se anuncia, pero no tapa el patio. */}
      <CtpCodigosDuplicados />

      {/* Los dos «encontrar una pieza», en el mismo renglón: el escáner abre la
          ficha de lo que está en el patio; «Buscar en el libro» pregunta al
          servidor (sin el tope de 5.000 y también lo ya consumido). Escanear
          = ver su ficha (Brandon, 2026-09-26), sin «ya estaba». */}
      <div className="flex flex-wrap items-start gap-2">
        <EscanerTrozas
          trozas={trozas}
          yaElegidas={SIN_MARCAR}
          accion="— su ficha abierta"
          mostrarCuenta={false}
          onTroza={(t) => abrirFicha(t.id)}
          className="min-w-[16rem] flex-1 space-y-1 border-0 bg-transparent p-0"
        />
        <button
          type="button"
          onClick={() => setBuscadorAbierto((v) => !v)}
          aria-expanded={buscadorAbierto}
          title={`La consulta del fiscalizador: llega con un código del POA y pregunta con qué guía entró esa troza.${meta.truncado ? " Acá no rige el tope de 5.000 piezas." : ""}`}
          className={`inline-flex h-12 shrink-0 items-center gap-2 rounded-2xl border px-3 text-sm font-bold transition-colors ${
            buscadorAbierto
              ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
              : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
          }`}
        >
          <Search className="h-4 w-4" aria-hidden="true" /> Buscar en el libro
        </button>
      </div>
      {buscadorAbierto && (
        <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
          <p className="mb-2 text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">
            La consulta del fiscalizador: llega con un código del POA y pregunta con qué guía entró esa troza.
            {meta.truncado && " Acá no rige el tope de 5.000 piezas."}
          </p>
          <CtpTrozasBuscador />
        </div>
      )}

      <AvisoFueraDelVolumen fuera={fuera.fuera} verFuera={fuera.verFuera} onVerFuera={fuera.setVerFuera} />
      <CtpTrozasLista
        trozas={vista}
        cargando={cargando}
        estadoFiltro={estadoFiltro}
        onEstadoFiltro={setEstadoFiltro}
        tramoFiltro={tramoFiltro}
        onTramoFiltro={setTramoFiltro}
        especie={especie}
        onEspecie={setEspecie}
        guia={guia}
        onGuia={setGuia}
        titulo={titulo}
        onTitulo={setTitulo}
        onVerFicha={(id, orden) => {
          setOrdenFicha(orden ?? []);
          abrirFicha(id);
        }}
        onApartar={setApartando}
        onAnotar={(ids, inicial) => setMedir({ ids, inicial })}
        filtrosDeAfuera={Boolean(alcance)}
      />

      {ficha && (
        /* `onVerOtra` deja saltar de un pedazo a su madre sin cerrar: el
           retrozado es justo donde uno quiere ir y volver. */
        <CtpTrozaFichaModal
          trozaId={ficha}
          onClose={() => abrirFicha(null)}
          onVerOtra={abrirFicha}
          vecinos={vecinosFicha}
          onNavegar={abrirFicha}
          onAnotar={(id) => {
            abrirFicha(null);
            setMedir({ ids: [id] });
          }}
          onArmarLote={(id) => {
            abrirFicha(null);
            setArmandoCon(id);
          }}
        />
      )}
      {armandoCon && (
        <CtpArmarLoteEscaneoSuelto
          inicial={[armandoCon]}
          onClose={() => {
            setArmandoCon(null);
            /* Las piezas que entraron a un lote cambian de estado en la lista. */
            void recargar();
          }}
        />
      )}
      {apartando && (
        <CtpApartarEnLoteModal
          piezas={apartando}
          onClose={() => setApartando(null)}
          onListo={() => void recargar()}
        />
      )}

      {verSinTitulo && (
        <CtpTrozasSinTituloModal
          piezas={sinTitulo}
          hoy={hoy}
          canchas={canchas}
          onClose={() => setVerSinTitulo(false)}
          onVerFicha={abrirFicha}
          onFiltrarTabla={() => setTitulo([SIN_TITULO])}
          onDeclarado={() => void recargar()}
          onAnotar={(id) => setMedir({ ids: sinTitulo.filter(faltanMedidas).map((t) => t.id), inicial: id })}
        />
      )}
      {verPlan && (
        <CtpTrozasPlanAserrioModal
          trozas={trozas}
          hoy={hoy}
          canchas={canchas}
          rendimientoPct={meta.rendimientoLibro?.pct}
          onApartar={setApartando}
          onVerFicha={abrirFicha}
          onClose={() => setVerPlan(false)}
        />
      )}
      {etiquetando && (
        <CtpEtiquetasTrozasModal
          ids={etiquetando}
          contexto={`${etiquetando.length} ${etiquetando.length === 1 ? "troza del patio sin etiqueta" : "trozas del patio sin etiqueta"}`}
          onClose={() => setEtiquetando(null)}
          onListo={() => void recargar()}
        />
      )}
      {medir && (
        <CtpTrozasMedirModal
          piezas={piezasMedir}
          inicialId={medir.inicial}
          onClose={() => setMedir(null)}
          onGuardado={() => void recargar()}
        />
      )}
    </div>
  );
}
