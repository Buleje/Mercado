/**
 * loth-planificador — propone CÓMO SE SACA LA MADERA de un plan: dónde va el
 * patio de acopio, dónde se arma el campamento, por dónde corren las trochas
 * de arrastre, por dónde sale el camión y en qué orden se tala.
 *
 * Todo SEGÚN LA GEOGRAFÍA: la altitud (pendientes), los ríos y quebradas (con
 * su faja marginal) y los caminos que ya existen (`loth-geografia.ts`). Cada
 * cosa que propone viene con su POR QUÉ en una frase y las cifras: el regente
 * decide, el sistema no inventa sin decir de dónde sale.
 *
 * PURO (sin React, DOM ni fetch) y determinístico: la misma entrada da la
 * misma propuesta, con los mismos ids. Lo corre `/api/admin/forestal/loth/
 * planificador` y lo puede correr el navegador al mover el patio.
 *
 * Cómo trabaja por dentro: pasa todo a metros locales (x al este, y al norte;
 * para un área de pocos km el error frente a la esfera es de centímetros) y
 * vuelve a lat/lng sólo para la salida. Las largas que se informan se miden
 * con haversine sobre la línea final, igual que las mide el mapa.
 */

import { pointInPolygon, type LatLng } from "./loth-geo";
import { FAJA_SUGERIDA } from "./loth-faja";
import { PENDIENTE_CRITICA_PCT } from "./loth-elevacion";
import { distanceM, hullBuffer, lineLengthM } from "./loth-utm";
import { textoDistancia } from "./loth-mapa-arboles";
import type { EtapaArbol } from "./loth-etapa-arbol";
import type { LothCartografia, LothReferencia, LothVia } from "./loth-cartografia";
import { etiquetaLinea, PREFIJO_PROPUESTA, type Bbox, type GrillaElevacion, type LineaGeo } from "./loth-geografia";
import {
  aLL,
  aXY,
  claseDeAgua,
  crearPlano,
  distPuntoSeg,
  IndiceSegmentos,
  pct,
  plural,
  r0,
  r1,
  Relieve,
  type Seg,
} from "./loth-planificador-terreno";
import { armarRed, buscarPatios, celdasEmpinadas, trazarSalida, ubicarCampamento, type AguaCerca, type EnFaja } from "./loth-planificador-piezas";

export { celdasEmpinadas };

// ─── Parámetros ──────────────────────────────────────────────────────────────

export interface ParametrosPlan {
  /** Pendiente a partir de la cual el arrastre mecanizado no es viable (%). */
  pendienteMaxArrastrePct: number;
  /** Un patio de acopio tiene que ser casi plano: se apilan trozas y maniobra un cargador. */
  pendienteMaxPatioPct: number;
  pendienteMaxCampamentoPct: number;
  /** Faja marginal a CADA lado (m). La ANA fija la real; estos son los de referencia. */
  fajaRioM: number;
  fajaQuebradaM: number;
  /** El campamento, a lo sumo a esta distancia del patio. */
  distMaxCampamentoM: number;
  /** …y con agua a lo sumo a esta distancia. */
  distMaxAguaCampamentoM: number;
  /** Ni encima del patio: ruido, polvo y maniobras. */
  distMinCampamentoPatioM: number;
  /** Entre dos patios alternativos, al menos esto (si no, son el mismo lugar). */
  separacionPatiosM: number;
  /**
   * Cuánto pesa ABRIR un metro de camino, en «m³ arrastrados un metro». Con
   * 400: abrir 1 m de camino cuesta como arrastrar 400 m³ un metro más. Es un
   * orden de magnitud de referencia (camino con tractor ≈ cientos de veces el
   * arrastre de un m³ por metro), NO una cifra del negocio: se ajusta.
   * Así un plan chico lleva el patio al camino (no paga abrir vía) y uno grande
   * lo mete en el monte (arrastrar tanta madera cuesta más que el camino).
   */
  pesoCaminoM3: number;
  /** Metros «equivalentes» que suma cruzar un río o quebrada (badén, puente, barro). */
  penalidadCruceM: number;
  /** Un tramo es trocha PRINCIPAL si por él sale la madera de al menos N árboles. */
  arbolesTrochaPrincipal: number;
  /** Al dibujar: un ramal más corto que esto a un solo árbol se saca con el cable del winche. */
  ramalMinimoM: number;
  /**
   * 0 = la menor cantidad de trocha posible; 1 = cada árbol por su camino más
   * corto al patio. Medido con los 61 árboles de Blas (29-09): 0 → 2,73 km de
   * trocha y 825 m de arrastre medio; 0,4 → 2,89 km y 679 m (+6 % de trocha,
   * −18 % de arrastre); 1 → 11,3 km y 556 m. Ver `armarRed`.
   */
  alfaArrastre: number;
  /** Pendiente máxima cómoda para un camión cargado en el camino de salida (%). */
  pendienteMaxCaminoPct: number;
  /** Una trocha que pasa a menos de esto de un semillero lo lastima al arrastrar (m). */
  distMinSemilleroM: number;
  /** Metros «equivalentes» que suma cada semillero que un tramo roza: se rodea si la vuelta es corta. */
  penalidadSemilleroM: number;
  /**
   * La trocha da la vuelta por lo seco antes que cruzar agua otra vez, salvo
   * que la vuelta cueste más que esto (m) por sobre el cruce.
   */
  vueltaMaxSinCruzarM: number;
}

