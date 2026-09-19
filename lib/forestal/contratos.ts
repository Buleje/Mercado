/**
 * contratos.ts — el permiso bajo el que se trabaja (ADR-421).
 *
 * PURO y client-safe: lo usan la DB class, los endpoints y la pantalla.
 *
 * El contrato ya era el eje del negocio antes de existir como entidad: el
 * código del permiso está escrito en `WoodEntry.originCode`, en
 * `ForestCtpEntry.originCode`, en `ForestLoteAserrio.permiso` y en el
 * `tituloHabilitante` de las guías y del directorio. Este módulo es lo que
 * permite tratar esas ocho escrituras sueltas como ocho contratos.
 */

/** Los papeles que la operación maneja, deducidos del propio código. */
export type TipoContrato =
  | "PER-FMP"
  | "PER-FMC"
  | "REG-PLT"
  | "CONCESION"
  | "CONTRATO"
  | "DEMA"
  | "PMFI"
  | "PO"
  | "otro";

export type EstadoContrato = "vigente" | "vencido" | "cerrado" | "suspendido";

export interface Contrato {
  id: string;
  codigo: string;
  codigoNorm: string;
  alias: string | null;
  titularNombre: string;
  titularId: string | null;
  titularDoc: string | null;
  titularDocTipo: string | null;
  resolucionNumero: string | null;
  resolucionFecha: string | null;
  tipo: TipoContrato | null;
  arffs: string | null;
  region: string | null;
  provincia: string | null;
  distrito: string | null;
  areaHa: number | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  estado: EstadoContrato;
  planId: string | null;
  notas: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ContratoInput {
  codigo: string;
  alias?: string | null;
  titularNombre: string;
  titularId?: string | null;
  titularDoc?: string | null;
  titularDocTipo?: string | null;
  resolucionNumero?: string | null;
  resolucionFecha?: string | null;
  tipo?: TipoContrato | null;
  arffs?: string | null;
  region?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  areaHa?: number | null;
  vigenciaDesde?: string | null;
  vigenciaHasta?: string | null;
  estado?: EstadoContrato;
  planId?: string | null;
  notas?: string | null;
}

/**
 * La forma canónica del código.
 *
 * Mayúsculas y espacios colapsados: «19-SEC/REG-PLT-2018-020» y
 * «19-sec/reg-plt-2018-020  » son el MISMO permiso. Sin esto, sembrar los
 * contratos desde el libro crearía dos filas para un papel —el mismo error que
 * el catálogo de especies tuvo con «Tornillo» y «TORNILLO»—.
 *
 * Lo que NO hace: tocar guiones, barras ni ceros. Un código forestal se
 * transcribe tal cual del papel; «normalizar» de más inventaría permisos.
 */
export function normalizarCodigoContrato(codigo: string): string {
  return (codigo ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * De qué tipo es el papel, leído del propio código.
 *
 * Sirve para agrupar y para que el alta llegue con el campo puesto; el operador
 * lo puede corregir. Se mira el código NORMALIZADO, así que no depende de cómo
 * lo escribieron.
 */
export function tipoDesdeCodigo(codigo: string): TipoContrato {
  const c = normalizarCodigoContrato(codigo);
  if (!c) return "otro";
  // Los prefijos salen de los códigos REALES del tenant, no de un catálogo
  // teórico: probar el endpoint con los datos mostró `PER-FMC` (permiso en
  // comunidad nativa) y `CON-25-UCA-0207` (concesión), que la primera versión
  // mandaba a «otro».
  if (c.includes("PER-FMP")) return "PER-FMP";
  if (c.includes("PER-FMC")) return "PER-FMC";
  if (c.includes("REG-PLT")) return "REG-PLT";
  if (/^CON-\d/.test(c)) return "CONCESION";
  if (c.includes("DEMA")) return "DEMA";
  if (c.includes("PMFI")) return "PMFI";
  if (c.startsWith("CONTRATO")) return "CONTRATO";
  if (/^PO[- ]/.test(c)) return "PO";
  return "otro";
}

/**
 * ¿El código parece un permiso de verdad?
 *
 * En los datos reales ya hay un `99-XXX/NO-EXISTE-2026-999` — un typo de prueba
 * que se convirtió en «contrato» por existir en una fila. Esto no bloquea nada:
 * marca los sospechosos para que el sembrado los muestre aparte en vez de
 * mezclarlos con los ocho reales.
 */
export function codigoSospechoso(codigo: string): boolean {
  const c = normalizarCodigoContrato(codigo);
  if (c.length < 6) return true;
  // La lista sale de lo que de verdad ensució los datos: además del
  // `99-XXX/NO-EXISTE-2026-999`, el tenant tenía un `AUDIT-PERMISO-INVENTADO`
  // que la primera versión daba por bueno.
  return (
    /\b(TEST|PRUEBA|QA|NO-EXISTE|XXX|DEMO|TMP|AUDIT|INVENTADO|FAKE|EJEMPLO|SAMPLE|DUMMY|BORRAR)\b/.test(c) ||
    /^TMP|^QA-/.test(c)
  );
}

/** Un bloque del balance: cuántos documentos y cuánta plata mueve. */
export interface BloqueBalance {
  /** Cuántos registros hay de esto. */
  documentos: number;
  /** Plata, en soles. */
  monto: number;
  /** Volumen, cuando el bloque lo tiene (madera y producción). */
  m3?: number;
  /** Cuántos de esos documentos todavía no tienen precio cargado. */
  sinValorizar?: number;
}

/**
 * El balance de un contrato.
 *
 * Nada de esto se guarda: se calcula al leer. Un saldo materializado obliga a
 * mantenerlo sincronizado desde siete lugares, y cada columna derivada de este
 * repo (`Adelanto.saldoPendiente`, los cuadres del libro) ya enseñó lo que
 * cuesta cuando se desincroniza.
 */
export interface BalanceContrato {
  contratoId: string;
  /** Lo que ENTRÓ: la madera que amparó el permiso. */
  madera: BloqueBalance;
  produccion: BloqueBalance;
  /**
   * Lo que se VENDIÓ de este permiso (ADR-141, `ForestCtpEntry.valorVenta`).
   *
   * Un despacho puede mezclar madera de dos contratos, así que el valor se
   * reparte por la proporción de cantidad que vino de cada uno: sumarlo entero
   * a uno inventaría una ganancia que el otro pagó. `sinValorizar` cuenta los
   * despachos del contrato que todavía no tienen precio de venta.
   */
  ventas: BloqueBalance;
  /** Lo que SALIÓ. */
  gastos: BloqueBalance;
  fletes: BloqueBalance;
  adelantos: BloqueBalance;
  /** Del adelanto entregado, cuánto todavía no se devolvió en madera. */
  adelantosSaldo: number;
  /** La cuenta corriente con las partes, si nació bajo este contrato. */
  cuentaCargos: BloqueBalance;
  cuentaAbonos: BloqueBalance;
}

/**
 * Cuánto salió en total y qué queda.
 *
 * `egresos` = lo efectivamente puesto: madera comprada + gastos + fletes +
 * adelantos entregados. La producción NO suma: es el mismo volumen transformado,
 * contarlo sería contar la madera dos veces.
 *
 * `porRecuperar` = lo que todavía debería volver: el saldo de adelantos (madera
 * que el habilitado aún no entregó) más lo que las partes deben en la cuenta.
 */
export function resumirBalance(b: BalanceContrato) {
  const egresos = b.madera.monto + b.gastos.monto + b.fletes.monto + b.adelantos.monto;
  const porRecuperar = b.adelantosSaldo + (b.cuentaCargos.monto - b.cuentaAbonos.monto);
  /**
   * Lo ganado: lo vendido menos lo puesto.
   *
   * `null` cuando NO hay ninguna venta cargada. Un contrato con gastos y sin
   * despachos no perdió esa plata: todavía no vendió. Mostrar «-S/ 20.000»
   * sería declarar una pérdida que nadie tuvo — la madera está en el patio.
   */
  /* `b.ventas` con `?.`: una respuesta que quedó en caché de ANTES de que el
     balance trajera ventas no puede romper la pantalla entera. Sin ventas, la
     ganancia es null — que es lo mismo que dice el caso «todavía no vendió». */
  const ventas = b.ventas?.monto ?? 0;
  const ganancia = (b.ventas?.documentos ?? 0) > 0 && ventas > 0 ? ventas - egresos : null;
  return {
    egresos,
    porRecuperar,
    ventas,
    ganancia,
    /** Cuánto queda de cada sol vendido, después de lo puesto. `null` sin ventas. */
    margenPct: ganancia != null && ventas > 0 ? (ganancia / ventas) * 100 : null,
    m3Ingresados: b.madera.m3 ?? 0,
    m3Producidos: b.produccion.m3 ?? 0,
    /** Cuánto costó cada m³ que entró. `null` cuando no hay volumen: dividir
     *  por cero para mostrar «S/ 0 por m³» sería declarar un costo que nadie
     *  midió. */
    costoPorM3: (b.madera.m3 ?? 0) > 0 ? egresos / (b.madera.m3 as number) : null,
    /** Rendimiento: qué fracción del volumen que entró salió como producto. */
    rendimientoPct:
      (b.madera.m3 ?? 0) > 0 && (b.produccion.m3 ?? 0) > 0
        ? ((b.produccion.m3 as number) / (b.madera.m3 as number)) * 100
        : null,
  };
}
