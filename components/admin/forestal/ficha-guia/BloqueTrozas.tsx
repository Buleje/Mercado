"use client";

/**
 * «Trozas» — la lista de la guía (anexo del casillero 35) contestando la
 * pregunta del patio: ¿dónde está cada una HOY? En patio, aserrada,
 * despachada, no llegó… y si ya tiene etiqueta QR (ADR-436).
 *
 * Filtros en pastillas pegados a la tabla que filtran (ley de Brandon 09-19,
 * punto 5). Ancha = tabla; angosta = lista (el bloque es su propio container:
 * una tabla dentro de un `AdminModal` en portal no colapsa a tarjetas sola).
 */

import { useMemo, useState } from "react";
import { Layers, QrCode } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  ESTADOS_TROZA,
  ROTULO_ESTADO_TROZA,
  estadoDeTroza,
  type EstadoTrozaFicha,
  type ResumenTrozas,
} from "@/lib/forestal/ficha-guia-resumen";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatDate } from "../ctp-shared";
import { CtpPaginacion, FilaVacia, TablaCtp, TbodyCtp, TheadCtp, usePaginacion } from "../ctp-tabla";
import type { TrozaDeFicha } from "../CtpGuiaFichaModal";
import { diaCorto } from "../costo-guia/comun";
import { BloqueCargando, BloqueFicha, Pastilla, type Tono } from "./comun";

const TONO_ESTADO: Record<EstadoTrozaFicha, Tono> = {
  en_patio: "exito",
  sin_recibir: "neutro",
  aserrada: "info",
  despachada: "marca",
  retrozada: "info",
  no_llego: "aviso",
  descarte: "neutro",
};

const medidas = (t: TrozaDeFicha) => (t.d1Cm && t.d2Cm && t.largoM ? `${t.d1Cm}×${t.d2Cm} cm · ${t.largoM} m` : "—");
const m3 = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? fmtM3(n) : "—";
};

function EstadoCelda({ t }: { t: TrozaDeFicha }) {
  const e = estadoDeTroza(t);
  return (
    <span className="inline-flex items-center gap-1.5">
      <Pastilla tono={TONO_ESTADO[e]} tam="sm">
        {ROTULO_ESTADO_TROZA[e]}
      </Pastilla>
      {t.etiquetadaEn && (
        <span title={`Etiqueta impresa el ${formatDate(t.etiquetadaEn)}`} className="text-[var(--accent-ink)]">
          <QrCode className="h-4 w-4" aria-hidden />
          <span className="sr-only">etiquetada</span>
        </span>
      )}
    </span>
  );
}

