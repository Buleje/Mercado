/**
 * lib/combustible/cuaderno.ts — Cuaderno de combustible en cilindros (ADR-533).
 *
 * Lo que el informe técnico le promete a SUNAT (inscripción en el Registro para
 * el Control de Bienes Fiscalizados, Zona de Régimen Especial): ingresos de
 * cilindros con factura y guía, salidas por vale de máquina con horómetro,
 * saldo diario en galones y cilindros, conteo físico semanal y un reporte del
 * mes contra lo declarado.
 *
 * Todo lo que se calcula vive acá, sin base ni React: la pantalla, el reporte
 * y el servidor (costo del vale, foto del cuaderno al contar) usan las MISMAS
 * cuentas. Funciones puras → se prueban con datos inventados en milisegundos.
 *
 * Cómo se reparte el combustible entre cilindros: primero en entrar, primero en
 * salir. Cada ingreso numera sus cilindros (C-01, C-02…) y un vale saca del
 * cilindro más viejo que todavía tiene; cuando se acaba, sigue con el próximo.
 * Así el cuaderno dice de qué cilindro salió cada vale sin que el operador lo
 * anote, y cuántos cilindros con combustible hay guardados en cada momento.
 *
 * El conteo físico manda: después de contar, el cuaderno queda en lo contado y
 * la diferencia queda anotada (faltante = sale del cilindro más viejo; sobrante
 * = vuelve al último cilindro abierto). Anular el conteo lo deshace.
 */

/** 1 m³ = 264,17 gal. Desde 1 m³ guardado, OSINERGMIN pide Registro de Hidrocarburos (consumidor directo). */
export const UMBRAL_OSINERGMIN_GAL = 264;
/** Lo que queda en el fondo de un cilindro y ya no sale con la bomba: menos que esto = vacío. */
export const RESIDUO_VACIO_GAL = 0.5;
/** El vale «gasta de más» si pasa la meta de gal/h de la máquina por más de 10 %. */
export const TOLERANCIA_META = 0.1;

export interface ConfigCuaderno {
  /** «Diésel B5 S-50». */
  producto: string;
  galPorCilindro: number;
  /** Lo declarado en el informe: cilindros guardados a la vez. */
  maxCilindros: number;
  /** Galones al año inscritos en SUNAT (cupo). null = todavía sin declarar. */
  cupoAnualGal: number | null;
  /** Cilindros proyectados por mes, enero → diciembre (12 números). null = sin proyección. */
  proyeccionCilindros: number[] | null;
  /** Quien firma el cuaderno (responsable técnico). */
  responsable: string | null;
}

export const CONFIG_POR_DEFECTO: ConfigCuaderno = {
  producto: "Diésel B5 S-50",
  galPorCilindro: 55,
  maxCilindros: 4,
  cupoAnualGal: null,
  proyeccionCilindros: null,
  responsable: null,
};

export type TipoIngreso = "compra" | "inicial";

export interface IngresoCuaderno {
  id: string;
  /** ISO con hora. */
  fecha: string;
  tipo: TipoIngreso;
  factura: string | null;
  grifo: string | null;
  grifoRuc: string | null;
  guia: string | null;
  cilindros: number;
  galones: number;
  precioGal: number | null;
  monto: number;
  /** Número del primer cilindro (5 → C-05); los demás siguen en fila. */
  primerCilindro: number;
  anulado: boolean;
  motivoAnulacion: string | null;
  notas: string | null;
  gastoId: string | null;
}

export interface ValeCuaderno {
  id: string;
  numero: number | null;
  fecha: string;
  maquinaId: string;
  maquina: string;
  placa: string | null;
  horometro: number | null;
  galones: number;
  operador: string | null;
  firmado: boolean;
  monto: number;
  notas: string | null;
  anulado: boolean;
  motivoAnulacion: string | null;
}

export interface ConteoCuaderno {
  id: string;
  fecha: string;
  cilindrosContados: number;
  galonesContados: number;
  /** Lo que decía el cuaderno al guardar el conteo (foto; la cuenta en vivo puede cambiar si se anota algo con fecha vieja). */
  cilindrosLibro: number;
  galonesLibro: number;
  contadoPor: string;
  testigo: string | null;
  notas: string | null;
  anulado: boolean;
}

