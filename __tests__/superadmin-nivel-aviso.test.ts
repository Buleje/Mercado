import { describe, it, expect } from "vitest";
import {
  compararAvisos,
  contarNiveles,
  cortesPedido,
  nivelAprobacionYape,
  nivelComprobanteApertura,
  nivelErrorDePanel,
  nivelesDePedidos,
  nivelNegocioEnRiesgo,
  nivelPedidoSinAtender,
  nivelSolicitudTienda,
  type Nivel,
} from "@/lib/superadmin/nivel-aviso";

// La bandeja real del 18-10 a las 13:15 UTC (106 avisos) es la que fijó las reglas.
const AHORA = new Date("2026-10-18T13:15:00.000Z");
const hace = (ms: number) => new Date(AHORA.getTime() - ms).toISOString();
const H = 3_600_000;
const D = 24 * H;

describe("nivelErrorDePanel", () => {
  it("372 veces visto hace 18 h = urgente (sigue pasando)", () => {
    const r = nivelErrorDePanel({ count: 372, lastSeenAt: "2026-10-17T18:39:18.803Z" }, AHORA);
    expect(r.nivel).toBe("urgente");
    expect(r.motivo).toMatch(/Sigue pasando/);
  });
  it("171 veces visto hace 27 h = urgente por cientos de repeticiones", () => {
    expect(nivelErrorDePanel({ count: 171, lastSeenAt: "2026-10-17T10:25:40.240Z" }, AHORA).nivel).toBe("urgente");
  });
  it("1 vez en las últimas 24 h = importante, no urgente", () => {
    expect(nivelErrorDePanel({ count: 1, lastSeenAt: hace(2 * H) }, AHORA).nivel).toBe("importante");
  });
  it("393 veces pero quieto hace 34 d = leve", () => {
    expect(nivelErrorDePanel({ count: 393, lastSeenAt: "2026-09-14T00:06:49.204Z" }, AHORA).nivel).toBe("leve");
  });
  it("130 veces visto hace 20 d = importante (cientos este mes)", () => {
    expect(nivelErrorDePanel({ count: 130, lastSeenAt: hace(20 * D) }, AHORA).nivel).toBe("importante");
  });
  it("6 veces hace 25 d = leve", () => {
    const r = nivelErrorDePanel({ count: 6, lastSeenAt: "2026-09-23T21:10:44.179Z" }, AHORA);
    expect(r).toEqual({ nivel: "leve", motivo: "Quieto hace 24 d, 6 veces" });
  });
});

describe("nivelNegocioEnRiesgo", () => {
  const base = { riskLevel: "critical", active: true, daysSinceLastOrder: 0, trialDaysLeft: null as number | null };
  it("tienda apagada = informativo aunque esté en riesgo crítico", () => {
    expect(nivelNegocioEnRiesgo({ ...base, active: false, trialDaysLeft: 0 }).nivel).toBe("informativo");
  });
  it("riesgo crítico que vende todos los días (Blas, Musa) = leve, no urgente", () => {
    expect(nivelNegocioEnRiesgo(base)).toEqual({ nivel: "leve", motivo: "Puntaje bajo, pero vende" });
  });
  it("dejó de vender hace 9 d = urgente", () => {
    expect(nivelNegocioEnRiesgo({ ...base, daysSinceLastOrder: 9 }).nivel).toBe("urgente");
  });
  it("41 y 75 d sin vender = importante", () => {
    expect(nivelNegocioEnRiesgo({ ...base, daysSinceLastOrder: 41 }).nivel).toBe("importante");
    expect(nivelNegocioEnRiesgo({ ...base, daysSinceLastOrder: 75 }).nivel).toBe("importante");
  });
  it("118 d sin vender = leve (rescate largo)", () => {
    expect(nivelNegocioEnRiesgo({ ...base, daysSinceLastOrder: 118 }).nivel).toBe("leve");
  });
  it("la prueba vence en 2 d = urgente aunque el riesgo sea alto", () => {
    const r = nivelNegocioEnRiesgo({ ...base, riskLevel: "high", trialDaysLeft: 2 });
    expect(r).toEqual({ nivel: "urgente", motivo: "La prueba vence en 2 d" });
  });
  it("riesgo alto con 10 d sin vender = importante (sólo el crítico sube a urgente)", () => {
    expect(nivelNegocioEnRiesgo({ ...base, riskLevel: "high", daysSinceLastOrder: 10 }).nivel).toBe("importante");
  });
});

