"use client";
import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Brain, MessageSquare, Bell, Stethoscope, Lightbulb, Target, HeartPulse, Settings } from "lucide-react";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const SmartDashboardTab = dynamic(
  () => import("@/components/admin/SmartDashboardTab"),
  { loading: S },
);
const AIAssistant = dynamic(
  () => import("@/components/admin/AIAssistant"),
  { ssr: false, loading: S },
);
const AlertsCenterTab = dynamic(
  () => import("@/components/admin/AlertsCenterTab"),
  { loading: S },
);
const AICommandCenter = dynamic(
  () => import("@/components/admin/ai-center/AICommandCenter"),
  { loading: S },
);
const SugerenciasIAModule = dynamic(
  () => import("@/components/admin/unified/SugerenciasIAModule"),
  { loading: S },
);
const MetasLogrosModule = dynamic(
  () => import("@/components/admin/unified/MetasLogrosModule"),
  { loading: S },
);
const AIHealthPanel = dynamic(
  () => import("@/components/admin/AIHealthPanel"),
  { loading: S },
);

const MODULE_ID = "asistente-ia";

const TABS = [
  { id: "dashboard-ia", label: "Mi negocio hoy", icon: Brain },
  { id: "centro-comando", label: "Centro de Comando", icon: Stethoscope },
  { id: "sugerencias", label: "Sugerencias", icon: Lightbulb },
  { id: "metas", label: "Metas y Logros", icon: Target },
  { id: "chat-ia", label: "Chat", icon: MessageSquare },
  { id: "alertas", label: "Alertas", icon: Bell },
  { id: "salud-ia", label: "Salud IA", icon: HeartPulse },
  { id: "config-ia", label: "Configurar IA", icon: Settings },
];

interface Props {
  tenantId?: string;
}

interface AIStatusData {
  hasAI: boolean;
  activeProvider: string;
  activeProviderName: string;
  providers: { id: string; name: string; configured: boolean }[];
}

