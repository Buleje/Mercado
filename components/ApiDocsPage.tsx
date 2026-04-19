"use client";

import React, { useState } from "react";
import {
  ChevronRight, Play, Loader2, CheckCircle, XCircle,
  Lock, Globe, ChevronDown, ChevronUp,
} from "@buleje/design-system/icons";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface ApiParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface ApiEndpoint {
  id: string;
  method: HttpMethod;
  path: string;
  description: string;
  auth: boolean;
  params: ApiParam[];
  requestExample?: object;
  responseExample: object;
}

type Category = {
  id: string;
  label: string;
  endpoints: ApiEndpoint[];
};

// ── Datos de endpoints ────────────────────────────────────────────────────────

const CATEGORIES: Category[] = [
  {
    id: "auth",
    label: "Autenticacion",
    endpoints: [
      {
        id: "auth-login",
        method: "POST",
        path: "/api/auth/login",
        description: "Inicia sesion como administrador y recibe una cookie de sesion firmada.",
        auth: false,
        params: [],
        requestExample: { username: "admin", password: "tu-password" },
        responseExample: { ok: true, role: "admin", tenantId: "main" },
      },
    ],
  },
  {
    id: "products",
    label: "Productos",
    endpoints: [
      {
        id: "products-list",
        method: "GET",
        path: "/api/products",
        description: "Lista todos los productos del tenant. Soporta busqueda y paginacion.",
        auth: true,
        params: [
          { name: "search",   type: "string",  required: false, description: "Buscar por nombre o codigo" },
          { name: "page",     type: "number",  required: false, description: "Pagina (default: 1)" },
          { name: "limit",    type: "number",  required: false, description: "Items por pagina (default: 20)" },
          { name: "category", type: "string",  required: false, description: "Filtrar por categoria" },
          { name: "active",   type: "boolean", required: false, description: "Filtrar por estado activo" },
        ],
        responseExample: {
          data: [{ id: 1, name: "Arroz Extra", price: 3.5, stock: 100, active: true }],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
      },
      {
        id: "products-create",
        method: "POST",
        path: "/api/products",
        description: "Crea un producto nuevo en el catalogo.",
        auth: true,
        params: [],
        requestExample: {
          name: "Arroz Extra 5kg",
          price: 18.5,
          stock: 50,
          categoryId: 2,
          barcode: "7591000001",
          minStock: 5,
        },
        responseExample: {
          id: 42,
          name: "Arroz Extra 5kg",
          price: 18.5,
          stock: 50,
          active: true,
          createdAt: "2026-03-29T12:00:00Z",
        },
      },
    ],
  },
  {
    id: "customers",
    label: "Clientes",
    endpoints: [
      {
        id: "customers-list",
        method: "GET",
        path: "/api/customers",
        description: "Lista clientes registrados. Busqueda por nombre o telefono.",
        auth: true,
        params: [
          { name: "search", type: "string", required: false, description: "Nombre o telefono" },
          { name: "page",   type: "number", required: false, description: "Pagina" },
          { name: "limit",  type: "number", required: false, description: "Resultados por pagina" },
        ],
        responseExample: {
          data: [{ phone: "999000111", name: "Maria Lopez", totalOrders: 5, totalSpent: 120.5 }],
          total: 1,
        },
      },
    ],
  },
  {
    id: "orders",
    label: "Pedidos",
    endpoints: [
      {
        id: "orders-create",
        method: "POST",
        path: "/api/orders",
        description: "Crea un nuevo pedido. Soporta delivery y recojo en tienda.",
        auth: true,
        params: [],
        requestExample: {
          customerPhone: "999000111",
          items: [{ productId: 1, qty: 2 }, { productId: 5, qty: 1 }],
          deliveryAddress: "Jr. Los Pinos 123",
          paymentMethod: "cash",
          idempotencyKey: "uuid-unico",
        },
        responseExample: {
          id: "ORD-001",
          status: "pending",
          total: 24.5,
          createdAt: "2026-03-29T12:00:00Z",
        },
      },
    ],
  },
  {
    id: "inventory",
    label: "Inventario",
    endpoints: [
      {
        id: "inventory-list",
        method: "GET",
        path: "/api/inventory",
        description: "Ver el inventario con niveles de stock, lotes FEFO y alertas.",
        auth: true,
        params: [
          { name: "lowStock", type: "boolean", required: false, description: "Solo productos con stock bajo" },
          { name: "search",   type: "string",  required: false, description: "Buscar producto" },
        ],
        responseExample: {
          data: [
            { productId: 1, productName: "Arroz Extra", stock: 100, minStock: 5, status: "ok" },
            { productId: 3, productName: "Aceite 1L",   stock: 2,   minStock: 10, status: "low" },
          ],
          total: 2,
        },
      },
    ],
  },
];

// ── Colores por método HTTP ───────────────────────────────────────────────────

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET:    "bg-emerald-100  text-emerald-700  dark:bg-emerald-900/40  dark:text-emerald-300",
  POST:   "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  PATCH:  "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  DELETE: "bg-red-100   text-red-700   dark:bg-red-900/40   dark:text-red-300",
};

// ── Componente de bloque de codigo ────────────────────────────────────────────