export interface DatosCuaderno {
  ingresos: readonly IngresoCuaderno[];
  vales: readonly ValeCuaderno[];
  conteos: readonly ConteoCuaderno[];
}

// ── Utilidades ───────────────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;
const LIMA_MS = 5 * 3600_000; // Perú: UTC−5 todo el año (sin horario de verano).

/** «aaaa-mm-dd» del día en Lima de una fecha ISO. */
export function diaLima(iso: string | number | Date): string {
  const ms = typeof iso === "number" ? iso : new Date(iso).getTime();
  return new Date(ms - LIMA_MS).toISOString().slice(0, 10);
}

/** Etiqueta del cilindro: 1 → «C-01», 100 → «C-100». */
export const etiquetaCilindro = (n: number): string => `C-${String(n).padStart(2, "0")}`;

/** «C-05 a C-08» · «C-05» · «—». */
export function rangoCilindros(primero: number, cantidad: number): string {
  if (cantidad <= 0) return "—";
  if (cantidad === 1) return etiquetaCilindro(primero);
  return `${etiquetaCilindro(primero)} a ${etiquetaCilindro(primero + cantidad - 1)}`;
}

/** El número que le toca al primer cilindro del próximo ingreso (los anulados no se reusan). */
export function siguienteCilindro(ingresos: readonly IngresoCuaderno[]): number {
  return ingresos.reduce((max, i) => Math.max(max, i.primerCilindro + i.cilindros), 1);
}

/** Galones proyectados del mes (1-12) o null. */
export function proyeccionDelMes(config: ConfigCuaderno, mes: number): number | null {
  const c = config.proyeccionCilindros?.[mes - 1];
  return c == null ? null : c * config.galPorCilindro;
}

export type NivelAlmacen = "ok" | "tope" | "excede" | "osinergmin" | "negativo";

/**
 * Cómo está lo guardado contra lo declarado. «tope» = justo en el máximo (no
 * comprar más hasta gastar); «excede» = más cilindros o galones de los
 * declarados a SUNAT; «osinergmin» = 1 m³ o más (otro registro).
 */
export function nivelAlmacen(saldoGal: number, cilindros: number, config: ConfigCuaderno): NivelAlmacen {
  if (saldoGal < -RESIDUO_VACIO_GAL) return "negativo";
  if (saldoGal >= UMBRAL_OSINERGMIN_GAL) return "osinergmin";
  const maxGal = config.maxCilindros * config.galPorCilindro;
  if (cilindros > config.maxCilindros || saldoGal > maxGal + RESIDUO_VACIO_GAL) return "excede";
  if (cilindros === config.maxCilindros) return "tope";
  return "ok";
}

// ── El recorrido: el cuaderno renglón por renglón ───────────────────────

export interface CilindroEstado {
  numero: number;
  etiqueta: string;
  ingresoId: string;
  fechaIngreso: string;
  capacidad: number;
  resto: number;
  precioGal: number | null;
  /** Primer vale que sacó de este cilindro. */
  abiertoEl: string | null;
  /** Cuándo se acabó (o lo dejó en cero un conteo). */
  vacioEl: string | null;
}

export type Renglon =
  | { tipo: "ingreso"; fecha: string; dia: string; ingreso: IngresoCuaderno; entradaGal: number; saldoGal: number; cilindros: number }
  | {
      tipo: "vale";
      fecha: string;
      dia: string;
      vale: ValeCuaderno;
      salidaGal: number;
      /** De qué cilindros salió («C-03», «C-04»); «sin respaldo» si no había. */
      deCilindros: string[];
      /** Galones que salieron sin cilindro que los respalde (falta anotar una compra). */
      sinRespaldoGal: number;
      costo: number;
      saldoGal: number;
      cilindros: number;
    }
  | {
      tipo: "conteo";
      fecha: string;
      dia: string;
      conteo: ConteoCuaderno;
      libroGal: number;
      libroCil: number;
      /** contado − cuaderno: negativo = faltante. */
      difGal: number;
      difCil: number;
      saldoGal: number;
      cilindros: number;
    };

