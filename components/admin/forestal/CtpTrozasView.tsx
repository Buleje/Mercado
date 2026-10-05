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
 * ## Un solo título y una sola jerarquía
 *
 * La vista tiene UN título (`SectionTitle`) y cada bloque el suyo (`CardTitle`).
 * Antes había dos encabezados casi iguales —«El patio, troza por troza» y «El
 * patio, pieza por pieza»— y cinco `<h3>` del mismo peso: con todo al mismo
 * nivel, nada es el título.
 *
 * ## Compacta (Brandon 05-10)
 *
 * Todo lo que no es la tabla vive en DOS renglones: la cabecera (título,
 * «Indicadores» plegable con su titular, «Sin título declarado», conteos y
 * actualizar) y el de buscar (escáner + «Buscar en el libro», que antes era
 * una caja al pie). Los indicadores arrancan plegados y se recuerdan; «Sin
 * título» es un botón con su tabla en un modal, y D1/D2 se anotan desde la
 * tabla cuando ninguna fuente los trae.
 */

import { useMemo, useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import { AlertTriangle, RefreshCw, Search, ShieldAlert } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { SIN_TITULO, type EstadoTroza } from "@/lib/forestal/trozas-patio";
import { faltanMedidas, piezasSinTitulo } from "@/lib/forestal/trozas-patio-medidas";
import { escribirTrozaEnUrl, trozaDeUrl } from "@/lib/forestal/ctp-troza-etiquetas";
import CtpApartarEnLoteModal from "./CtpApartarEnLoteModal";
import { CtpArmarLoteEscaneoSuelto } from "./CtpArmarLoteEscaneoModal";
import CtpCodigosDuplicados from "./CtpCodigosDuplicados";
import CtpConteosPatio from "./CtpConteosPatio";
import CtpTrozaFichaModal from "./CtpTrozaFichaModal";
import EscanerTrozas from "./EscanerTrozas";
import CtpTrozasBuscador from "./CtpTrozasBuscador";
import CtpTrozasLista from "./CtpTrozasLista";
import CtpTrozasMedirModal from "./CtpTrozasMedirModal";
import { useIndicadoresPatio } from "./CtpTrozasPatio";
import CtpTrozasSinTituloModal from "./CtpTrozasSinTituloModal";
import { n2 } from "./ctp-trozas-ui";
import { usePlantaUbicacion } from "./hooks/use-planta-ubicacion";
import { useTrozasPatio } from "./hooks/use-trozas-patio";

/** El escáner de fichas no marca nada: todas se pueden volver a mirar. */
const SIN_MARCAR: ReadonlySet<string> = new Set();

export default function CtpTrozasView() {
  const { trozas, meta, cargando, error, recargar } = useTrozasPatio();
  /* Los filtros viven acá porque los tocan las dos pantallas: se elige un estado
     en el panel de arriba y la lista de abajo tiene que obedecer. */
  /* Listas y no un valor suelto (Brandon, 2026-09-10): «libre Y apartada» es la
     pregunta de todos los días —qué hay parado— y con uno solo había que mirar
     el patio dos veces y sumar a mano. */
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoTroza[]>([]);
  const [tramoFiltro, setTramoFiltro] = useState<string[]>([]);
  /**
   * Especie, guía y título suben acá con estado y tramo (ADR-400).
   *
   * Vivían adentro de la lista, así que el panorama de arriba contaba TODA la
   * pila mientras la tabla mostraba una especie: dos números que se
   * contradicen en la misma pantalla. Ahora los dos miran el mismo conjunto.
   *
   * Estado y tramo NO recortan el panorama: son su propio desglose, y filtrar
   * las tarjetas por lo que se elige EN las tarjetas las dejaría en cero.
   */
  const [especie, setEspecie] = useState<string[]>([]);
  const [guia, setGuia] = useState<string[]>([]);
  const [titulo, setTitulo] = useState<string[]>([]);
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
  const canchas = usePlantaUbicacion();
  const hoy = useMemo(() => new Date(), [trozas]); // eslint-disable-line react-hooks/exhaustive-deps

  const { boton: botonKpis, panel: panelKpis } = useIndicadoresPatio({
    trozas, meta, cargando, estadoFiltro, onEstadoFiltro: setEstadoFiltro,
    tramoFiltro, onTramoFiltro: setTramoFiltro, especie, guia, titulo,
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
      <header className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <SectionTitle>El patio, troza por troza</SectionTitle>
          <InfoTip
            title="El patio, troza por troza"
            what="Qué hay parado hoy, qué se puede llevar a la sierra y qué lleva demasiado tiempo esperando."
            affects="Consumos cuenta m³ por guía; acá la unidad es la pieza."
          />
        </div>
        {botonKpis}
        {/* La deuda de origen legal, a la vista aunque los indicadores estén
            plegados; abre su tabla. Sólo cuando existe: un cero en verde sería
            una felicitación que nadie pidió. */}
        {sinTitulo.length > 0 && (
          <button
            type="button"
            onClick={() => setVerSinTitulo(true)}
            title="Piezas paradas sin título habilitante: ver cuáles y de qué guía"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 px-2.5 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--data-warning-500)]/20"
          >
            <ShieldAlert className="h-4 w-4 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden="true" />
            Sin título declarado
            <span className="font-mono tabular-nums">{sinTitulo.length}</span>
            <span className="font-mono text-xs font-normal tabular-nums text-[var(--text-secondary)]">{n2(m3SinTitulo)} m³</span>
          </button>
        )}
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          {/* El conteo físico del patio (acta del modo patio, 2026-09-26). */}
          <CtpConteosPatio />
          <button
            type="button" onClick={() => void recargar()} disabled={cargando}
            title="Actualizar el patio" aria-label="Actualizar el patio"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

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

      <CtpTrozasLista
        trozas={trozas}
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
        onVerFicha={(id) => abrirFicha(id)}
        onApartar={setApartando}
        onAnotar={(ids, inicial) => setMedir({ ids, inicial })}
      />

      {ficha && (
        /* `onVerOtra` deja saltar de un pedazo a su madre sin cerrar: el
           retrozado es justo donde uno quiere ir y volver. */
        <CtpTrozaFichaModal
          trozaId={ficha}
          onClose={() => abrirFicha(null)}
          onVerOtra={abrirFicha}
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
          onAnotar={(id) => setMedir({ ids: sinTitulo.filter(faltanMedidas).map((t) => t.id), inicial: id })}
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
