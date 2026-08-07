"use client";

/**
 * CtpProductosStockModal — «Productos en Stock»: de dónde salen los renglones
 * de la Lista de Productos de una GTF de salida.
 *
 * Es el picker que usa el LO-CTP del SNIFFS: se filtra por plan de manejo, lote,
 * paquete, fecha, especie y producto; se tildan los que van en el camión y se
 * agregan a la guía. Cada fila es un PAQUETE (ADR-349) —lo que existe en la
 * pila— y arrastra la corrida de la que salió, que es lo que después cierra la
 * cadena de custodia (I4/I5).
 *
 * El saldo NO se recalcula acá: viene de `productosDisponibles`, que lo lee de
 * `saldosDeCorridas` (única fuente, ADR-316).
 */

import { useEffect, useMemo, useState } from "react";
import { Boxes, Loader2, PackageOpen, Search } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { TOLERANCIA_M3, r4, uidDeFila, type FilaDespacho } from "@/lib/forestal/despacho-lista";
import { Btn, ModalFooter, productLabel } from "./ctp-shared";
import { CtpPaginacion, FilaVacia, TablaCtp, TbodyCtp, TheadCtp, usePaginacion } from "./ctp-tabla";

interface PaqueteAPI {
  id: string;
  codigo: string;
  producto: string | null;
  presentacion: string | null;
  cantidad: number;
  volumenM3: number;
  espesorCm: number | null;
  anchoCm: number | null;
  largoM: number | null;
}

interface CorridaAPI {
  id: string;
  lineNo: number | null;
  fecha: string;
  especie: string | null;
  especieCientifica: string | null;
  producto: string | null;
  presentacion: string | null;
  unidad: string | null;
  lote: string | null;
  lineaProduccion: string | null;
  gtfOrigen?: string[];
  titularOrigen?: string[];
  disponible: number;
  paquetes: PaqueteAPI[];
}

const CAMPO =
  "h-12 w-full rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";
const CELDA_NUM =
  "h-9 w-24 rounded-lg border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-right font-mono text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

const norm = (v: string | null | undefined) => (v ?? "").toLowerCase().trim();
const dia = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const fmtDia = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) : "—";
const MEDIDA: Record<string, string> = { m3: "Metros cúbicos", pt: "Pies tablares", kg: "Kilogramos", unidad: "Unidades" };

/** Una fila candidata: el paquete con su corrida al lado. */
function filasDeCorridas(corridas: CorridaAPI[]): FilaDespacho[] {
  return corridas.flatMap((c): FilaDespacho[] => {
    const base = {
      corridaId: c.id,
      lineNo: c.lineNo,
      especie: c.especie,
      especieCientifica: c.especieCientifica,
      unidad: c.unidad ?? "m3",
      disponibleCorrida: c.disponible,
      gtfOrigen: c.gtfOrigen ?? [],
      titularOrigen: c.titularOrigen ?? [],
      lote: c.lote,
      linea: c.lineaProduccion,
      fechaProduccion: c.fecha,
    };
    /* Las corridas viejas no tienen paquetes cargados: entran como una fila con
       su saldo. Ocultarlas escondería producto que existe en la pila. */
    if (c.paquetes.length === 0) {
      return [{
        ...base,
        uid: uidDeFila(c.id, null),
        paqueteId: null,
        producto: c.producto,
        codigo: null,
        presentacion: c.presentacion,
        cantidad: 0,
        espesorCm: null, anchoCm: null, largoM: null,
        volumen: r4(c.disponible),
      }];
    }
    return c.paquetes.map((p) => ({
      ...base,
      uid: uidDeFila(c.id, p.id),
      paqueteId: p.id,
      producto: p.producto ?? c.producto,
      codigo: p.codigo,
      presentacion: p.presentacion ?? c.presentacion,
      cantidad: p.cantidad,
      espesorCm: p.espesorCm, anchoCm: p.anchoCm, largoM: p.largoM,
      /* Un paquete no puede sacar más de lo que le queda a su corrida: si ya
         salió parte, el tope es el saldo, no lo que el paquete pesó al nacer. */
      volumen: r4(Math.min(p.volumenM3, c.disponible)),
    }));
  });
}