export const PARAMETROS_PLAN: Readonly<ParametrosPlan> = {
  pendienteMaxArrastrePct: PENDIENTE_CRITICA_PCT,
  pendienteMaxPatioPct: 12,
  pendienteMaxCampamentoPct: 10,
  fajaRioM: FAJA_SUGERIDA.rio,
  fajaQuebradaM: FAJA_SUGERIDA.quebrada,
  distMaxCampamentoM: 500,
  distMaxAguaCampamentoM: 400,
  distMinCampamentoPatioM: 50,
  separacionPatiosM: 200,
  pesoCaminoM3: 400,
  penalidadCruceM: 250,
  arbolesTrochaPrincipal: 5,
  ramalMinimoM: 25,
  alfaArrastre: 0.4,
  pendienteMaxCaminoPct: 15,
  distMinSemilleroM: 5,
  penalidadSemilleroM: 150,
  vueltaMaxSinCruzarM: 500,
};

/** Tope de árboles por corrida: más que esto, se planifican los de más volumen. */
export const MAX_ARBOLES_PLAN = 2_000;

// ─── Entrada / salida ────────────────────────────────────────────────────────

export interface ArbolAExtraer {
  id: string;
  codigo: string;
  lat: number;
  lng: number;
  /** Volumen del censo; null = sin dato (pesa como el promedio de los demás). */
  m3: number | null;
  /** En qué punto de la cadena está. Sin etapa = en pie. */
  etapa?: EtapaArbol | null;
  especie?: string;
}

export interface EntradaPlan {
  arboles: readonly ArbolAExtraer[];
  /** Contorno del predio (o de la parcela); [] = sin dibujar. */
  predio: readonly LatLng[];
  rios: readonly LineaGeo[];
  caminos: readonly LineaGeo[];
  elevacion: GrillaElevacion | null;
  /** El recuadro de la geografía: por ahí se busca el camino de salida. */
  bbox?: Bbox | null;
  /** El patio que eligió el usuario (lo movió en el mapa): se respeta y se recalcula lo demás. */
  patioFijo?: LatLng | null;
  /** Árboles que NO se tocan (semilleros del regente o del POA): las trochas los rodean. */
  semilleros?: readonly { codigo: string; lat: number; lng: number }[];
  parametros?: Partial<ParametrosPlan>;
}

export interface PatioPropuesto {
  lat: number;
  lng: number;
  /** Menor = mejor. Metros·m³ de arrastre + el camino a abrir, en la misma unidad. */
  puntaje: number;
  /** Distancia en línea recta a la madera, ponderada por m³. */
  distanciaMediaM: number;
  distanciaCaminoM: number | null;
  caminoCercano: string | null;
  pendientePct: number | null;
  elevacionM: number | null;
  distanciaAguaM: number | null;
  fijadoPorUsuario: boolean;
  porQue: string;
}

export interface CampamentoPropuesto {
  lat: number;
  lng: number;
  distanciaPatioM: number;
  agua: { nombre: string; clase: ClaseAgua; distanciaM: number; fajaM: number } | null;
  pendientePct: number | null;
  porQue: string;
}

export interface TramoTrocha {
  id: string;
  desde: string;
  hasta: string;
  puntos: [LatLng, LatLng];
  largoM: number;
  pendienteMaxPct: number | null;
  /** Pasa la pendiente máxima de arrastre. */
  empinado: boolean;
  /** Veces que cruza un río o quebrada. */
  cruces: number;
  /** Códigos de los semilleros a menos de `distMinSemilleroM` (la trocha los roza). */
  semilleros: string[];
  clase: "principal" | "ramal";
  arbolesAguasAbajo: number;
  m3AguasAbajo: number;
}

export interface LineaTrocha {
  id: string;
  nombre: string;
  clase: "principal" | "ramal";
  puntos: LatLng[];
  largoM: number;
  /** Códigos de los árboles que se sacan por esta línea (el que la termina incluido). */
  arboles: string[];
  /** La línea de la que sale; null = sale del patio. */
  saleDe: string | null;
}

export interface CaminoSalida {
  puntos: LatLng[];
  largoM: number;
  pendienteMaxPct: number | null;
  cruces: number;
  destino: string;
  porQue: string;
}

export interface PasoDeTala {
  orden: number;
  id: string;
  codigo: string;
  ramal: string;
  distanciaRedM: number;
  m3: number | null;
  accion: "talar_y_arrastrar" | "arrastrar";
  enFaja: boolean;
  fueraDelPredio: boolean;
}

export interface CeldaNoApta {
  sur: number;
  oeste: number;
  norte: number;
  este: number;
  pendientePct: number;
}

export interface PropuestaPlan {
  vacia: boolean;
  motivo: string | null;
  resumen: {
    arboles: number;
    m3: number;
    dentroDelPredio: number;
    fueraDelPredio: number;
    enFaja: number;
    /** Sobre el tope: no entraron a la corrida. */
    fueraDelTope: number;
  };
  /** El elegido primero; hasta 3, separados. */
  patios: PatioPropuesto[];
  campamento: CampamentoPropuesto | null;
  trochas: {
    tramos: TramoTrocha[];
    lineas: LineaTrocha[];
    largoTotalM: number;
    largoPrincipalM: number;
    largoRamalesM: number;
    distanciaMediaArrastreM: number;
    distanciaMaxArrastreM: number;
    tramosEmpinados: number;
    cruces: number;
    porQue: string;
  };
  caminoSalida: CaminoSalida | null;
  ordenTala: PasoDeTala[];
  porQueOrden: string;
  zonasNoAptas: CeldaNoApta[];
  avisos: string[];
  parametros: ParametrosPlan;
}

export type ClaseAgua = "rio" | "quebrada";