function CodeBlock({ value }: { value: Record<string, unknown> | unknown[] }) {
  return (
    <pre className="text-xs font-mono bg-gray-950 text-green-400 rounded-xl p-4 overflow-auto max-h-48 whitespace-pre-wrap">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

// ── Panel de un endpoint ──────────────────────────────────────────────────────

function EndpointPanel({ endpoint }: { endpoint: ApiEndpoint }) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; status: number; body: unknown } | null>(null);

  const handleTry = async () => {
    setRunning(true);
    setResult(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      const res = await fetch(endpoint.path, {
        method: endpoint.method,
        headers,
        ...(endpoint.requestExample ? { body: JSON.stringify(endpoint.requestExample) } : {}),
      });

      let body: unknown;
      try { body = await res.json(); } catch { body = null; }
      setResult({ ok: res.ok, status: res.status, body });
    } catch (e) {
      setResult({ ok: false, status: 0, body: { error: e instanceof Error ? e.message : String(e) } });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
      {/* Header del endpoint */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${METHOD_COLORS[endpoint.method]}`}>
          {endpoint.method}
        </span>
        <span className="font-mono text-sm text-gray-800 dark:text-gray-200 flex-1">
          {endpoint.path}
        </span>
        {endpoint.auth && (
          <span title="Requiere autenticacion">
            <Lock className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
          </span>
        )}
        {open ? (
          <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
        )}
      </button>

      {/* Descripcion breve (siempre visible) */}
      <p className="px-4 pb-3 text-sm text-gray-500 dark:text-gray-400">
        {endpoint.description}
      </p>

      {/* Contenido expandible */}
      {open && (
        <div className="border-t border-gray-100 dark:border-gray-800 p-4 space-y-5">
          {/* Parametros */}
          {endpoint.params.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                Parametros
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100 dark:border-gray-800">
                      <th className="text-left py-1.5 pr-3 font-medium">Nombre</th>
                      <th className="text-left py-1.5 pr-3 font-medium">Tipo</th>
                      <th className="text-left py-1.5 pr-3 font-medium">Requerido</th>
                      <th className="text-left py-1.5 font-medium">Descripcion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {endpoint.params.map((p) => (
                      <tr key={p.name} className="border-b border-gray-50 dark:border-gray-800/50">
                        <td className="py-1.5 pr-3 font-mono text-green-700 dark:text-green-400">
                          {p.name}
                        </td>
                        <td className="py-1.5 pr-3 text-emerald-600 dark:text-emerald-400 font-mono">
                          {p.type}
                        </td>
                        <td className="py-1.5 pr-3">
                          {p.required ? (
                            <span className="text-red-500 font-medium">Si</span>
                          ) : (
                            <span className="text-gray-400">No</span>
                          )}
                        </td>
                        <td className="py-1.5 text-gray-600 dark:text-gray-400">
                          {p.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Ejemplo de request */}
          {endpoint.requestExample && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                Ejemplo de request (body)
              </h4>
              <CodeBlock value={endpoint.requestExample as Record<string, unknown>} />
            </div>
          )}

          {/* Ejemplo de response */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
              Ejemplo de response
            </h4>
            <CodeBlock value={endpoint.responseExample as Record<string, unknown>} />
          </div>

          {/* Boton "Probar" */}
          <div className="border border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase flex items-center gap-1.5">
              <Play className="h-3.5 w-3.5" /> Probar en vivo
            </h4>
            {endpoint.auth && (
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="API key o token (opcional)"
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            )}
            <button
              onClick={handleTry}
              disabled={running}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl transition-colors"
            >
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Ejecutar
            </button>

            {result && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {result.ok ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className={`text-sm font-medium ${result.ok ? "text-green-600" : "text-red-600"}`}>
                    HTTP {result.status}
                  </span>
                </div>
                {result.body != null && typeof result.body === "object" && (
                  <CodeBlock value={result.body as Record<string, unknown>} />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ApiDocsPage() {
  const [activeCategory, setActiveCategory] = useState<string>(CATEGORIES[0].id);

  const currentCategory = CATEGORIES.find((c) => c.id === activeCategory) ?? CATEGORIES[0];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Globe className="h-6 w-6 text-green-600" />
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              API Docs — Buleje
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              REST API v1 · Base URL: <span className="font-mono">/api</span>
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-6xl mx-auto w-full flex gap-0 md:gap-6 px-4 py-6">
        {/* Sidebar */}
        <aside className="hidden md:block w-52 shrink-0">
          <div className="sticky top-6 space-y-1">
            <p className="text-xs font-semibold text-gray-400 uppercase px-2 mb-3">
              Categorias
            </p>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-left transition-colors ${
                  activeCategory === cat.id
                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 transition-transform ${
                    activeCategory === cat.id ? "rotate-90" : ""
                  }`}
                />
                {cat.label}
                <span className="ml-auto text-xs text-gray-400">
                  {cat.endpoints.length}
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* Selector mobile */}
        <div className="md:hidden w-full mb-4">
          <select
            value={activeCategory}
            onChange={(e) => setActiveCategory(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.label} ({cat.endpoints.length})
              </option>
            ))}
          </select>
        </div>

        {/* Panel principal */}
        <main className="flex-1 min-w-0 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {currentCategory.label}
            </h2>
            <span className="text-xs text-gray-400">
              {currentCategory.endpoints.length} endpoint{currentCategory.endpoints.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Nota de autenticacion */}
          <div className="flex items-start gap-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3">
            <Lock className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              Los endpoints con <strong>candado</strong> requieren sesion activa de admin.
              Inicia sesion en <span className="font-mono">/admin</span> antes de probarlos.
            </p>
          </div>

          {currentCategory.endpoints.map((endpoint) => (
            <EndpointPanel key={endpoint.id} endpoint={endpoint} />
          ))}
        </main>
      </div>
    </div>
  );
}

export default ApiDocsPage;