/** Pastilla-filtro: `aria-pressed`, con su cuenta. */
function Filtro({ activo, onClick, children, n }: { activo: boolean; onClick: () => void; children: React.ReactNode; n: number }) {
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
      <span className="font-mono text-xs tabular-nums opacity-80">{n}</span>
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
}: {
  trozas: TrozaDeFicha[] | null;
  resumen: ResumenTrozas | null;
  /** id de troza → especie de la fila donde cuelga, si es de otra (ADR-435). */
  enOtraFila: Map<string, string>;
  especies: string[];
  indice: number;
  className?: string;
}) {
  const [estado, setEstado] = useState<EstadoTrozaFicha | null>(null);
  const [especie, setEspecie] = useState<string | null>(null);
  const [verTodas, setVerTodas] = useState(false);

  const filtradas = useMemo(
    () =>
      (trozas ?? []).filter(
        (t) => (estado == null || estadoDeTroza(t) === estado) && (especie == null || (t.especieComun ?? "") === especie),
      ),
    [trozas, estado, especie],
  );
  const { visibles, rango, porPagina, setPorPagina, ir } = usePaginacion(filtradas);
  const filas = verTodas ? filtradas : visibles;
  const numero = (i: number) => (verTodas ? i + 1 : rango.inicio + i + 1);
  const porEspecie = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of trozas ?? []) m.set(t.especieComun ?? "", (m.get(t.especieComun ?? "") ?? 0) + 1);
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
          example="Toca «En patio» para ver las que faltan etiquetar antes de moverlas."
        />
      }
      extra={
        resumen ? (
          <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
            <span className="font-semibold text-[var(--text-tertiary)]">{resumen.total} ·</span> {fmtM3(resumen.m3)} m³
          </span>
        ) : undefined
      }
    >
      {trozas == null ? (
        <BloqueCargando filas={5} />
      ) : trozas.length === 0 ? (
        <p className="py-2 text-sm text-[var(--text-secondary)]">Esta guía no tiene trozas cargadas.</p>
      ) : (
        <div className="@container/trozas space-y-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
            <Filtro activo={estado == null} onClick={() => setEstado(null)} n={trozas.length}>
              Todas
            </Filtro>
            {ESTADOS_TROZA.filter((e) => (resumen?.porEstado[e.clave] ?? 0) > 0).map((e) => (
              <Filtro key={e.clave} activo={estado === e.clave} onClick={() => setEstado(estado === e.clave ? null : e.clave)} n={resumen?.porEstado[e.clave] ?? 0}>
                {e.rotulo}
              </Filtro>
            ))}
          </div>
          {especies.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por especie">
              {especies.map((e) => (
                <Filtro key={e} activo={especie === e} onClick={() => setEspecie(especie === e ? null : e)} n={porEspecie.get(e) ?? 0}>
                  {e}
                </Filtro>
              ))}
            </div>
          )}

          {/* Ancha: tabla. */}
          <div className="hidden @min-[34rem]/trozas:block">
            <TablaCtp altoMax="max-h-[26rem]">
              <TheadCtp>
                <tr>
                  <th className="px-3 py-2 font-bold">N°</th>
                  <th className="px-3 py-2 font-bold">Codificación</th>
                  <th className="px-3 py-2 font-bold">Especie</th>
                  <th className="px-3 py-2 font-bold">Medidas</th>
                  <th className="px-3 py-2 text-right font-bold">m³</th>
                  <th className="px-3 py-2 font-bold">Estado</th>
                  <th className="px-3 py-2 font-bold">Llegada</th>
                </tr>
              </TheadCtp>
              <TbodyCtp>
                {filas.length === 0 && <FilaVacia cols={7}>Ninguna troza con ese filtro.</FilaVacia>}
                {filas.map((t, i) => (
                  <tr key={t.id} className="hover:bg-[var(--surface-sunken)]">
                    <td className="px-3 py-2 font-mono tabular-nums text-[var(--text-tertiary)]">{numero(i)}</td>
                    <td className="px-3 py-2">
                      <span className="font-mono font-bold text-[var(--text-primary)]">{t.codificacion ?? "—"}</span>
                      {t.codigoPlanta && <span className="block font-mono text-xs text-[var(--text-tertiary)]">planta {t.codigoPlanta}</span>}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">
                      {t.especieComun ?? "—"}
                      {enOtraFila.has(t.id) && (
                        <span className="ml-1.5 rounded-full bg-[var(--data-warning-500)]/15 px-1.5 text-xs font-bold text-[var(--data-warning-ink)]">
                          en fila {enOtraFila.get(t.id)}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums text-[var(--text-secondary)]">{medidas(t)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-primary)]">{m3(t.volumenM3)}</td>
                    <td className="px-3 py-2">
                      <EstadoCelda t={t} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-sm tabular-nums text-[var(--text-secondary)]">
                      {t.noRecepcionada ? "—" : t.fechaRecepcion ? diaCorto(t.fechaRecepcion) : "sin fechar"}
                    </td>
                  </tr>
                ))}
              </TbodyCtp>
            </TablaCtp>
          </div>

          {/* Angosta: lista. */}
          <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)] @min-[34rem]/trozas:hidden">
            {filas.length === 0 && <li className="px-3 py-3 text-sm text-[var(--text-tertiary)]">Ninguna troza con ese filtro.</li>}
            {filas.map((t, i) => (
              <li key={t.id} className="flex items-start gap-3 px-3 py-2.5">
                <span className="w-6 shrink-0 pt-0.5 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{numero(i)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono font-bold text-[var(--text-primary)]">{t.codificacion ?? "—"}</span>
                    <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{m3(t.volumenM3)} m³</span>
                  </div>
                  <p className="truncate text-sm text-[var(--text-secondary)]">
                    {t.especieComun ?? "—"} · <span className="font-mono text-xs tabular-nums">{medidas(t)}</span>
                  </p>
                  <div className="mt-1">
                    <EstadoCelda t={t} />
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {!verTodas && filtradas.length > rango.fin - rango.inicio && (
            <CtpPaginacion
              rango={rango}
              porPagina={porPagina}
              onPorPagina={setPorPagina}
              onIr={ir}
              sustantivo="troza"
              extra={
                <button type="button" onClick={() => setVerTodas(true)} className="font-bold text-[var(--accent-ink)] underline">
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
