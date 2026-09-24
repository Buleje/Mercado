"use client";

/**
 * Productos disponibles — la madera aserrada que sigue en la planta (ADR-349).
 *
 * El libro sabía cuánto se produjo y cuánto se despachó, pero para saber **qué
 * hay hoy** había que restar dos columnas de dos pantallas distintas. Acá está
 * el resultado: cada corrida con saldo, con sus paquetes —código, presentación y
 * dimensiones— que es como se encuentra el producto en la pila.
 *
 * El saldo NO se calcula acá: lo da `saldosDeCorridas`, la única fuente
 * (ADR-316). Una segunda cuenta sería una segunda verdad.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { leerJson } from "@/lib/errores/sin-dato";
import {
  BookmarkPlus,
  Boxes,
  CheckCircle2,
  Clock,
  Coins,
  Download,
  FileSpreadsheet,
  Layers,
  PackageOpen,
  Pencil,
  RefreshCw,
  RotateCcw,
  Ruler,
  Search,
  TreePine,
  Truck,
  Users,
} from "@buleje/design-system/icons";
import CtpKpi, { DesgloseSimple, type FilaDesglose } from "./CtpKpi";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  ColumnasMenu,
  CtpKpisPlegables,
  IconAction,
  productLabel,
  useColumnasVisibles,
} from "./ctp-shared";
import CtpKpiFiltros from "./CtpKpiFiltros";
import {
  CtpPaginacion,
  FilaVacia,
  TablaCtp,
  TbodyCtp,
  TheadCtp,
  ThOrdenable,
  usePaginacion,
} from "./ctp-tabla";
import CtpPaqueteFicha from "./CtpPaqueteFicha";
import CtpReprocesoModal from "./CtpReprocesoModal";
import ReprocesoSugeridoBanda from "./reproceso-sugerido-banda";
import {
  leerBorradorDeReproceso,
  olvidarBorradorDeReproceso,
  olvidarTodosLosReprocesos,
  pendientesDeReproceso,
  type BorradorDeReproceso,
} from "@/lib/forestal/reproceso-borrador";
import { tipoComercialDelProducto } from "@/lib/forestal/loctp-catalogos";
import CtpCubicarProductoModal from "./CtpCubicarProductoModal";
import CtpDespachoGuiaModal from "./CtpDespachoGuiaModal";
import CtpMarcarUsadoModal from "./CtpMarcarUsadoModal";
import CtpEditarLineaModal, { type LineaEditable } from "./CtpEditarLineaModal";
import CtpEscuadriaPaqueteModal, { type PaqueteAMedir } from "./CtpEscuadriaPaqueteModal";
import {
  guardarEscuadriaDePaquete,
  type EscuadriaAGuardar,
} from "@/lib/forestal/escuadria-guardar";
import { CeldaEscuadria } from "./ctp-celda-escuadria";
import { CeldaApartado } from "./ctp-celda-apartado";
import { AvisosDelStock, type ClaveAviso } from "./ctp-disponibles-avisos";
import {
  compararDisponibles,
  siguienteOrden,
  type CampoOrden,
} from "@/lib/forestal/disponibles-orden";
import CtpApartarModal from "./CtpApartarModal";
import CtpBarraSeleccion from "./ctp-barra-seleccion";
import {
  ETIQUETA_TRAMO,
  TONO_TRAMO,
  edadEnDias,
  fmtEdad,
  resumenDeEdad,
  tramoDeEdad,
  DIAS_VIEJO,
  type TramoEdad,
} from "@/lib/forestal/edad-del-patio";
import {
  resumenDeValor,
  valorDeCorrida,
  valorDeFila,
  type ConsumoCosteable,
  type GuiaCosteable,
  type ValorDeCorrida,
} from "@/lib/forestal/valor-del-patio";
import {
  disponiblesACsv,
  nombreArchivoDisponibles,
  type FilaDisponibleCsv,
} from "@/lib/forestal/disponibles-csv";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import { uidDeFila } from "@/lib/forestal/despacho-lista";
import type { FilaDeclarada } from "@/lib/forestal/cubicacion-cuadre";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { esInventarioDeApertura } from "@/lib/forestal/lotes-aserrio";
import { CampoDeFiltro } from "./ctp-filtros-panel";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { alCambiarApartados } from "@/lib/forestal/apartados-evento";
import { useMiRol } from "@/hooks/use-mi-rol";
import { puedePedir } from "@/lib/auth/roles-rutas-panel";
import { useContratoActivo } from "@/contexts/contrato-activo-context";
import { conContratoId } from "@/lib/forestal/contrato-filtro";

interface PaqueteDisponible {
  id: string;
  codigo: string;
  producto: string | null;
  presentacion: string | null;
  cantidad: number;
  volumenM3: number;
  espesorCm: number | null;
  anchoCm: number | null;
  largoM: number | null;
  observations: string | null;
  /** Reserva viva de ESTE paquete (ADR-418). `null` = libre. */
  apartado: Apartado | null;
}

/** Una reserva viva: la madera sigue en el patio pero ya tiene dueño. */
interface Apartado {
  id: string;
  para: string;
  hasta: string | null;
  nota: string | null;
  creadoAt: string;
}

interface CorridaDisponible {
  id: string;
  lineNo: number | null;
  fecha: string;
  especie: string | null;
  especieCientifica: string | null;
  producto: string | null;
  presentacion: string | null;
  unidad: string | null;
  /** De quién es la madera (ADR-412): "propia" | "tercero" | null. */
  duenoMadera?: string | null;
  titularNombre?: string | null;
  lote: string | null;
  /** `quantity` del asiento — lo que el editor corrige (ADR-401). */
  cantidad: number | null;
  /** `volumeInputM3` del asiento: materia prima que entró a la sierra. */
  volumenConsumidoM3: number | null;
  producido: number;
  despachado: number;
  reprocesado: number;
  disponible: number;
  paquetes: PaqueteDisponible[];
  observations: string | null;
  /** N° de Permiso (código de origen) de los ingresos que alimentaron la
   *  corrida — la corrida no tiene uno propio, hereda el de la madera. */
  titularOrigen: string[];
  /** Las guías de esa madera: es DONDE vive el permiso cuando falta. */
  gtfOrigen: string[];
  /** Marcado a mano como "ya usado" (Brandon, 2026-09-01): `null` = disponible como siempre. */
  usadoAt: string | null;
  usadoMotivo: string | null;
  /** Reserva viva de la corrida entera (fila sin paquete). `null` = libre. */
  apartado?: Apartado | null;
  /** Rendimiento declarado (0..100) — convierte costo de troza a costo de producto. */
  rendimientoPct?: number | null;
  /** Insumos para valorizar el patio (ADR-418). Ver `lib/forestal/valor-del-patio`. */
  costoConsumos?: ConsumoCosteable[];
  costoPorGtf?: GuiaCosteable[];
}

type FilaTabla = { corrida: CorridaDisponible; paquete: PaqueteDisponible | null };

/** La clave de una fila: el paquete si lo hay, la corrida si no. */
/* El mismo `uid` que espera `presetUids` de `CtpDespachoGuiaModal`
   (`corridaId:paqueteId`, o `corridaId:corrida` sin paquete): así lo tildado
   acá entra DIRECTO a la lista de la guía sin traducir un formato por otro. */
const claveFila = (f: FilaTabla) => uidDeFila(f.corrida.id, f.paquete?.id ?? null);

/** El color de la pastilla de edad, por tramo. Clases enteras: ver `CHIP_TONO`. */
const EDAD_TONO: Record<TramoEdad, string> = {
  fresco:
    "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  maduro:
    "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  viejo:
    "bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
};

const nf = (n: number) => formatNumber(n);
const norm = (v: string | null | undefined) => (v ?? "").toLowerCase().trim();

/**
 * «Tornillo» y «TORNILLO» son la MISMA especie (Brandon, 2026-09-08).
 *
 * El filtro ya comparaba normalizado, pero las OPCIONES del desplegable y sus
 * pesos se agrupaban por el texto exacto: salían dos entradas para la misma
 * madera, cada una mostrando la mitad del volumen, y elegir cualquiera de las
 * dos traía el total. Dos opciones que hacen lo mismo y dos números que no
 * cuadran con lo que muestran al elegirlos.
 *
 * `claveEspecie` es la misma que agrupa el resto del libro (quita tildes y el
 * paréntesis del científico), así que «Ishpíngo» e «Ishpingo» también caen
 * juntas. Para el permiso alcanza con la caja y los espacios: un código de
 * título habilitante no lleva tildes, pero sí se tipea con espacios de más.
 */
const clavePermiso = (v: string | null | undefined) =>
  (v ?? "").trim().toUpperCase().replace(/\s+/g, " ");

/**
 * Agrupa por clave y devuelve UN nombre por grupo: el que más veces aparece en
 * el libro. Se muestra tal como está escrito en algún asiento — inventar una
 * forma canónica pondría en pantalla un texto que no está en ninguno.
 */
