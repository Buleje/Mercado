/**
 * Inicio › Clientes › gráficos especializados: las cuentas (movidas tal cual
 * desde `ClientesAdvancedCharts` el 2026-10-09; `ahora` entra por parámetro para
 * poder probarlas) y qué se muestra. Sin React.
 *
 * Cambios de presentación: los meses se escriben a mano («oct»), y el nombre del
 * cliente sale de tu lista cuando la venta trae sólo el teléfono.
 */
import { hayDatosEnSerie, hayFilas, hayTendencia } from "@/lib/admin/inicio/hay-datos";
import { mapaDeNombres, mesCorto, type ClientesCrudos } from "./clientes-tablero";

export function calcularAvanzado(raw: ClientesCrudos, ahora: number = Date.now()) {
  const { orders, sales, reviews } = raw;
  const nombres = mapaDeNombres(raw.customers);

  // ── 1. COHORT RETENTION (matriz m0-m3) ──────────────────────────────────
  const cohort = (() => {
    const now = new Date(ahora);
    const rows: Array<{
      cohorte: string;
      size: number;
      m0: number;
      m1: number;
      m2: number;
      m3: number;
    }> = [];
    for (let c = 3; c >= 0; c--) {
      const cStart = new Date(now.getFullYear(), now.getMonth() - c, 1);
      const cEnd = new Date(now.getFullYear(), now.getMonth() - c + 1, 0, 23, 59, 59);
      const label = mesCorto(cStart, now);
      const allPhonesBefore = new Set<string>();
      orders
        .filter((o) => o.status === "entregado" && new Date(o.createdAt) < cStart)
        .forEach((o) => {
          if (o.customer?.phone) allPhonesBefore.add(o.customer.phone);
        });
      sales
        .filter((s) => new Date(s.createdAt) < cStart)
        .forEach((s) => {
          if (s.customerPhone) allPhonesBefore.add(s.customerPhone);
        });
      const firstPurchase = new Set<string>();
      orders
        .filter(
          (o) =>
            o.status === "entregado" &&
            new Date(o.createdAt) >= cStart &&
            new Date(o.createdAt) <= cEnd,
        )
        .forEach((o) => {
          if (o.customer?.phone && !allPhonesBefore.has(o.customer.phone))
            firstPurchase.add(o.customer.phone);
        });
      sales
        .filter((s) => new Date(s.createdAt) >= cStart && new Date(s.createdAt) <= cEnd)
        .forEach((s) => {
          if (s.customerPhone && !allPhonesBefore.has(s.customerPhone))
            firstPurchase.add(s.customerPhone);
        });
      const cohortSize = firstPurchase.size;
      if (cohortSize === 0) {
        rows.push({ cohorte: label, size: 0, m0: 0, m1: 0, m2: 0, m3: 0 });
        continue;
      }
      const mPcts = [100];
      for (let m = 1; m <= 3; m++) {
        const mS = new Date(now.getFullYear(), now.getMonth() - c + m, 1);
        const mE = new Date(now.getFullYear(), now.getMonth() - c + m + 1, 0, 23, 59, 59);
        if (mS > now) {
          mPcts.push(-1);
          continue;
        }
        let retained = 0;
        firstPurchase.forEach((phone) => {
          const hasPurchase =
            orders.some(
              (o) =>
                o.status === "entregado" &&
                o.customer?.phone === phone &&
                new Date(o.createdAt) >= mS &&
                new Date(o.createdAt) <= mE,
            ) ||
            sales.some(
              (s) =>
                s.customerPhone === phone &&
                new Date(s.createdAt) >= mS &&
                new Date(s.createdAt) <= mE,
            );
          if (hasPurchase) retained++;
        });
        mPcts.push(Math.round((retained / cohortSize) * 100));
      }
      rows.push({
        cohorte: label,
        size: cohortSize,
        m0: mPcts[0],
        m1: mPcts[1],
        m2: mPcts[2],
        m3: mPcts[3],
      });
    }
    return rows;
  })();

  // ── 2. RFM Quadrant (Recency × Frequency, size = Monetary) ──────────────
  const rfm = (() => {
    const now = ahora;
    const m = new Map<
      string,
      { name: string; lastPurchase: number; frequency: number; monetary: number }
    >();
    const addOrder = (
      phone: string | undefined,
      name: string | undefined,
      date: string,
      total: number,
    ) => {
      if (!phone) return;
      const t = new Date(date).getTime();
      const cur = m.get(phone) ?? {
        name: name ?? phone,
        lastPurchase: 0,
        frequency: 0,
        monetary: 0,
      };
      cur.lastPurchase = Math.max(cur.lastPurchase, t);
      cur.frequency += 1;
      cur.monetary += total;
      m.set(phone, cur);
    };
    orders
      .filter((o) => o.status === "entregado")
      .forEach((o) =>
        addOrder(o.customer?.phone, o.customer?.name, o.createdAt, o.total),
      );
    sales.forEach((s) =>
      addOrder(s.customerPhone, nombres.get(s.customerPhone ?? "") ?? s.customerPhone, s.createdAt, s.total),
    );
    const rows = Array.from(m.values()).map((c) => ({
      name: c.name,
      recencyDays: Math.round((now - c.lastPurchase) / (24 * 60 * 60 * 1000)),
      frequency: c.frequency,
      monetary: c.monetary,
    }));
    if (rows.length === 0) {
      return { rows: [], medianRecency: 0, medianFreq: 0, counts: { champions: 0, loyal: 0, risk: 0, new: 0 } };
    }
    const sortedR = [...rows].sort((a, b) => a.recencyDays - b.recencyDays);
    const sortedF = [...rows].sort((a, b) => a.frequency - b.frequency);
    const medianRecency = sortedR[Math.floor(sortedR.length / 2)]?.recencyDays ?? 0;
    const medianFreq = sortedF[Math.floor(sortedF.length / 2)]?.frequency ?? 0;
    const champions = rows.filter(
      (r) => r.recencyDays <= medianRecency && r.frequency >= medianFreq,
    ).length;
    const loyal = rows.filter(
      (r) => r.recencyDays > medianRecency && r.frequency >= medianFreq,
    ).length;
    const risk = rows.filter(
      (r) => r.recencyDays > medianRecency && r.frequency < medianFreq,
    ).length;
    const newC = rows.filter(
      (r) => r.recencyDays <= medianRecency && r.frequency < medianFreq,
    ).length;
    return { rows, medianRecency, medianFreq, counts: { champions, loyal, risk, new: newC } };
  })();

  // ── 3. DISTRIBUCIÓN DE RATING ─────────────────────────────────────────────
  const ratingChart = (() => {
    const arr = [1, 2, 3, 4, 5].map((r) => ({
      rating: `${r}/5`,
      cantidad: reviews.filter((rv) => Math.round(rv.rating) === r).length,
    }));
    const total = arr.reduce((s, x) => s + x.cantidad, 0);
    const promedio =
      reviews.length > 0
        ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
        : 0;
    const buenos = arr.filter((x) => Number(x.rating[0]) >= 4).reduce((s, x) => s + x.cantidad, 0);
    const malos = arr.filter((x) => Number(x.rating[0]) <= 2).reduce((s, x) => s + x.cantidad, 0);
    return { arr, total, promedio, buenos, malos };
  })();

  // ── 4. COMPARATIVA NUEVOS CLIENTES SEM ACTUAL vs PREVIA ─────────────────
  const comp = (() => {
    const now = ahora;
    const DAYS_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const buckets = Array.from({ length: 7 }).map(() => ({
      day: "",
      current: 0,
      previous: 0,
    }));
    const curStart = now - 7 * 24 * 60 * 60 * 1000;
    const prevStart = now - 14 * 24 * 60 * 60 * 1000;

    // Nuevos = primera compra en la semana
    const firstByPhone = new Map<string, number>();
    const pushFirst = (phone: string | undefined, date: string) => {
      if (!phone) return;
      const t = new Date(date).getTime();
      const cur = firstByPhone.get(phone);
      if (cur == null || t < cur) firstByPhone.set(phone, t);
    };
    orders
      .filter((o) => o.status === "entregado")
      .forEach((o) => pushFirst(o.customer?.phone, o.createdAt));
    sales.forEach((s) => pushFirst(s.customerPhone, s.createdAt));

    firstByPhone.forEach((t) => {
      if (t >= curStart) {
        const daysAgo = Math.floor((now - t) / (24 * 60 * 60 * 1000));
        if (daysAgo < 0 || daysAgo >= 7) return;
        buckets[6 - daysAgo].current += 1;
      } else if (t >= prevStart) {
        const daysAgo = Math.floor((curStart - t) / (24 * 60 * 60 * 1000));
        if (daysAgo < 0 || daysAgo >= 7) return;
        buckets[6 - daysAgo].previous += 1;
      }
    });
    const today = new Date(ahora);
    buckets.forEach((r, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      r.day = DAYS_LABEL[d.getDay()];
    });
    return buckets;
  })();

  // ── 5. HEATMAP activity hora × día (30d) ────────────────────────────────
  const heatmap = (() => {
    const last30 = ahora - 30 * 24 * 60 * 60 * 1000;
    const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const BUCKETS = [
      { label: "Mañana", range: [6, 11] },
      { label: "Mediodía", range: [12, 14] },
      { label: "Tarde", range: [15, 18] },
      { label: "Noche", range: [19, 23] },
    ];
    const matrix = BUCKETS.map(() => [0, 0, 0, 0, 0, 0, 0]);
    const add = (iso: string) => {
      if (new Date(iso).getTime() < last30) return;
      const d = new Date(iso);
      const dow = (d.getDay() + 6) % 7;
      const h = d.getHours();
      const bi = BUCKETS.findIndex(({ range }) => h >= range[0] && h <= range[1]);
      if (bi < 0) return;
      matrix[bi][dow] += 1;
    };
    orders.filter((o) => o.status === "entregado").forEach((o) => add(o.createdAt));
    sales.forEach((s) => add(s.createdAt));
    const max = Math.max(1, ...matrix.flat());
    const peak = matrix.reduce(
      (best, row, idx) => {
        const rowMax = Math.max(...row);
        return rowMax > best.value ? { idx, value: rowMax } : best;
      },
      { idx: -1, value: 0 },
    );
    return { matrix, max, buckets: BUCKETS, days: DAYS, peak };
  })();

  // ── 6. CHURN RISK — clientes en riesgo ──────────────────────────────────
  const churn = (() => {
    const now = ahora;
    const lastByPhone = new Map<string, { name: string; last: number; total: number; freq: number }>();
    const register = (
      phone: string | undefined,
      name: string | undefined,
      date: string,
      total: number,
    ) => {
      if (!phone) return;
      const t = new Date(date).getTime();
      const cur = lastByPhone.get(phone) ?? { name: name ?? phone, last: 0, total: 0, freq: 0 };
      cur.last = Math.max(cur.last, t);
      cur.total += total;
      cur.freq += 1;
      if (name) cur.name = name;
      lastByPhone.set(phone, cur);
    };
    orders
      .filter((o) => o.status === "entregado")
      .forEach((o) => register(o.customer?.phone, o.customer?.name, o.createdAt, o.total));
    sales.forEach((s) => register(s.customerPhone, nombres.get(s.customerPhone ?? "") ?? s.customerPhone, s.createdAt, s.total));

    const rows = Array.from(lastByPhone.values())
      .map((c) => {
        const days = Math.round((now - c.last) / (24 * 60 * 60 * 1000));
        const riskScore =
          days > 60 ? 3 : days > 30 ? 2 : days > 14 ? 1 : 0;
        return { ...c, daysSinceLast: days, riskScore };
      })
      .filter((r) => r.riskScore >= 2 && r.freq >= 2)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const high = rows.filter((r) => r.riskScore === 3).length;
    const med = rows.filter((r) => r.riskScore === 2).length;
    const valueAtRisk = rows.reduce((s, r) => s + r.total, 0);
    return { rows, high, med, valueAtRisk };
  })();

  return { cohort, rfm, ratingChart, comp, heatmap, churn };
}

export type ClientesAvanzado = ReturnType<typeof calcularAvanzado>;

export interface QueSeMuestraAvanzado {
  cohorte: boolean;
  rfm: boolean;
  rating: boolean;
  comparativa: boolean;
  mapaDeCalor: boolean;
  riesgo: boolean;
}

/** Qué gráfico especializado tiene algo que decir (R2 del tablero). */
export function queSeMuestraAvanzado(a: ClientesAvanzado): QueSeMuestraAvanzado {
  return {
    // La cohorte del mes en curso no tiene «mes siguiente»: hace falta una anterior con clientes.
    cohorte: a.cohort.some((c) => c.size > 0 && c.m1 >= 0),
    // Con 1-2 puntos el mapa de grupos no separa a nadie.
    rfm: hayFilas(a.rfm.rows, 3),
    rating: a.ratingChart.total > 0,
    comparativa: hayTendencia(a.comp, ["current", "previous"]),
    mapaDeCalor: hayDatosEnSerie(a.heatmap.matrix.flat().map((v) => ({ v })), ["v"], { minPuntos: 2 }),
    riesgo: hayFilas(a.churn.rows),
  };
}
