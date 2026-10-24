"use client";

/**
 * «Trozas» — la lista de la guía (anexo del casillero 35) contestando la
 * pregunta del patio: ¿dónde está cada una HOY? En patio, aserrada,
 * despachada, no llegó… y si ya tiene etiqueta QR (ADR-436).
 *
 * Con sus medidas en dos juegos (Brandon, 2026-09-26): las de la GUÍA —D1, D2
 * en cm y largo en m, cada una en su columna y «—» la que falta— y las de la
 * cubicación OXAPAMPA propia —D1″, D2″, L′ y su PT—, con el total de PT y
 * cuántas van cubicadas en el pie. «Cubicar Oxapampa» abre la planilla.
 *
 * Filtros en pastillas pegados a la tabla que filtran (ley de Brandon 09-19,
 * punto 5). Ancha = tabla; angosta = lista (el bloque es su propio container:
 * una tabla dentro de un `AdminModal` en portal no colapsa a tarjetas sola).
 */

import { useMemo, useState } from "react";
import { Layers, Ruler } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  ESTADOS_TROZA,
  estadoDeTroza,
  type EstadoTrozaFicha,
  type ResumenTrozas,
} from "@/lib/forestal/ficha-guia-resumen";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { resumenOxapampa } from "@/lib/forestal/cubicacion-oxapampa";
import { CtpPaginacion, usePaginacion } from "../ctp-tabla";
import type { TrozaDeFicha } from "../CtpGuiaFichaModal";
import { BOTON_BLOQUE, BloqueCargando, BloqueFicha } from "./comun";
import { ListaTrozas, TablaTrozas } from "./TrozasListado";

/** Pastilla-filtro: `aria-pressed`, con su cuenta. */
function Filtro({
  activo,
  onClick,
  children,
  n,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
  n: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-muted)] ${
        activo
          ? "border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--accent-ink)]"
          : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
      }`}
    >
      {children}
      <span className="font-mono text-xs tabular-nums">{n}</span>
    </button>
  );
}

export default function BloqueTrozas({
  trozas,
  resumen,
  enOtraFila,
  especies,
  indice,
  className,
  onCubicar,
  ocupado = false,
}: {
  trozas: TrozaDeFicha[] | null;
  resumen: ResumenTrozas | null;
  /** id de troza → especie de la fila donde cuelga, si es de otra (ADR-435). */
  enOtraFila: Map<string, string>;
  especies: string[];
  indice: number;
  className?: string;
  /** Abre la planilla «Cubicar Oxapampa». Sin esto no se ofrece. */
  onCubicar?: () => void;
  ocupado?: boolean;
}) {
  const [estado, setEstado] = useState<EstadoTrozaFicha | null>(null);
  const [especie, setEspecie] = useState<string | null>(null);
  const [verTodas, setVerTodas] = useState(false);

  const filtradas = useMemo(
    () =>
      (trozas ?? []).filter(
        (t) =>
          (estado == null || estadoDeTroza(t) === estado) &&
          (especie == null || (t.especieComun ?? "") === especie),
      ),
    [trozas, estado, especie],
  );
  const { visibles, rango, porPagina, setPorPagina, ir } = usePaginacion(filtradas);
  const filtrando = estado != null || especie != null;
  /* El total del pie es de lo FILTRADO (como el subtotal de Excel); el de la
     cabecera, de la guía entera. */
  const ox = useMemo(() => resumenOxapampa(filtradas), [filtradas]);
  const oxGuia = useMemo(() => resumenOxapampa(trozas ?? []), [trozas]);
  const filas = verTodas ? filtradas : visibles;
  const numero = (i: number) => (verTodas ? i + 1 : rango.inicio + i + 1);
  const porEspecie = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of trozas ?? [])
      m.set(t.especieComun ?? "", (m.get(t.especieComun ?? "") ?? 0) + 1);
    return m;
  }, [trozas]);

  return (
    <BloqueFicha
      titulo="Trozas"
      plegable
      icono={Layers}
      indice={indice}
      className={className}
      info={
        <InfoTip
          title="Dónde está cada troza"
          what="La lista de trozas de la guía con su estado de hoy: en patio, aserrada, despachada, retrozada o que no llegó. El ícono QR dice que ya tiene etiqueta."
          affects="Sólo las de «En patio» se pueden llevar a la sierra o despachar."
          example="Toca «En patio» para ver las que faltan etiquetar antes de moverlas. Las medidas «—» faltan en la guía; ⓘ = medida en planta."
        />
      }
      pie={
        onCubicar && trozas && trozas.length > 0 ? (
          <>
            <button type="button" onClick={onCubicar} disabled={ocupado} className={BOTON_BLOQUE}>
              <Ruler className="h-4 w-4" aria-hidden /> Cubicar Oxapampa
            </button>
            <span className="text-sm tabular-nums text-[var(--text-secondary)]">
              {oxGuia.cubicadas} de {trozas.length} cubicadas
            </span>
          </>
        ) : undefined
      }
      extra={
        resumen ? (
          <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
            <span className="font-semibold text-[var(--text-tertiary)]">{resumen.total} ·</span>{" "}
            {fmtM3(resumen.m3)} m³
            {oxGuia.cubicadas > 0 && <> · {fmtPt(oxGuia.pt)} PT</>}
          </span>
        ) : undefined
      }
    >
      {trozas == null ? (
        <BloqueCargando filas={5} />
      ) : trozas.length === 0 ? (
        <p className="py-2 text-sm text-[var(--text-secondary)]">
          Esta guía no tiene trozas cargadas.
        </p>
      ) : (
        <div className="@container/trozas space-y-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
            <Filtro activo={estado == null} onClick={() => setEstado(null)} n={trozas.length}>
              Todas
            </Filtro>
            {ESTADOS_TROZA.filter((e) => (resumen?.porEstado[e.clave] ?? 0) > 0).map((e) => (
              <Filtro
                key={e.clave}
                activo={estado === e.clave}
                onClick={() => setEstado(estado === e.clave ? null : e.clave)}
                n={resumen?.porEstado[e.clave] ?? 0}
              >
                {e.rotulo}
              </Filtro>
            ))}
          </div>
          {especies.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por especie">
              {especies.map((e) => (
                <Filtro
                  key={e}
                  activo={especie === e}
                  onClick={() => setEspecie(especie === e ? null : e)}
                  n={porEspecie.get(e) ?? 0}
                >
                  {e}
                </Filtro>
              ))}
            </div>
          )}

          {/* Ancha: tabla. Especie va bajo el código y la llegada bajo el estado:
              con las dos cubicaciones son 11 columnas en 2/3 del modal. */}
          <TablaTrozas
            filas={filas}
            numero={numero}
            filtradas={filtradas}
            filtrando={filtrando}
            ox={ox}
            enOtraFila={enOtraFila}
          />
          {/* Angosta: lista. */}
          <ListaTrozas
            filas={filas}
            numero={numero}
            filtradas={filtradas}
            filtrando={filtrando}
            ox={ox}
          />

          {!verTodas && filtradas.length > rango.fin - rango.inicio && (
            <CtpPaginacion
              rango={rango}
              porPagina={porPagina}
              onPorPagina={setPorPagina}
              onIr={ir}
              sustantivo="troza"
              extra={
                <button
                  type="button"
                  onClick={() => setVerTodas(true)}
                  className="font-bold text-[var(--accent-ink)] underline"
                >
                  ver las {filtradas.length} de una
                </button>
              }
            />
          )}
        </div>
      )}
    </BloqueFicha>
  );
}