function vacia(motivo: string, parametros: ParametrosPlan, avisos: string[] = [], resumen?: PropuestaPlan["resumen"]): PropuestaPlan {
  return {
    vacia: true,
    motivo,
    resumen: resumen ?? { arboles: 0, m3: 0, dentroDelPredio: 0, fueraDelPredio: 0, enFaja: 0, fueraDelTope: 0 },
    patios: [],
    campamento: null,
    trochas: {
      tramos: [],
      lineas: [],
      largoTotalM: 0,
      largoPrincipalM: 0,
      largoRamalesM: 0,
      distanciaMediaArrastreM: 0,
      distanciaMaxArrastreM: 0,
      tramosEmpinados: 0,
      cruces: 0,
      porQue: motivo,
    },
    caminoSalida: null,
    ordenTala: [],
    porQueOrden: "",
    zonasNoAptas: [],
    avisos,
    parametros,
  };
}

// ─── El planificador ─────────────────────────────────────────────────────────

/**
 * Propone patio, campamento, trochas, camino de salida y orden de tala.
 * Nunca lanza por falta de datos: sin ríos, sin caminos o sin relieve, propone
 * con lo que hay y lo dice en `avisos`.
 */
export function planificarExtraccion(entrada: EntradaPlan): PropuestaPlan {
  const P: ParametrosPlan = { ...PARAMETROS_PLAN, ...limpiarParametros(entrada.parametros) };
  const avisos: string[] = [];

  // ── Árboles válidos + tope ──
  const validos = entrada.arboles.filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng) && !(a.lat === 0 && a.lng === 0));
  const sinCoords = entrada.arboles.length - validos.length;
  if (sinCoords > 0) avisos.push(`${plural(sinCoords, "árbol no tiene", "árboles no tienen")} coordenadas: no entran al plan.`);
  let arboles = validos;
  let fueraDelTope = 0;
  if (arboles.length > MAX_ARBOLES_PLAN) {
    fueraDelTope = arboles.length - MAX_ARBOLES_PLAN;
    arboles = [...arboles].sort((a, b) => (b.m3 ?? 0) - (a.m3 ?? 0) || a.codigo.localeCompare(b.codigo, "es", { numeric: true })).slice(0, MAX_ARBOLES_PLAN);
    avisos.push(`Se planificaron los ${MAX_ARBOLES_PLAN.toLocaleString("en-US")} árboles de más volumen; ${plural(fueraDelTope, "quedó", "quedaron")} fuera.`);
  }
  if (arboles.length === 0) {
    return vacia(
      entrada.arboles.length === 0
        ? "No hay árboles para sacar en este plan: todos están talados y despachados, son semilleros, o el censo está vacío."
        : "Ningún árbol del censo tiene coordenadas: carga sus UTM para poder planificar.",
      P,
      avisos,
      { arboles: 0, m3: 0, dentroDelPredio: 0, fueraDelPredio: 0, enFaja: 0, fueraDelTope },
    );
  }
  // Orden estable: el resultado no depende del orden en que vino la lista.
  arboles = [...arboles].sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }) || a.id.localeCompare(b.id));

  const conM3 = arboles.filter((a) => a.m3 != null && a.m3 > 0);
  const m3Medio = conM3.length ? conM3.reduce((s, a) => s + (a.m3 as number), 0) / conM3.length : 1;
  const peso = (a: ArbolAExtraer) => (a.m3 != null && a.m3 > 0 ? a.m3 : m3Medio);
  const m3Total = conM3.reduce((s, a) => s + (a.m3 as number), 0);
  const pesoTotal = arboles.reduce((s, a) => s + peso(a), 0);
  if (conM3.length < arboles.length) {
    avisos.push(`${plural(arboles.length - conM3.length, "árbol no tiene", "árboles no tienen")} volumen en el censo: pesan como el promedio (${m3Medio.toFixed(2)} m³).`);
  }

  // ── Plano local centrado en la madera ──
  const cLat = arboles.reduce((s, a) => s + a.lat, 0) / arboles.length;
  const cLng = arboles.reduce((s, a) => s + a.lng, 0) / arboles.length;
  const pl = crearPlano(cLat, cLng);
  const relieve = new Relieve(entrada.elevacion, pl);
  const txy = arboles.map((a) => aXY(pl, [a.lat, a.lng]));

  // ── Agua y caminos al índice ──
  const rios = entrada.rios.filter((l) => l.puntos.length >= 2);
  const agua = new IndiceSegmentos(100);
  rios.forEach((l, li) => {
    for (let i = 0; i < l.puntos.length - 1; i++) {
      const [ax, ay] = aXY(pl, l.puntos[i]);
      const [bx, by] = aXY(pl, l.puntos[i + 1]);
      agua.agregar({ ax, ay, bx, by, linea: li });
    }
  });
  const fajaDe = (li: number) => (claseDeAgua(rios[li]) === "rio" ? P.fajaRioM : P.fajaQuebradaM);
  const fajaMax = Math.max(P.fajaRioM, P.fajaQuebradaM);
  /** Agua más cercana dentro de `radio`, con su faja. */
  const aguaCerca: AguaCerca = (x, y, radio) => {
    const m = agua.masCercano(x, y, radio);
    return m ? { d: m.d, linea: m.linea, faja: fajaDe(m.linea) } : null;
  };
  /**
   * ¿Cae dentro de la faja de ALGÚN cauce? No alcanza con el más cercano: una
   * quebrada a 40 m (faja 30) puede tapar a un río a 45 m (faja 50).
   */
  const enAlgunaFaja: EnFaja = (x, y, holguraM = 0) => {
    for (const k of agua.enCaja(x - fajaMax - holguraM, y - fajaMax - holguraM, x + fajaMax + holguraM, y + fajaMax + holguraM)) {
      const s = agua.segs[k];
      const d = distPuntoSeg(x, y, s.ax, s.ay, s.bx, s.by);
      const faja = fajaDe(s.linea);
      if (d <= faja + holguraM) return { d, linea: s.linea, faja };
    }
    return null;
  };

  const caminos = entrada.caminos.filter((l) => l.puntos.length >= 2 && l.vehicular !== false);
  const segCamino: Seg[] = [];
  caminos.forEach((l, li) => {
    for (let i = 0; i < l.puntos.length - 1; i++) {
      const [ax, ay] = aXY(pl, l.puntos[i]);
      const [bx, by] = aXY(pl, l.puntos[i + 1]);
      segCamino.push({ ax, ay, bx, by, linea: li });
    }
  });
  const caminoMasCercano = (x: number, y: number): { d: number; linea: number } | null => {
    let mejor: { d: number; linea: number } | null = null;
    for (const s of segCamino) {
      const d = distPuntoSeg(x, y, s.ax, s.ay, s.bx, s.by);
      if (!mejor || d < mejor.d) mejor = { d, linea: s.linea };
    }
    return mejor;
  };

  if (rios.length === 0) avisos.push("No se conocen ríos ni quebradas en la zona: no se pudo cuidar la faja marginal ni buscar agua para el campamento. Si hay, dibújalos en el mapa.");
  if (caminos.length === 0) avisos.push("No se conocen caminos en la zona: no hay a dónde conectar el patio. Dibuja la vía de acceso en el mapa.");
  if (!relieve.hay) avisos.push("Sin datos de altitud: no se midieron pendientes. Las trochas se trazaron como si el terreno fuera plano.");

  // ── Predio: dentro/fuera, faja ──
  const predio = entrada.predio.length >= 3 ? [...entrada.predio] : [];
  const dentro = arboles.map((a) => (predio.length ? pointInPolygon([a.lat, a.lng], predio) : true));
  const fueraDelPredio = predio.length ? dentro.filter((d) => !d).length : 0;
  const enFaja = txy.map(([x, y]) => enAlgunaFaja(x, y));
  const nEnFaja = enFaja.filter(Boolean).length;
  const codigos = (idx: number[]) => {
    const cs = idx.slice(0, 6).map((i) => arboles[i].codigo);
    return idx.length > 6 ? `${cs.join(", ")} y ${idx.length - 6} más` : cs.join(", ");
  };
  const m3Fuera = arboles.reduce((s, a, i) => s + (dentro[i] ? 0 : peso(a)), 0);
  // El predio, salvo que la mayor parte de la madera esté afuera: entonces un
  // patio «dentro del predio» quedaría lejísimos y se busca junto a los árboles.
  const usarPredio = predio.length > 0 && m3Fuera / pesoTotal < 0.5;
  if (!predio.length) avisos.push("No hay predio ni área dibujada: el patio se buscó alrededor de los árboles.");
  if (fueraDelPredio > 0) {
    const idx = dentro.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0);
    const quien = fueraDelPredio === arboles.length ? `Los ${plural(fueraDelPredio, "árbol cae", "árboles caen")}` : `${fueraDelPredio} de ${plural(arboles.length, "árbol caen", "árboles caen")}`;
    // Un solo aviso por un solo hecho: dónde cae la madera y qué se hizo con eso.
    avisos.push(
      `${quien} fuera del área dibujada (${codigos(idx)}): ${usarPredio ? "se incluyen en el plan" : "el patio se buscó junto a los árboles y no dentro del área"}. Revisa el contorno o sus coordenadas.`,
    );
  }
  if (nEnFaja > 0) {
    const idx = enFaja.map((w, i) => (w ? i : -1)).filter((i) => i >= 0);
    avisos.push(`${plural(nEnFaja, "árbol queda", "árboles quedan")} dentro de la faja marginal de un río o quebrada (${codigos(idx)}): revisa antes de talarlos.`);
  }

  // ── Zona donde buscar el patio ──
  const zona: LatLng[] = usarPredio ? predio : hullBuffer(arboles.map((a) => [a.lat, a.lng] as LatLng), 150);

  const resumen: PropuestaPlan["resumen"] = {
    arboles: arboles.length,
    m3: Math.round(m3Total * 1000) / 1000,
    dentroDelPredio: predio.length ? arboles.length - fueraDelPredio : 0,
    fueraDelPredio,
    enFaja: nEnFaja,
    fueraDelTope,
  };

  // ── Zonas no aptas (celdas con pendiente > máx. de arrastre) ──
  const zonasNoAptas = celdasEmpinadas(entrada.elevacion, P.pendienteMaxArrastrePct);

  // ── Patio ──
  const evaluarPatio = (x: number, y: number) => {
    let arrastre = 0;
    for (let i = 0; i < arboles.length; i++) arrastre += peso(arboles[i]) * Math.hypot(txy[i][0] - x, txy[i][1] - y);
    const cam = caminoMasCercano(x, y);
    const puntaje = arrastre + (cam ? P.pesoCaminoM3 * cam.d : 0);
    return { arrastre, cam, puntaje };
  };

  const patios: PatioPropuesto[] = [];
  let descartes = { faja: 0, pendiente: 0, probados: 0 };
  const describirPatio = (x: number, y: number, fijado: boolean, extra: string): PatioPropuesto => {
    const ev = evaluarPatio(x, y);
    const [lat, lng] = aLL(pl, x, y);
    const p = relieve.pendiente(x, y);
    const z = relieve.z(x, y);
    const w = aguaCerca(x, y, 2_000);
    const media = ev.arrastre / pesoTotal;
    const camTxt = ev.cam
      ? `a ${textoDistancia(ev.cam.d)} de la vía más cercana (${etiquetaLinea(caminos[ev.cam.linea]).toLowerCase()})`
      : "sin camino conocido cerca";
    const aguaTxt = w ? `el agua más cercana a ${textoDistancia(w.d)} (fuera de su faja de ${w.faja} m)` : "sin ríos conocidos cerca";
    return {
      lat,
      lng,
      puntaje: r0(ev.puntaje),
      distanciaMediaM: r0(media),
      distanciaCaminoM: ev.cam ? r0(ev.cam.d) : null,
      caminoCercano: ev.cam ? etiquetaLinea(caminos[ev.cam.linea]) : null,
      pendientePct: p == null ? null : r1(p),
      elevacionM: z == null ? null : r0(z),
      distanciaAguaM: w ? r0(w.d) : null,
      fijadoPorUsuario: fijado,
      porQue: `${fijado ? "Lo fijaste tú. " : ""}Queda a ${textoDistancia(media)} en promedio de la madera (ponderado por m³), ${camTxt}, con ${pct(p)} y ${aguaTxt}.${extra}`,
    };
  };

  if (entrada.patioFijo && Number.isFinite(entrada.patioFijo[0]) && Number.isFinite(entrada.patioFijo[1])) {
    const [x, y] = aXY(pl, entrada.patioFijo);
    const w = enAlgunaFaja(x, y);
    const p = relieve.pendiente(x, y);
    const reparos: string[] = [];
    if (w) reparos.push(`cae dentro de la faja marginal (a ${r0(w.d)} m del agua)`);
    if (p != null && p > P.pendienteMaxPatioPct) reparos.push(`tiene ${r0(p)} % de pendiente (el máximo para un patio es ${P.pendienteMaxPatioPct} %)`);
    if (zona.length >= 3 && !pointInPolygon(entrada.patioFijo, zona)) reparos.push(usarPredio ? "queda fuera del predio" : "queda lejos de los árboles");
    patios.push(describirPatio(x, y, true, reparos.length ? ` Ojo: ${reparos.join(" y ")}.` : ""));
    if (reparos.length) avisos.push(`El patio que fijaste ${reparos.join(" y ")}.`);
  } else {
    const r = buscarPatios(zona, pl, P, relieve, enAlgunaFaja, evaluarPatio);
    descartes = r.descartes;
    if (r.elegidos.length === 0) {
      return {
        ...vacia("No hay ningún punto del área fuera de la faja marginal para poner el patio: revisa el contorno o los ríos dibujados.", P, avisos, resumen),
        zonasNoAptas,
      };
    }
    if (r.relajado) {
      avisos.push(`Ningún punto del área tiene menos de ${P.pendienteMaxPatioPct} % de pendiente: el patio propuesto es el menos empinado que se encontró. Habrá que nivelar.`);
    }
    const mejor = r.elegidos[0].puntaje;
    r.elegidos.forEach((c, i) => {
      const extra =
        i === 0
          ? ` Se probaron ${plural(descartes.probados, "punto", "puntos")}${descartes.pendiente || descartes.faja ? `; se descartaron ${plural(descartes.pendiente, "por pendiente", "por pendiente")} y ${plural(descartes.faja, "por la faja marginal", "por la faja marginal")}` : ""}.`
          : ` Opción ${i + 1}: ${r0(((c.puntaje - mejor) / Math.max(1, mejor)) * 100)} % más costosa que la primera.`;
      patios.push(describirPatio(c.x, c.y, false, extra));
    });
  }
  const patio = patios[0];
  const [px, py] = aXY(pl, [patio.lat, patio.lng]);

  // ── Trochas (árbol de expansión mínima con costo del terreno) ──
  const semilleros = (entrada.semilleros ?? []).filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  const idxSemilleros = new IndiceSegmentos(50);
  semilleros.forEach((s, i) => {
    const [x, y] = aXY(pl, [s.lat, s.lng]);
    idxSemilleros.agregar({ ax: x, ay: y, bx: x, by: y, linea: i });
  });
  const red = armarRed(px, py, txy, relieve, agua, P, idxSemilleros);
  const nodoLL = (k: number): LatLng => (k === 0 ? [patio.lat, patio.lng] : [arboles[k - 1].lat, arboles[k - 1].lng]);
  const nodoId = (k: number) => (k === 0 ? "patio" : arboles[k - 1].id);

  // Arraigar en el patio.
  const n = arboles.length + 1;
  const hijos: number[][] = Array.from({ length: n }, () => []);
  const padre = new Int32Array(n).fill(-1);
  const aristaDe = new Map<number, (typeof red)[number]>();
  {
    const ady: number[][] = Array.from({ length: n }, () => []);
    red.forEach((e, i) => {
      ady[e.a].push(i);
      ady[e.b].push(i);
    });
    const visto = new Uint8Array(n);
    visto[0] = 1;
    const cola = [0];
    for (let h = 0; h < cola.length; h++) {
      const u = cola[h];
      for (const ei of ady[u]) {
        const e = red[ei];
        const v = e.a === u ? e.b : e.a;
        if (visto[v]) continue;
        visto[v] = 1;
        padre[v] = u;
        hijos[u].push(v);
        aristaDe.set(v, e);
        cola.push(v);
      }
    }
  }
  // Cuántos árboles y m³ salen por cada nodo (post-orden).
  const orden: number[] = [];
  {
    const pila = [0];
    while (pila.length) {
      const u = pila.pop() as number;
      orden.push(u);
      for (const v of hijos[u]) pila.push(v);
    }
  }
  const cuenta = new Float64Array(n);
  const m3Abajo = new Float64Array(n);
  for (let i = orden.length - 1; i >= 0; i--) {
    const u = orden[i];
    if (u !== 0) {
      cuenta[u] += 1;
      m3Abajo[u] += arboles[u - 1].m3 ?? 0;
    }
    if (padre[u] >= 0) {
      cuenta[padre[u]] += cuenta[u];
      m3Abajo[padre[u]] += m3Abajo[u];
    }
  }
  const distRed = new Float64Array(n);
  const largoArista = new Float64Array(n);
  for (const u of orden) {
    if (u === 0) continue;
    largoArista[u] = distanceM(nodoLL(padre[u]), nodoLL(u));
    distRed[u] = distRed[padre[u]] + largoArista[u];
  }

  const tramos: TramoTrocha[] = [];
  for (const u of orden) {
    if (u === 0) continue;
    const e = aristaDe.get(u);
    if (!e) continue;
    tramos.push({
      id: `t-${nodoId(padre[u])}-${nodoId(u)}`,
      desde: nodoId(padre[u]),
      hasta: nodoId(u),
      puntos: [nodoLL(padre[u]), nodoLL(u)],
      largoM: r1(largoArista[u]),
      pendienteMaxPct: e.pendMax == null ? null : r1(e.pendMax),
      empinado: e.pendMax != null && e.pendMax > P.pendienteMaxArrastrePct,
      cruces: e.cruces,
      semilleros: e.semilleros.map((i) => semilleros[i].codigo),
      clase: cuenta[u] >= P.arbolesTrochaPrincipal ? "principal" : "ramal",
      arbolesAguasAbajo: cuenta[u],
      m3AguasAbajo: r1(m3Abajo[u] * 1000) / 1000,
    });
  }
  const claseDe = (u: number): "principal" | "ramal" => (cuenta[u] >= P.arbolesTrochaPrincipal ? "principal" : "ramal");

  // ── Líneas: cadenas del árbol (la que sigue por el hijo más pesado de su misma clase) ──
  const cadenas: { clase: "principal" | "ramal"; nodos: number[]; padreCadena: number | null }[] = [];
  const cadenaDeNodo = new Int32Array(n).fill(-1);
  {
    const pila: { desde: number; primero: number; padreCadena: number | null }[] = [];
    const ordenHijos = (u: number) => [...hijos[u]].sort((a, b) => m3Abajo[b] - m3Abajo[a] || cuenta[b] - cuenta[a] || a - b);
    for (const v of ordenHijos(0).reverse()) pila.push({ desde: 0, primero: v, padreCadena: null });
    while (pila.length) {
      const { desde, primero, padreCadena } = pila.pop() as (typeof pila)[number];
      const clase = claseDe(primero);
      const idx = cadenas.length;
      const nodos = [desde, primero];
      cadenaDeNodo[primero] = idx;
      let u = primero;
      const pendientes: { desde: number; primero: number; padreCadena: number }[] = [];
      for (;;) {
        const hs = ordenHijos(u);
        const sigue = hs.find((h) => claseDe(h) === clase);
        for (const h of hs) if (h !== sigue) pendientes.push({ desde: u, primero: h, padreCadena: idx });
        if (sigue == null) break;
        nodos.push(sigue);
        cadenaDeNodo[sigue] = idx;
        u = sigue;
      }
      cadenas.push({ clase, nodos, padreCadena });
      for (const p of pendientes.reverse()) pila.push(p);
    }
  }
  // Nombres: principales primero, cada grupo de la más larga a la más corta.
  const largoCadena = cadenas.map((c) => lineLengthM(c.nodos.map(nodoLL)));
  const nombreCadena: string[] = new Array(cadenas.length);
  {
    let np = 0;
    let nr = 0;
    const idx = cadenas.map((_, i) => i).sort((a, b) => (cadenas[a].clase === cadenas[b].clase ? largoCadena[b] - largoCadena[a] || a - b : cadenas[a].clase === "principal" ? -1 : 1));
    for (const i of idx) nombreCadena[i] = cadenas[i].clase === "principal" ? `Trocha ${++np}` : `Ramal ${++nr}`;
  }
  const lineas: LineaTrocha[] = cadenas.map((c, i) => ({
    id: `${PREFIJO_PROPUESTA}${c.clase === "principal" ? "trocha" : "ramal"}-${nombreCadena[i].split(" ")[1]}`,
    nombre: nombreCadena[i],
    clase: c.clase,
    puntos: c.nodos.map(nodoLL),
    largoM: r1(largoCadena[i]),
    arboles: c.nodos.filter((k) => k !== 0).slice(c.nodos[0] === 0 ? 0 : 1).map((k) => arboles[k - 1].codigo),
    saleDe: c.padreCadena == null ? null : nombreCadena[c.padreCadena],
  }));
  lineas.sort((a, b) => (a.clase === b.clase ? b.largoM - a.largoM || a.nombre.localeCompare(b.nombre) : a.clase === "principal" ? -1 : 1));

  const largoPrincipal = tramos.filter((t) => t.clase === "principal").reduce((s, t) => s + t.largoM, 0);
  const largoRamales = tramos.filter((t) => t.clase === "ramal").reduce((s, t) => s + t.largoM, 0);
  const sumaPesoDist = arboles.reduce((s, a, i) => s + peso(a) * distRed[i + 1], 0);
  const distMedia = sumaPesoDist / pesoTotal;
  const distMax = arboles.reduce((m, _, i) => Math.max(m, distRed[i + 1]), 0);
  const empinados = tramos.filter((t) => t.empinado);
  const crucesTot = tramos.reduce((s, t) => s + t.cruces, 0);
  const partes: string[] = [];
  partes.push(
    largoPrincipal > 0
      ? `${textoDistancia(largoPrincipal + largoRamales)} de trocha para ${plural(arboles.length, "árbol", "árboles")}: ${textoDistancia(largoPrincipal)} de trocha principal (por donde sale la madera de ${P.arbolesTrochaPrincipal} árboles o más) y ${textoDistancia(largoRamales)} de ramales.`
      : `${textoDistancia(largoRamales)} de trocha para ${plural(arboles.length, "árbol", "árboles")}, toda en ramales: ningún tramo junta la madera de ${P.arbolesTrochaPrincipal} árboles.`,
  );
  partes.push(`Arrastre medio de ${textoDistancia(distMedia)} (ponderado por m³), el más lejano a ${textoDistancia(distMax)}.`);
  if (relieve.hay) {
    partes.push(
      empinados.length
        ? `${plural(empinados.length, "tramo pasa", "tramos pasan")} el ${P.pendienteMaxArrastrePct} % de pendiente: ahí el tractor no arrastra, hay que rodear o sacar con cable.`
        : `Ningún tramo pasa el ${P.pendienteMaxArrastrePct} % de pendiente.`,
    );
  }
  if (rios.length) partes.push(crucesTot ? `${plural(crucesTot, "cruce", "cruces")} de río o quebrada: cada uno pide badén o puente.` : "No cruza ningún río ni quebrada.");
  const porQueTrochas = partes.join(" ");
  if (empinados.length) avisos.push(`${plural(empinados.length, "tramo de trocha pasa", "tramos de trocha pasan")} el ${P.pendienteMaxArrastrePct} % de pendiente.`);
  // Lo que no se pudo rodear (el único camino al árbol pasa junto al semillero): se dice cuál.
  const rozados = [...new Set(tramos.flatMap((t) => t.semilleros))];
  if (rozados.length) {
    avisos.push(`La trocha pasa a menos de ${P.distMinSemilleroM} m ${rozados.length === 1 ? "del semillero" : "de los semilleros"} ${rozados.slice(0, 6).join(", ")}: al arrastrar por ahí, cuídalo${rozados.length === 1 ? "" : "s"}.`);
  }

  // ── Camino de salida ──
  const caminoSalida = caminos.length ? trazarSalida(px, py, pl, relieve, agua, segCamino, caminos, entrada.bbox ?? null, zona, P) : null;
  if (caminos.length && !caminoSalida) avisos.push("No se encontró cómo llegar del patio a un camino dentro de la zona consultada.");

  // ── Campamento ──
  const campamento = ubicarCampamento(px, py, pl, relieve, aguaCerca, enAlgunaFaja, rios, zona, P);
  // El patio lo fijó el usuario: lo que eso le cuesta al campamento, dicho.
  if (entrada.patioFijo) {
    if (!campamento) avisos.push(`Con el patio donde lo pusiste no hay un lugar plano para el campamento a menos de ${textoDistancia(P.distMaxCampamentoM)}.`);
    else if (rios.length && !campamento.agua) {
      const w = aguaCerca(px, py, 5_000);
      avisos.push(
        `Con el patio donde lo pusiste, el campamento queda sin agua a menos de ${textoDistancia(P.distMaxAguaCampamentoM)}${w ? ` (la más cercana, a ${textoDistancia(w.d)} del patio)` : ""}.`,
      );
    }
  }

  // ── Orden de tala: de lo lejano a lo cercano, cada ramal antes que la trocha de la que sale ──
  const ordenTala: PasoDeTala[] = [];
  {
    const hijosCadena: number[][] = cadenas.map(() => []);
    const raices: number[] = [];
    cadenas.forEach((c, i) => (c.padreCadena == null ? raices.push(i) : hijosCadena[c.padreCadena].push(i)));
    const maxDist = cadenas.map((c) => c.nodos.reduce((m, k) => Math.max(m, distRed[k]), 0));
    const porLejania = (a: number, b: number) => maxDist[b] - maxDist[a] || a - b;
    const secuencia: number[] = [];
    const visitar = (ci: number) => {
      for (const h of [...hijosCadena[ci]].sort(porLejania)) visitar(h);
      secuencia.push(ci);
    };
    for (const r of raices.sort(porLejania)) visitar(r);
    for (const ci of secuencia) {
      const propios = cadenas[ci].nodos.filter((k) => k !== 0 && cadenaDeNodo[k] === ci);
      propios.sort((a, b) => distRed[b] - distRed[a] || a - b);
      for (const k of propios) {
        const a = arboles[k - 1];
        ordenTala.push({
          orden: ordenTala.length + 1,
          id: a.id,
          codigo: a.codigo,
          ramal: nombreCadena[ci],
          distanciaRedM: r0(distRed[k]),
          m3: a.m3,
          accion: !a.etapa || a.etapa === "en_pie" ? "talar_y_arrastrar" : "arrastrar",
          enFaja: enFaja[k - 1] != null,
          fueraDelPredio: !dentro[k - 1],
        });
      }
    }
  }
  const primero = ordenTala[0];
  const porQueOrden = primero
    ? `Se empieza por lo más lejano (${primero.codigo}, en ${primero.ramal}, a ${textoDistancia(primero.distanciaRedM)} del patio por la trocha) y se vuelve hacia el patio; cada ramal se termina antes que la trocha de la que sale. Así ningún tronco se arrastra por encima de otro ya tumbado.`
    : "";

  return {
    vacia: false,
    motivo: null,
    resumen,
    patios,
    campamento,
    trochas: {
      tramos,
      lineas,
      largoTotalM: r1(largoPrincipal + largoRamales),
      largoPrincipalM: r1(largoPrincipal),
      largoRamalesM: r1(largoRamales),
      distanciaMediaArrastreM: r0(distMedia),
      distanciaMaxArrastreM: r0(distMax),
      tramosEmpinados: empinados.length,
      cruces: crucesTot,
      porQue: porQueTrochas,
    },
    caminoSalida,
    ordenTala,
    porQueOrden,
    zonasNoAptas,
    avisos,
    parametros: P,
  };
}

