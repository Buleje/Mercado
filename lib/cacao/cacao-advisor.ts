/**
 * cacao-advisor.ts — asesor determinístico de "¿cuándo vender / aguantar?" (ADR-128).
 * Client-safe y puro: NO importar prisma ni llm. Traduce las métricas reales del
 * mercado (precio, tendencia, posición 52sem, volatilidad) en una recomendación
 * para un acopiador de cacao en Pucallpa. NUNCA inventa cifras — solo razona
 * sobre los números dados. El "fino de aroma" peruano cotiza con premio.
 */

export interface AdvisorPriceInput {
  value: number;
  changePct: number | null; // diario
  weekHigh52: number | null;
  weekLow52: number | null;
  series?: { c: number }[]; // cierres diarios (1 año) para tendencia/volatilidad
}

export type AdvisorAction = "vender" | "aguantar" | "neutral";

export interface AdvisorDonde { canal: string; nota: string }
export interface AdvisorResult {
  signal: AdvisorAction;
  fuerza: "fuerte" | "moderada" | "leve";
  titulo: string;
  resumen: string;
  motivos: string[];
  cuando: string;
  donde: AdvisorDonde[];
  riesgos: string[];
  compra: string;
  metrics: { pos52: number | null; trend30: number | null; trend7: number | null; volatilidad: number | null };
}

function pctChange(arr: number[], n: number): number | null {
  if (arr.length < n + 1) return arr.length >= 2 ? round1(((arr[arr.length - 1] - arr[0]) / arr[0]) * 100) : null;
  const a = arr[arr.length - 1 - n], b = arr[arr.length - 1];
  return a > 0 ? round1(((b - a) / a) * 100) : null;
}
function volatility(arr: number[], n = 30): number | null {
  const s = arr.slice(-n);
  if (s.length < 5) return null;
  const rets: number[] = [];
  for (let i = 1; i < s.length; i++) rets.push((s[i] - s[i - 1]) / s[i - 1]);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  return round1(Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) * 100);
}
const round1 = (n: number) => Math.round(n * 10) / 10;

const DONDE: AdvisorDonde[] = [
  { canal: "Cooperativa / asociación", nota: "mejor precio si tu cacao es fino de aroma y bien fermentado" },
  { canal: "Exportador directo", nota: "conviene con volumen y grado I uniforme" },
  { canal: "Mercado / intermediario local (Pucallpa)", nota: "pago rápido pero precio menor" },
];

export function cacaoAdvisor(p: AdvisorPriceInput): AdvisorResult {
  const closes = (p.series ?? []).map((x) => x.c).filter((c) => typeof c === "number" && c > 0);
  const pos52 = p.weekHigh52 != null && p.weekLow52 != null && p.weekHigh52 > p.weekLow52
    ? Math.round(((p.value - p.weekLow52) / (p.weekHigh52 - p.weekLow52)) * 100) : null;
  const trend30 = closes.length ? pctChange(closes, 22) : null; // ~1 mes hábil
  const trend7 = closes.length ? pctChange(closes, 5) : null; // ~1 semana hábil
  const vol = closes.length ? volatility(closes) : null;
  const metrics = { pos52, trend30, trend7, volatilidad: vol };

  const high = pos52 != null && pos52 >= 65;
  const low = pos52 != null && pos52 <= 35;
  const rising = (trend7 ?? 0) > 3 || (trend30 ?? 0) > 6;
  const falling = (trend7 ?? 0) < -3 || (trend30 ?? 0) < -6;
  const nervioso = (vol ?? 0) >= 3;

  let signal: AdvisorAction = "neutral";
  let fuerza: AdvisorResult["fuerza"] = "leve";
  const motivos: string[] = [];

  if (pos52 != null) motivos.push(high ? `Precio en la parte ALTA de su rango anual (${pos52}% entre mín y máx 52 sem).` : low ? `Precio en la parte BAJA de su rango anual (${pos52}%).` : `Precio en zona media del año (${pos52}%).`);
  if (trend30 != null) motivos.push(`Últimas ~4 semanas: ${trend30 > 0 ? "+" : ""}${trend30}%.`);
  if (trend7 != null) motivos.push(`Última semana: ${trend7 > 0 ? "+" : ""}${trend7}%.`);
  if (vol != null) motivos.push(`Volatilidad ${vol}%/día ${nervioso ? "(mercado nervioso)" : "(mercado tranquilo)"}.`);

  if (high && !falling) { signal = "vender"; fuerza = rising ? "fuerte" : "moderada"; }
  else if (high && falling) { signal = "vender"; fuerza = "moderada"; }
  else if (low && falling) { signal = "aguantar"; fuerza = "fuerte"; }
  else if (low) { signal = "aguantar"; fuerza = "moderada"; }
  else if (rising) { signal = "vender"; fuerza = "leve"; }
  else if (falling) { signal = "aguantar"; fuerza = "moderada"; }
  else { signal = "neutral"; fuerza = "leve"; }

  const titulo = signal === "vender"
    ? (fuerza === "fuerte" ? "Buen momento para VENDER tu cacao seco" : "Inclínate a VENDER")
    : signal === "aguantar"
      ? (fuerza === "fuerte" ? "Mejor AGUANTAR — no vendas barato" : "Inclínate a AGUANTAR")
      : "Momento NEUTRAL — vendé según tu caja";

  const resumen = signal === "vender"
    ? `El precio internacional está ${high ? "alto" : "subiendo"}${rising ? " y con impulso" : ""}. Si tenés stock seco listo, es buena ventana para vender y asegurar margen.`
    : signal === "aguantar"
      ? `El precio está ${low ? "bajo" : "cayendo"}${nervioso ? " y el mercado está nervioso" : ""}. Vender ahora te deja poco; si podés cubrir tu caja, conviene esperar una recuperación.`
      : `El precio no muestra una señal clara. Vendé lo que necesites para tu flujo de caja y guardá el resto esperando mejor precio.`;

  const cuando = signal === "vender"
    ? (rising ? "Esta semana, sin esperar demasiado — el impulso puede frenarse." : "En los próximos días, aprovechando el nivel actual.")
    : signal === "aguantar"
      ? `Esperá señales de recuperación${p.weekHigh52 ? ` (idealmente que se acerque a USD ${Math.round((p.value + (p.weekHigh52 - p.value) * 0.4))}/t)` : ""}; revisá el mercado cada semana.`
      : "Según tu necesidad de caja; no hay urgencia.";

  const riesgos: string[] = [];
  if (nervioso) riesgos.push(`Mercado volátil (±${vol}%/día): vendé en partes para no arriesgar todo a un solo día.`);
  if (signal === "aguantar") riesgos.push("Aguantar tiene costo: el cacao mal guardado gana humedad y pierde grado/precio.");
  if (signal === "vender" && falling) riesgos.push("Viene cayendo: no te demores, podría seguir bajando.");
  riesgos.push("El precio internacional es referencia; tu precio en chacra/FOB suele ir por debajo (flete + margen del comprador).");

  const compra = low || (pos52 != null && pos52 <= 40)
    ? "Para ACOPIAR: precio bajo = buena oportunidad de comprar barato a tus productores (y vender cuando suba)."
    : high
      ? "Para ACOPIAR: precio alto = cuidá tu margen, los productores pedirán más por kg."
      : "Para ACOPIAR: precio en zona media, condiciones normales de compra.";

  return { signal, fuerza, titulo, resumen, motivos, cuando, donde: DONDE, riesgos, compra, metrics };
}
