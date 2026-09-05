"use client";

/**
 * CtpResumenPermisoModal — el patio, permiso por permiso (Brandon, 2026-09-01).
 *
 * Un fiscalizador no pregunta «¿cuánto entró en total?» — pregunta «¿cuánto
 * entró CON ESTE título habilitante?». Elegís un N° de permiso y ves su
 * desglose por especie (piezas, m³, pie tablar aserrable aproximado), sin
 * combinarlo con los demás.
 *
 * Desde ahí, «Distribuir esta rolliza» siembra un bloque por cada GTF del
 * permiso en la Distribución de rolliza sobre lo aserrado (Herramientas →
 * Resúmenes → Rolliza) y abre esa pantalla — la GTF y el m³ ya los tiene el
 * Libro, no hay por qué tipearlos de nuevo. La distribución en sí sigue
 * viviendo ahí (bloques persistidos, Anexo 04, export): este modal sólo
 * evita la carga manual.
 *
 * Ronda 2 (Brandon, 2026-09-01): resumen general de TODO el período, elegir
 * varios permisos Y lotes a la vez para distribuir juntos (cada guía sigue
 * siendo su propio bloque — nunca se funden dos permisos en un renglón), un
 * apartado para pegar el código de una cubicación guardada y ver su resumen
 * como «objetivo», y la lista de aserrada ya disponible para compararla
 * contra ese objetivo.
 *
 * Ronda 3 (Brandon, 2026-09-01): el cuadre combina las TRES fuentes contra
 * el objetivo — lo que ya está disponible (aserrada hecha) cuenta directo en
 * m³; la rolliza elegida (permisos + lotes sin aserrar) se convierte a
 * aserrada ESTIMADA al tope de rendimiento (56 %, el mismo coeficiente que
 * usa Consumos/Lotes — nunca un cuarto número inventado).
 *
 * Ronda 4 (Brandon, 2026-09-01): dos correcciones sobre lo de arriba.
 *
 * 1) «Volumen sobrante» de un LOTE son dos cosas distintas según su origen,
 *    y antes sólo se veía una: un lote de trozas armado a mano tiene rolliza
 *    SIN ASERRAR (`volumenLibre`); un lote de apertura de inventario nunca
 *    tuvo trozas reales («declarado directamente») — su «sobrante» es
 *    aserrada YA producida que sigue sin despachar (`salidaDelLote().enPatio`,
 *    la misma cuenta que arma Productos disponibles). Antes el filtro sólo
 *    miraba lotes `status:"abierto"` con rolliza libre, así que los de
 *    inventario —que quedan en `status:"consumido"` porque no hay nada que
 *    aserrar— nunca aparecían. Ahora un lote entra a la lista si tiene
 *    CUALQUIERA de los dos, y cada fila declara cuál es.
 *
 * 2) El objetivo YA se puede partir por tipo comercial (Comercial,
 *    Paquetería larga…) leyendo `objetivo.piezas` con el mismo `agruparPor`
 *    que arma «Composición por tipo» en Resúmenes — es real, no un invento.
 *    Con eso, un producto disponible o un lote de inventario cuyo tipo NO es
 *    de los que pide el objetivo queda con candado: sumarlo declararía un
 *    tipo por otro. La rolliza (permisos + lotes sin aserrar) sigue sin tipo
 *    —se define recién al aserrar— así que entra como pool aparte, sin
 *    candado.
 *
 * Ronda 5 (Brandon, 2026-09-01): el valor de cada lote ahora dice
 * explícitamente «m³ aserrada» o «m³ rolliza» al lado del número —antes
 * había que leer el subtítulo para saber cuál era— y el objetivo se puede
 * elegir de una lista desplegable con TODAS las cubicaciones guardadas
 * (mismo origen que Cubicador de madera → Guardadas), sin tener que ir a
 * copiar el código primero. El código pegado sigue andando igual, para
 * cuando ya se lo tenés a mano.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Layers, Share2 } from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Btn } from "./ctp-shared";
import { slugKey } from "./CubicacionResumenes";
import { TOOL_ONCE_KEY } from "./ForestalHerramientas";
import { FilaSeleccionable, SeccionObjetivo, SeccionResumenPermiso } from "./ctp-resumen-permiso-secciones";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import {
  agruparTrozas,
  especiesDe,
  bloquesDeGuiaDe,
  type TrozaConsumible,
} from "@/lib/forestal/consumo-trozas";
import { esLoteDeInventario, salidaDelLote, volumenLibre, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import { agruparPor } from "@/lib/forestal/cubicacion-resumen";
import { RENDIMIENTO_META, productoDelTipoComercial } from "@/lib/forestal/loctp-catalogos";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";

const nf = (n: number) => n.toLocaleString("es-PE");

/** Sólo lo que este modal necesita de "Productos disponibles" — referencia,
 *  no se toca el resto de la forma real (`CtpProductosDisponibles.tsx`). */
