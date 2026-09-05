"use client";

/**
 * Cubicar un producto que ya está en el libro (ADR-368).
 *
 * El cubicador grande mide madera en el aire: se dicta una pila y sale su pie
 * tablar. Acá se mide **contra un asiento**: la corrida ya declaró un tipo, una
 * especie, una cantidad y un volumen, y lo que la cinta diga tiene que cuadrar
 * con eso — porque los dos papeles viajan juntos y el que los cruza es un
 * fiscalizador.
 *
 * Comparte con el cubicador lo que importa: las MISMAS fórmulas (`cubicarPieza`,
 * `tipoDePieza`), las mismas celdas tipo Excel y el mismo lugar donde se guarda
 * (`/api/admin/forestal/cubicaciones`, con `ctpEntryId` apuntando a la corrida).
 * No duplica el dictado por voz ni la importación de Excel: eso vive en la
 * herramienta, y una segunda copia de 2000 líneas divergiría a la primera semana.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Check, FileText, Loader2, Plus, Save, Trash2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { ESPECIES_MADERA, cubicarPieza, type PiezaCubicada, type Unidad } from "@/lib/forestal/cubicacion";
import { ORDEN_TIPO, tipoDePieza, type TipoComercial } from "@/lib/forestal/cubicacion-tipo";
import {
  cuadrarConLibro,
  cuadrarConjunto,
  tonoGeneral,
  type FilaDeclarada,
} from "@/lib/forestal/cubicacion-cuadre";
import { hoyISO, type CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { useCubicacionesGuardadas } from "@/hooks/use-cubicaciones-guardadas";
import { CeldaNum, useTecladoGrilla } from "./celdas-excel";
import { TipoSelect } from "./tipo-badge";
import Anexo04Modal from "./Anexo04Modal";
import { Btn, I, ModalBody, ModalFooter } from "./ctp-shared";
import { FilaVacia, TablaCtp, TbodyCtp, TheadCtp } from "./ctp-tabla";

/** Una fila de la grilla: lo tipeado vive como texto hasta que se cubica. */
interface FilaCubicada {
  id: string;
  cantidad: string;
  espesor: string;
  ancho: string;
  largo: string;
  uEspesor: Unidad;
  uAncho: Unidad;
  uLargo: Unidad;
  especie: string;
  /** Tipo forzado a mano; vacío = lo decide la medida. */
  tipoManual: TipoComercial | "";
}

const GRILLA = "cubicar-producto";
const nuevaFila = (base?: Partial<FilaCubicada>): FilaCubicada => ({
  id: `f-${Math.round(performance.now() * 1000)}-${Math.random().toString(36).slice(2, 7)}`,
  cantidad: "",
  espesor: "",
  ancho: "",
  largo: "",
  uEspesor: "pulg",
  uAncho: "pulg",
  uLargo: "pies",
  especie: "",
  tipoManual: "",
  ...base,
});

const n = (v: string) => Number(String(v).replace(",", ".")) || 0;
const fmtPt = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** La fila, ya medida. `null` si todavía no tiene las tres dimensiones. */
function cubicar(f: FilaCubicada): PiezaCubicada | null {
  const cantidad = n(f.cantidad) || 1;
  const espesor = n(f.espesor);
  const ancho = n(f.ancho);
  const largo = n(f.largo);
  if (!(espesor > 0 && ancho > 0 && largo > 0)) return null;
  const { pieTablar, m3 } = cubicarPieza({
    cantidad, espesor, ancho, largo,
    uEspesor: f.uEspesor, uAncho: f.uAncho, uLargo: f.uLargo,
  });
  return {
    id: f.id, cantidad, espesor, ancho, largo,
    uEspesor: f.uEspesor, uAncho: f.uAncho, uLargo: f.uLargo,
    especie: f.especie || undefined,
    tipo: f.tipoManual || undefined,
    pieTablar, m3,
  };
}