export default function CtpProductosStockModal({
  yaElegidos,
  presetProducto,
  presetEspecie,
  onAgregar,
  onCerrar,
}: {
  /** uids que ya están en la lista de la guía: no se ofrecen dos veces. */
  yaElegidos: ReadonlySet<string>;
  presetProducto?: string | null;
  presetEspecie?: string | null;
  onAgregar: (filas: FilaDespacho[]) => void;
  onCerrar: () => void;
}) {
  const [filas, setFilas] = useState<FilaDespacho[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [plan, setPlan] = useState("");
  const [lote, setLote] = useState("");
  const [texto, setTexto] = useState("");
  const [fecha, setFecha] = useState("");
  const [especie, setEspecie] = useState(presetEspecie ?? "");
  const [producto, setProducto] = useState(presetProducto ?? "");

  /** Lo tildado + lo editado a mano, por uid (sobrevive al cambio de filtro). */
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, { cantidad?: number; volumen?: number }>>({});

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    /* Sin período: el stock es lo que HAY hoy en la planta, no lo que se
       produjo en el mes que se está mirando en el libro. */
    ctpGet<{ corridas?: CorridaAPI[] }>("/api/admin/forestal/ctp?disponibles=1")
      .then((r) => {
        if (!vivo) return;
        const nuevas = filasDeCorridas(r.corridas ?? []);
        setFilas(nuevas);
        setError(null);
        /* El preset llega de Saldos con la escritura del libro ("Madera
           aserrada") y el filtro compara contra la del catálogo ("MADERA
           ASERRADA"): sin canonizarlo, el atajo abría la pila vacía sin decir
           por qué. Si no existe entre lo disponible, se ignora — mejor la lista
           completa que una pantalla en blanco. */
        if (presetProducto) setProducto(nuevas.map((f) => f.producto ?? "").find((p) => norm(p) === norm(presetProducto)) ?? "");
        if (presetEspecie) setEspecie(nuevas.map((f) => f.especie ?? "").find((e) => norm(e) === norm(presetEspecie)) ?? "");
      })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [presetProducto, presetEspecie]);

  const opciones = useMemo(() => {
    const unicos = (vals: (string | null | undefined)[]) => [...new Set(vals.map((v) => (v ?? "").trim()).filter(Boolean))].sort();
    return {
      planes: unicos(filas.flatMap((f) => f.titularOrigen)),
      lotes: unicos(filas.map((f) => f.lote)),
      especies: unicos(filas.map((f) => f.especie)),
      productos: unicos(filas.map((f) => f.producto)),
    };
  }, [filas]);

  const visibles = useMemo(() => {
    const q = norm(texto);
    return filas.filter((f) => {
      if (yaElegidos.has(f.uid)) return false;
      if (plan && !f.titularOrigen.some((t) => norm(t) === norm(plan))) return false;
      if (lote && norm(f.lote) !== norm(lote)) return false;
      if (especie && norm(f.especie) !== norm(especie)) return false;
      if (producto && norm(f.producto) !== norm(producto)) return false;
      if (fecha && dia(f.fechaProduccion) !== fecha) return false;
      if (q && ![f.codigo, ...f.gtfOrigen, f.lote, f.especie].some((v) => norm(v).includes(q))) return false;
      return true;
    });
  }, [filas, yaElegidos, plan, lote, especie, producto, fecha, texto]);

  const { visibles: enPagina, rango, porPagina, setPorPagina, ir } = usePaginacion(visibles, { porPaginaInicial: 25 });

  /** La fila con lo que el operador editó encima. */
  const conEdits = (f: FilaDespacho): FilaDespacho => ({ ...f, ...edits[f.uid] });

  const seleccionadas = useMemo(
    () => visibles.filter((f) => elegidas.has(f.uid)).map(conEdits),
    // `conEdits` cierra sobre `edits`: es lo que cambia de verdad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibles, elegidas, edits],
  );
  /* Se avisa acá y no al guardar: pedirle a una corrida más de lo que le queda
     es el error que el backend rechaza (I5) después de media guía cargada. */
  const excedidas = useMemo(() => {
    const porCorrida = new Map<string, number>();
    for (const f of seleccionadas) porCorrida.set(f.corridaId, r4((porCorrida.get(f.corridaId) ?? 0) + (f.volumen || 0)));
    return new Set(
      seleccionadas.filter((f) => (porCorrida.get(f.corridaId) ?? 0) - f.disponibleCorrida > TOLERANCIA_M3).map((f) => f.uid),
    );
  }, [seleccionadas]);

  const totalElegido = r4(seleccionadas.reduce((a, f) => a + (f.volumen || 0), 0));
  const puedeAgregar = seleccionadas.length > 0 && excedidas.size === 0 && seleccionadas.every((f) => f.volumen > 0);

  function alternar(uid: string) {
    setElegidas((prev) => {
      const s = new Set(prev);
      if (s.has(uid)) s.delete(uid); else s.add(uid);
      return s;
    });
  }
  function editar(uid: string, campo: "cantidad" | "volumen", valor: string) {
    const n = Number(valor.replace(",", "."));
    setEdits((prev) => ({ ...prev, [uid]: { ...prev[uid], [campo]: Number.isFinite(n) ? n : 0 } }));
    // Editar una fila es querer llevarla: se tilda sola, como en el SNIFFS.
    setElegidas((prev) => (prev.has(uid) ? prev : new Set(prev).add(uid)));
  }

  const todasEnPagina = enPagina.length > 0 && enPagina.every((f) => elegidas.has(f.uid));

  return (
    <AdminModal
      open
      onClose={onCerrar}
      variant="wide"
      title="Productos en stock"
      description="Lo aserrado que sigue en la planta: elegí qué sube al camión y con qué cantidad"
      icon={Boxes}
      className="sm:w-[min(96vw,100rem)] sm:max-w-none"
      footer={
        <ModalFooter
          error={error}
          nota={
            seleccionadas.length > 0 ? (
              <span>
                <b className="text-[var(--text-primary)]">{seleccionadas.length}</b> elegido{seleccionadas.length === 1 ? "" : "s"} ·{" "}
                <span className="font-mono tabular-nums">{totalElegido.toFixed(4)} m³</span>
                {excedidas.size > 0 && <span className="ml-2 font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">Hay filas que superan el saldo de su corrida</span>}
              </span>
            ) : (
              <span>{visibles.length} producto{visibles.length === 1 ? "" : "s"} en la pila</span>
            )
          }
        >
          <Btn variant="ghost" onClick={onCerrar}>Cerrar</Btn>
          <Btn variant="primary" disabled={!puedeAgregar} onClick={() => { onAgregar(seleccionadas); onCerrar(); }}>
            Agregar productos{seleccionadas.length > 0 ? ` (${seleccionadas.length})` : ""}
          </Btn>
        </ModalFooter>
      }
    >
      <div className="space-y-3 px-5 py-4 sm:px-6">
        {/* Los seis filtros del formato, en el mismo orden. */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-6">
          <Filtro label="Plan de manejo de origen">
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className={CAMPO}>
              <option value="">Todos los planes</option>
              {opciones.planes.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Filtro>
          <Filtro label="Lote de producción">
            <select value={lote} onChange={(e) => setLote(e.target.value)} className={CAMPO}>
              <option value="">Todos los lotes</option>
              {opciones.lotes.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </Filtro>
          <Filtro label="Paquete / GTF de origen">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
              <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar…" className={`${CAMPO} pl-9`} />
            </div>
          </Filtro>
          <Filtro label="Fecha de producción">
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
          </Filtro>
          <Filtro label="Especie">
            <select value={especie} onChange={(e) => setEspecie(e.target.value)} className={CAMPO}>
              <option value="">Todas</option>
              {opciones.especies.map((e2) => <option key={e2} value={e2}>{e2}</option>)}
            </select>
          </Filtro>
          <Filtro label="Producto">
            <select value={producto} onChange={(e) => setProducto(e.target.value)} className={CAMPO}>
              <option value="">Todos</option>
              {opciones.productos.map((p) => <option key={p} value={p}>{productLabel(p)}</option>)}
            </select>
          </Filtro>
        </div>

        <TablaCtp altoMax="max-h-[52vh]">
          <TheadCtp>
            <tr>
              <th className="px-2 py-2">
                <input
                  type="checkbox"
                  checked={todasEnPagina}
                  onChange={() =>
                    setElegidas((prev) => {
                      const s = new Set(prev);
                      for (const f of enPagina) { if (todasEnPagina) s.delete(f.uid); else s.add(f.uid); }
                      return s;
                    })
                  }
                  aria-label="Elegir todos los de esta página"
                  className="h-4 w-4 accent-[var(--accent)]"
                />
              </th>
              <th className="px-3 py-2 font-bold">GTF origen</th>
              <th className="px-3 py-2 font-bold">Titular de origen</th>
              <th className="px-3 py-2 font-bold">Producción</th>
              <th className="px-3 py-2 font-bold">Lote</th>
              <th className="px-3 py-2 font-bold">Paquete</th>
              <th className="px-3 py-2 font-bold">Línea</th>
              <th className="px-3 py-2 font-bold">Especie</th>
              <th className="px-3 py-2 font-bold">Producto</th>
              <th className="px-3 py-2 text-right font-bold">Esp. (cm)</th>
              <th className="px-3 py-2 text-right font-bold">Ancho (cm)</th>
              <th className="px-3 py-2 text-right font-bold">Largo (m)</th>
              <th className="px-3 py-2 text-right font-bold">Cantidad</th>
              <th className="px-3 py-2 font-bold">Presentación</th>
              <th className="px-3 py-2 text-right font-bold">Volumen</th>
              <th className="px-3 py-2 font-bold">Medida</th>
            </tr>
          </TheadCtp>
          <TbodyCtp>
            {enPagina.length === 0 && (
              <FilaVacia cols={16}>
                {cargando ? (
                  <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Leyendo la planta…</span>
                ) : filas.length === 0 ? (
                  "No hay producto disponible: todo lo aserrado ya salió o todavía no se declaró ninguna producción."
                ) : (
                  "Ningún producto coincide con los filtros (los que ya están en la lista no se ofrecen otra vez)."
                )}
              </FilaVacia>
            )}
            {enPagina.map((base) => {
              const f = conEdits(base);
              const elegida = elegidas.has(f.uid);
              const excede = excedidas.has(f.uid);
              return (
                <tr
                  key={f.uid}
                  className={
                    excede
                      ? "bg-[var(--data-error-500)]/10"
                      : elegida
                        ? "bg-[var(--data-success-500)]/10"
                        : "hover:bg-[var(--surface-sunken)]"
                  }
                >
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={elegida}
                      onChange={() => alternar(f.uid)}
                      aria-label={`Elegir ${f.codigo ?? `corrida #${f.lineNo ?? ""}`}`}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">{f.gtfOrigen.join(" · ") || "—"}</td>
                  <td className="max-w-[16rem] px-3 py-2 text-xs text-[var(--text-secondary)]">{f.titularOrigen.join(" · ") || "—"}</td>
                  <td className="px-3 py-2 text-xs tabular-nums text-[var(--text-secondary)]">
                    {fmtDia(f.fechaProduccion)}
                    <div className="font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">#{f.lineNo ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">{f.lote ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-sm font-bold text-[var(--text-primary)]">{f.codigo ?? <span className="font-sans font-normal text-[var(--text-tertiary)]">sin paquete</span>}</td>
                  <td className="px-3 py-2 font-mono text-xs text-[var(--text-tertiary)]">{f.linea ?? "—"}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{f.especie ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">{productLabel(f.producto ?? "")}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{f.espesorCm ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{f.anchoCm ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{f.largoM ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number" min="0" step="1" value={f.cantidad}
                      onChange={(e) => editar(f.uid, "cantidad", e.target.value)}
                      aria-label={`Cantidad de ${f.codigo ?? "la corrida"}`}
                      className={CELDA_NUM}
                    />
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--text-tertiary)]">{f.presentacion ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number" min="0" step="0.0001" value={f.volumen}
                      onChange={(e) => editar(f.uid, "volumen", e.target.value)}
                      aria-label={`Volumen de ${f.codigo ?? "la corrida"}`}
                      className={`${CELDA_NUM} ${excede ? "border-[var(--data-error-500)]" : ""}`}
                    />
                    <div className="mt-0.5 font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                      saldo {f.disponibleCorrida.toFixed(4)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--text-tertiary)]">{MEDIDA[f.unidad] ?? f.unidad}</td>
                </tr>
              );
            })}
          </TbodyCtp>
        </TablaCtp>

        {visibles.length > 0 && (
          <CtpPaginacion
            rango={rango}
            porPagina={porPagina}
            onPorPagina={setPorPagina}
            onIr={ir}
            sustantivo="producto"
            extra={<span className="inline-flex items-center gap-1.5"><PackageOpen className="h-3.5 w-3.5" /> el saldo es de la corrida, no del paquete</span>}
          />
        )}
      </div>
    </AdminModal>
  );
}

function Filtro({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">{label}</span>
      {children}
    </label>
  );
}