interface CorridaDisponibleMin {
  id: string;
  especie: string | null;
  producto: string | null;
  disponible: number;
  titularOrigen: string[];
}

/** Un bloque de rolliza listo para sembrar, sin `id` (se lo pone quien siembra). */
type CandidatoBloque = { etiqueta: string; especie: string; m3: number; permiso?: string | null };

export default function CtpResumenPermisoModal({
  open,
  onClose,
  trozas,
  lotes,
}: {
  open: boolean;
  onClose: () => void;
  /** TODAS las trozas del período (patio + ya consumidas): un permiso se
   *  describe por lo que entró, no por lo que sigue libre. */
  trozas: TrozaConsumible[];
  /** Lotes de aserrío del tenant — para «traer lo que sobra» de los abiertos. */
  lotes: LoteAserrio[];
}) {
  const [permisoElegido, setPermisoElegido] = useState<string | null>(null);
  const [seleccionMulti, setSeleccionMulti] = useState<Set<string>>(new Set());
  const [seleccionLotes, setSeleccionLotes] = useState<Set<string>>(new Set());
  const [seleccionDisponibles, setSeleccionDisponibles] = useState<Set<string>>(new Set());
  const [lotesElegidos, setLotesElegidos] = useState<Set<string>>(new Set());
  const [disponibles, setDisponibles] = useState<CorridaDisponibleMin[] | null>(null);
  const [cargandoDisponibles, setCargandoDisponibles] = useState(false);

  const [codigoObjetivo, setCodigoObjetivo] = useState("");
  const [objetivo, setObjetivo] = useState<CubicacionRegistro | null>(null);
  const [buscandoObjetivo, setBuscandoObjetivo] = useState(false);
  const [errorObjetivo, setErrorObjetivo] = useState<string | null>(null);
  /** Todas las cubicaciones guardadas del tenant — se buscan UNA vez y las
   *  usan tanto el desplegable «elegir de la lista» como el código pegado a
   *  mano, para no repetir el fetch (Brandon, 2026-09-01). */
  const [cubicacionesGuardadas, setCubicacionesGuardadas] = useState<CubicacionRegistro[] | null>(null);
  const [cargandoCubicaciones, setCargandoCubicaciones] = useState(false);

  const grupos = useMemo(() => agruparTrozas(trozas, "permiso"), [trozas]);
  const grupo = useMemo(() => grupos.find((g) => g.clave === permisoElegido) ?? null, [grupos, permisoElegido]);
  const especies = useMemo(() => (grupo ? especiesDe(grupo.trozas) : []), [grupo]);
  const ptTotal = useMemo(() => especies.reduce((a, e) => a + e.ptAserrable, 0), [especies]);

  /** El total de TODO el período, sin combinar permisos entre sí — sólo suma
   *  lo que cada uno ya reporta individualmente. */
  const totalGeneral = useMemo(
    () => grupos.reduce((a, g) => ({ piezas: a.piezas + g.piezas, volumenM3: a.volumenM3 + g.volumenM3 }), { piezas: 0, volumenM3: 0 }),
    [grupos],
  );

  /**
   * Un lote entra si tiene rolliza sin aserrar (`rollizaSobranteM3`, se puede
   * distribuir) O aserrada ya producida sin despachar (`aserradaSobranteM3`,
   * cuenta directo como «ya disponible» — NUNCA se siembra como bloque de
   * rolliza, sería declarar aserrada como si fuera troza). Casi nunca las
   * dos a la vez, pero se calculan las dos por si acaso.
   */
  const lotesConSobra = useMemo(() => {
    return lotes
      .map((l) => {
        const salida = salidaDelLote(l);
        return {
          lote: l,
          rollizaSobranteM3: volumenLibre(l),
          aserradaSobranteM3: salida?.enPatio ?? 0,
          productoAserrada: l.produccion?.productType ?? null,
        };
      })
      .filter((x) => x.rollizaSobranteM3 > 1e-4 || x.aserradaSobranteM3 > 1e-4);
  }, [lotes]);
  /** Sólo los que tienen rolliza SIN aserrar — la única fuente válida para
   *  sembrar bloques (step de un permiso: «Traer rolliza de lotes abiertos»). */
  const lotesConRollizaSobrante = useMemo(
    () => lotesConSobra.filter((x) => x.rollizaSobranteM3 > 1e-4).map((x) => x.lote),
    [lotesConSobra],
  );

  /** El objetivo partido por tipo comercial, leyendo sus piezas reales con el
   *  MISMO agrupador que usa «Composición por tipo» en Resúmenes — nunca un
   *  desglose inventado. */
  const objetivoPorTipo = useMemo(() => {
    if (!objetivo || objetivo.piezas.length === 0) return [];
    const { grupos } = agruparPor(objetivo.piezas, "tipo");
    return grupos.map((g) => ({
      tipo: g.label,
      piezas: g.cantidad,
      m3: g.m3,
      pieTablar: g.pieTablar,
      producto: productoDelTipoComercial(g.clave),
    }));
  }, [objetivo]);
  const productosNecesarios = useMemo(
    () => new Set(objetivoPorTipo.map((g) => g.producto).filter((p): p is string => p != null)),
    [objetivoPorTipo],
  );
  /** `null` = el objetivo no distingue tipos (o no hay objetivo): no bloquear nada. */
  function tipoBloqueado(producto: string | null): boolean {
    if (!objetivo || productosNecesarios.size === 0 || !producto) return false;
    return !productosNecesarios.has(producto);
  }

  /* La lista se resetea cada vez que se cierra el modal, y los lotes elegidos
     cada vez que se cambia de permiso — elegir un lote para un permiso no
     debería arrastrarse en silencio al siguiente. */
  useEffect(() => { setLotesElegidos(new Set()); }, [permisoElegido]);

  /* Se busca una sola vez por apertura: es la misma foto completa que usa la
     pestaña Productos disponibles (ADR-316), sin filtro de período — la
     rolliza de este permiso puede haber producido aserrada hace meses. */
  useEffect(() => {
    if (!open || disponibles != null || cargandoDisponibles) return;
    setCargandoDisponibles(true);
    ctpGet<{ corridas?: CorridaDisponibleMin[] }>("/api/admin/forestal/ctp?disponibles=1")
      .then((r) => setDisponibles(r.corridas ?? []))
      .catch(() => setDisponibles([]))
      .finally(() => setCargandoDisponibles(false));
  }, [open, disponibles, cargandoDisponibles]);

  const disponibleDelPermiso = useMemo(() => {
    if (!disponibles || !grupo) return 0;
    return disponibles
      .filter((c) => c.titularOrigen.includes(grupo.clave))
      .reduce((a, c) => a + (Number(c.disponible) || 0), 0);
  }, [disponibles, grupo]);

  const disponiblesOrdenados = useMemo(
    () => [...(disponibles ?? [])].filter((c) => c.disponible > 1e-4).sort((a, b) => b.disponible - a.disponible),
    [disponibles],
  );
  const totalDisponiblesElegidos = useMemo(
    () => disponiblesOrdenados.filter((c) => seleccionDisponibles.has(c.id)).reduce((a, c) => a + c.disponible, 0),
    [disponiblesOrdenados, seleccionDisponibles],
  );

  /** Trae la lista completa una sola vez — el desplegable la necesita apenas
   *  se abre el apartado, no recién al tocar «Buscar». */
  async function cargarCubicacionesGuardadas(): Promise<CubicacionRegistro[]> {
    if (cubicacionesGuardadas) return cubicacionesGuardadas;
    setCargandoCubicaciones(true);
    try {
      const r = await fetch("/api/admin/forestal/cubicaciones", { credentials: "include", cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { cubicaciones?: CubicacionRegistro[] };
      const lista = j.cubicaciones ?? [];
      setCubicacionesGuardadas(lista);
      return lista;
    } finally {
      setCargandoCubicaciones(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void cargarCubicacionesGuardadas().catch(() => setCubicacionesGuardadas([]));
    // Sólo al abrir — cargarCubicacionesGuardadas ya evita repetir el fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function buscarObjetivo() {
    const codigo = codigoObjetivo.trim();
    if (!codigo) return;
    setBuscandoObjetivo(true);
    setErrorObjetivo(null);
    try {
      const lista = await cargarCubicacionesGuardadas();
      const hallada = lista.find((c) => c.id === codigo);
      if (!hallada) {
        setObjetivo(null);
        setErrorObjetivo("No se encontró ninguna cubicación guardada con ese código.");
        return;
      }
      setObjetivo(hallada);
    } catch (e) {
      setErrorObjetivo(e instanceof Error ? e.message : "No se pudo buscar el código.");
    } finally {
      setBuscandoObjetivo(false);
    }
  }

  /** Elegida de la lista desplegable — mismo resultado que pegar su código,
   *  sin tener que ir a copiarlo primero. */
  function elegirObjetivoPorId(id: string) {
    if (!id) return;
    const hallada = (cubicacionesGuardadas ?? []).find((c) => c.id === id);
    if (!hallada) return;
    setObjetivo(hallada);
    setCodigoObjetivo(hallada.id);
    setErrorObjetivo(null);
  }

  function cerrar() {
    onClose();
    // El próximo permiso arranca en la lista, no en el último que se miró.
    setTimeout(() => {
      setPermisoElegido(null);
      setSeleccionMulti(new Set());
      setSeleccionLotes(new Set());
      setSeleccionDisponibles(new Set());
    }, 200);
  }

  function toggleEn(set: Set<string>, clave: string, setter: (s: Set<string>) => void) {
    const s2 = new Set(set);
    if (s2.has(clave)) s2.delete(clave);
    else s2.add(clave);
    setter(s2);
  }

  /**
   * Navegación DURA a propósito: el sidebar admin cambia de módulo por click
   * en su propio estado, no leyendo la URL en cada render — un `router.push`
   * cliente movía la barra de direcciones pero la pantalla se quedaba en
   * Consumo (bug encontrado y corregido acá mismo, Brandon 2026-09-01).
   * `window.location.href` fuerza el remount que sí lee `?tab=`.
   *
   * `candidatos` ya viene con un renglón por guía+especie o por lote: sembrar
   * varios permisos/lotes juntos no los funde — cada uno queda igual de
   * individual que si se hubiera sembrado uno solo.
   */
  function sembrarYAbrir(candidatos: CandidatoBloque[]) {
    try {
      const raw = localStorage.getItem(slugKey("-rolliza"));
      const actuales: BloqueRolliza[] = raw ? JSON.parse(raw) : [];
      const yaCargados = new Set(actuales.map((b) => `${b.etiqueta}::${b.especie}`));
      const nuevos: BloqueRolliza[] = candidatos
        .filter((c) => !yaCargados.has(`${c.etiqueta}::${c.especie}`))
        .map((c, i) => ({
          id: `permiso-${Date.now().toString(36)}-${i}`,
          etiqueta: c.etiqueta,
          especie: c.especie,
          m3: c.m3,
          permiso: c.permiso ?? null,
          origen: "manual" as const,
        }));
      if (nuevos.length > 0) {
        localStorage.setItem(slugKey("-rolliza"), JSON.stringify([...actuales, ...nuevos]));
      }
      localStorage.setItem(slugKey("-vista-resumen"), "rolliza");
      sessionStorage.setItem(TOOL_ONCE_KEY, "resumenes");
    } catch {
      /* localStorage puede fallar (modo privado) — igual navegamos: el
         operario puede cargar los bloques a mano en la pantalla real. */
    }
    window.location.href = "/admin?tab=forestal-herramientas";
  }

  function distribuirPermisoActual() {
    if (!grupo) return;
    const deGuias = bloquesDeGuiaDe(grupo.trozas);
    const deLotes: CandidatoBloque[] = lotesConRollizaSobrante
      .filter((l) => lotesElegidos.has(l.id))
      .map((l) => ({ etiqueta: `Lote ${l.code}`, especie: l.speciesCommon, m3: volumenLibre(l) }));
    sembrarYAbrir([...deGuias, ...deLotes]);
  }

  function distribuirSeleccionMulti() {
    const trozasElegidas = grupos.filter((g) => seleccionMulti.has(g.clave)).flatMap((g) => g.trozas);
    const deGuias = bloquesDeGuiaDe(trozasElegidas);
    // SÓLO la rolliza sin aserrar de los lotes elegidos — la aserrada YA
    // producida (`aserradaSobranteM3`) nunca se siembra como bloque.
    const deLotes: CandidatoBloque[] = lotesConSobra
      .filter((x) => seleccionLotes.has(x.lote.id) && x.rollizaSobranteM3 > 1e-4)
      .map((x) => ({ etiqueta: `Lote ${x.lote.code}`, especie: x.lote.speciesCommon, m3: x.rollizaSobranteM3 }));
    sembrarYAbrir([...deGuias, ...deLotes]);
  }

  const totalMulti = useMemo(
    () => grupos.filter((g) => seleccionMulti.has(g.clave)).reduce((a, g) => a + g.volumenM3, 0),
    [grupos, seleccionMulti],
  );
  const totalLotesRollizaMulti = useMemo(
    () => lotesConSobra.filter((x) => seleccionLotes.has(x.lote.id)).reduce((a, x) => a + x.rollizaSobranteM3, 0),
    [lotesConSobra, seleccionLotes],
  );
  const totalLotesAserradaMulti = useMemo(
    () => lotesConSobra.filter((x) => seleccionLotes.has(x.lote.id)).reduce((a, x) => a + x.aserradaSobranteM3, 0),
    [lotesConSobra, seleccionLotes],
  );
  const hayEleccionParaDistribuir = seleccionMulti.size > 0 || totalLotesRollizaMulti > 1e-4;

  /**
   * El cuadre: las TRES fuentes elegidas, convertidas a la misma unidad
   * (m³ de aserrada), contra el objetivo. La rolliza SIN ASERRAR (permisos +
   * lotes) nunca es aserrada 1:1 — se estima al tope de rendimiento del
   * 56 % (`RENDIMIENTO_META`, el mismo que usan Consumos y Lotes) y se marca
   * SIEMPRE como aproximado. Lo disponible Y la aserrada ya producida de un
   * lote de inventario ya son aserrada real: cuentan directo. Esto
   * RECONCILIA — no reparte sola cuánto sacar de cada uno.
   */
  const yaDisponibleM3 = totalDisponiblesElegidos + totalLotesAserradaMulti;
  const rollizaElegidaM3 = totalMulti + totalLotesRollizaMulti;
  const rollizaAserrableM3 = rollizaElegidaM3 * RENDIMIENTO_META;
  const totalCubiertoM3 = yaDisponibleM3 + rollizaAserrableM3;
  const pctCuadre =
    objetivo && objetivo.totales.m3 > 0 ? Math.min(999, Math.round((totalCubiertoM3 / objetivo.totales.m3) * 100)) : null;
  const faltanteCuadreM3 = objetivo ? Math.max(0, objetivo.totales.m3 - totalCubiertoM3) : 0;
  const sobranteCuadreM3 = objetivo ? Math.max(0, totalCubiertoM3 - objetivo.totales.m3) : 0;

  /** Cuánto de «ya disponible» (elegido) cae en CADA producto — para el
   *  desglose por tipo del cuadre. */
  const yaDisponiblePorProducto = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of disponiblesOrdenados) {
      if (!seleccionDisponibles.has(c.id) || !c.producto) continue;
      m.set(c.producto, (m.get(c.producto) ?? 0) + c.disponible);
    }
    for (const x of lotesConSobra) {
      if (!seleccionLotes.has(x.lote.id) || !x.productoAserrada || x.aserradaSobranteM3 <= 1e-4) continue;
      m.set(x.productoAserrada, (m.get(x.productoAserrada) ?? 0) + x.aserradaSobranteM3);
    }
    return m;
  }, [disponiblesOrdenados, seleccionDisponibles, lotesConSobra, seleccionLotes]);

  return (
    <AdminModal
      open={open}
      onClose={cerrar}
      variant="info"
      icon={Layers}
      title={grupo ? `Permiso ${grupo.clave}` : "Resumen por N° de permiso"}
      description={
        grupo
          ? `${nf(grupo.piezas)} trozas · ${fmtM3(grupo.volumenM3)} m³`
          : "Elegí un permiso o un lote, o pegá un objetivo para compararlo"
      }
    >
      <div className="space-y-4 p-5">
        {!grupo ? (
          grupos.length === 0 && lotesConSobra.length === 0 ? (
            <p className="rounded-xl border-2 border-dashed border-[var(--rule-base)] px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">
              Todavía no hay trozas ingresadas en este período.
            </p>
          ) : (
            <>
              <SeccionObjetivo
                codigo={codigoObjetivo}
                onCodigo={setCodigoObjetivo}
                onBuscar={() => void buscarObjetivo()}
                buscando={buscandoObjetivo}
                error={errorObjetivo}
                objetivo={objetivo}
                cubicaciones={cubicacionesGuardadas}
                cargandoCubicaciones={cargandoCubicaciones}
                onElegir={elegirObjetivoPorId}
              />

              <div className="grid grid-cols-2 gap-3">
                <StatCard density="compact" label="Trozas del período" value={nf(totalGeneral.piezas)} emphasis="neutral" />
                <StatCard density="compact" label="Volumen del período (m³)" value={fmtM3(totalGeneral.volumenM3)} emphasis="success" />
              </div>

              {grupos.length > 0 && (
                <SeccionResumenPermiso titulo="Permisos">
                  <ul className="divide-y divide-[var(--rule-soft)] overflow-hidden rounded-xl border-2 border-[var(--rule-base)]">
                    {grupos.map((g) => (
                      <li key={g.clave} className="flex items-center gap-1 px-2">
                        <input
                          type="checkbox"
                          checked={seleccionMulti.has(g.clave)}
                          onChange={() => toggleEn(seleccionMulti, g.clave, setSeleccionMulti)}
                          aria-label={`Elegir el permiso ${g.clave} para distribuir junto con otros`}
                          className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                        />
                        <button
                          type="button"
                          onClick={() => setPermisoElegido(g.clave)}
                          className="flex flex-1 items-center justify-between gap-3 px-2 py-3 text-left transition-colors hover:bg-[var(--surface-sunken)]"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{g.clave}</span>
                            <span className="text-xs text-[var(--text-tertiary)]">{nf(g.piezas)} trozas</span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                              {fmtM3(g.volumenM3)} m³
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </SeccionResumenPermiso>
              )}

              {lotesConSobra.length > 0 && (
                <SeccionResumenPermiso titulo="Lotes con volumen restante">
                  <p className="text-xs text-[var(--text-tertiary)]">
                    De inventario o de trozas — cualquiera de los dos, o ambos. Un lote de inventario nunca tuvo
                    trozas reales: su sobrante es aserrada YA producida (cuenta como «ya disponible», candado si su
                    tipo no es del objetivo); uno de trozas es rolliza sin aserrar (se distribuye abajo).
                  </p>
                  <ul className="overflow-hidden rounded-xl border-2 border-[var(--rule-base)]">
                    {lotesConSobra.map((x) => {
                      const esInventario = esLoteDeInventario(x.lote);
                      const esRolliza = x.rollizaSobranteM3 > 1e-4;
                      const bloqueado = !esRolliza && tipoBloqueado(x.productoAserrada);
                      return (
                        <FilaSeleccionable
                          key={x.lote.id}
                          checked={seleccionLotes.has(x.lote.id)}
                          onToggle={() => toggleEn(seleccionLotes, x.lote.id, setSeleccionLotes)}
                          disabled={bloqueado}
                          disabledHint={`El objetivo no pide ${x.productoAserrada ?? "este tipo"} — no se puede sumar.`}
                          titulo={x.lote.code}
                          subtitulo={
                            esRolliza
                              ? `${x.lote.speciesCommon} · ${esInventario ? "Inventario" : "De trozas"} · rolliza sin aserrar`
                              : `${x.lote.speciesCommon} · Inventario · ${x.productoAserrada ?? "aserrada"} sin declarar`
                          }
                          valor={`${fmtM3(esRolliza ? x.rollizaSobranteM3 : x.aserradaSobranteM3)} m³ ${esRolliza ? "rolliza" : "aserrada"}`}
                          ariaLabel={`Elegir el lote ${x.lote.code} para distribuir`}
                        />
                      );
                    })}
                  </ul>
                </SeccionResumenPermiso>
              )}

              {disponiblesOrdenados.length > 0 && (
                <SeccionResumenPermiso titulo="Productos disponibles (aserrados, ya producidos)">
                  <p className="text-xs text-[var(--text-tertiary)]">
                    No se suman a la distribución de rolliza — es aserrada YA hecha. Tildá para compararla contra el
                    objetivo de arriba{objetivo ? " (con candado si el tipo no es del objetivo)" : ""}.
                  </p>
                  <ul className="max-h-56 overflow-y-auto overflow-x-hidden rounded-xl border-2 border-[var(--rule-base)]">
                    {disponiblesOrdenados.map((c) => (
                      <FilaSeleccionable
                        key={c.id}
                        checked={seleccionDisponibles.has(c.id)}
                        onToggle={() => toggleEn(seleccionDisponibles, c.id, setSeleccionDisponibles)}
                        disabled={tipoBloqueado(c.producto)}
                        disabledHint={`El objetivo no pide ${c.producto ?? "este tipo"} — no se puede sumar.`}
                        titulo={c.producto ?? "Sin producto"}
                        subtitulo={[c.especie, c.titularOrigen[0]].filter(Boolean).join(" · ") || undefined}
                        valor={`${fmtM3(c.disponible)} m³`}
                        ariaLabel={`Elegir ${c.producto ?? "este producto"} disponible`}
                      />
                    ))}
                  </ul>
                  {seleccionDisponibles.size > 0 && (
                    <p className="text-sm text-[var(--text-secondary)]">
                      <b className="text-[var(--text-primary)]">{fmtM3(totalDisponiblesElegidos)} m³</b> elegidos —
                      ver el cuadre completo (con lotes de inventario) más abajo.
                    </p>
                  )}
                </SeccionResumenPermiso>
              )}

              {objetivo && (
                <div className="space-y-2 rounded-xl border-2 border-[var(--rule-base)] p-3">
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    Cuadre contra el objetivo — {objetivo.nombre}
                  </p>

                  {objetivoPorTipo.length > 0 && (
                    <ul className="space-y-1 rounded-lg bg-[var(--surface-sunken)] p-2">
                      {objetivoPorTipo.map((g) => {
                        const yaDeEsteTipo = g.producto ? (yaDisponiblePorProducto.get(g.producto) ?? 0) : 0;
                        const faltaDeEsteTipo = Math.max(0, g.m3 - yaDeEsteTipo);
                        const listo = faltaDeEsteTipo <= 1e-4;
                        return (
                          <li key={g.tipo} className="flex items-center gap-1.5 text-sm">
                            {listo ? (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--data-success-600)] dark:text-[var(--data-success-500)]" aria-hidden />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]" aria-hidden />
                            )}
                            <b className="text-[var(--text-primary)]">{g.tipo}</b>
                            <span className="font-mono tabular-nums text-[var(--text-tertiary)]">
                              — {fmtM3(g.m3)} m³ objetivo ({g.piezas} pzs) · ya {fmtM3(yaDeEsteTipo)} m³
                              {listo ? " — suficiente" : ` — faltan ${fmtM3(faltaDeEsteTipo)} m³`}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <ul className="space-y-0.5 font-mono text-sm tabular-nums text-[var(--text-secondary)]">
                    <li>
                      Objetivo total: <b className="text-[var(--text-primary)]">{fmtM3(objetivo.totales.m3)} m³</b>{" "}
                      <span className="font-sans text-[var(--text-tertiary)]">
                        ({objetivo.totales.piezas} piezas · {fmtPt(objetivo.totales.pieTablar)} PT)
                      </span>
                    </li>
                    <li>
                      Ya disponible (elegido): <b className="text-[var(--text-primary)]">{fmtM3(yaDisponibleM3)} m³</b>{" "}
                      <span className="font-sans text-[var(--text-tertiary)]">
                        (productos disponibles + aserrada de lotes de inventario)
                      </span>
                    </li>
                    <li>
                      Rolliza elegida sin aserrar (permisos + lotes): <b className="text-[var(--text-primary)]">{fmtM3(rollizaElegidaM3)} m³</b>{" "}
                      <span className="font-sans text-[var(--text-tertiary)]">
                        → ≈{fmtM3(rollizaAserrableM3)} m³ aserrable (56%, aproximado — todavía sin tipo, se define al aserrar)
                      </span>
                    </li>
                  </ul>
                  <p
                    className={`flex items-center gap-1.5 text-sm font-bold ${
                      faltanteCuadreM3 > 1e-4
                        ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                        : "text-[var(--data-success-600)] dark:text-[var(--data-success-500)]"
                    }`}
                  >
                    {faltanteCuadreM3 > 1e-4 ? (
                      <>
                        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                        Faltan {fmtM3(faltanteCuadreM3)} m³ en total para cumplir el objetivo ({pctCuadre}% cubierto entre las tres fuentes).
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                        Cubrís el objetivo en total{sobranteCuadreM3 > 1e-4 ? ` — sobran ≈${fmtM3(sobranteCuadreM3)} m³` : ""}.
                      </>
                    )}
                  </p>
                </div>
              )}

              {hayEleccionParaDistribuir && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-[var(--accent)] bg-primary/5 p-3">
                  <p className="text-sm text-[var(--text-secondary)]">
                    {seleccionMulti.size > 0 && (
                      <>
                        <b className="text-[var(--text-primary)]">{seleccionMulti.size}</b> permiso
                        {seleccionMulti.size === 1 ? "" : "s"}
                      </>
                    )}
                    {seleccionMulti.size > 0 && totalLotesRollizaMulti > 1e-4 ? " y " : ""}
                    {totalLotesRollizaMulti > 1e-4 && (
                      <>lotes con rolliza sin aserrar</>
                    )}{" "}
                    · {fmtM3(rollizaElegidaM3)} m³ — cada guía y cada lote queda en su propio bloque.
                  </p>
                  <Btn variant="primary" size="sm" onClick={distribuirSeleccionMulti}>
                    <Share2 className="h-4 w-4" aria-hidden /> Distribuir seleccionados
                  </Btn>
                </div>
              )}
            </>
          )
        ) : (
          <>
            <button
              type="button"
              onClick={() => setPermisoElegido(null)}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Todos los permisos
            </button>

            <div className="grid grid-cols-3 gap-3">
              <StatCard density="compact" label="Trozas" value={nf(grupo.piezas)} emphasis="neutral" />
              <StatCard density="compact" label="Volumen (m³)" value={fmtM3(grupo.volumenM3)} emphasis="success" />
              <StatCard
                density="compact"
                label="PT aserrable (56%)"
                value={`≈${nf(ptTotal)}`}
                subValue="Aproximado, tope de rendimiento"
                emphasis="neutral"
              />
            </div>

            <div className="overflow-x-auto rounded-xl border-2 border-[var(--rule-base)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                    <th scope="col" className="px-3 py-2 text-left">Especie</th>
                    <th scope="col" className="px-3 py-2 text-right">Piezas</th>
                    <th scope="col" className="px-3 py-2 text-right">M³</th>
                    <th scope="col" className="px-3 py-2 text-right">PT aserrable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule-soft)]">
                  {especies.map((e) => (
                    <tr key={e.especie}>
                      <td className="px-3 py-2 font-bold text-[var(--text-primary)]">{e.especie}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtPiezas(e.piezas)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtM3(e.volumenM3)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">
                        ≈{fmtPt(e.ptAserrable)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] font-bold">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{nf(grupo.piezas)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtM3(grupo.volumenM3)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">≈{nf(ptTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Referencia, NO se mezcla sola con la distribución: es aserrada
                YA producida (de una corrida vieja, quizás de otro lote) — sumarla
                a ciegas a los bloques de esta rolliza declararía dos veces la
                misma madera. Se muestra para que el operario decida a mano. */}
            {cargandoDisponibles ? (
              <p className="text-xs text-[var(--text-tertiary)]">Buscando aserrada disponible de este permiso…</p>
            ) : disponibleDelPermiso > 1e-4 ? (
              <p className="rounded-xl bg-[var(--data-info-500)]/10 px-3 py-2 text-sm text-[var(--text-secondary)]">
                <b className="text-[var(--text-primary)]">{fmtM3(disponibleDelPermiso)} m³</b> de aserrada de este permiso ya
                está disponible (producida, sin despachar) — es referencia, no se agrega sola a la distribución de abajo.
              </p>
            ) : null}

            {lotesConRollizaSobrante.length > 0 && (
              <div className="rounded-xl border-2 border-[var(--rule-base)] p-3">
                <p className="mb-2 text-sm font-bold text-[var(--text-primary)]">
                  Traer rolliza sin aserrar de lotes abiertos
                </p>
                <ul className="space-y-1.5">
                  {lotesConRollizaSobrante.map((l) => (
                    <li key={l.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={lotesElegidos.has(l.id)}
                        onChange={() => toggleEn(lotesElegidos, l.id, setLotesElegidos)}
                        aria-label={`Incluir el lote ${l.code} en la distribución`}
                        className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                      />
                      <span className="text-sm text-[var(--text-secondary)]">
                        <b className="text-[var(--text-primary)]">{l.code}</b> · {l.speciesCommon} ·{" "}
                        {esLoteDeInventario(l) ? "Inventario" : "De trozas"} · {fmtM3(volumenLibre(l))} m³ sin aserrar
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4">
              <p className="mb-3 text-sm text-[var(--text-secondary)]">
                <b className="text-[var(--text-primary)]">Distribución de rolliza sobre lo aserrado:</b> abre
                Herramientas → Resúmenes → Rolliza con un bloque por cada guía de este permiso
                {lotesElegidos.size > 0 ? " y por cada lote tildado arriba" : ""} ya cargado (etiqueta y m³), listo
                para poner días y % aprovechable.
              </p>
              <Btn variant="primary" onClick={distribuirPermisoActual} className="w-full sm:w-auto">
                <Share2 className="h-4 w-4" aria-hidden /> Distribuir esta rolliza sobre lo aserrado
              </Btn>
            </div>
          </>
        )}
      </div>
    </AdminModal>
  );
}