export interface Recorrido {
  renglones: Renglon[];
  cilindros: CilindroEstado[];
  saldoGal: number;
  cilindrosConCombustible: number;
  /** Último precio por galón conocido (para costear lo que sale sin respaldo). */
  ultimoPrecioGal: number | null;
}

const ORDEN_TIPO = { ingreso: 0, vale: 1, conteo: 2 } as const;

type Evento =
  | { tipo: "ingreso"; ms: number; x: IngresoCuaderno }
  | { tipo: "vale"; ms: number; x: ValeCuaderno }
  | { tipo: "conteo"; ms: number; x: ConteoCuaderno };

/** Los movimientos vigentes en orden de fecha (en el mismo instante: ingreso → vale → conteo). */
function eventos(d: DatosCuaderno): Evento[] {
  const ev: Evento[] = [
    ...d.ingresos.filter((i) => !i.anulado).map((x) => ({ tipo: "ingreso" as const, ms: Date.parse(x.fecha), x })),
    ...d.vales.filter((v) => !v.anulado).map((x) => ({ tipo: "vale" as const, ms: Date.parse(x.fecha), x })),
    ...d.conteos.filter((c) => !c.anulado).map((x) => ({ tipo: "conteo" as const, ms: Date.parse(x.fecha), x })),
  ];
  return ev.sort((a, b) => a.ms - b.ms || ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo]);
}

const conCombustible = (cs: readonly CilindroEstado[]) => cs.filter((c) => c.resto > RESIDUO_VACIO_GAL).length;

/**
 * Pasa por todos los movimientos vigentes y devuelve cada renglón con el saldo
 * que dejó, más el estado de cada cilindro. `hastaMs` corta antes (para saber
 * qué decía el cuaderno en un momento dado: la foto del conteo).
 */