/** Sólo los parámetros numéricos y finitos; lo demás se ignora (vienen de la URL). */
function limpiarParametros(p: Partial<ParametrosPlan> | undefined): Partial<ParametrosPlan> {
  if (!p) return {};
  const out: Partial<ParametrosPlan> = {};
  for (const k of Object.keys(PARAMETROS_PLAN) as (keyof ParametrosPlan)[]) {
    const v = p[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

// ─── A la cartografía ────────────────────────────────────────────────────────

const recortar = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Patio (acopio) y campamento como referencias del plano. Ids estables `prop-…`. */
export function propuestaAReferencias(p: PropuestaPlan): LothReferencia[] {
  const out: LothReferencia[] = [];
  const patio = p.patios[0];
  if (patio) {
    out.push({ id: `${PREFIJO_PROPUESTA}acopio-1`, nombre: "Patio de acopio (propuesta)", tipo: "acopio", lat: patio.lat, lng: patio.lng, nota: recortar(patio.porQue, 160) });
  }
  if (p.campamento) {
    out.push({ id: `${PREFIJO_PROPUESTA}campamento-1`, nombre: "Campamento (propuesta)", tipo: "campamento", lat: p.campamento.lat, lng: p.campamento.lng, nota: recortar(p.campamento.porQue, 160) });
  }
  return out;
}

/**
 * Trochas y camino de salida como vías del plano. Los ramales de un solo
 * árbol más cortos que `ramalMinimoM` no se dibujan (ese tronco se saca con el
 * cable del winche desde la trocha). `maxVias` = lo que queda libre en la
 * cartografía; si no alcanza, se dejan afuera los ramales más cortos y se dice.
 */
export function propuestaAVias(p: PropuestaPlan, opts: { maxVias?: number } = {}): { vias: LothVia[]; omitidas: string[] } {
  const max = opts.maxVias ?? Infinity;
  const omitidas: string[] = [];
  const cortos = p.trochas.lineas.filter((l) => l.clase === "ramal" && l.arboles.length <= 1 && l.largoM < p.parametros.ramalMinimoM);
  if (cortos.length) omitidas.push(`${plural(cortos.length, "ramal", "ramales")} de menos de ${p.parametros.ramalMinimoM} m: se saca con cable, no se dibuja.`);
  const lineas = p.trochas.lineas.filter((l) => !cortos.includes(l)).map((l) => ({
    id: l.id,
    nombre: `${l.nombre} (propuesta)`,
    tipo: "trocha" as const,
    puntos: l.puntos,
  }));
  const vias: LothVia[] = [];
  if (p.caminoSalida && p.caminoSalida.puntos.length >= 2 && p.caminoSalida.largoM > 0 && vias.length < max) {
    vias.push({ id: `${PREFIJO_PROPUESTA}acceso-1`, nombre: "Camino de salida (propuesta)", tipo: "acceso", puntos: p.caminoSalida.puntos });
  }
  // Las líneas ya vienen: principales primero, cada grupo de la más larga a la más corta.
  let entraron = 0;
  for (const l of lineas) {
    if (vias.length >= max) break;
    vias.push(l);
    entraron++;
  }
  const sinLugar = lineas.length - entraron;
  if (sinLugar > 0) omitidas.push(`${plural(sinLugar, "trocha no entró", "trochas no entraron")} al plano: no queda lugar entre las ${MAX_VIAS_CARTO} vías que admite.`);
  return { vias, omitidas };
}

/** Topes de la cartografía (los mismos que su normalizador). */
const MAX_REFERENCIAS_CARTO = 120;
const MAX_VIAS_CARTO = 40;

/**
 * Mezcla la propuesta en la cartografía SIN pisar lo dibujado: saca lo que
 * había propuesto antes (ids `prop-…`) y agrega lo nuevo. El resultado se
 * guarda con el PUT de siempre (`/loth/cartografia`).
 */
export function mezclarPropuestaEnCartografia(
  carto: LothCartografia,
  p: PropuestaPlan,
): { cartografia: LothCartografia; agregadas: { referencias: number; vias: number }; omitidas: string[] } {
  const refsPropias = carto.referencias.filter((r) => !r.id.startsWith(PREFIJO_PROPUESTA));
  const viasPropias = carto.vias.filter((v) => !v.id.startsWith(PREFIJO_PROPUESTA));
  const refs = propuestaAReferencias(p).slice(0, Math.max(0, MAX_REFERENCIAS_CARTO - refsPropias.length));
  const { vias, omitidas } = propuestaAVias(p, { maxVias: Math.max(0, MAX_VIAS_CARTO - viasPropias.length) });
  return {
    cartografia: { ...carto, referencias: [...refsPropias, ...refs], vias: [...viasPropias, ...vias] },
    agregadas: { referencias: refs.length, vias: vias.length },
    omitidas,
  };
}