function agruparPorClave(valores: string[], clave: (v: string) => string): string[] {
  const grupos = new Map<string, Map<string, number>>();
  for (const bruto of valores) {
    const v = (bruto ?? "").trim();
    if (!v) continue;
    const k = clave(v);
    if (!k) continue;
    const cuenta = grupos.get(k) ?? new Map<string, number>();
    cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
    grupos.set(k, cuenta);
  }
  return [...grupos.values()]
    .map(
      (cuenta) =>
        [...cuenta.entries()].sort(
          (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es-PE"),
        )[0][0],
    )
    .sort((a, b) => a.localeCompare(b, "es-PE"));
}

const fmtDia = (iso: string) =>
  formatDate(iso, { soloFecha: true });

/**
 * Columnas OPCIONALES de esta tabla (mismo patrón que Producción/Documentos):
 * Código/Producto/Especie/Piezas/Volumen/Saldo/Acciones quedan fijas — son las
 * que identifican y cuantifican la fila.
 */
const COLUMNAS_DISPONIBLES_OPCIONALES = [
  { key: "presentacion", label: "Presentación" },
  { key: "medidas", label: "Medidas" },
  { key: "lote", label: "Corrida / lote" },
  { key: "pieTablar", label: "Pie tablar" },
  /* Hace cuánto que esa madera no se mueve. Va prendida: medido el 2026-09-15
     en el libro real, un paquete lleva 331 días parado y la tabla no mostraba
     una sola fecha. La madera aserrada parada se mancha y pierde precio. */
  { key: "edad", label: "Parado hace" },
  /* Cuánto vale la fila. Apagada por omisión: en Blas ninguna de las 24 guías
     tiene costo cargado todavía, así que la columna arrancaría vacía. */
  { key: "valor", label: "Valor (S/)", porDefecto: false },
  { key: "permiso", label: "N° Permiso", porDefecto: false },
] as const;

const CAMPO =
  "h-12 w-full rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

export default function CtpProductosDisponibles({ period }: { period: CtpPeriod }) {
  const [corridas, setCorridas] = useState<CorridaDisponible[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  /* Listas: «tornillo Y cachimbo» es la pregunta de todos los días y con un
     valor solo había que mirar la pantalla dos veces (Brandon, 2026-09-10). */
  const [especie, setEspecie] = useState<string[]>([]);
  const [producto, setProducto] = useState<string[]>([]);
  const [permiso, setPermiso] = useState<string[]>([]);
  /** Columnas opcionales de esta tabla, elegibles y persistidas por dispositivo. */
  const [colsVisibles, setColsVisibles] = useColumnasVisibles(
    "ctp-disponibles-cols",
    COLUMNAS_DISPONIBLES_OPCIONALES,
  );
  /** Ficha del paquete abierta desde su código (ADR-366). */
  const [fichaPaquete, setFichaPaquete] = useState<string | null>(null);
  /** El paquete al que se le está cargando o corrigiendo la escuadría. */
  const [escuadria, setEscuadria] = useState<PaqueteAMedir | null>(null);
  /** Producto que vuelve a la sierra (ADR-316). */
  const [reprocesar, setReprocesar] = useState<CorridaDisponible | null>(null);
  /**
   * El reproceso que viene sugerido desde la distribución (ADR-404). Se lee en
   * un efecto y no en el initializer: `sessionStorage` no existe en el server.
   */
  const [sugerido, setSugerido] = useState<BorradorDeReproceso | null>(null);
  /** Cuántos quedan en la cola contando el que se muestra («2 de 3»). */
  const [pendientes, setPendientes] = useState(0);
  useEffect(() => {
    setSugerido(leerBorradorDeReproceso());
    setPendientes(pendientesDeReproceso());
  }, []);
  /**
   * Consume el pase actual y muestra el SIGUIENTE. Antes esto limpiaba la
   * pantalla y había que volver a la distribución por cada reproceso; con la
   * cola, declarar uno deja el próximo arriba, listo (2026-09-09).
   */
  const avanzarCola = useCallback(() => {
    setSugerido(olvidarBorradorDeReproceso());
    setPendientes(pendientesDeReproceso());
  }, []);
  /** Fila que se está cubicando para el ANEXO N° 04. */
  const [cubicar, setCubicar] = useState<{
    corrida: CorridaDisponible;
    paquete: PaqueteDisponible | null;
  } | null>(null);
  /**
   * Filas tildadas para cubicar en conjunto (ADR-369).
   *
   * La clave es la del PAQUETE cuando lo hay y la de la corrida cuando no: es la
   * misma que dibuja la fila, así que tildar y mirar hablan de lo mismo.
   */
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  /** La corrida que se está editando (ADR-401): completar huecos y corregir. */
  const [editar, setEditar] = useState<LineaEditable | null>(null);
  /** El modal abierto para cubicar TODO lo tildado. */
  const [cubicarConjunto, setCubicarConjunto] = useState(false);
  /** La guía de despacho abierta con lo tildado ya cargado (`presetUids`). */
  const [despachando, setDespachando] = useState(false);
  /** Lo que pasó tras una acción de la fila: se dice arriba y no en un toast que
   *  se va antes de que el operador levante la vista de la tabla. */
  const [nota, setNota] = useState<string | null>(null);
  /** La corrida que se está marcando como "ya usada" (Brandon, 2026-09-01). */
  const [marcarUsado, setMarcarUsado] = useState<CorridaDisponible | null>(null);
  /** Ver también lo marcado como usado — por omisión queda afuera, es justo
   *  lo que pide la marca. */
  const [verUsados, setVerUsados] = useState(false);
  const [desmarcando, setDesmarcando] = useState<string | null>(null);
  /**
   * Lo que hay pero NO se está viendo por estar marcado como usado.
   *
   * Sin esto la pantalla vacía afirmaba «todo lo aserrado ya salió o todavía no
   * se declaró ninguna producción» — y en el depósito real había 5 corridas con
   * 76.45 m³, todas marcadas a mano. Ninguna de las dos causas que decía era la
   * verdadera, y la única llave (el tilde «Ver también lo marcado como usado»)
   * estaba abajo, sin ninguna señal de que escondiera algo.
   */
  const [ocultosPorUsado, setOcultosPorUsado] = useState<{
    corridas: number;
    volumen: number;
  } | null>(null);
  /**
   * Hoy, tomado en el navegador y en un efecto.
   *
   * La edad de un paquete no se puede calcular en el server: lo renderizado
   * allá y lo de acá darían días distintos y React lo marcaría como mismatch.
   * Hasta que monte, las celdas de edad muestran «—», que es la verdad.
   */
  const [ahora, setAhora] = useState<Date | null>(null);
  useEffect(() => setAhora(new Date()), []);
  /** Orden de la tabla. Por omisión el mismo que traía el servidor: lo último
   *  aserrado arriba (edad ascendente). Lo nuevo es poder cambiarlo. */
  const [orden, setOrden] = useState<{ by: CampoOrden; dir: "asc" | "desc" }>({
    by: "edad",
    dir: "asc",
  });
  /** El aviso tildado, que acota la tabla. `null` = se ve todo. */
  const [aviso, setAviso] = useState<ClaveAviso | null>(null);
  /** Filas que se están apartando: una sola o toda la selección (ADR-418). */
  /* Apartar escribe por PATCH, que sólo deja a admin/dueño: al almacenero no se
     le ofrece la puerta (recibiría un 403). La reserva ya puesta la sigue viendo. */
  const puedeApartar = puedePedir("PATCH /api/admin/forestal/ctp", useMiRol());
  const [apartando, setApartando] = useState<{
    filas: { ctpEntryId: string; paqueteId: string | null; etiqueta: string; volumenM3: number; piezas: number | null }[];
    apartadoActual: Apartado | null;
  } | null>(null);

  /* «Solo este permiso»: lo que sigue en el patio de ESE contrato (filtra el servidor). */
  const { contratoFiltro } = useContratoActivo();
  const recargar = useCallback(async () => {
    setCargando(true);
    const qs = conContratoId(applyCtpPeriodParams(new URLSearchParams({ disponibles: "1" }), period), contratoFiltro);
    if (verUsados) qs.set("incluirUsados", "1");
    try {
      const r = await ctpGet<{ corridas?: CorridaDisponible[] }>(`/api/admin/forestal/ctp?${qs}`);
      const lista = r.corridas ?? [];
      setCorridas(lista);
      setError(null);

      /* Si no quedó nada a la vista, preguntamos QUÉ hay detrás de la marca:
         una pantalla vacía tiene que poder decir por qué está vacía. Sólo
         cuando hace falta — con producto a la vista, este pedido no se hace. */
      if (lista.length === 0 && !verUsados) {
        const qsUsados = conContratoId(applyCtpPeriodParams(new URLSearchParams({ disponibles: "1" }), period), contratoFiltro);
        qsUsados.set("incluirUsados", "1");
        try {
          const conUsados = await ctpGet<{ corridas?: CorridaDisponible[] }>(
            `/api/admin/forestal/ctp?${qsUsados}`,
          );
          const marcadas = (conUsados.corridas ?? []).filter((c) => c.usadoAt);
          setOcultosPorUsado(
            marcadas.length > 0
              ? {
                  corridas: marcadas.length,
                  volumen:
                    Math.round(
                      marcadas.reduce((a, c) => a + (Number(c.disponible) || 0), 0) * 1000,
                    ) / 1000,
                }
              : null,
          );
        } catch {
          /* El conteo es contexto, no el dato: si falla, la pantalla sigue
             mostrando el vacío como siempre. */
          setOcultosPorUsado(null);
        }
      } else {
        setOcultosPorUsado(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [period, verUsados, contratoFiltro]);

  useEffect(() => {
    void recargar();
  }, [recargar]);
  /* Una reserva liberada o extendida desde la campana de avisos: sin esto la
     tabla, montada detrás del modal, seguía mostrando la reserva vieja. */
  useEffect(() => alCambiarApartados(() => void recargar()), [recargar]);

  /** Desmarcar no pide motivo (sólo marcar lo pide): volver a mostrar algo que
   *  se sacó por error no necesita justificarse igual que sacarlo. */
  const desmarcar = useCallback(
    async (c: CorridaDisponible) => {
      setDesmarcando(c.id);
      try {
        const r = await fetch("/api/admin/forestal/ctp", {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ id: c.id, action: "marcar_usado", usado: false }),
        });
        if (!r.ok) {
          const data = (await leerJson(r)) as {
            message?: string;
            error?: string;
          } | null;
          throw new Error(data?.message ?? data?.error ?? `El servidor respondió ${r.status}`);
        }
        invalidarCtp("/forestal/ctp");
        setNota(`Corrida N° ${c.lineNo ?? "—"} vuelve a Productos disponibles.`);
        await recargar();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setDesmarcando(null);
      }
    },
    [recargar],
  );

  /**
   * Escribe la escuadría del paquete en el libro.
   *
   * ⚠️ El servidor todavía NO tiene esta rama: falta `corregir_medidas_paquete`
   * en `app/api/admin/forestal/ctp/route.ts` y el método de escritura en
   * `lib/db/forest-ctp.db.ts` (zona reservada). Hasta que aterrice, el modal
   * muestra el error del servidor tal cual — que es lo que un formulario hace
   * con cualquier rechazo, no una pantalla rota.
   */
  const guardarEscuadria = useCallback(
    async (medidas: EscuadriaAGuardar) => {
      await guardarEscuadriaDePaquete(medidas);
      setEscuadria(null);
      setNota(
        `Escuadría guardada: ${medidas.espesorCm} × ${medidas.anchoCm} cm · ${medidas.largoM} m.`,
      );
      await recargar();
    },
    [recargar],
  );

  const opciones = useMemo(
    () => ({
      especies: agruparPorClave(
        corridas.map((c) => c.especie ?? ""),
        claveEspecie,
      ),
      productos: agruparPorClave(
        corridas.map((c) => c.producto ?? ""),
        claveEspecie,
      ),
      permisos: agruparPorClave(
        corridas.flatMap((c) => c.titularOrigen ?? []),
        clavePermiso,
      ),
    }),
    [corridas],
  );

  /**
   * Cuánto m³ DISPONIBLE hay detrás de cada valor (ADR-400).
   *
   * Es lo que se muestra al costado de cada opción: acá lo que importa no es
   * cuántas corridas hay sino cuánta madera queda, que es lo que se despacha.
   * Un permiso con 0.4 m³ y otro con 40 se eligen distinto.
   */
  const pesos = useMemo(() => {
    /* Suma por CLAVE, no por texto: si no, cada grafía muestra su mitad y el
       número de la opción no es el que aparece al elegirla. */
    const sumar = (valores: (c: CorridaDisponible) => string[], clave: (v: string) => string) => {
      const m = new Map<string, number>();
      for (const c of corridas) {
        for (const bruto of valores(c)) {
          const k = clave(bruto ?? "");
          if (!k) continue;
          m.set(k, (m.get(k) ?? 0) + c.disponible);
        }
      }
      return m;
    };
    return {
      especies: sumar((c) => [c.especie ?? ""], claveEspecie),
      productos: sumar((c) => [c.producto ?? ""], claveEspecie),
      permisos: sumar((c) => c.titularOrigen ?? [], clavePermiso),
    };
  }, [corridas]);

  const visibles = useMemo(() => {
    const q = norm(texto);
    return corridas.filter((c) => {
      /* La misma clave con la que se arman las opciones: filtrar con otra regla
         es como se llega a un desplegable que ofrece algo y no trae nada. */
      /* OR adentro de cada filtro, AND entre filtros: el autofiltro de Excel. */
      if (
        especie.length > 0 &&
        !especie.some((e) => claveEspecie(c.especie ?? "") === claveEspecie(e))
      )
        return false;
      if (
        producto.length > 0 &&
        !producto.some((p) => claveEspecie(c.producto ?? "") === claveEspecie(p))
      )
        return false;
      if (
        permiso.length > 0 &&
        !(c.titularOrigen ?? []).some((t) =>
          permiso.some((p) => clavePermiso(t) === clavePermiso(p)),
        )
      )
        return false;
      if (q) {
        const campos = [c.especie, c.producto, c.lote, ...c.paquetes.map((p) => p.codigo)];
        if (!campos.some((x) => norm(x).includes(q))) return false;
      }
      return true;
    });
  }, [corridas, texto, especie, producto, permiso]);

  /**
   * Cuánto vale por m³ lo que salió de cada corrida (ADR-418).
   *
   * Se calcula una vez por corrida y no por fila: los quince paquetes de una
   * corrida comparten la misma madera, el mismo costo y el mismo rendimiento.
   */
  const valorPorCorrida = useMemo(() => {
    const m = new Map<string, ValorDeCorrida>();
    for (const c of corridas) {
      m.set(
        c.id,
        valorDeCorrida({
          gtfOrigen: c.gtfOrigen ?? [],
          costoConsumos: c.costoConsumos ?? [],
          costoPorGtf: c.costoPorGtf ?? [],
          rendimientoPct: c.rendimientoPct ?? null,
          producido: c.producido,
          volumenConsumidoM3: c.volumenConsumidoM3,
        }),
      );
    }
    return m;
  }, [corridas]);

  /* La fila es el PAQUETE: es lo que se busca en la pila y lo que se cita en la
     guía de salida. Las corridas sin paquetes cargados —las viejas— entran como
     una fila con su saldo, para que no desaparezca producto que existe.

     Cada fila llega ya con su edad, su valor y su reserva: ordenar, acotar por
     aviso y exportar leen todas de acá, así que las tres dicen lo mismo. */
  const filas = useMemo(
    () =>
      visibles.flatMap((c) => {
        const dias = ahora ? edadEnDias(c.fecha, ahora) : null;
        const base = {
          corrida: c,
          dias,
          tramo: tramoDeEdad(dias),
          valorCorrida: valorPorCorrida.get(c.id) ?? null,
        };
        const conValor = (
          paquete: PaqueteDisponible | null,
          volumenM3: number,
          apartado: Apartado | null,
        ) => ({
          ...base,
          paquete,
          volumenM3,
          apartado,
          valorSoles: base.valorCorrida ? valorDeFila(base.valorCorrida, volumenM3) : null,
        });
        return c.paquetes.length > 0
          ? c.paquetes.map((p) => conValor(p, p.volumenM3, p.apartado ?? null))
          : [conValor(null, c.disponible, c.apartado ?? null)];
      }),
    [visibles, ahora, valorPorCorrida],
  );

  /** Cuántas filas hay detrás de cada aviso. Se cuenta sobre TODO lo filtrado
   *  —no sobre lo ya acotado—, o el chip se apagaría solo al tildarlo. */
  const cuentaAvisos = useMemo(
    () => ({
      "sin-escuadria": filas.filter(
        (f) => f.paquete && !(f.paquete.espesorCm && f.paquete.anchoCm && f.paquete.largoM),
      ).length,
      "sin-piezas": filas.filter((f) => f.paquete && !f.paquete.cantidad).length,
      viejos: filas.filter((f) => f.dias != null && f.dias > DIAS_VIEJO).length,
      apartados: filas.filter((f) => f.apartado != null).length,
    }),
    [filas],
  );

  const acotadas = useMemo(() => {
    if (!aviso) return filas;
    if (aviso === "sin-escuadria")
      return filas.filter(
        (f) => f.paquete && !(f.paquete.espesorCm && f.paquete.anchoCm && f.paquete.largoM),
      );
    if (aviso === "sin-piezas") return filas.filter((f) => f.paquete && !f.paquete.cantidad);
    if (aviso === "viejos") return filas.filter((f) => f.dias != null && f.dias > DIAS_VIEJO);
    return filas.filter((f) => f.apartado != null);
  }, [filas, aviso]);

  /** El orden que pidió la cabecera. La comparación vive en un lib puro con
   *  tests (`disponibles-orden`): los nulos van al final en los dos sentidos. */
  const ordenadas = useMemo(() => {
    const clave = (f: (typeof acotadas)[number]) => ({
      codigo: f.paquete?.codigo ?? "",
      producto: productLabel(f.paquete?.producto ?? f.corrida.producto ?? ""),
      especie: f.corrida.especie ?? "",
      piezas: f.paquete?.cantidad ?? null,
      volumenM3: f.volumenM3,
      pieTablar: pieTablarDe(f.volumenM3),
      saldoCorridaM3: f.corrida.disponible,
      diasParado: f.dias,
      valorSoles: f.valorSoles,
    });
    return [...acotadas].sort((a, b) => compararDisponibles(clave(a), clave(b), orden));
  }, [acotadas, orden]);

  const ordenarPor = useCallback(
    (campo: CampoOrden) => setOrden((prev) => siguienteOrden(prev, campo)),
    [],
  );

  const { visibles: enPagina, rango, porPagina, setPorPagina, ir } = usePaginacion(ordenadas);
  /** Checkbox+Código+Producto+Especie+Piezas+Volumen+Saldo+Acciones (fijas) +
   *  las opcionales que estén prendidas — para que la fila vacía ocupe el
   *  ancho real de la tabla y no se vea descuadrada. */
  const totalCols = 8 + Object.values(colsVisibles).filter(Boolean).length;

  /** Lo tildado, con la forma que pide `cuadrarConjunto`. */
  const elegidas = useMemo<FilaDeclarada[]>(
    () =>
      filas
        .filter((f) => seleccion.has(claveFila(f)))
        .map((f) => ({
          id: claveFila(f),
          etiqueta: f.paquete?.codigo ?? `Corrida N° ${f.corrida.lineNo ?? "—"}`,
          especie: f.corrida.especie,
          producto: f.paquete?.producto ?? f.corrida.producto,
          /* Del paquete si lo hay; si no, lo que la corrida todavía tiene. */
          piezas: f.paquete?.cantidad ?? null,
          volumenM3: f.paquete?.volumenM3 ?? f.corrida.disponible,
        })),
    [filas, seleccion],
  );
  const totalElegido = useMemo(
    () => ({
      piezas: elegidas.reduce((a, f) => a + (f.piezas ?? 0), 0),
      m3: Math.round(elegidas.reduce((a, f) => a + (f.volumenM3 ?? 0), 0) * 10_000) / 10_000,
      corridas: [
        ...new Set(filas.filter((f) => seleccion.has(claveFila(f))).map((f) => f.corrida.id)),
      ],
    }),
    [elegidas, filas, seleccion],
  );

  const totales = useMemo(
    () => ({
      volumen: Math.round(visibles.reduce((a, c) => a + c.disponible, 0) * 10000) / 10000,
      paquetes: visibles.reduce((a, c) => a + c.paquetes.length, 0),
      especies: new Set(visibles.map((c) => claveEspecie(c.especie ?? "")).filter(Boolean)).size,
      productos: new Set(visibles.map((c) => norm(c.producto)).filter(Boolean)).size,
    }),
    [visibles],
  );
  /** Piezas de TODO lo filtrado (no sólo la página): una fila es un paquete o
   *  una corrida sin paquetes, así que sumar acá no repite ninguna corrida. */
  const totalPiezas = useMemo(
    () => ordenadas.reduce((a, f) => a + (f.paquete?.cantidad ?? 0), 0),
    [ordenadas],
  );
  /** Para quién se apartó antes: alimenta el `datalist` del modal, así el
   *  segundo apartado del mismo cliente no se escribe con otra grafía. */
  const destinatariosConocidos = useMemo(
    () =>
      [
        ...new Set(
          corridas
            .flatMap((c) => [c.apartado?.para, ...c.paquetes.map((p) => p.apartado?.para)])
            .filter((v): v is string => !!v && v.trim().length > 0)
            .map((v) => v.trim()),
        ),
      ].sort((a, b) => a.localeCompare(b, "es-PE")),
    [corridas],
  );

  /** Cuántas corridas distintas quedan representadas en lo que se muestra. */
  const corridasALaVista = useMemo(
    () => new Set(ordenadas.map((f) => f.corrida.id)).size,
    [ordenadas],
  );
  /** m³ de lo que está a la vista. Con un aviso tildado no coincide con el KPI
   *  —que describe el filtro y no el aviso—, y por eso la franja del aviso dice
   *  en palabras cuántas filas de cuántas se están mostrando. */
  const volumenALaVista = useMemo(
    () => Math.round(ordenadas.reduce((a, f) => a + f.volumenM3, 0) * 10_000) / 10_000,
    [ordenadas],
  );

  /**
   * Cuántos paquetes a la vista NO tienen escuadría.
   *
   * La tarjeta decía «Con su código y sus medidas» sobre TODOS: medido el
   * 2026-09-15 en el libro real, 27 de 33 no tienen ninguna de las tres. Una
   * cifra que afirma lo contrario de lo que la columna de al lado muestra es
   * peor que no tener la cifra.
   */
  const paquetesSinMedidas = cuentaAvisos["sin-escuadria"];

  /** Cómo está repartida la edad del stock a la vista, para el desglose del KPI. */
  const edadDelStock = useMemo(
    () => resumenDeEdad(filas.map((f) => ({ dias: f.dias, volumenM3: f.volumenM3 }))),
    [filas],
  );
  /** Qué vale el patio y cuántas guías faltan costear para poder decirlo. */
  const valorDelStock = useMemo(
    () =>
      resumenDeValor(
        filas.flatMap((f) =>
          f.valorCorrida ? [{ valor: f.valorCorrida, volumenM3: f.volumenM3 }] : [],
        ),
      ),
    [filas],
  );

  /**
   * De qué está hecho el stock, para abrirlo desde la propia tarjeta.
   *
   * Acá NO hay comparación contra el período anterior y no es un olvido: esta
   * pestaña no tiene período (`SIN_PERIODO`), porque un depósito es lo que hay
   * HOY y no un flujo entre dos fechas. Un «+12 % vs el mes pasado» sobre un
   * stock sin fecha sería un número inventado. Lo que sí se puede contestar
   * —y no se podía sin filtrar de a una— es de qué se compone.
   *
   * Se agrupa por CLAVE (`claveEspecie` / `norm`) y no por el texto: el libro
   * tiene «Tornillo» y «TORNILLO» escritos por dos personas, y separarlos
   * partiría el mismo stock en dos mitades.
   */
  const repartir = useCallback(
    (
      clave: (c: CorridaDisponible) => string,
      etiqueta: (c: CorridaDisponible) => string,
    ): FilaDesglose[] => {
      const map = new Map<string, { value: string; count: number; peso: number }>();
      for (const c of visibles) {
        const k = clave(c);
        if (!k) continue;
        const prev = map.get(k) ?? { value: etiqueta(c), count: 0, peso: 0 };
        map.set(k, { value: prev.value, count: prev.count + 1, peso: prev.peso + c.disponible });
      }
      return [...map.values()].map((v) => ({ value: v.value, count: v.count, volumeM3: v.peso }));
    },
    [visibles],
  );
  const porEspecie = useMemo(
    () =>
      repartir(
        (c) => claveEspecie(c.especie ?? ""),
        (c) => c.especie ?? "Sin especie",
      ),
    [repartir],
  );
  const porProducto = useMemo(
    () =>
      repartir(
        (c) => norm(c.producto),
        (c) => productLabel(c.producto ?? "") || "Sin producto",
      ),
    [repartir],
  );

  /**
   * Las corridas que podrían alimentar el reproceso sugerido: las que declaran
   * el MISMO tipo comercial que la sugerencia dice reprocesar y tienen saldo.
   * Se compara por tipo y no por el texto del producto: «MADERA ASERRADA
   * (COMERCIAL)» y «Comercial» son lo mismo escrito en dos idiomas.
   */
  const candidatasSugeridas = useMemo(() => {
    if (!sugerido) return [];
    const norma = (v: string | null | undefined) =>
      (v ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
    const buscado = norma(sugerido.desdeTipo);
    return corridas
      .filter((c) => c.disponible > 0 && norma(tipoComercialDelProducto(c.producto)) === buscado)
      .map((c) => ({ id: c.id, lineNo: c.lineNo, disponible: c.disponible }));
  }, [corridas, sugerido]);

  /**
   * El stock, tal como se está viendo, en un archivo.
   *
   * Despacho y Saldos exportan desde hace meses; esta pestaña —la que el
   * vendedor tiene abierta cuando le preguntan por teléfono qué hay— no tenía
   * ninguna salida. Se exporta lo ORDENADO y ACOTADO, con las columnas que
   * están prendidas: un CSV que no coincide con la pantalla obliga a revisar
   * cuál de los dos miente.
   */
  const exportar = useCallback(() => {
    const columnas: (keyof FilaDisponibleCsv)[] = [
      "codigo",
      "producto",
      "especie",
      ...((colsVisibles.presentacion ? ["presentacion"] : []) as (keyof FilaDisponibleCsv)[]),
      ...((colsVisibles.medidas
        ? ["espesorCm", "anchoCm", "largoM"]
        : []) as (keyof FilaDisponibleCsv)[]),
      "piezas",
      "volumenM3",
      ...((colsVisibles.pieTablar ? ["pieTablar"] : []) as (keyof FilaDisponibleCsv)[]),
      ...((colsVisibles.lote ? ["corrida", "lote"] : []) as (keyof FilaDisponibleCsv)[]),
      "saldoCorridaM3",
      ...((colsVisibles.edad ? ["diasParado"] : []) as (keyof FilaDisponibleCsv)[]),
      ...((colsVisibles.valor ? ["valorSoles"] : []) as (keyof FilaDisponibleCsv)[]),
      ...((colsVisibles.permiso ? ["permiso"] : []) as (keyof FilaDisponibleCsv)[]),
      "gtf",
      "apartadoPara",
      "estado",
    ];
    const csv = disponiblesACsv(
      ordenadas.map((f) => ({
        codigo: f.paquete?.codigo ?? "",
        producto: productLabel(f.paquete?.producto ?? f.corrida.producto ?? ""),
        especie: f.corrida.especie ?? "",
        presentacion: f.paquete?.presentacion ?? f.corrida.presentacion ?? "",
        espesorCm: f.paquete?.espesorCm ?? null,
        anchoCm: f.paquete?.anchoCm ?? null,
        largoM: f.paquete?.largoM ?? null,
        piezas: f.paquete?.cantidad ?? null,
        volumenM3: f.volumenM3,
        pieTablar: pieTablarDe(f.volumenM3),
        corrida: f.corrida.lineNo != null ? `N° ${f.corrida.lineNo}` : "",
        lote: f.corrida.lote ?? "",
        permiso: (f.corrida.titularOrigen ?? []).join(" · "),
        gtf: (f.corrida.gtfOrigen ?? []).join(" · "),
        saldoCorridaM3: f.corrida.disponible,
        diasParado: f.dias,
        valorSoles: f.valorSoles,
        apartadoPara: f.apartado?.para ?? null,
        estado: f.corrida.usadoAt ? "Marcado como usado" : f.apartado ? "Apartado" : "Disponible",
      })),
      { columnas },
    );
    const nombre = nombreArchivoDisponibles(ahora ?? new Date());
    /* BOM adelante: sin él Excel es-PE lee los acentos como símbolos. Mismo
       gesto que `CtpSaldosView`, que ya exporta así. */
    const url = URL.createObjectURL(
      new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setNota(`Exportadas ${ordenadas.length} fila${ordenadas.length === 1 ? "" : "s"} a ${nombre}.`);
  }, [ordenadas, colsVisibles, ahora]);

  if (error) {
    return (
      <p className="rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]">
        No se pudieron leer los productos disponibles: {error}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Lo que la distribución sugirió reprocesar, esperando que el operario
          diga de qué corrida sale — eso no se adivina (ADR-404 → ADR-316). */}
      {sugerido && (
        <ReprocesoSugeridoBanda
          borrador={sugerido}
          candidatas={candidatasSugeridas}
          onUsar={(id) => {
            const c = corridas.find((x) => x.id === id);
            if (c) setReprocesar(c);
          }}
          pendientes={pendientes}
          onDescartar={avanzarCola}
          onDescartarTodos={
            pendientes > 1
              ? () => {
                  olvidarTodosLosReprocesos();
                  setSugerido(null);
                  setPendientes(0);
                }
              : undefined
          }
        />
      )}

      {/* Todos detrás del botón «Indicadores» (Brandon, 2026-09-03); el titular
          —cuánto hay y en cuántos paquetes— va en la línea de resumen. */}
      <CtpKpisPlegables
        claveMemoria="disponibles"
        /* Los filtros que gobiernan estas cifras (ADR-400): son los MISMOS que
           recortan la tabla de abajo — `visibles` alimenta a las dos. */
        filtrosActivos={[especie, producto, permiso].filter((v) => v.length > 0).length}
        filtros={
          <CtpKpiFiltros
            campos={[
              {
                key: "especie",
                label: "Especie",
                todos: "Todas las especies",
                textoVacio: "Sin producto en el depósito",
                valor: especie,
                opciones: opciones.especies.map((e) => ({
                  value: e,
                  label: e,
                  hint: `${fmtM3(pesos.especies.get(claveEspecie(e)) ?? 0)} m³`,
                })),
                onChange: setEspecie,
              },
              {
                key: "permiso",
                label: "Permiso (título habilitante)",
                todos: "Todos los permisos",
                textoVacio: "Sin producto en el depósito",
                valor: permiso,
                opciones: opciones.permisos.map((p) => ({
                  value: p,
                  label: p,
                  hint: `${fmtM3(pesos.permisos.get(clavePermiso(p)) ?? 0)} m³`,
                })),
                onChange: setPermiso,
              },
              {
                key: "producto",
                label: "Producto",
                todos: "Todos los productos",
                textoVacio: "Sin producto en el depósito",
                valor: producto,
                opciones: opciones.productos.map((p) => ({
                  value: p,
                  label: productLabel(p),
                  hint: `${fmtM3(pesos.productos.get(claveEspecie(p)) ?? 0)} m³`,
                })),
                onChange: setProducto,
              },
            ]}
            onLimpiar={() => {
              setEspecie([]);
              setPermiso([]);
              setProducto([]);
            }}
            nota={
              [especie, permiso, producto].some((v) => v.length > 0)
                ? `Los indicadores muestran sólo ${[
                    especie.length > 0 ? `especie: ${especie.join(" o ")}` : "",
                    permiso.length > 0 ? `permiso: ${permiso.join(" o ")}` : "",
                    producto.length > 0
                      ? `producto: ${producto.map(productLabel).join(" o ")}`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}`
                : null
            }
          />
        }
        resumen={
          visibles.length === 0
            ? ocultosPorUsado
              ? `Sin producto disponible · ${fmtM3(ocultosPorUsado.volumen)} m³ marcados como usados`
              : "Sin producto disponible en planta"
            : `${fmtM3(totales.volumen)} m³ · ${nf(totales.paquetes)} paquete${totales.paquetes === 1 ? "" : "s"} · ${nf(totalPiezas)} pieza${totalPiezas === 1 ? "" : "s"} · ${nf(visibles.length)} corrida${visibles.length === 1 ? "" : "s"}`
        }
        tarjetas={[
          <CtpKpi
            key="volumen"
            label="Disponible (m³)"
            value={fmtM3(totales.volumen)}
            /* La fórmula decía «producido − despachado − reprocesado» y se
               dejaba afuera la resta que más sorprende: lo marcado a mano como
               usado. Con 76.45 m³ marcados, el operador leía 0.000 bajo una
               fórmula donde ningún término explicaba ese cero. */
            subValue={
              ocultosPorUsado
                ? `${formatNumber(pieTablarDe(totales.volumen))} pt · ${fmtM3(ocultosPorUsado.volumen)} m³ más están marcados como usados`
                : `${formatNumber(pieTablarDe(totales.volumen))} pt · producido − despachado − reprocesado − marcado usado`
            }
            icon={TreePine}
            desglose={
              porEspecie.length > 0 ? (
                <DesgloseSimple filas={porEspecie} onElegir={(v) => setEspecie([v])} />
              ) : undefined
            }
            desgloseLabel="Por especie"
            emphasis="success"
          />,
          <CtpKpi
            key="paquetes"
            label="Paquetes en planta"
            value={nf(totales.paquetes)}
            subValue={
              totales.paquetes === 0
                ? "Sin paquetes cargados"
                : paquetesSinMedidas > 0
                  ? `${nf(paquetesSinMedidas)} sin escuadría cargada`
                  : "Todos con su código y su escuadría"
            }
            icon={Boxes}
          />,
          /**
           * Las PIEZAS, que es como se carga un camión.
           *
           * `totalPiezas` se calculaba desde antes —lo usa el pie de la tabla—
           * pero no estaba en ninguna tarjeta: el cliente pide «200 tablas», no
           * «4 m³», y el vendedor tenía que sumarlas fila por fila.
           */
          <CtpKpi
            key="piezas"
            label="Piezas disponibles"
            value={nf(totalPiezas)}
            subValue={
              totalPiezas === 0
                ? "las corridas no declaran cantidad por paquete"
                : "de todo lo filtrado, no sólo de esta página"
            }
            icon={Layers}
          />,
          <CtpKpi
            key="especies"
            label="Especies"
            value={nf(totales.especies)}
            subValue="Distintas en stock"
            icon={TreePine}
            desglose={
              porEspecie.length > 0 ? (
                <DesgloseSimple filas={porEspecie} onElegir={(v) => setEspecie([v])} />
              ) : undefined
            }
            desgloseLabel="Cuánto hay de cada una"
          />,
          /* `totales.productos` también venía calculado y sin mostrarse: dos
             especies pueden dar seis productos distintos (aserrada, tablillas,
             comercial…) y es lo que decide qué se le puede ofrecer al cliente. */
          <CtpKpi
            key="productos"
            label="Tipos de producto"
            value={nf(totales.productos)}
            subValue={totales.productos === 1 ? "Un solo tipo en stock" : "Distintos en stock"}
            icon={Boxes}
            desglose={
              porProducto.length > 0 ? (
                <DesgloseSimple filas={porProducto} onElegir={(v) => setProducto([v])} />
              ) : undefined
            }
            desgloseLabel="Cuánto hay de cada uno"
          />,
          <CtpKpi
            key="corridas"
            label="Corridas con saldo"
            value={nf(visibles.length)}
            subValue="Producción que todavía no salió"
            icon={PackageOpen}
          />,
          /**
           * Hace cuánto que la madera más vieja no se mueve.
           *
           * El patio venía descrito sólo por su tamaño (m³, paquetes, piezas) y
           * nunca por su edad: 85 m³ de Tornillo aserrado ayer y 85 m³ parados
           * desde hace once meses se leían igual en esta pantalla, y valen
           * cosas muy distintas — la aserrada parada se mancha de hongo azul.
           */
          <CtpKpi
            key="edad"
            label="Lo más viejo lleva"
            value={edadDelStock.masViejoDias == null ? "—" : fmtEdad(edadDelStock.masViejoDias)}
            subValue={
              edadDelStock.porTramo.viejo.filas > 0
                ? `${nf(edadDelStock.porTramo.viejo.filas)} fila${edadDelStock.porTramo.viejo.filas === 1 ? "" : "s"} · ${fmtM3(edadDelStock.porTramo.viejo.volumenM3)} m³ paradas hace más de ${DIAS_VIEJO} días`
                : "Nada lleva más de 90 días parado"
            }
            icon={Clock}
            emphasis={edadDelStock.porTramo.viejo.filas > 0 ? "error" : undefined}
            desglose={
              <DesgloseSimple
                filas={(["viejo", "maduro", "fresco"] as TramoEdad[])
                  .filter((t) => edadDelStock.porTramo[t].filas > 0)
                  .map((t) => ({
                    value: ETIQUETA_TRAMO[t],
                    count: edadDelStock.porTramo[t].filas,
                    volumeM3: edadDelStock.porTramo[t].volumenM3,
                  }))}
                onElegir={(v) =>
                  setAviso(v === ETIQUETA_TRAMO.viejo ? (aviso === "viejos" ? null : "viejos") : null)
                }
              />
            }
            desgloseLabel="Cuánto hay de cada edad"
          />,
          /**
           * Cuánto vale lo que está parado.
           *
           * El costo de la materia prima entra por guía (ADR-134) y muere en
           * Ingresos: el stock nunca supo lo que costó. Medido el 2026-09-15,
           * ninguna de las 24 guías de Blas tiene costo cargado, así que la
           * tarjeta hoy no muestra una cifra falsa: muestra cuántas guías hay
           * que costear para que exista.
           */
          <CtpKpi
            key="valor"
            label="Valor del patio"
            value={
              valorDelStock.filasValorizadas === 0
                ? "sin costear"
                : `S/ ${formatNumber(valorDelStock.totalSoles, { max: 0 })}`
            }
            subValue={
              valorDelStock.guiasSinCosto.length > 0
                ? `Faltan costear ${nf(valorDelStock.guiasSinCosto.length)} guía${valorDelStock.guiasSinCosto.length === 1 ? "" : "s"} en Ingresos`
                : valorDelStock.filasValorizadas === 0
                  ? "Ninguna corrida dice de qué guía salió"
                  : `${nf(valorDelStock.filasValorizadas)} fila${valorDelStock.filasValorizadas === 1 ? "" : "s"} valorizadas al costo de su guía`
            }
            icon={Coins}
          />,
        ]}
      />

      {/* Siete columnas y no seis: la celda de la derecha ahora lleva DOS
          botones (Exportar y Columnas) y con una sola columna «Exportar»
          quedaba cortado contra el borde. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
        <label className="relative sm:col-span-2">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]"
            aria-hidden
          />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Código de paquete, especie o lote…"
            aria-label="Buscar un producto disponible"
            className={`${CAMPO} pl-9`}
          />
        </label>
        {/* Un desplegable sin opciones no se dibuja — la misma regla que ya
            aplica el panel de indicadores (`CtpKpiFiltros`). Acá salían los tres
            en gris diciendo «Sin datos en el período», que además culpaba al
            período: en esta vista el período NO acota el depósito (ver el
            endpoint, `soloDelPeriodo`), así que mandaba a cambiar algo que no
            cambia nada. El que está filtrando se dibuja igual, o el operador se
            queda sin poder apagarlo. */}
        {(opciones.especies.length > 0 || especie.length > 0) && (
          <CampoDeFiltro
            label="Especie"
            value={especie}
            options={opciones.especies.map((e) => ({ value: e }))}
            onChange={setEspecie}
            placeholder="Todas las especies"
            textoVacio="Sin producto en el depósito"
          />
        )}
        {(opciones.productos.length > 0 || producto.length > 0) && (
          <CampoDeFiltro
            label="Producto"
            value={producto}
            options={opciones.productos.map((p) => ({ value: p, label: productLabel(p) }))}
            onChange={setProducto}
            placeholder="Todos los productos"
            textoVacio="Sin producto en el depósito"
          />
        )}
        {(opciones.permisos.length > 0 || permiso.length > 0) && (
          <CampoDeFiltro
            label="N° de permiso"
            value={permiso}
            options={opciones.permisos.map((p) => ({ value: p }))}
            onChange={setPermiso}
            placeholder="Todos los permisos"
            textoVacio="Sin producto en el depósito"
          />
        )}
        <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
          {/* Lo que el vendedor manda por WhatsApp cuando le piden la lista. */}
          <button
            type="button"
            onClick={exportar}
            disabled={ordenadas.length === 0}
            title="Bajar lo que estás viendo a un CSV que abre en Excel"
            className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-[var(--accent)]"
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden /> Exportar
          </button>
          <ColumnasMenu
            columnas={COLUMNAS_DISPONIBLES_OPCIONALES}
            visibles={colsVisibles}
            onChange={setColsVisibles}
          />
        </div>
      </div>

      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={verUsados}
          onChange={(e) => setVerUsados(e.target.checked)}
          className="h-5 w-5 accent-[var(--accent)]"
        />
        Ver también lo marcado como usado
      </label>

      {/* Lo que el propio stock tiene mal, en chips que acotan la tabla. */}
      <AvisosDelStock
        cuentas={cuentaAvisos}
        activo={aviso}
        onElegir={setAviso}
        detalle={`Mostrando ${nf(ordenadas.length)} de ${nf(filas.length)} filas · ${fmtM3(volumenALaVista)} m³`}
      />

      <TablaCtp>
        <TheadCtp>
          <tr>
            <th className="w-10 px-2 py-2">
              {/* Tildar todo lo que se está viendo: con el filtro puesto, «todo»
                  es lo filtrado y no las 500 corridas del período. */}
              <input
                type="checkbox"
                aria-label="Elegir todas las filas visibles"
                className="h-5 w-5 accent-[var(--accent)]"
                checked={enPagina.length > 0 && enPagina.every((f) => seleccion.has(claveFila(f)))}
                onChange={(e) =>
                  setSeleccion((prev) => {
                    const s = new Set(prev);
                    for (const f of enPagina) {
                      if (e.target.checked) s.add(claveFila(f));
                      else s.delete(claveFila(f));
                    }
                    return s;
                  })
                }
              />
            </th>
            {/* Ordenables las que se comparan: «cuál es el más viejo», «cuál
                tiene más piezas», «cuál vale más». Sin esto había que exportar
                a Excel para contestarlas. */}
            <ThOrdenable campo="codigo" orden={orden} onOrdenar={ordenarPor}>
              Código paquete
            </ThOrdenable>
            <ThOrdenable campo="producto" orden={orden} onOrdenar={ordenarPor}>
              Producto
            </ThOrdenable>
            <ThOrdenable campo="especie" orden={orden} onOrdenar={ordenarPor}>
              Especie
            </ThOrdenable>
            {colsVisibles.presentacion && <th className="px-3 py-2 font-bold">Presentación</th>}
            {colsVisibles.medidas && <th className="px-3 py-2 font-bold">Medidas</th>}
            {/* Piezas · m³ · PT, pegadas (2026-09-09): el pie tablar estaba
                dos columnas más allá, detrás de «Corrida / lote». */}
            <ThOrdenable campo="piezas" orden={orden} onOrdenar={ordenarPor} align="right">
              Piezas
            </ThOrdenable>
            <ThOrdenable campo="volumen" orden={orden} onOrdenar={ordenarPor} align="right">
              Volumen
            </ThOrdenable>
            {colsVisibles.pieTablar && (
              <ThOrdenable campo="pieTablar" orden={orden} onOrdenar={ordenarPor} align="right">
                Pie tablar
              </ThOrdenable>
            )}
            {colsVisibles.valor && (
              <ThOrdenable campo="valor" orden={orden} onOrdenar={ordenarPor} align="right">
                Valor (S/)
              </ThOrdenable>
            )}
            {colsVisibles.lote && <th className="px-3 py-2 font-bold">Corrida / lote</th>}
            {colsVisibles.edad && (
              <ThOrdenable campo="edad" orden={orden} onOrdenar={ordenarPor} align="right">
                Parado hace
              </ThOrdenable>
            )}
            <ThOrdenable campo="saldo" orden={orden} onOrdenar={ordenarPor} align="right">
              Saldo corrida
            </ThOrdenable>
            {colsVisibles.permiso && <th className="px-3 py-2 font-bold">N° Permiso</th>}
            <th className="px-3 py-2 text-right font-bold">Acciones</th>
          </tr>
        </TheadCtp>
        <TbodyCtp>
          {enPagina.length === 0 && (
            <FilaVacia cols={totalCols}>
              {cargando ? (
                "Leyendo la planta…"
              ) : aviso ? (
                /* El vacío lo causó el chip, no el filtro: decirlo y ofrecer
                   la salida, o el operador va a buscar el error en otro lado. */
                <span className="inline-flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
                  Ninguna fila de las {nf(filas.length)} que estás viendo entra en ese aviso.
                  <button
                    type="button"
                    onClick={() => setAviso(null)}
                    className="font-bold text-[var(--accent-ink)] underline decoration-dotted underline-offset-2 dark:text-[var(--accent)]"
                  >
                    Ver todo de nuevo
                  </button>
                </span>
              ) : corridas.length > 0 ? (
                "Ningún producto coincide con el filtro."
              ) : ocultosPorUsado ? (
                /* La causa REAL del vacío, con su salida. El texto viejo
                   afirmaba «todo salió o no se declaró producción» y las dos
                   eran falsas: el producto está, marcado a mano como usado. */
                <span className="inline-flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
                  No hay producto disponible, pero{" "}
                  <b className="text-[var(--text-primary)]">
                    {ocultosPorUsado.corridas} corrida{ocultosPorUsado.corridas === 1 ? "" : "s"}
                  </b>{" "}
                  ({fmtM3(ocultosPorUsado.volumen)} m³) est
                  {ocultosPorUsado.corridas === 1 ? "á" : "án"} marcada
                  {ocultosPorUsado.corridas === 1 ? "" : "s"} como usada
                  {ocultosPorUsado.corridas === 1 ? "" : "s"}.
                  <button
                    type="button"
                    onClick={() => setVerUsados(true)}
                    className="font-bold text-[var(--accent-ink)] underline decoration-dotted underline-offset-2 dark:text-[var(--accent)]"
                  >
                    Verlas
                  </button>
                </span>
              ) : (
                "No hay producto disponible: todo lo aserrado ya salió o todavía no se declaró ninguna producción."
              )}
            </FilaVacia>
          )}
          {enPagina.map(({ corrida: c, paquete: p, dias, tramo, valorSoles, apartado }) => (
            <tr key={p ? p.id : c.id} className="hover:bg-[var(--surface-sunken)]">
              <td className="px-2 py-2">
                <input
                  type="checkbox"
                  aria-label={`Elegir ${p?.codigo ?? `la corrida N° ${c.lineNo ?? "—"}`}`}
                  className="h-5 w-5 accent-[var(--accent)]"
                  checked={seleccion.has(claveFila({ corrida: c, paquete: p }))}
                  onChange={(e) =>
                    setSeleccion((prev) => {
                      const s = new Set(prev);
                      const k = claveFila({ corrida: c, paquete: p });
                      if (e.target.checked) s.add(k);
                      else s.delete(k);
                      return s;
                    })
                  }
                />
              </td>
              <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">
                {/* El código abre la ficha del paquete (ADR-366): es el número
                    que alguien tiene delante y la puerta a su origen. */}
                {p?.codigo ? (
                  <button
                    type="button"
                    onClick={() => setFichaPaquete(p.codigo)}
                    title={`Ver de qué corrida y de qué madera salió ${p.codigo}`}
                    className="rounded-xl underline decoration-dotted underline-offset-4 transition-colors hover:text-[var(--accent)]"
                  >
                    {p.codigo}
                  </button>
                ) : (
                  <span className="font-sans text-[var(--text-tertiary)]">sin paquete</span>
                )}
              </td>
              <td className="px-3 py-2 text-[var(--text-secondary)]">
                <div className="flex flex-wrap items-center gap-1">
                  {productLabel(p?.producto ?? c.producto ?? "")}
                  {/* Misma marca que escribe el importador del libro
                      (`ctp-serfor-a-libro.ts`): sin esto un paquete importado se
                      ve igual que uno recién aserrado, y son datos de calidad
                      distinta. El predicado es único (`lotes-aserrio.ts`). */}
                  {esInventarioDeApertura(c.observations) && (
                    <span
                      title="Existencia de apertura: entró por el importador del libro"
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--data-info-500)]/15 px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
                    >
                      <Download className="h-3 w-3 shrink-0" aria-hidden /> Importado
                    </span>
                  )}
                  {/* Madera de tercero (ADR-412): lo que el centro asierra por
                      encargo NO es suyo. Va en la fila del producto porque es
                      ahí donde se decide despacharlo, y despachar lo ajeno como
                      propio es el error que este chip existe para evitar. */}
                  {c.duenoMadera === "tercero" && (
                    <span
                      title={
                        c.titularNombre
                          ? `La madera es de ${c.titularNombre} — el centro la asierra por encargo`
                          : "Madera de un tercero: el centro la asierra por encargo"
                      }
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--data-info-500)]/15 px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
                    >
                      <Users className="h-3 w-3 shrink-0" aria-hidden />
                      {c.titularNombre ?? "De tercero"}
                    </span>
                  )}
                  {/* Reservado para alguien (ADR-418): sigue en el patio y sigue
                      contando en los m³, pero ya tiene dueño. Una reserva
                      vencida que nadie soltó es stock congelado por error, y la
                      pastilla lo dice en rojo. */}
                  {apartado && (
                    <CeldaApartado
                      apartado={apartado}
                      ahora={ahora ?? undefined}
                      onAbrir={() =>
                        setApartando({
                          filas: [
                            {
                              ctpEntryId: c.id,
                              paqueteId: p?.id ?? null,
                              etiqueta: p?.codigo ?? `Corrida N° ${c.lineNo ?? "—"}`,
                              volumenM3: p?.volumenM3 ?? c.disponible,
                              piezas: p?.cantidad ?? null,
                            },
                          ],
                          apartadoActual: apartado,
                        })
                      }
                    />
                  )}
                  {c.usadoAt && (
                    <span
                      title={
                        c.usadoMotivo
                          ? `Marcado como usado: ${c.usadoMotivo}`
                          : "Marcado como usado"
                      }
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--data-warning-500)]/15 px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                    >
                      <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden /> Usado
                    </span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-[var(--text-secondary)]">{c.especie ?? "—"}</td>
              {colsVisibles.presentacion && (
                <td className="px-3 py-2 text-[var(--text-tertiary)]">
                  {p?.presentacion ?? c.presentacion ?? "—"}
                </td>
              )}
              {colsVisibles.medidas && (
                <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
                  {/* El `—` mudo pasó a ser puerta: sin escuadría el volumen de
                      este paquete no tiene contra qué cotejarse (27 de 33 en el
                      libro real). Con ella, al lado va el veredicto del cuadre. */}
                  <CeldaEscuadria
                    paquete={p}
                    onEditar={() =>
                      p &&
                      setEscuadria({
                        id: p.id,
                        codigo: p.codigo,
                        ctpEntryId: c.id,
                        lineNo: c.lineNo,
                        producto: p.producto ?? c.producto,
                        especie: c.especie,
                        cantidad: p.cantidad,
                        volumenM3: p.volumenM3,
                        espesorCm: p.espesorCm,
                        anchoCm: p.anchoCm,
                        largoM: p.largoM,
                      })
                    }
                  />
                </td>
              )}
              <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                {p ? nf(p.cantidad) : "—"}
              </td>
              <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                {fmtM3(p?.volumenM3 ?? c.disponible)}
              </td>
              {/* Pie tablar: es la unidad en la que se canta y se vende en el
                  patio; el libro guarda m³ y la conversión se hacía aparte. */}
              {colsVisibles.pieTablar && (
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                  {formatNumber(pieTablarDe(p?.volumenM3 ?? c.disponible))}
                </td>
              )}
              {colsVisibles.valor && (
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                  {valorSoles == null ? (
                    /* Un guion, nunca S/ 0: el costo de la guía todavía no se
                       cargó y un cero afirmaría que esa madera no costó nada. */
                    <span
                      title="No se puede valorizar: falta el costo de la guía que trajo esta madera"
                      className="text-[var(--text-tertiary)]"
                    >
                      —
                    </span>
                  ) : (
                    `${formatCurrency(valorSoles)}`
                  )}
                </td>
              )}
              {colsVisibles.lote && (
                <td className="px-3 py-2 text-xs text-[var(--text-tertiary)]">
                  <span className="font-mono">N° {c.lineNo ?? "—"}</span>
                  {c.lote && <span className="ml-1 font-mono">· {c.lote}</span>}
                  <div>{fmtDia(c.fecha)}</div>
                </td>
              )}
              {colsVisibles.edad && (
                <td className="px-3 py-2 text-right">
                  {dias == null ? (
                    <span className="text-[var(--text-tertiary)]">—</span>
                  ) : (
                    <span
                      title={`Aserrado el ${fmtDia(c.fecha)}`}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[length:var(--ts-2xs)] font-bold tabular-nums ${EDAD_TONO[tramo ?? "fresco"]}`}
                    >
                      {fmtEdad(dias)}
                    </span>
                  )}
                </td>
              )}
              <td className="px-3 py-2 text-right">
                <span className="font-mono font-bold tabular-nums text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                  {fmtM3(c.disponible)}
                </span>
                {c.despachado > 0 && (
                  <div className="font-mono text-xs text-[var(--text-tertiary)]">
                    de {fmtM3(c.producido)} · salió {fmtM3(c.despachado)}
                  </div>
                )}
              </td>
              {colsVisibles.permiso && (
                <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
                  {c.titularOrigen?.length ? c.titularOrigen.join(" · ") : "—"}
                </td>
              )}
              {/**
               * Qué se puede HACER con esta madera, en la fila donde se la mira
               * (ADR-367). Antes la vista era sólo de consulta: para reprocesar
               * o para cubicar había que salir a otra pestaña y volver a buscar
               * el producto.
               */}
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-1">
                  {/* Editar los datos de la fila. Va primero porque es lo que
                      se hace ANTES de cubicar o despachar: un producto con la
                      especie mal escrita no se busca en la pila. */}
                  <IconAction
                    icon={Pencil}
                    tone="muted"
                    onClick={() =>
                      setEditar({
                        id: c.id,
                        lineNo: c.lineNo,
                        fecha: c.fecha,
                        observations: c.observations,
                        presentacion: c.presentacion,
                        materiaPrimaRef: c.lote,
                        duenoMadera: c.duenoMadera ?? null,
                        titularNombre: c.titularNombre ?? null,
                        speciesCommon: c.especie,
                        speciesScientific: c.especieCientifica,
                        productType: c.producto,
                        unit: c.unidad,
                        quantity: c.cantidad,
                        volumeInputM3: c.volumenConsumidoM3,
                        /* El saldo despachado/reprocesado es lo que la pantalla
                           ya sabe de las ataduras: alcanza para avisar antes de
                           abrir. El servidor vuelve a decidir con la verdad. */
                        atadaPorque:
                          c.despachado > 0
                            ? "ya tiene madera despachada"
                            : c.reprocesado > 0
                              ? "ya alimentó un reproceso"
                              : null,
                        permisos: c.titularOrigen,
                        gtfOrigen: c.gtfOrigen,
                        /* Las especies que este libro ya escribió: sugerencia
                           para no inventar una grafía nueva de la misma madera
                           («Tornillo» y «TORNILLO» eran dos, ADR-400 §6). */
                        especiesConocidas: opciones.especies,
                      })
                    }
                    label="Editar los datos de la fila: especie, producto, cantidad, volumen, permiso"
                  />
                  <IconAction
                    icon={PackageOpen}
                    tone="muted"
                    disabled={!p?.codigo}
                    onClick={() => p?.codigo && setFichaPaquete(p.codigo)}
                    label={
                      p?.codigo
                        ? `Ficha de ${p.codigo}: de qué corrida y de qué madera salió`
                        : "Sin paquete: no hay ficha"
                    }
                  />
                  <IconAction
                    icon={Ruler}
                    tone="info"
                    onClick={() => setCubicar({ corrida: c, paquete: p })}
                    label="Cubicar: medir pieza por pieza, cuadrar contra el libro y guardar (sale el ANEXO N° 04)"
                  />
                  {!apartado && puedeApartar && (
                    <IconAction
                      icon={BookmarkPlus}
                      tone="info"
                      onClick={() =>
                        setApartando({
                          filas: [
                            {
                              ctpEntryId: c.id,
                              paqueteId: p?.id ?? null,
                              etiqueta: p?.codigo ?? `Corrida N° ${c.lineNo ?? "—"}`,
                              volumenM3: p?.volumenM3 ?? c.disponible,
                              piezas: p?.cantidad ?? null,
                            },
                          ],
                          apartadoActual: null,
                        })
                      }
                      label="Apartar: reservarlo para un cliente hasta que se emita la guía"
                    />
                  )}
                  <IconAction
                    icon={RefreshCw}
                    tone="accent"
                    disabled={c.disponible <= 0}
                    onClick={() => setReprocesar(c)}
                    label={
                      c.disponible > 0
                        ? "Reprocesar: vuelve a la sierra y sale como otro producto"
                        : "Sin saldo disponible para reprocesar"
                    }
                  />
                  {c.usadoAt ? (
                    <IconAction
                      icon={RotateCcw}
                      tone="success"
                      busy={desmarcando === c.id}
                      disabled={desmarcando != null}
                      onClick={() => void desmarcar(c)}
                      label="Desmarcar: vuelve a aparecer en Productos disponibles"
                    />
                  ) : (
                    <IconAction
                      icon={CheckCircle2}
                      tone="muted"
                      onClick={() => setMarcarUsado(c)}
                      label="Marcar como usado: sale de Productos disponibles sin despacharse ni reprocesarse"
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </TbodyCtp>
        {/* Los totales de la columna, alineados bajo su propia columna — antes
            sólo el volumen aparecía suelto en el pie de la paginación, sin
            relación visual con Piezas ni Pie tablar. «Saldo corrida» queda
            sin total a propósito: la misma corrida repite su saldo en cada
            uno de sus paquetes, así que sumar la columna la contaría de más
            — el total correcto YA es el de Volumen (una vez por corrida). */}
        {ordenadas.length > 0 && (
          <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
            <tr>
              <td
                colSpan={4 + (colsVisibles.presentacion ? 1 : 0) + (colsVisibles.medidas ? 1 : 0)}
                className="px-3 py-2 text-sm font-bold text-[var(--text-secondary)]"
              >
                {corridasALaVista} {corridasALaVista === 1 ? "corrida" : "corridas"} ·{" "}
                {ordenadas.length} {ordenadas.length === 1 ? "fila" : "filas"}
              </td>
              <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                {nf(totalPiezas)}
              </td>
              {/* El total de una columna es la SUMA DE ESA COLUMNA. Antes venía
                  del KPI (saldo por corrida) y con un aviso tildado habría
                  quedado mostrando el total de filas que no están en pantalla. */}
              <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                {fmtM3(volumenALaVista)}
              </td>
              {colsVisibles.pieTablar && (
                <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                  {formatNumber(pieTablarDe(volumenALaVista))}
                </td>
              )}
              {colsVisibles.valor && (
                <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                  {/* Sin total si falta valorizar alguna fila: un subtotal
                      presentado como total es la mentira más fácil de creer. */}
                  {valorDelStock.filasSinValor > 0 || valorDelStock.filasValorizadas === 0 ? (
                    <span
                      title={`Faltan ${valorDelStock.filasSinValor} filas por valorizar`}
                      className="font-sans text-[length:var(--ts-2xs)] font-normal text-[var(--text-tertiary)]"
                    >
                      parcial
                    </span>
                  ) : (
                    `${formatCurrency(valorDelStock.totalSoles)}`
                  )}
                </td>
              )}
              {colsVisibles.lote && <td />}
              {colsVisibles.edad && (
                <td className="px-3 py-2 text-right font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                  {edadDelStock.masViejoDias == null
                    ? "—"
                    : `el más viejo: ${fmtEdad(edadDelStock.masViejoDias)}`}
                </td>
              )}
              <td />
              {colsVisibles.permiso && <td />}
              <td />
            </tr>
          </tfoot>
        )}
      </TablaCtp>

      <CtpPaginacion
        rango={rango}
        porPagina={porPagina}
        onPorPagina={setPorPagina}
        onIr={ir}
        sustantivo="paquete"
        extra={
          <span className="font-mono tabular-nums">{fmtM3(volumenALaVista)} m³ disponibles</span>
        }
      />
      {/* De un código de la pila a su corrida y a la madera con la que se hizo. */}
      {fichaPaquete && (
        <CtpPaqueteFicha codigo={fichaPaquete} onClose={() => setFichaPaquete(null)} />
      )}

      {/**
       * Cubicar el camión entero (ADR-369): se mide una vez y se cuadra contra
       * TODO lo tildado, especie por especie. Lo que sobra de una especie no
       * puede tapar lo que falta de otra, y eso sólo se ve mirando el conjunto.
       */}
      {cubicarConjunto && (
        <CtpCubicarProductoModal
          ctpEntryIds={totalElegido.corridas}
          titulo={`Cubicar ${elegidas.length} registro(s) · ${fmtM3(totalElegido.m3)} m³`}
          filas={elegidas}
          onClose={() => setCubicarConjunto(false)}
          onGuardada={(msg) => {
            setCubicarConjunto(false);
            setSeleccion(new Set());
            setNota(msg);
          }}
        />
      )}

      {editar && (
        <CtpEditarLineaModal
          linea={editar}
          onCerrar={() => setEditar(null)}
          onListo={(resumen) => {
            setNota(resumen);
            invalidarCtp();
            void recargar();
          }}
        />
      )}

      {seleccion.size > 0 && (
        <CtpBarraSeleccion
          cifras={[
            { label: "Registros", valor: `${elegidas.length}` },
            { label: "Piezas", valor: `${totalElegido.piezas}` },
            { label: "Volumen", valor: `${fmtM3(totalElegido.m3)} m³`, fuerte: true },
            {
              label: "Pie tablar",
              valor: `${formatNumber(pieTablarDe(totalElegido.m3))} pt`,
            },
          ]}
          onLimpiar={() => setSeleccion(new Set())}
          accionLabel="Cubicar madera"
          accionIcon={Ruler}
          onAccion={() => setCubicarConjunto(true)}
          /* Despachar con guía sin volver a elegir: la lista de la guía nace
             con estos mismos productos (`presetUids`, ya usado por la cancha
             de reserva del mapa de planta — mismo camino, otro punto de
             partida). */
          accionesSecundarias={[
            { label: "Despachar con guía", icon: Truck, onClick: () => setDespachando(true) },
            /* Apartar lo tildado (ADR-418): el paso que faltaba entre elegir y
               emitir. Hasta ahora, entre las dos cosas no había ningún estado y
               nada impedía que otro despachara los mismos paquetes. */
            ...(puedeApartar ? [{
              label: "Apartar para un cliente",
              icon: BookmarkPlus,
              onClick: () =>
                setApartando({
                  filas: filas
                    .filter((f) => seleccion.has(claveFila(f)))
                    .map((f) => ({
                      ctpEntryId: f.corrida.id,
                      paqueteId: f.paquete?.id ?? null,
                      etiqueta: f.paquete?.codigo ?? `Corrida N° ${f.corrida.lineNo ?? "—"}`,
                      volumenM3: f.volumenM3,
                      piezas: f.paquete?.cantidad ?? null,
                    })),
                  apartadoActual: null,
                }),
            }] : []),
          ]}
        />
      )}

      {despachando && (
        <CtpDespachoGuiaModal
          presetUids={[...seleccion]}
          onClose={() => setDespachando(false)}
          onSaved={({ lineas, offline }) => {
            setDespachando(false);
            setSeleccion(new Set());
            setNota(
              offline
                ? `Sin señal: ${lineas} producto${lineas === 1 ? "" : "s"} quedaron anotados y suben solos con la conexión.`
                : `Guía registrada · ${lineas} ${lineas === 1 ? "línea" : "líneas"}.`,
            );
            void recargar();
          }}
        />
      )}

      {reprocesar && (
        <CtpReprocesoModal
          origen={{
            id: reprocesar.id,
            lineNo: reprocesar.lineNo,
            especie: reprocesar.especie,
            producto: reprocesar.producto,
            unidad: reprocesar.unidad,
            disponible: reprocesar.disponible,
          }}
          /* Lo que la distribución ya calculó no se vuelve a tipear: producto
             y m³ llegan puestos y el operario confirma. */
          sugerencia={
            sugerido
              ? {
                  producto: sugerido.productoDestino,
                  m3: sugerido.m3,
                  desdeTipo: sugerido.desdeTipo,
                }
              : undefined
          }
          onClose={() => setReprocesar(null)}
          onListo={(msg, detalle) => {
            setReprocesar(null);
            /* El pase se consume y aparece el siguiente de la cola: dejarlo
               colgado ofrecería declarar dos veces el mismo reproceso. */
            avanzarCola();
            setNota(`${msg} — ${detalle}`);
            /* La madera dejó de estar disponible: la lista tiene que decirlo ya. */
            void recargar();
          }}
        />
      )}

      {marcarUsado && (
        <CtpMarcarUsadoModal
          corridaId={marcarUsado.id}
          lineNo={marcarUsado.lineNo}
          onClose={() => setMarcarUsado(null)}
          onListo={(msg) => {
            setMarcarUsado(null);
            setNota(msg);
            void recargar();
          }}
        />
      )}

      {/**
       * Cubicar el producto (ADR-368): se mide pieza por pieza con las mismas
       * fórmulas del cubicador, se CUADRA contra lo que el libro declara —tipo,
       * especie, piezas y volumen— y se guarda ligado a la corrida. De ahí sale
       * el ANEXO N° 04, que es el papel que detalla lo que la guía resume.
       */}
      {cubicar && (
        <CtpCubicarProductoModal
          ctpEntryIds={[cubicar.corrida.id]}
          titulo={cubicar.paquete?.codigo ?? `Corrida N° ${cubicar.corrida.lineNo ?? "—"}`}
          filas={[
            {
              id: cubicar.paquete?.id ?? cubicar.corrida.id,
              etiqueta: cubicar.paquete?.codigo ?? `Corrida N° ${cubicar.corrida.lineNo ?? "—"}`,
              especie: cubicar.corrida.especie,
              producto: cubicar.paquete?.producto ?? cubicar.corrida.producto,
              piezas: cubicar.paquete?.cantidad ?? null,
              volumenM3: cubicar.paquete?.volumenM3 ?? cubicar.corrida.disponible,
            },
          ]}
          onClose={() => setCubicar(null)}
          onGuardada={(msg) => {
            setCubicar(null);
            setNota(msg);
          }}
        />
      )}

      {/**
       * Cargar o corregir la escuadría del paquete. El volumen declarado NO se
       * pisa: el modal muestra la diferencia y el que midió la pila decide.
       */}
      {escuadria && (
        <CtpEscuadriaPaqueteModal
          paquete={escuadria}
          onCerrar={() => setEscuadria(null)}
          onGuardar={guardarEscuadria}
        />
      )}

      {/**
       * Reservar producto para un cliente (ADR-418).
       *
       * Medido el 2026-09-15: 9 de las 14 corridas de Blas salieron del stock
       * por «marcar como usado» —sin guía y sin cliente—. Apartar es el estado
       * que faltaba: la madera sigue contando en el patio, pero la pantalla
       * dice para quién es y hasta cuándo.
       */}
      {apartando && (
        <CtpApartarModal
          abierto
          filas={apartando.filas}
          apartadoActual={apartando.apartadoActual}
          destinatariosConocidos={destinatariosConocidos}
          onCerrar={() => setApartando(null)}
          onListo={(msg) => {
            setApartando(null);
            setSeleccion(new Set());
            setNota(msg);
            invalidarCtp("/forestal/ctp");
            void recargar();
          }}
        />
      )}
    </div>
  );
}