export default function AsistenteIAModule({ tenantId }: Props) {
  const [tab, setTab] = useState("dashboard-ia");
  const [aiStatus, setAiStatus] = useState<AIStatusData | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetch("/api/ai/status")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setAiStatus(data); })
      .catch(() => {});
  }, []);

  const testConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/ai/test");
      const data = await res.json();
      setTestResult({ ok: data.ok, message: data.message });
      // Refresh status after test
      const statusRes = await fetch("/api/ai/status");
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setAiStatus(statusData);
      }
    } catch {
      setTestResult({ ok: false, message: "Error de conexión. Revisa tu internet." });
    } finally {
      setTesting(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Asistente IA"
        description="Panel de inteligencia artificial: dashboard, sugerencias, alertas y configuración"
        icon={Brain}
      />
      {/* AI Status Banner */}
      {aiStatus && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
          aiStatus.hasAI
            ? "bg-emerald-50 border-emerald-200"
            : "bg-amber-50 border-amber-200"
        }`}>
          <span className={`h-3 w-3 rounded-full ${aiStatus.hasAI ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
          <div className="flex-1">
            <p className={`text-sm font-bold ${aiStatus.hasAI ? "text-emerald-700" : "text-amber-700"}`}>
              {aiStatus.hasAI ? `✅ IA Activa: ${aiStatus.activeProviderName}` : "⚠️ Sin API de IA configurada"}
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {aiStatus.providers.filter(p => p.configured).length} de {aiStatus.providers.length} proveedores configurados
              {!aiStatus.hasAI && " — Ve a la pestaña 'Configurar IA' para agregar tu API key gratis"}
            </p>
          </div>
          {!aiStatus.hasAI && (
            <button
              onClick={() => setTab("config-ia")}
              className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors"
            >
              Configurar
            </button>
          )}
        </div>
      )}

      <AdminTabBar
        tabs={TABS}
        activeTab={tab}
        onTabChange={setTab}
        moduleId={MODULE_ID}
      >
      {tab === "dashboard-ia" && <SmartDashboardTab />}
      {tab === "centro-comando" && <AICommandCenter />}
      {tab === "sugerencias" && <SugerenciasIAModule />}
      {tab === "metas" && <MetasLogrosModule />}
      {tab === "chat-ia" && (
        <div className="bg-white rounded-2xl border border-gray-200 min-h-[600px] h-[calc(100vh-220px)]">
          <AIAssistant embedded />
        </div>
      )}
      {tab === "alertas" && <AlertsCenterTab tenantId={tenantId} />}
      {tab === "salud-ia" && <AIHealthPanel />}
      {tab === "config-ia" && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-2">Configurar APIs de IA (Gratis)</h2>
          <p className="text-sm text-gray-500 mb-6">
            Para que la IA funcione, necesitas agregar al menos UNA API key en el archivo <code className="px-1.5 py-0.5 rounded bg-gray-100 text-xs font-mono">.env</code> de tu proyecto.
            Todas las opciones son <strong>gratis</strong>.
          </p>

          <div className="space-y-4">
            {[
              {
                name: "Groq (Llama 3.1)",
                envVar: "GROQ_API_KEY",
                url: "https://console.groq.com",
                steps: ["Ve a console.groq.com y crea una cuenta gratis", "Haz clic en 'API Keys' → 'Create API Key'", "Copia la key y pégala en tu archivo .env"],
                color: "from-orange-500 to-amber-500",
                configured: aiStatus?.providers.find(p => p.id === "groq")?.configured ?? false,
              },
              {
                name: "Google Gemini",
                envVar: "GOOGLE_AI_API_KEY",
                url: "https://aistudio.google.com/apikey",
                steps: ["Ve a aistudio.google.com/apikey", "Inicia sesión con tu cuenta de Google", "Haz clic en 'Create API Key' y copia la key"],
                color: "from-blue-500 to-cyan-500",
                configured: aiStatus?.providers.find(p => p.id === "google")?.configured ?? false,
              },
              {
                name: "xAI Grok",
                envVar: "XAI_API_KEY",
                url: "https://console.x.ai",
                steps: ["Ve a console.x.ai y crea una cuenta", "En el dashboard, genera una API key", "Copia la key y agrégala a .env"],
                color: "from-gray-700 to-gray-900",
                configured: aiStatus?.providers.find(p => p.id === "xai")?.configured ?? false,
              },
            ].map(provider => (
              <div key={provider.envVar} className="rounded-xl border border-gray-200 overflow-hidden">
                <div className={`bg-linear-to-r ${provider.color} px-4 py-3 flex items-center justify-between`}>
                  <h3 className="text-sm font-bold text-white">{provider.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    provider.configured
                      ? "bg-white/20 text-white"
                      : "bg-white/10 text-white/70"
                  }`}>
                    {provider.configured ? "✅ Configurado" : "❌ No configurado"}
                  </span>
                </div>
                <div className="p-4">
                  <div className="mb-3">
                    <p className="text-xs font-mono text-gray-500 mb-1">Variable en .env:</p>
                    <code className="block px-3 py-2 rounded-lg bg-gray-100 text-sm font-mono text-gray-900">
                      {provider.envVar}=&quot;tu-api-key-aquí&quot;
                    </code>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-gray-700">Pasos para obtener tu key gratis:</p>
                    {provider.steps.map((step, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        <span className="text-xs text-gray-600">{step}</span>
                      </div>
                    ))}
                  </div>
                  <a
                    href={provider.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors"
                  >
                    🔗 Ir a {provider.url.replace("https://", "")}
                  </a>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 rounded-xl bg-primary/5 border border-primary/20">
            <h4 className="text-sm font-bold text-primary mb-2">🧪 Probar conexión</h4>
            <p className="text-xs text-gray-600 mb-3">
              Después de agregar tu API key y reiniciar el servidor, haz clic aquí para verificar que todo funciona.
            </p>
            <button
              onClick={testConnection}
              disabled={testing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {testing ? (
                <><span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Probando...</>
              ) : (
                "⚡ Probar conexión con la IA"
              )}
            </button>
            {testResult && (
              <div className={`mt-3 p-3 rounded-lg border text-sm font-medium ${
                testResult.ok
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}>
                {testResult.ok ? "✅" : "❌"} {testResult.message}
              </div>
            )}
          </div>

          <div className="mt-6 p-4 rounded-xl bg-primary/5 border border-primary/20">
            <h4 className="text-sm font-bold text-primary mb-2">📁 ¿Dónde está el archivo .env?</h4>
            <p className="text-xs text-gray-600 leading-relaxed">
              Abre la carpeta <code className="px-1 py-0.5 rounded bg-gray-100 text-[10px] font-mono">bodega-san-martin/</code> en tu proyecto y busca el archivo <code className="px-1 py-0.5 rounded bg-gray-100 text-[10px] font-mono">.env</code>.
              Ahí verás las líneas con los nombres de las variables. Solo pega tu API key entre las comillas y reinicia el servidor con <code className="px-1 py-0.5 rounded bg-gray-100 text-[10px] font-mono">npm run dev</code>.
            </p>
          </div>
        </div>
      )}
      </AdminTabBar>
    </div>
  );
}