export function recorrer(d: DatosCuaderno, hastaMs = Number.POSITIVE_INFINITY): Recorrido {
  const cilindros: CilindroEstado[] = [];
  const renglones: Renglon[] = [];
  /** Galones que salieron sin cilindro (se cubren con el próximo ingreso). */
  let pendiente = 0;
  let ultimoPrecio: number | null = null;

  const saldo = () => r2(cilindros.reduce((s, c) => s + c.resto, 0) - pendiente);

  /** Saca `gal` de los cilindros, el más viejo primero. Devuelve de cuáles salió, el costo y lo que faltó. */
  const sacar = (gal: number, fecha: string) => {
    let falta = gal;
    let costo = 0;
    const de: string[] = [];
    for (const c of cilindros) {
      if (falta <= 0) break;
      if (c.resto <= 0) continue;
      const toma = Math.min(c.resto, falta);
      c.resto = r2(c.resto - toma);
      falta = r2(falta - toma);
      costo += toma * (c.precioGal ?? ultimoPrecio ?? 0);
      if (!c.abiertoEl) c.abiertoEl = fecha;
      if (c.resto <= RESIDUO_VACIO_GAL && !c.vacioEl) c.vacioEl = fecha;
      de.push(c.etiqueta);
    }
    if (falta > 0) {
      pendiente = r2(pendiente + falta);
      costo += falta * (ultimoPrecio ?? 0);
    }
    return { de, costo: r2(costo), sinRespaldo: r2(Math.max(0, falta)) };
  };

  for (const e of eventos(d)) {
    if (e.ms > hastaMs) break;
    const fecha = e.x.fecha;
    const dia = diaLima(e.ms);
    if (e.tipo === "ingreso") {
      const i = e.x;
      const n = Math.max(1, i.cilindros);
      const precio = i.precioGal ?? ultimoPrecio;
      if (i.precioGal != null) ultimoPrecio = i.precioGal;
      const porCil = i.galones / n;
      for (let k = 0; k < n; k++) {
        cilindros.push({
          numero: i.primerCilindro + k,
          etiqueta: etiquetaCilindro(i.primerCilindro + k),
          ingresoId: i.id,
          fechaIngreso: fecha,
          // El último absorbe el redondeo: 4 cilindros de 220 gal = 55 × 4 exacto.
          capacidad: k === n - 1 ? r2(i.galones - r2(porCil) * (n - 1)) : r2(porCil),
          resto: k === n - 1 ? r2(i.galones - r2(porCil) * (n - 1)) : r2(porCil),
          precioGal: precio,
          abiertoEl: null,
          vacioEl: null,
        });
      }
      // Lo que salió sin respaldo se cubre con lo que acaba de entrar.
      if (pendiente > 0) {
        const p = pendiente;
        pendiente = 0;
        sacar(p, fecha);
      }
      renglones.push({ tipo: "ingreso", fecha, dia, ingreso: i, entradaGal: i.galones, saldoGal: saldo(), cilindros: conCombustible(cilindros) });
    } else if (e.tipo === "vale") {
      const v = e.x;
      const s = sacar(v.galones, fecha);
      renglones.push({
        tipo: "vale",
        fecha,
        dia,
        vale: v,
        salidaGal: v.galones,
        deCilindros: s.de,
        sinRespaldoGal: s.sinRespaldo,
        costo: s.costo,
        saldoGal: saldo(),
        cilindros: conCombustible(cilindros),
      });
    } else {
      const c = e.x;
      const libroGal = saldo();
      const libroCil = conCombustible(cilindros);
      const dif = r2(c.galonesContados - libroGal);
      if (dif < 0) {
        sacar(-dif, fecha);
      } else if (dif > 0) {
        let sobra = dif;
        const cubre = Math.min(sobra, pendiente);
        pendiente = r2(pendiente - cubre);
        sobra = r2(sobra - cubre);
        if (sobra > 0) {
          // Vuelve al último cilindro abierto; si no hay, al último que tiene; si no, a uno «sin número».
          const destino =
            [...cilindros].reverse().find((x) => x.abiertoEl && x.resto > RESIDUO_VACIO_GAL) ??
            [...cilindros].reverse().find((x) => x.resto > RESIDUO_VACIO_GAL) ??
            [...cilindros].reverse()[0];
          if (destino) {
            destino.resto = r2(destino.resto + sobra);
            destino.vacioEl = destino.resto > RESIDUO_VACIO_GAL ? null : destino.vacioEl;
          } else {
            cilindros.push({
              numero: 0, etiqueta: "Sin número", ingresoId: c.id, fechaIngreso: fecha,
              capacidad: sobra, resto: sobra, precioGal: ultimoPrecio, abiertoEl: null, vacioEl: null,
            });
          }
        }
      }
      renglones.push({
        tipo: "conteo",
        fecha,
        dia,
        conteo: c,
        libroGal,
        libroCil,
        difGal: dif,
        difCil: c.cilindrosContados - libroCil,
        saldoGal: saldo(),
        cilindros: conCombustible(cilindros),
      });
    }
  }

  return { renglones, cilindros, saldoGal: saldo(), cilindrosConCombustible: conCombustible(cilindros), ultimoPrecioGal: ultimoPrecio };
}

/** Lo que diría el cuaderno en un instante (antes de un conteo con esa fecha). */
export function libroAl(d: DatosCuaderno, fechaIso: string): { saldoGal: number; cilindros: number } {
  const r = recorrer(d, Date.parse(fechaIso) - 1);
  return { saldoGal: r.saldoGal, cilindros: r.cilindrosConCombustible };
}

/** Costo de un vale nuevo (galones al precio de los cilindros de donde saldría). */
export function costoDeVale(d: DatosCuaderno, fechaIso: string, galones: number): { costo: number; deCilindros: string[]; sinRespaldoGal: number } {
  const prueba: ValeCuaderno = {
    id: "__nuevo__", numero: null, fecha: fechaIso, maquinaId: "", maquina: "", placa: null, horometro: null,
    galones, operador: null, firmado: false, monto: 0, notas: null, anulado: false, motivoAnulacion: null,
  };
  const r = recorrer({ ...d, vales: [...d.vales, prueba] });
  const fila = r.renglones.find((x) => x.tipo === "vale" && x.vale.id === "__nuevo__");
  return fila && fila.tipo === "vale"
    ? { costo: fila.costo, deCilindros: fila.deCilindros, sinRespaldoGal: fila.sinRespaldoGal }
    : { costo: 0, deCilindros: [], sinRespaldoGal: galones };
}