export default function CtpCubicarProductoModal({
  filas: declaradas,
  ctpEntryIds,
  titulo,
  onClose,
  onGuardada,
}: {
  /**
   * Las filas del libro contra las que se cuadra. Una sola (el paquete de esa
   * fila) o el conjunto tildado: un camión se cubica entero y tiene que cuadrar
   * contra los N paquetes que van a salir, no contra uno (ADR-369).
   */
  filas: FilaDeclarada[];
  /** Corridas a las que queda ligada la cubicación (el hilo al Libro). */
  ctpEntryIds: string[];
  titulo: string;
  onClose: () => void;
  onGuardada: (mensaje: string, registro?: CubicacionRegistro) => void;
}) {
  /** Cuando se cuadra contra UNA sola fila se puede además mirar su tipo. */
  const unica = declaradas.length === 1 ? declaradas[0] : null;
  /* Si todo lo elegido es de la misma especie, la grilla arranca con ella: con
     tres paquetes de Tornillo, pedir la especie fila por fila es pedir que la
     olviden — y una pieza sin especie no cuadra contra nada. */
  const especiesElegidas = [...new Set(declaradas.map((d) => (d.especie ?? "").trim()).filter(Boolean))];
  const especieBase = especiesElegidas.length === 1 ? especiesElegidas[0] : "";
  const [filas, setFilas] = useState<FilaCubicada[]>(() => [nuevaFila({ especie: especieBase })]);
  const [nombre, setNombre] = useState(() =>
    declaradas.length === 1 ? `${declaradas[0].etiqueta} · ${declaradas[0].especie ?? ""}`.trim() : titulo,
  );
  /**
   * Cubicación guardada que se reusa en vez de medir de nuevo (ADR-369).
   *
   * El camión se cubicó ayer y hoy hay que decidir contra qué paquetes cuadra:
   * volver a tipear cuarenta filas para eso sería una segunda medición de la
   * misma madera — y dos mediciones distintas de la misma pila es justo lo que
   * no puede pasar.
   */
  const [cargada, setCargada] = useState<string>("");
  const guardadas = useCubicacionesGuardadas();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forzar, setForzar] = useState(false);
  const [verAnexo, setVerAnexo] = useState(false);

  const piezas = useMemo(() => filas.map(cubicar).filter((p): p is PiezaCubicada => p !== null), [filas]);
  const totales = useMemo(
    () => ({
      piezas: piezas.reduce((a, p) => a + p.cantidad, 0),
      pieTablar: Math.round(piezas.reduce((a, p) => a + p.pieTablar, 0) * 100) / 100,
      m3: Math.round(piezas.reduce((a, p) => a + p.m3, 0) * 10_000) / 10_000,
    }),
    [piezas],
  );
  /** El cuadre se calcula MIENTRAS se mide, no al guardar: enterarse al final es
   *  enterarse cuando ya se tipearon cuarenta filas. */
  const cuadre = useMemo(() => cuadrarConjunto(piezas, declaradas), [piezas, declaradas]);
  /* Sin filas elegidas se está midiendo libre (el botón de Consumos): no hay
     asiento contra el cual cuadrar, así que no se muestra un rojo por algo que
     todavía no se comparó con nada. */
  const libre = declaradas.length === 0;
  /* Contra una sola fila se agrega el cruce del TIPO, que por especie no existe. */
  const avisosTipo = useMemo(
    () => (unica ? cuadrarConLibro(piezas, { producto: unica.producto }).filter((a) => a.campo === "tipo") : []),
    [piezas, unica],
  );
  const avisos = useMemo(
    () => (libre ? [] : [...avisosTipo, ...cuadre.avisos]),
    [libre, avisosTipo, cuadre.avisos],
  );
  const tono = tonoGeneral(avisos.length > 0 ? avisos : [{ campo: "volumen", tono: cuadre.tono, texto: "" }]);
  const hayProblema = avisos.some((a) => a.tono !== "ok");

  const set = (id: string, cambio: Partial<FilaCubicada>) =>
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, ...cambio } : f)));
  const quitar = (id: string) => setFilas((prev) => (prev.length === 1 ? prev : prev.filter((f) => f.id !== id)));
  const teclado = useTecladoGrilla({
    grilla: GRILLA,
    enterSiempreConfirma: false,
    onConfirmar: () => setFilas((prev) => [...prev, nuevaFila({ especie: especieBase })]),
    onEliminarFila: (i) => setFilas((prev) => (prev.length === 1 ? prev : prev.filter((_, k) => k !== i))),
    onDuplicarFila: (i) =>
      setFilas((prev) => {
        const base = prev[i];
        return base ? [...prev.slice(0, i + 1), nuevaFila(base), ...prev.slice(i + 1)] : prev;
      }),
  });

  async function guardar() {
    if (piezas.length === 0) return;
    if (hayProblema && !forzar) {
      setForzar(true);
      setError("Mirá las diferencias de abajo. Si la medición es la correcta, volvé a apretar para guardarla igual.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/cubicaciones", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          /* Reusar una guardada la ACTUALIZA (le agrega las corridas contra las
             que ahora cuadra) en vez de dejar dos copias de la misma medición. */
          ...(cargada ? { id: cargada } : {}),
          nombre: nombre.trim() || "Cubicación del producto",
          fecha: hoyISO(),
          especie: especieBase || undefined,
          /* El hilo al libro: desde el despacho se llega a estas medidas, y el
             ANEXO N° 04 sale con la pieza por pieza que el Libro no guarda. */
          ctpEntryIds,
          notas:
            `Cubicación de ${declaradas.length} registro(s) del libro: ${declaradas.map((d) => d.etiqueta).join(", ").slice(0, 300)}.` +
            (hayProblema ? " Se guardó con diferencias respecto del asiento." : ""),
          piezas: piezas.map((p) => ({
            id: p.id, cantidad: p.cantidad, espesor: p.espesor, ancho: p.ancho, largo: p.largo,
            uEspesor: p.uEspesor, uAncho: p.uAncho, uLargo: p.uLargo, especie: p.especie ?? null,
          })),
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { cubicacion?: CubicacionRegistro; message?: string; error?: string };
      if (!r.ok) throw new Error(j?.message ?? j?.error ?? `El servidor respondió ${r.status}`);
      onGuardada(
        `Cubicación guardada: ${totales.piezas} piezas · ${fmtPt(totales.pieTablar)} pt · ${fmtM3(totales.m3)} m³` +
          (hayProblema ? " (con diferencias respecto del libro)" : ""),
        j.cubicacion,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AdminModal
      open
      onClose={guardando ? () => {} : onClose}
      variant="info"
      icon={FileText}
      title={`Cubicar · ${titulo}`}
      description={
        declaradas.length === 0
          ? "Medí la madera y después tildá en la tabla contra qué registros tiene que cuadrar"
          : `${declaradas.length} registro(s) elegidos · ${cuadre.total.piezasDeclaradas} piezas · ${fmtM3(cuadre.total.m3Declarado)} m³ declarados`
      }
      footer={
        <ModalFooter
          error={error}
          nota={
            <span className="font-mono tabular-nums">
              {totales.piezas} pza · {fmtPt(totales.pieTablar)} pt · {fmtM3(totales.m3)} m³
            </span>
          }
        >
          <Btn variant="secondary" onClick={onClose} disabled={guardando}>Cerrar</Btn>
          <Btn variant="secondary" disabled={piezas.length === 0} onClick={() => setVerAnexo(true)}>
            <FileText className="h-4 w-4" /> ANEXO N° 04
          </Btn>
          <Btn variant="primary" disabled={piezas.length === 0 || guardando} onClick={() => void guardar()}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {forzar && hayProblema ? "Guardar igual" : "Guardar cubicación"}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        {/* El cuadre, arriba: es la razón por la que esta pantalla existe. */}
        {avisos.length > 0 && (
          <ul
            className={`space-y-1 rounded-xl border-2 px-3 py-2 ${
              tono === "error"
                ? "border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10"
                : tono === "aviso"
                  ? "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10"
                  : "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10"
            }`}
          >
            {avisos.map((a) => (
              <li key={a.campo} className="flex items-start gap-2 text-sm">
                {a.tono === "ok" ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden />
                ) : (
                  <AlertTriangle
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      a.tono === "error"
                        ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                        : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                    }`}
                    aria-hidden
                  />
                )}
                <span className={a.tono === "ok" ? "text-[var(--text-secondary)]" : "font-bold text-[var(--text-primary)]"}>
                  {a.texto}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/**
         * El cuadre ESPECIE POR ESPECIE, que es donde vive el error que importa.
         * El total puede cerrar con las especies cruzadas —sobra Tornillo, falta
         * Capirona— y eso en una guía es carga sin amparo.
         */}
        {cuadre.porEspecie.length > 0 && !libre && (
          <TablaCtp>
            <TheadCtp>
              <tr>
                <th className="px-3 py-2 font-bold">Especie</th>
                <th className="px-3 py-2 text-right font-bold">Piezas medidas</th>
                <th className="px-3 py-2 text-right font-bold">Piezas del libro</th>
                <th className="px-3 py-2 text-right font-bold">m³ medidos</th>
                <th className="px-3 py-2 text-right font-bold">m³ del libro</th>
                <th className="px-3 py-2 text-right font-bold">Diferencia</th>
              </tr>
            </TheadCtp>
            <TbodyCtp>
              {cuadre.porEspecie.map((f) => (
                <tr key={f.especie} className="hover:bg-[var(--surface-sunken)]">
                  <td className="px-3 py-2 font-bold text-[var(--text-primary)]">{f.especie}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{f.piezasMedidas}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{f.piezasDeclaradas}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{fmtM3(f.m3Medido)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{fmtM3(f.m3Declarado)}</td>
                  <td
                    className={`px-3 py-2 text-right font-mono font-bold tabular-nums ${
                      f.tono === "ok"
                        ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                        : f.tono === "error"
                          ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                          : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                    }`}
                  >
                    {f.deltaM3 > 0 ? "+" : ""}{fmtM3(f.deltaM3)} m³
                    {f.deltaPiezas !== 0 && (
                      <span className="ml-1 text-xs font-normal">
                        ({f.deltaPiezas > 0 ? "+" : ""}{f.deltaPiezas} pza)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="bg-[var(--surface-sunken)] font-bold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{cuadre.total.piezasMedidas}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{cuadre.total.piezasDeclaradas}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtM3(cuadre.total.m3Medido)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtM3(cuadre.total.m3Declarado)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {cuadre.total.deltaM3 > 0 ? "+" : ""}{fmtM3(cuadre.total.deltaM3)} m³
                </td>
              </tr>
            </TbodyCtp>
          </TablaCtp>
        )}

        {guardadas.lista.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Usar una cubicación ya guardada
            </span>
            <select
              className={I}
              value={cargada}
              onChange={(e) => {
                const id = e.target.value;
                setCargada(id);
                const reg = guardadas.lista.find((c) => c.id === id);
                if (!reg) return;
                /* Las piezas vuelven a la grilla tal como se guardaron: se puede
                   corregir una y el cuadre se recalcula, pero no se re-mide. */
                setFilas(
                  reg.piezas.map((p) => ({
                    id: p.id,
                    cantidad: String(p.cantidad),
                    espesor: String(p.espesor),
                    ancho: String(p.ancho),
                    largo: String(p.largo),
                    uEspesor: p.uEspesor,
                    uAncho: p.uAncho,
                    uLargo: p.uLargo,
                    especie: p.especie ?? "",
                    tipoManual: p.tipo ?? "",
                  })),
                );
                setNombre(reg.nombre);
              }}
            >
              <option value="">Medir de nuevo</option>
              {guardadas.lista.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} · {c.totales.piezas} pza · {fmtM3(c.totales.m3)} m³ · {c.fecha}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Nombre de la cubicación
            </span>
            <input className={I} value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} />
          </label>
          <Btn variant="secondary" onClick={() => setFilas((p) => [...p, nuevaFila({ especie: especieBase })])}>
            <Plus className="h-4 w-4" /> Agregar fila
          </Btn>
        </div>

        {/* La grilla: las mismas celdas del cubicador — Enter agrega, ↑↓ y ←→
            navegan, Ctrl+D duplica y Ctrl+Supr borra. */}
        <div data-grilla={GRILLA}>
          <TablaCtp>
            <TheadCtp>
              <tr>
                <th className="px-2 py-2 text-right font-bold">Cant.</th>
                <th className="px-2 py-2 font-bold">Espesor</th>
                <th className="px-2 py-2 font-bold">Ancho</th>
                <th className="px-2 py-2 font-bold">Largo</th>
                <th className="px-2 py-2 font-bold">Tipo</th>
                <th className="px-2 py-2 font-bold">Especie</th>
                <th className="px-2 py-2 text-right font-bold">Pie tablar</th>
                <th className="px-2 py-2 text-right font-bold">m³</th>
                <th className="px-2 py-2"><span className="sr-only">Quitar</span></th>
              </tr>
            </TheadCtp>
            <TbodyCtp>
              {filas.length === 0 && <FilaVacia cols={9}>Agregá una fila y cargá las medidas.</FilaVacia>}
              {filas.map((f, i) => {
                const p = cubicar(f);
                const auto = p ? tipoDePieza({ ...p, tipo: undefined }) : "Otro";
                return (
                  <tr key={f.id} className="hover:bg-[var(--surface-sunken)]">
                    <td className="px-2 py-1.5 text-right">
                      <CeldaNum valor={f.cantidad} onValor={(v) => set(f.id, { cantidad: v })} fila={i} col={0} onKeyDown={teclado} etiqueta={`Cantidad fila ${i + 1}`} ancho="w-16" placeholder="1" />
                    </td>
                    {(["espesor", "ancho", "largo"] as const).map((dim, k) => (
                      <td key={dim} className="px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          <CeldaNum
                            valor={f[dim]}
                            onValor={(v) => set(f.id, { [dim]: v } as Partial<FilaCubicada>)}
                            fila={i}
                            col={k + 1}
                            onKeyDown={teclado}
                            etiqueta={`${dim} fila ${i + 1}`}
                            ancho="w-16"
                          />
                          <select
                            aria-label={`Unidad de ${dim}, fila ${i + 1}`}
                            value={dim === "espesor" ? f.uEspesor : dim === "ancho" ? f.uAncho : f.uLargo}
                            onChange={(e) =>
                              set(f.id, {
                                [dim === "espesor" ? "uEspesor" : dim === "ancho" ? "uAncho" : "uLargo"]:
                                  e.target.value as Unidad,
                              } as Partial<FilaCubicada>)
                            }
                            className="h-10 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-1 text-xs text-[var(--text-secondary)]"
                          >
                            {(["pulg", "cm", "pies", "m"] as const).map((u) => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                    ))}
                    <td className="px-2 py-1.5">
                      <TipoSelect
                        tipo={f.tipoManual || auto}
                        auto={auto}
                        manual={Boolean(f.tipoManual)}
                        opciones={ORDEN_TIPO}
                        onCambiar={(t) => set(f.id, { tipoManual: t })}
                        etiqueta={`Tipo fila ${i + 1}`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        aria-label={`Especie fila ${i + 1}`}
                        value={f.especie}
                        onChange={(e) => set(f.id, { especie: e.target.value })}
                        className="h-10 w-32 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-1.5 text-sm text-[var(--text-primary)]"
                      >
                        <option value="">Sin especie</option>
                        {ESPECIES_MADERA.map((e) => (
                          <option key={e} value={e}>{e}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                      {p ? fmtPt(p.pieTablar) : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {p ? fmtM3(p.m3) : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => quitar(f.id)}
                        aria-label={`Quitar la fila ${i + 1}`}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--data-error-500)] hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </TbodyCtp>
          </TablaCtp>
        </div>

        <p className="px-1 text-sm text-[var(--text-tertiary)]">
          <b>Enter</b> agrega una fila · <b>↑↓ ←→</b> se mueven por la grilla · <b>Ctrl+D</b> duplica ·{" "}
          <b>Ctrl+Supr</b> borra. El dictado por voz y la importación de Excel están en Herramientas → Cubicador.
        </p>
      </ModalBody>

      {verAnexo && (
        <Anexo04Modal
          rows={piezas}
          especieGlobal={especieBase || undefined}
          ctpEntryId={ctpEntryIds[0]}
          onCerrar={() => setVerAnexo(false)}
        />
      )}
    </AdminModal>
  );
}
