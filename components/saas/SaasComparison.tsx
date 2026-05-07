"use client";

import { m as motion } from "framer-motion";
import { Check, X } from "@buleje/design-system/icons";

interface Row {
  feature: string;
  cuaderno: React.ReactNode;
  excel: React.ReactNode;
  bodega: React.ReactNode;
}

function Yes() {
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full" style={{ background: "rgba(45,106,79,0.12)" }}>
      <Check className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} aria-hidden="true" />
    </span>
  );
}

function No() {
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full" style={{ background: "rgba(0,0,0,0.05)" }}>
      <X className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
    </span>
  );
}

const rows: Row[] = [
  {
    feature: "Precio",
    cuaderno: <span className="text-xs text-gray-500 dark:text-[rgba(240,244,241,0.5)]">Gratis</span>,
    excel: <span className="text-xs text-gray-500 dark:text-[rgba(240,244,241,0.5)]">Gratis</span>,
    bodega: (
      <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
        Desde S/ 0
      </span>
    ),
  },
  {
    feature: "Inventario automático",
    cuaderno: <No />,
    excel: <No />,
    bodega: <Yes />,
  },
  {
    feature: "Alertas de stock",
    cuaderno: <No />,
    excel: <No />,
    bodega: <Yes />,
  },
  {
    feature: "Ventas por WhatsApp",
    cuaderno: <No />,
    excel: <No />,
    bodega: <Yes />,
  },
  {
    feature: "Fiados con semáforo",
    cuaderno: <No />,
    excel: <No />,
    bodega: <Yes />,
  },
  {
    feature: "Funciona sin internet",
    cuaderno: <Yes />,
    excel: <No />,
    bodega: <Yes />,
  },
  {
    feature: "Inteligencia artificial",
    cuaderno: <No />,
    excel: <No />,
    bodega: <Yes />,
  },
  {
    feature: "Comandos de voz",
    cuaderno: <No />,
    excel: <No />,
    bodega: <Yes />,
  },
  {
    feature: "Multi-dispositivo",
    cuaderno: <No />,
    excel: <Yes />,
    bodega: <Yes />,
  },
  {
    feature: "Reportes automáticos",
    cuaderno: <No />,
    excel: <span className="text-xs text-gray-400 dark:text-[rgba(240,244,241,0.4)]">Manual</span>,
    bodega: (
      <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
        Diario
      </span>
    ),
  },
];

const headers = ["Característica", "Cuaderno", "Excel", "Buleje ERP"];

export default function SaasComparison() {
  return (
    <section
      id="comparativa"
      className="py-20 md:py-28 bg-gray-50 dark:bg-[#0f1a14]"
    >
      <div className="max-w-5xl mx-auto px-5 sm:px-8 lg:px-12">
        {/* Header */}
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: [0.175, 0.885, 0.32, 1.275] }}
        >
          <h2
            className="font-extrabold text-gray-900 dark:text-[#f0f4f1] mb-3"
            style={{ fontSize: "clamp(1.5rem, 3vw, 2.2rem)", letterSpacing: "-0.02em" }}
          >
            Por que elegir nuestro sistema
          </h2>
          <p className="text-gray-500 dark:text-[rgba(240,244,241,0.6)] text-base sm:text-lg">
            Compara con lo que usas hoy
          </p>
        </motion.div>

        {/* Table wrapper — horizontal scroll on mobile */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: [0.175, 0.885, 0.32, 1.275] }}
          className="overflow-x-auto -mx-5 px-5 sm:mx-0 sm:px-0"
        >
          <table className="min-w-[520px] w-full border-collapse text-sm">
            {/* Column group for highlight */}
            <colgroup>
              <col className="w-[42%]" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
              <col
                className="w-[26%]"
                style={{ background: "rgba(45,106,79,0.06)" }}
              />
            </colgroup>

            <thead>
              <tr>
                {headers.map((h, idx) => {
                  const isBodega = idx === 3;
                  return (
                    <th
                      key={h}
                      scope="col"
                      className="py-3 px-4 text-left font-bold text-xs uppercase tracking-wide"
                      style={
                        isBodega
                          ? {
                              color: "var(--accent)",
                              borderBottom: "2px solid var(--accent)",
                              background: "rgba(45,106,79,0.08)",
                              borderTopLeftRadius: idx === 3 ? "0.75rem" : undefined,
                              borderTopRightRadius: idx === 3 ? "0.75rem" : undefined,
                            }
                          : {
                              color: undefined,
                              borderBottom: "2px solid rgba(0,0,0,0.08)",
                            }
                      }
                    >
                      {isBodega ? (
                        <span className="flex items-center gap-1">
                          {h}
                          <span
                            className="ml-1 px-1.5 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-black text-white"
                            style={{ background: "#f97316" }}
                          >
                            NUEVO
                          </span>
                        </span>
                      ) : (
                        h
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.feature}
                  className={
                    i % 2 === 0
                      ? "bg-white dark:bg-[#121f17]"
                      : "bg-gray-50/60 dark:bg-[#0f1a14]"
                  }
                >
                  {/* Feature name */}
                  <td className="py-3 px-4 font-medium text-gray-700 dark:text-[rgba(240,244,241,0.8)] text-sm">
                    {row.feature}
                  </td>

                  {/* Cuaderno */}
                  <td className="py-3 px-4 text-center">{row.cuaderno}</td>

                  {/* Excel */}
                  <td className="py-3 px-4 text-center">{row.excel}</td>

                  {/* Buleje — highlighted */}
                  <td
                    className="py-3 px-4 text-center"
                    style={{
                      background: "rgba(45,106,79,0.06)",
                      borderLeft: "1px solid rgba(45,106,79,0.15)",
                      borderRight: "1px solid rgba(45,106,79,0.15)",
                    }}
                  >
                    {row.bodega}
                  </td>
                </tr>
              ))}

              {/* CTA row */}
              <tr>
                <td colSpan={3} className="py-4 px-4" />
                <td
                  className="py-4 px-4 text-center"
                  style={{
                    background: "rgba(45,106,79,0.08)",
                    borderLeft: "1px solid rgba(45,106,79,0.15)",
                    borderRight: "1px solid rgba(45,106,79,0.15)",
                    borderBottom: "2px solid var(--accent)",
                    borderBottomLeftRadius: "0.75rem",
                    borderBottomRightRadius: "0.75rem",
                  }}
                >
                  <a
                    href="#precios"
                    className="inline-block px-4 py-2 rounded-xl text-xs font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                    style={{
                      background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)",
                      boxShadow: "0 4px 16px -4px rgba(45,106,79,0.5)",
                    }}
                  >
                    Empezar gratis
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </motion.div>
      </div>
    </section>
  );
}