// ── Saldo diario ────────────────────────────────────────────────────────

export interface DiaCuaderno {
  dia: string;
  entradasGal: number;
  entradasCil: number;
  salidasGal: number;
  vales: number;
  /** Diferencias de los conteos del día (contado − cuaderno). */
  ajusteGal: number;
  saldoGal: number;
  cilindros: number;
  nivel: NivelAlmacen;
  /** Hubo movimiento ese día (los otros solo arrastran el saldo). */
  conMovimiento: boolean;
}

function sumarDia(dia: string, n: number): string {
  const t = Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Un renglón por día entre `desde` y `hasta` (inclusive, «aaaa-mm-dd» de Lima),
 * con lo que entró, salió, se ajustó y el saldo al cierre del día.
 */
export function saldoDiario(r: Recorrido, config: ConfigCuaderno, desde: string, hasta: string): DiaCuaderno[] {
  let saldoGal = 0;
  let cil = 0;
  for (const x of r.renglones) {
    if (x.dia >= desde) break;
    saldoGal = x.saldoGal;
    cil = x.cilindros;
  }
  const porDia = new Map<string, Renglon[]>();
  for (const x of r.renglones) {
    if (x.dia < desde || x.dia > hasta) continue;
    const l = porDia.get(x.dia);
    if (l) l.push(x);
    else porDia.set(x.dia, [x]);
  }
  const dias: DiaCuaderno[] = [];
  for (let dia = desde; dia <= hasta; dia = sumarDia(dia, 1)) {
    const del = porDia.get(dia) ?? [];
    let entradasGal = 0;
    let entradasCil = 0;
    let salidasGal = 0;
    let vales = 0;
    let ajusteGal = 0;
    for (const x of del) {
      if (x.tipo === "ingreso") {
        entradasGal += x.entradaGal;
        entradasCil += x.ingreso.cilindros;
      } else if (x.tipo === "vale") {
        salidasGal += x.salidaGal;
        vales++;
      } else ajusteGal += x.difGal;
      saldoGal = x.saldoGal;
      cil = x.cilindros;
    }
    dias.push({
      dia,
      entradasGal: r2(entradasGal),
      entradasCil,
      salidasGal: r2(salidasGal),
      vales,
      ajusteGal: r2(ajusteGal),
      saldoGal,
      cilindros: cil,
      nivel: nivelAlmacen(saldoGal, cil, config),
      conMovimiento: del.length > 0,
    });
  }
  return dias;
}

// ── Horómetro: ¿la máquina gasta lo normal? ─────────────────────────────

export interface RendimientoVale {
  valeId: string;
  /** Horas desde el vale anterior de la misma máquina. */
  horas: number | null;
  galPorHora: number | null;
  meta: number | null;
  sobreMeta: boolean;
}

/**
 * Gal/h de cada vale: lo que se le echa ahora es lo que quemó desde el vale
 * anterior (se llena el tanque en cada vale). El primer vale de cada máquina
 * no tiene contra qué medirse.
 */
export function rendimientoVales(vales: readonly ValeCuaderno[], metas: Readonly<Record<string, number | null>>): Map<string, RendimientoVale> {
  const out = new Map<string, RendimientoVale>();
  const vigentes = vales.filter((v) => !v.anulado).sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha));
  const ultimoH = new Map<string, number>();
  for (const v of vigentes) {
    const meta = metas[v.maquinaId] ?? null;
    const prev = ultimoH.get(v.maquinaId);
    let horas: number | null = null;
    let gph: number | null = null;
    if (v.horometro != null && prev != null && v.horometro > prev) {
      horas = Math.round((v.horometro - prev) * 10) / 10;
      gph = Math.round((v.galones / horas) * 100) / 100;
    }
    if (v.horometro != null) ultimoH.set(v.maquinaId, v.horometro);
    out.set(v.id, { valeId: v.id, horas, galPorHora: gph, meta, sobreMeta: gph != null && meta != null && gph > meta * (1 + TOLERANCIA_META) });
  }
  return out;
}

