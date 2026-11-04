"use client";

/**
 * Lo primero que se mira del cuaderno: cuánto hay guardado, cuánto lugar queda
 * contra lo declarado a SUNAT, lo comprado en el año contra el cupo y lo
 * gastado en el mes contra la proyección. Si el almacén está en el tope o
 * pasado, el aviso va arriba de todo.
 */

import { AlertTriangle, CalendarDays, Fuel, Package, ShoppingCart } from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import { RESIDUO_VACIO_GAL, type ReporteMes } from "@/lib/combustible/cuaderno";
import { cn } from "@/lib/utils";
import { NIVEL, TONO_CAJA, TONO_TEXTO, gal, num1, cil } from "./compartido";
import type { CuadernoCombustible } from "./use-cuaderno-combustible";

export default function ResumenCombustible({ c, repHoy }: { c: CuadernoCombustible; repHoy: ReporteMes | null }) {
  const { datos, rec, nivel } = c;
  if (!datos || !rec) return null;
  const cfg = datos.config;
  const libres = Math.max(0, cfg.maxCilindros - rec.cilindrosConCombustible);
  const aviso = NIVEL[nivel];
  const anio = repHoy?.acumuladoAnio;
  const conCombustible = rec.cilindros.filter((x) => x.resto > RESIDUO_VACIO_GAL);
  const emph = aviso.tono === "error" ? "error" : aviso.tono === "aviso" ? "warning" : "neutral";

  return (
    <div className="space-y-3" data-combustible-resumen>
      {nivel !== "ok" && (
        <div role="status" className={cn("flex items-start gap-2 rounded-xl border px-3 py-2.5", TONO_CAJA[aviso.tono])}>
          <AlertTriangle className={cn("mt-0.5 h-5 w-5 shrink-0", TONO_TEXTO[aviso.tono])} aria-hidden />
          <span className={cn("text-sm font-bold", TONO_TEXTO[aviso.tono])}>{aviso.largo}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="En el almacén"
          value={gal(rec.saldoGal)}
          subValue={`${cil(rec.cilindrosConCombustible)} con combustible`}
          icon={Fuel}
          emphasis={emph}
          density="compact"
        />
        <StatCard
          label="Lugar libre"
          value={cil(libres)}
          subValue={`Máx. ${cfg.maxCilindros} declarados (${gal(cfg.maxCilindros * cfg.galPorCilindro)})`}
          icon={Package}
          emphasis={libres === 0 ? emph : "neutral"}
          density="compact"
        />
        <StatCard
          label="Comprado en el año"
          value={gal(anio?.comprasGal ?? 0)}
          subValue={anio?.cupo != null ? `de ${gal(anio.cupo)} inscritos (${num1(anio.pct ?? 0)} %)` : "Sin cupo declarado (Ajustes)"}
          icon={ShoppingCart}
          emphasis={anio?.cupo != null && anio.comprasGal > anio.cupo ? "error" : "neutral"}
          density="compact"
        />
        <StatCard
          label="Gastado este mes"
          value={gal(repHoy?.totalConsumo ?? 0)}
          subValue={repHoy?.proyeccionGal != null ? `Proyección del mes: ${gal(repHoy.proyeccionGal)}` : "Sin proyección (Ajustes)"}
          icon={CalendarDays}
          emphasis={repHoy?.proyeccionGal != null && repHoy.totalConsumo > repHoy.proyeccionGal * 1.1 ? "warning" : "neutral"}
          density="compact"
        />
      </div>
      {conCombustible.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Cilindros con combustible">
          {conCombustible.map((x) => (
            <li
              key={x.numero}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-1 text-sm"
              title={x.abiertoEl ? "Abierto (ya se sacó de este)" : "Lleno, sin abrir"}
            >
              <span className="font-mono font-bold text-[var(--text-primary)]">{x.etiqueta}</span>
              <span className="tabular-nums text-[var(--text-secondary)]">{gal(x.resto)}</span>
              {x.abiertoEl && <span className="text-xs font-semibold text-[var(--text-tertiary)]">abierto</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