describe("solicitudes, Yape y comprobantes", () => {
  it("solicitud: nueva = importante, 3 d = urgente, 5 meses = leve, pidiendo datos = informativo", () => {
    expect(nivelSolicitudTienda({ status: "pending", submittedAt: hace(5 * H) }, AHORA).nivel).toBe("importante");
    expect(nivelSolicitudTienda({ status: "pending", submittedAt: hace(3 * D) }, AHORA).nivel).toBe("urgente");
    expect(nivelSolicitudTienda({ status: "pending", submittedAt: "2026-05-24T01:27:53.314Z" }, AHORA).nivel).toBe("leve");
    expect(nivelSolicitudTienda({ status: "info_requested", submittedAt: hace(3 * D) }, AHORA).nivel).toBe("informativo");
  });
  it("Yape: recién llegado = importante, 45 min = urgente, a mano = urgente, viejo = importante (la plata nunca es leve)", () => {
    expect(nivelAprobacionYape({ status: "pending", createdAt: hace(10 * 60_000) }, AHORA).nivel).toBe("importante");
    expect(nivelAprobacionYape({ status: "pending", createdAt: hace(45 * 60_000) }, AHORA).nivel).toBe("urgente");
    expect(nivelAprobacionYape({ status: "review_required", createdAt: hace(60_000) }, AHORA).nivel).toBe("urgente");
    expect(nivelAprobacionYape({ status: "pending", createdAt: hace(9 * D) }, AHORA).nivel).toBe("importante");
  });
  it("comprobante de apertura: 13 h sin tienda = urgente", () => {
    expect(nivelComprobanteApertura({ createdAt: hace(13 * H) }, AHORA).nivel).toBe("urgente");
    expect(nivelComprobanteApertura({ createdAt: hace(H) }, AHORA).nivel).toBe("importante");
  });
});

describe("pedidos sin atender", () => {
  it("en curso ≤ 2 h, importante hasta 3 d, olvidado después", () => {
    expect(nivelPedidoSinAtender({ createdAt: hace(H) }, AHORA).nivel).toBe("informativo");
    expect(nivelPedidoSinAtender({ createdAt: hace(5 * H) }, AHORA).nivel).toBe("importante");
    expect(nivelPedidoSinAtender({ createdAt: "2026-09-06T15:58:37.423Z" }, AHORA).nivel).toBe("leve");
  });
  it("los cortes de fecha cuentan lo mismo que la regla, borde incluido", () => {
    const { enCursoDesde, olvidadoAntesDe } = cortesPedido(AHORA);
    expect(nivelPedidoSinAtender({ createdAt: enCursoDesde }, AHORA).nivel).toBe("informativo");
    expect(nivelPedidoSinAtender({ createdAt: olvidadoAntesDe }, AHORA).nivel).toBe("importante");
    expect(nivelPedidoSinAtender({ createdAt: new Date(olvidadoAntesDe.getTime() - 1) }, AHORA).nivel).toBe("leve");
  });
  it("83 pedidos, 0 en curso, 83 olvidados → todos leves", () => {
    expect(nivelesDePedidos(83, 0, 83)).toEqual({ urgente: 0, importante: 0, leve: 83, informativo: 0 });
    expect(nivelesDePedidos(10, 2, 5)).toEqual({ urgente: 0, importante: 3, leve: 5, informativo: 2 });
  });
});

describe("orden y conteo", () => {
  it("urgente primero; dentro del nivel lo más reciente; sin fecha respeta el orden de llegada", () => {
    const a = (id: string, nivel: Nivel, createdAt: string | null) => ({ id, nivel, createdAt });
    const lista = [
      a("leve-nuevo", "leve", hace(H)),
      a("urg-viejo", "urgente", hace(2 * D)),
      a("rescate-1", "importante", null),
      a("urg-nuevo", "urgente", hace(H)),
      a("rescate-2", "importante", null),
    ].sort(compararAvisos);
    expect(lista.map((x) => x.id)).toEqual(["urg-nuevo", "urg-viejo", "rescate-1", "rescate-2", "leve-nuevo"]);
    expect(contarNiveles(lista)).toEqual({ urgente: 2, importante: 2, leve: 1, informativo: 0 });
  });
});