/**
 * El horómetro de un vale nuevo tiene que quedar entre la lectura anterior y
 * la siguiente de la misma máquina. Devuelve el porqué si no, o null.
 */
export function problemaDeHorometro(vales: readonly ValeCuaderno[], maquinaId: string, fechaIso: string, horometro: number | null): string | null {
  if (horometro == null) return null;
  const t = Date.parse(fechaIso);
  const deEsta = vales.filter((v) => !v.anulado && v.maquinaId === maquinaId && v.horometro != null);
  const antes = deEsta.filter((v) => Date.parse(v.fecha) <= t).sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha))[0];
  const despues = deEsta.filter((v) => Date.parse(v.fecha) > t).sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha))[0];
  if (antes && horometro < (antes.horometro as number))
    return `El horómetro (${horometro}) es menor que el del vale anterior de esta máquina (${antes.horometro} el ${diaLima(antes.fecha)}).`;
  if (despues && horometro > (despues.horometro as number))
    return `El horómetro (${horometro}) es mayor que el del vale siguiente de esta máquina (${despues.horometro} el ${diaLima(despues.fecha)}).`;
  return null;
}

// ── Reporte del mes (para SUNAT) ────────────────────────────────────────

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
export const nombreMes = (mes: number): string => MESES[mes - 1] ?? "";

export interface ConsumoMaquina {
  maquinaId: string;
  maquina: string;
  placa: string | null;
  vales: number;
  galones: number;
  /** Horas medidas entre vales con horómetro (los que tienen uno anterior). */
  horas: number;
  galPorHora: number | null;
  meta: number | null;
  sobreMeta: boolean;
  valesSobreMeta: number;
}

export interface ReporteMes {
  anio: number;
  mes: number;
  titulo: string;
  desde: string;
  hasta: string;
  /** Último día del saldo diario: `hasta` en un mes cerrado, hoy en el mes en curso. */
  hastaDias: string;
  config: ConfigCuaderno;
  saldoInicial: { gal: number; cil: number };
  saldoFinal: { gal: number; cil: number };
  compras: IngresoCuaderno[];
  /** Stock inicial anotado este mes (no es compra). */
  iniciales: IngresoCuaderno[];
  totalCompras: { cil: number; gal: number; monto: number };
  totalInicial: number;
  consumo: ConsumoMaquina[];
  totalConsumo: number;
  vales: Array<{ vale: ValeCuaderno; deCilindros: string[]; sinRespaldoGal: number; rend: RendimientoVale | null }>;
  anulados: { ingresos: IngresoCuaderno[]; vales: ValeCuaderno[] };
  conteos: Array<{ conteo: ConteoCuaderno; libroGal: number; libroCil: number; difGal: number; difCil: number }>;
  totalDiferencias: number;
  dias: DiaCuaderno[];
  proyeccionGal: number | null;
  acumuladoAnio: { comprasGal: number; consumoGal: number; cupo: number | null; restante: number | null; pct: number | null };
  /** saldo inicial + entradas − salidas + diferencias = saldo final (si no cierra, hay un error de cuenta). */
  cuadra: boolean;
  alertas: string[];
}

/** «1 día» / «3 días». */
const cuantos = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`;

const fmtGal = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })} gal`;

