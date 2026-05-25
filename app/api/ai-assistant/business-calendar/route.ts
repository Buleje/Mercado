import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import {
  isQuincena,
  getTemporada,
  getProximoFeriado,
} from "@/lib/ai-business-snapshot";
import { logger } from "@/lib/logger";

// ── Types ───────────────────────────────────────────────────────────────────

interface CalendarEvent {
  nombre: string;
  fecha: string;
  tipo: "feriado" | "comercial" | "quincena" | "local" | "temporada";
  diasHasta: number;
  impactoNegocio: string;
}

// ── Static holiday/event definitions ────────────────────────────────────────

function calcularEventos(today: Date, dias: number): CalendarEvent[] {
  const year = today.getFullYear();
  const limite = new Date(today.getTime() + dias * 86_400_000);
  const eventos: CalendarEvent[] = [];

  // Helper to add event if within range
  const tryAdd = (
    nombre: string,
    mes: number,
    dia: number,
    tipo: CalendarEvent["tipo"],
    impactoNegocio: string,
    yr = year
  ) => {
    const fecha = new Date(yr, mes, dia);
    if (fecha >= today && fecha <= limite) {
      const diasHasta = Math.ceil(
        (fecha.getTime() - today.getTime()) / 86_400_000
      );
      eventos.push({
        nombre,
        fecha: fecha.toISOString().slice(0, 10),
        tipo,
        diasHasta,
        impactoNegocio,
      });
    }
  };

  // Check this year and next year for events near year boundaries
  for (const yr of [year, year + 1]) {
    // ── Feriados nacionales ──
    tryAdd("Año Nuevo", 0, 1, "feriado", "Día libre — stock de fiesta y limpieza", yr);
    tryAdd("Día del Trabajo", 4, 1, "feriado", "Día libre — ventas previas de asado/parrilla", yr);
    tryAdd("San Pedro y San Pablo", 5, 29, "feriado", "Feriado largo posible — stock de viaje", yr);
    tryAdd("Fiestas Patrias (día 1)", 6, 28, "feriado", "MÁXIMA demanda — cerveza, gaseosas, snacks, carne", yr);
    tryAdd("Fiestas Patrias (día 2)", 6, 29, "feriado", "Segundo día de fiestas — reposición urgente", yr);
    tryAdd("Santa Rosa de Lima", 7, 30, "feriado", "Feriado — demanda moderada", yr);
    tryAdd("Combate de Angamos", 9, 8, "feriado", "Feriado — demanda moderada", yr);
    tryAdd("Todos los Santos", 10, 1, "feriado", "Turrones, flores — preparar 1 semana antes", yr);
    tryAdd("Inmaculada Concepción", 11, 8, "feriado", "Inicio campaña navideña fuerte", yr);
    tryAdd("Navidad", 11, 25, "feriado", "MÁXIMA demanda — panetón, chocolate, espumante, pollo", yr);

    // ── San Valentín ──
    tryAdd("San Valentín", 1, 14, "comercial", "Chocolates, vino, regalos — margen alto", yr);

    // ── Día de la Madre (2do domingo de mayo) ──
    const mayo1 = new Date(yr, 4, 1);
    const primerDomMayo = ((7 - mayo1.getDay()) % 7) + 1;
    const diaMadre = primerDomMayo + 7;
    tryAdd("Día de la Madre", 4, diaMadre, "comercial", "2da fecha comercial más importante — tortas, regalos, pollo", yr);

    // ── Día del Padre (3er domingo de junio) ──
    const jun1 = new Date(yr, 5, 1);
    const primerDomJun = ((7 - jun1.getDay()) % 7) + 1;
    const diaPadre = primerDomJun + 14;
    tryAdd("Día del Padre", 5, diaPadre, "comercial", "Cerveza, licores, carnes — promociones combo", yr);

    // ── Campañas ──
    if (today.getMonth() <= 2 || (yr > year && true)) {
      tryAdd("Campaña Escolar", 1, 15, "comercial", "Útiles escolares, loncheras, bebidas — feb a mar", yr);
    }
    tryAdd("Inicio Campaña Navideña", 10, 1, "comercial", "Empezar a stockear panetón, chocolate, espumante", yr);

    // ── Eventos Pucallpa ──
    tryAdd("Aniversario de Pucallpa", 9, 13, "local", "Fiesta local — cerveza, gaseosas, demanda alta", yr);

    // ── Quincenas del mes actual y siguiente ──
    for (let m = today.getMonth(); m <= today.getMonth() + 1; m++) {
      const realMonth = m % 12;
      const realYear = m > 11 ? yr + 1 : yr;
      tryAdd(`Quincena (15/${realMonth + 1})`, realMonth, 15, "quincena", "Pico de ventas — clientes cobran", realYear);
      // Fin de mes / inicio
      const lastDay = new Date(realYear, realMonth + 1, 0).getDate();
      tryAdd(`Fin de mes (${lastDay}/${realMonth + 1})`, realMonth, lastDay, "quincena", "Segundo pico — preparar stock y cambio", realYear);
    }
  }

  // Dedupe by nombre+fecha and sort by diasHasta
  const seen = new Set<string>();
  return eventos
    .filter((e) => {
      const key = `${e.nombre}-${e.fecha}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.diasHasta - b.diasHasta);
}

// ── GET handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req, ["admin", "owner", "manager", "cajero", "analista"]);
    if (auth instanceof NextResponse) return auth;

    const rateLimited = applyRateLimit(req, "GENEROUS", "ai-calendar");
    if (rateLimited) return rateLimited;

    const today = new Date();
    const eventos = calcularEventos(today, 30);
    const temporada = getTemporada(today);
    const esQuincena = isQuincena(today);
    const proximoFeriado = getProximoFeriado(today);

    return NextResponse.json({
      today: today.toISOString(),
      temporada,
      esQuincena,
      proximoFeriado: proximoFeriado
        ? {
            nombre: proximoFeriado.nombre,
            fecha: proximoFeriado.fecha.toISOString().slice(0, 10),
            diasAntes: proximoFeriado.diasAntes,
          }
        : null,
      eventos,
    });
  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