export function reporteDelMes(
  d: DatosCuaderno,
  config: ConfigCuaderno,
  anio: number,
  mes: number,
  metas: Readonly<Record<string, number | null>>,
  maquinas: ReadonlyArray<{ id: string; nombre: string; placa: string | null }> = [],
  /** «aaaa-mm-dd» de Lima: el saldo diario del mes en curso llega hasta hoy (los días que no pasan no van al papel). */
  hoy: string = diaLima(Date.now()),
): ReporteMes {
  const desde = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const hasta = sumarDia(mes === 12 ? `${anio + 1}-01-01` : `${anio}-${String(mes + 1).padStart(2, "0")}-01`, -1);
  const hastaDias = hoy < hasta ? hoy : hasta;
  const enMes = (iso: string) => {
    const dia = diaLima(iso);
    return dia >= desde && dia <= hasta;
  };
  const r = recorrer(d);
  const dias = hastaDias < desde ? [] : saldoDiario(r, config, desde, hastaDias);
  const antes = r.renglones.filter((x) => x.dia < desde).at(-1);
  const saldoInicial = { gal: antes?.saldoGal ?? 0, cil: antes?.cilindros ?? 0 };
  const ultimo = dias.at(-1);
  const saldoFinal = { gal: ultimo?.saldoGal ?? saldoInicial.gal, cil: ultimo?.cilindros ?? saldoInicial.cil };

  const delMes = r.renglones.filter((x) => x.dia >= desde && x.dia <= hasta);
  const compras = delMes.flatMap((x) => (x.tipo === "ingreso" && x.ingreso.tipo === "compra" ? [x.ingreso] : []));
  const iniciales = delMes.flatMap((x) => (x.tipo === "ingreso" && x.ingreso.tipo === "inicial" ? [x.ingreso] : []));
  const rend = rendimientoVales(d.vales, metas);
  const vales = delMes.flatMap((x) =>
    x.tipo === "vale" ? [{ vale: x.vale, deCilindros: x.deCilindros, sinRespaldoGal: x.sinRespaldoGal, rend: rend.get(x.vale.id) ?? null }] : [],
  );
  const conteos = delMes.flatMap((x) =>
    x.tipo === "conteo" ? [{ conteo: x.conteo, libroGal: x.libroGal, libroCil: x.libroCil, difGal: x.difGal, difCil: x.difCil }] : [],
  );

  // Consumo por máquina: todas las máquinas con vales en el mes, y también las que no tuvieron (se ven en cero).
  const porMaq = new Map<string, ConsumoMaquina>();
  for (const m of maquinas)
    porMaq.set(m.id, { maquinaId: m.id, maquina: m.nombre, placa: m.placa, vales: 0, galones: 0, horas: 0, galPorHora: null, meta: metas[m.id] ?? null, sobreMeta: false, valesSobreMeta: 0 });
  const galConHoras = new Map<string, number>();
  for (const { vale, rend: rv } of vales) {
    const c =
      porMaq.get(vale.maquinaId) ??
      { maquinaId: vale.maquinaId, maquina: vale.maquina, placa: vale.placa, vales: 0, galones: 0, horas: 0, galPorHora: null, meta: metas[vale.maquinaId] ?? null, sobreMeta: false, valesSobreMeta: 0 };
    c.vales++;
    c.galones = r2(c.galones + vale.galones);
    if (rv?.horas != null) {
      c.horas = Math.round((c.horas + rv.horas) * 10) / 10;
      galConHoras.set(vale.maquinaId, r2((galConHoras.get(vale.maquinaId) ?? 0) + vale.galones));
    }
    if (rv?.sobreMeta) c.valesSobreMeta++;
    porMaq.set(vale.maquinaId, c);
  }
  for (const c of porMaq.values()) {
    const g = galConHoras.get(c.maquinaId) ?? 0;
    c.galPorHora = c.horas > 0 ? Math.round((g / c.horas) * 100) / 100 : null;
    c.sobreMeta = c.galPorHora != null && c.meta != null && c.galPorHora > c.meta * (1 + TOLERANCIA_META);
  }
  const consumo = [...porMaq.values()].sort((a, b) => b.galones - a.galones || a.maquina.localeCompare(b.maquina));

  const totalCompras = {
    cil: compras.reduce((s, i) => s + i.cilindros, 0),
    gal: r2(compras.reduce((s, i) => s + i.galones, 0)),
    monto: r2(compras.reduce((s, i) => s + i.monto, 0)),
  };
  const totalInicial = r2(iniciales.reduce((s, i) => s + i.galones, 0));
  const totalConsumo = r2(vales.reduce((s, v) => s + v.vale.galones, 0));
  const totalDiferencias = r2(conteos.reduce((s, c) => s + c.difGal, 0));

  // Acumulado del año hasta el fin de este mes.
  const iniAnio = `${anio}-01-01`;
  const delAnio = r.renglones.filter((x) => x.dia >= iniAnio && x.dia <= hasta);
  const comprasAnio = r2(delAnio.reduce((s, x) => s + (x.tipo === "ingreso" && x.ingreso.tipo === "compra" ? x.entradaGal : 0), 0));
  const consumoAnio = r2(delAnio.reduce((s, x) => s + (x.tipo === "vale" ? x.salidaGal : 0), 0));
  const cupo = config.cupoAnualGal;
  const acumuladoAnio = {
    comprasGal: comprasAnio,
    consumoGal: consumoAnio,
    cupo,
    restante: cupo != null ? r2(cupo - comprasAnio) : null,
    pct: cupo != null && cupo > 0 ? Math.round((comprasAnio / cupo) * 1000) / 10 : null,
  };

  const cuadra = Math.abs(r2(saldoInicial.gal + totalCompras.gal + totalInicial - totalConsumo + totalDiferencias) - saldoFinal.gal) < 0.01;

  const alertas: string[] = [];
  const diasExcede = dias.filter((x) => x.nivel === "excede" || x.nivel === "osinergmin");
  if (diasExcede.length > 0)
    alertas.push(`${cuantos(diasExcede.length, "día", "días")} con más de lo declarado guardado (máx. ${config.maxCilindros} cilindros = ${fmtGal(config.maxCilindros * config.galPorCilindro)}).`);
  if (dias.some((x) => x.nivel === "osinergmin")) alertas.push(`Hubo ${UMBRAL_OSINERGMIN_GAL} gal o más guardados: eso pide Registro de Hidrocarburos de OSINERGMIN.`);
  const negativos = dias.filter((x) => x.nivel === "negativo");
  if (negativos.length > 0) alertas.push(`${cuantos(negativos.length, "día", "días")} con saldo negativo: falta anotar una compra o un vale tiene galones de más.`);
  const sinResp = vales.filter((v) => v.sinRespaldoGal > 0);
  if (sinResp.length > 0) alertas.push(sinResp.length === 1 ? "1 vale salió sin cilindro que lo respalde." : `${sinResp.length} vales salieron sin cilindro que los respalde.`);
  for (const c of consumo) if (c.valesSobreMeta > 0) alertas.push(`${c.maquina}: ${cuantos(c.valesSobreMeta, "vale", "vales")} por encima de la meta de ${c.meta} gal/h (revisar fuga o desvío).`);
  if (Math.abs(totalDiferencias) >= 1) alertas.push(`Diferencias de conteo en el mes: ${fmtGal(totalDiferencias)}.`);
  if (cupo != null && comprasAnio > cupo) alertas.push(`Las compras del año (${fmtGal(comprasAnio)}) pasan el cupo inscrito de ${fmtGal(cupo)}.`);
  const proy = proyeccionDelMes(config, mes);
  if (proy != null && totalConsumo > proy * (1 + TOLERANCIA_META)) alertas.push(`El consumo del mes (${fmtGal(totalConsumo)}) pasa la proyección declarada (${fmtGal(proy)}).`);
  if (!cuadra) alertas.push("El balance del mes no cierra: revisar el cuaderno.");

  return {
    anio,
    mes,
    titulo: `${nombreMes(mes)} ${anio}`,
    desde,
    hasta,
    hastaDias,
    config,
    saldoInicial,
    saldoFinal,
    compras,
    iniciales,
    totalCompras,
    totalInicial,
    consumo,
    totalConsumo,
    vales,
    anulados: {
      ingresos: d.ingresos.filter((i) => i.anulado && enMes(i.fecha)),
      vales: d.vales.filter((v) => v.anulado && enMes(v.fecha)),
    },
    conteos,
    totalDiferencias,
    dias,
    proyeccionGal: proy,
    acumuladoAnio,
    cuadra,
    alertas,
  };
}
