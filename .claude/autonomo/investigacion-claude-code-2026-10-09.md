# Investigación: usar Claude Code al máximo en vez del chat (09-10-2026)

4 agentes en paralelo. Fuentes y fechas dentro de cada informe.

---

## Funciones de Claude Code frente a claude.ai

**Estado al 09-10, con docs oficiales.** Ya estás en la última versión (2.1.296). Chrome sigue sin soportar WSL y computer use en la CLI sigue siendo sólo macOS. La fecha «09-10» es el día de consulta, porque las páginas de docs no traen fecha. Las entradas del CHANGELOG llevan la fecha de release.

| Qué | Existe en Claude Code | Cómo usarlo o instalarlo | Fuente + fecha |
|---|---|---|---|
| Research (claude.ai) | Parcial | No hay modo Research. Sustituto: pedir «usa un subagente para investigar X» (ventana propia), tu `/deep-research` y Firecrawl (ya configurado). | [Common workflows](https://code.claude.com/docs/en/common-workflows) 09-10. Research de claude.ai: [soporte](https://support.claude.com/en/articles/11088861-use-research-on-claude) |
| Memoria | Parcial | CLAUDE.md + auto memory (por repo; se cargan las primeras 200 líneas o 25 KB). Activar o desactivar: `/memory`. Vínculo con la memoria de claude.ai: sin verificar. | [Memory](https://code.claude.com/docs/en/memory) 09-10 |
| Projects y archivos de conocimiento | Parcial | Los Projects de claude.ai no existen en la CLI. El «Projects» de Claude Code es beta (Pro/Max, despliegue gradual); búscalo en la barra lateral de claude.ai/code. Para archivos: `claude --add-dir <carpeta>` y `@archivo`. | [Projects](https://code.claude.com/docs/en/claude-projects) 09-10 |
| Pegar captura del portapapeles de Windows | Sí | En WSL: `Alt+V`. `Ctrl+V` también está enlazado, pero la terminal puede interceptarlo. Sirve con capturas de Win+Shift+S; arrastrar la imagen también. | [Interactive mode](https://code.claude.com/docs/en/interactive-mode) 09-10; CHANGELOG 2.1.157 |
| PDF, Word, Excel | Parcial | PDF: la herramienta Read acepta `pages`. Word y Excel: tus skills `/anthropic-skills:docx` y `xlsx`. Límite de tamaño: sin verificar. | CHANGELOG 2.1.295 (08-10) |
| Dictado por voz | Sí (sólo dictado) | Requiere login claude.ai (si `ANTHROPIC_API_KEY` está exportada, quítala). En WSL necesitas WSLg y `sudo apt install sox libsox-fmt-pulse`. Luego `/voice` (mantén Espacio) o `/voice tap`. Pon `"language": "spanish"` en `/home/usuario/.claude/settings.json`; también cambia el idioma de las respuestas. No consume tokens. | [Voice dictation](https://code.claude.com/docs/en/voice-dictation) 09-10 |
| Respuestas habladas | No | No encontré respuestas habladas en la doc de dictado ni en el CHANGELOG. Sustituto: modo voz de la app de claude.ai (beta, todos los planes). | [Voice dictation](https://code.claude.com/docs/en/voice-dictation) 09-10; [Use voice mode](https://support.claude.com/en/articles/11101966-use-voice-mode) (resumen de búsqueda) |
| App del celular | Parcial (es un cliente) | Pestaña Code de la app Claude: sesiones en la nube, Remote Control hacia tu PC (`/remote-control`) y Dispatch desde Desktop (Pro/Max). `/mobile` muestra el QR. Desde el celular no hay `/plugin`, `/resume` ni Bypass. | [Mobile](https://code.claude.com/docs/en/mobile) 09-10 |
| Conectores de claude.ai | Sí | Se cargan solos con login claude.ai; míralos con `/mcp`. Gmail, Calendar y Microsoft 365 se autentican en claude.ai/customize/connectors, no desde la CLI (Drive: sin verificar si aplica igual). Si dice `session token rejected`: `/login` y reconectar. No están en sesiones WSL de Desktop. | [MCP](https://code.claude.com/docs/en/mcp) 09-10; [Desktop WSL](https://code.claude.com/docs/en/desktop-wsl) 09-10 |
| Claude in Chrome | No en WSL | Doc oficial: «Chrome integration isn't supported in Windows Subsystem for Linux (WSL)». Sustituto: Playwright MCP (ya lo tienes). Claude Code nativo en Windows tiene secciones de Chrome propias (sin probar). | [Chrome](https://code.claude.com/docs/en/chrome) 09-10 |
| Computer use | Parcial | CLI: sólo macOS. Windows: sólo en la app Desktop (Settings > This computer > System), research preview, Pro/Max. Que funcione en sesiones WSL de Desktop: sin verificar. Tu desktop-control MCP ya controla Windows desde WSL. | [Computer use](https://code.claude.com/docs/en/computer-use) 09-10; [Desktop](https://code.claude.com/docs/en/desktop) 09-10 |
| Desktop (pestaña Code) en Windows con WSL | Sí, con límites | Selector de entorno → distro WSL2. Sin terminal integrada, conectores, plugins, forking ni `@` en sesiones WSL. Sí: sesiones paralelas, diff visual y estado de PR. | [Desktop WSL](https://code.claude.com/docs/en/desktop-wsl) 09-10 |
| Cloud (claude.ai/code) | Sí (Pro, Max, Team) | `claude --cloud "tarea"`; traerla de vuelta con `claude --teleport`; auto-arreglo de PR con `/autofix-pr` (exige la GitHub App). Cuenta contra tu límite del plan, sin cargo extra por VM. | [Cloud](https://code.claude.com/docs/en/claude-code-on-the-web) 09-10 |
| Rutinas (programadas en la nube) | Sí (Pro, Max) | `/schedule`. Corren aunque la PC esté apagada: útil para revisiones o auditorías nocturnas. | [Common workflows](https://code.claude.com/docs/en/common-workflows) 09-10; [Feature availability](https://code.claude.com/docs/en/feature-availability) 09-10 |
| Crédito de nube de USD 250 (vence 05-11) | Sin verificar | La doc no menciona ningún crédito de nube con ese nombre. Si es de API Console, sólo sirve en sesiones con API key (sin conectores, voz, Remote Control ni cloud). Si son usage credits de claude.ai, se gastan con el contexto 1M (aunque te sobre plan) o cuando el plan se agota con extra usage activo (regla exacta para cloud: sin verificar). Revísalo en claude.ai/settings/usage. Ultrareview tiene «free runs» según el índice: precio sin verificar. | [Errors](https://code.claude.com/docs/en/errors) 09-10; [Cloud](https://code.claude.com/docs/en/claude-code-on-the-web) 09-10 |
| Plugins y skills oficiales | Sí | `claude-plugins-official` ya viene activo. Documentos: `/plugin marketplace add anthropics/skills` (contenido sin verificar; ya tienes docx, pdf, xlsx y pptx). Productividad: `/plugin marketplace add anthropics/knowledge-work-plugins` (sin verificar). Investigación profunda: no hallé un plugin oficial (sin verificar). | [Marketplaces](https://code.claude.com/docs/en/plugins/anthropic-marketplaces) 09-10 |
| Novedades 2.1.293 a 2.1.296 | Ya estás en la última | Releases en UTC: 2.1.293 el 07-10, 2.1.294 el 08-10, 2.1.295 el 08-10, 2.1.296 el 09-10. Lo que te toca: se arreglaron las reglas path-scoped y los CLAUDE.md anidados que no cargaban al leer con `cat`, `head`, `grep` (2.1.293); `agentType` en `subagentStatusLine` (2.1.293); push de Remote Control corregido (2.1.293 y 2.1.295); `autoCompactWindow` para subagentes y `CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL` para Workflows (2.1.296). | [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) |

**Las 5 cosas que más te cambian el día, en orden**

1. **Alt+V para capturas.** Toma la captura con Win+Shift+S y pégala en el prompt de WSL con Alt+V. Hoy describes lo que ves; con esto lo muestras.
2. **Dictado en español.** `/voice` + `"language": "spanish"` + `sox` con WSLg. No hay respuestas habladas: eso sigue en la app de claude.ai.
3. **Conectores autenticados.** Autentica Gmail y Calendar una vez en claude.ai/customize/connectors y deja de abrir claude.ai para correo o agenda.
4. **Cloud y rutinas.** `claude --cloud` para trabajo largo con la PC apagada y `/schedule` para revisiones nocturnas. Antes de gastar el crédito, confirma de qué tipo es.
5. **Desktop con WSL.** Diff visual, sesiones paralelas y estado de PR sin salir de Windows. Lo que falta en esas sesiones: terminal integrada y conectores.

---

## Búsqueda, navegador y documentos

**MCP y herramientas para Claude Code (investigado el 09-10-2026)**

Hoy tienes esto (lo leí en `~/.claude.json`): Firecrawl y context7 remotos, Playwright local (Chromium headless, **sin tus sesiones**) y desktop-control, que corre con el `node.exe` de Windows. WSL está en modo `mirrored`, así que el `127.0.0.1` de WSL llega a Windows.

### A. Búsqueda e investigación profunda
Ya tienes dos buscadores:
- **WebSearch**: su propia descripción dice «US-only». No medí cuánto afecta a las búsquedas de Perú.
- **Firecrawl search**: en el benchmark de AIMultiple queda entre los 4 primeros de 8, junto a Brave, Exa y Parallel Pro, con intervalos solapados (no verifiqué la fecha del benchmark). Su categoría `gov` es **solo de EE. UU.**; para SUNAT o SERFOR hay que usar `includeDomains: ["gob.pe"]`.

| Herramienta | Qué gana | Evidencia | Costo | Comando | Riesgo |
|---|---|---|---|---|---|
| **Exa** | Más precisión al buscar un dato puntual; búsqueda semántica; `agent_run` hace investigación de varios pasos | openbenchmarks (~sep-2026): modo fast 99,3 % en 652 ms, instant 97,7 % en 398 ms. En tickets de código, modo deep 1.º de 9 con 83,0 % (26-09-2026) | Sin clave: gratis con límite. Con cuenta: US$10/mes de crédito, luego US$7 por 1.000; `agent_run` US$0,012–1,00 por corrida | `claude mcp add -s user --transport http exa https://mcp.exa.ai/mcp` y luego `/mcp` (OAuth) | Tus consultas llegan a Exa |
| Parallel Search | Gratis sin cuenta; país y dominios se fijan en la URL | openbenchmarks: 1.º en tareas de varias búsquedas (46,5 % F1, 45 preguntas), pero el modo turbo da 71,3 % en dato único. AIMultiple: la versión Pro tarda 13,6 s | Anónimo gratis; Task MCP US$0,005–2,40 por corrida (fuente secundaria) | `claude mcp add -s user --transport http parallel https://search.parallel.ai/mcp` | Igual que Exa |
| Brave | Índice propio; el más rápido | AIMultiple: 1.º de 8, 669 ms. openbenchmarks: 94,0 % | US$5/mes gratis, luego US$5 por 1.000 (leído hoy en brave.com); según terceros pide tarjeta | `claude mcp add brave -e BRAVE_API_KEY=… -- npx -y @brave/brave-search-mcp-server` (sin verificar) | Corre en tu PC; según terceros no tiene tope de gasto |
| Tavily | Nada nuevo | openbenchmarks: 87,7 % en 1,88 s. AIMultiple: 5.º de 8 | 1.000 créditos/mes; una investigación gasta de 4 a 250 créditos | `claude mcp add --transport http tavily https://mcp.tavily.com/mcp/` (OAuth) | — |
| Perplexity | Entrega la respuesta ya redactada; `perplexity_research` | No encontré benchmark independiente | Sonar Pro: US$3 por millón de tokens de entrada y US$15 de salida, más un cargo por consulta; investigación profunda ≈US$0,41–1,32 cada una (terceros) | `claude mcp add --transport http perplexity https://api.perplexity.ai/mcp --header "Authorization: Bearer $PPLX_KEY"` (la documentación la vi solo vía buscador) | Claude recibe el resumen de otro modelo, no las fuentes |
| Kagi · Linkup · Jina | Kagi: sin anuncios. Linkup: modo deep. Jina (ahora de Elastic): lee URLs, igual que Firecrawl | Linkup: 91–92 % en SimpleQA (cifra del propio vendedor); se reportaron precios contradictorios en jul–ago 2026 | Kagi US$12 por 1.000 (el más caro); Linkup ~US$5 por 1.000 | Kagi: `https://mcp.kagi.com/mcp` con Bearer; los otros sin verificar | — |

### B. Navegador

| Herramienta | Qué gana | Evidencia | Costo | Comando | Riesgo |
|---|---|---|---|---|---|
| Playwright MCP (ya lo tienes) | `--cdp-endpoint` se conecta a un Chrome ya abierto; `--extension` usa pestañas con sesión iniciada mediante la extensión «Playwright MCP Bridge» | playwright.dev y GitHub (2026) | Gratis | Receta abajo | Una página maliciosa con tu sesión abierta puede hacer acciones con tu cuenta |
| Playwright CLI | Unas 4× menos tokens (114k → 27k) porque guarda las capturas de la página en disco; `attach --cdp=chrome` | Documentación leída hoy. La cifra de tokens es de testcollab, que cita al equipo de Playwright | Gratis | `npm i -g @playwright/cli` (sin verificar) | El mismo |
| Chrome DevTools MCP (Google) | Red, consola y rendimiento; `--autoConnect` se engancha a tu Chrome de siempre; `--slim` deja solo 3 herramientas | developer.chrome.com (leído hoy): pide Chrome 144+ y activar chrome://inspect/#remote-debugging; la conexión manual exige otro `--user-data-dir`. El issue #1149 dice que con el plugin abre una ventana nueva | Gratis | Receta abajo | Por defecto envía estadísticas y URLs a Google CrUX; se apaga con `--no-usage-statistics --no-performance-crux` |
| Claude in Chrome | Sería lo ideal | Documentación oficial: **no funciona en WSL** (issue #93124) | Incluido en Max | — | — |
| Browser Use / Browserbase + Stagehand | Navegador en la nube | Browserbase: 1 h gratis, luego US$20/mes. Browser Use: US$0,02/h (terceros, sep-2026) | De pago | No recomendado | Tus cookies quedan en una nube de EE. UU. |

**Receta para usar tu Chrome de Windows desde WSL**
1. *Perfil aparte (recomendado)*:
   - Abre Chrome con `"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --remote-debugging-port=9222 --user-data-dir='C:\ChromeAgente'`.
   - Inicia sesión una vez en SUNAT SOL, SERFOR y tus proveedores; la sesión queda guardada.
   - Conecta tu Playwright: `claude mcp add -s user chrome-sesion -- /home/usuario/proyectos/Mercado/node_modules/.bin/playwright-mcp --cdp-endpoint http://127.0.0.1:9222`
2. *Tu perfil normal*:
   - Con Chrome 144+, activa chrome://inspect/#remote-debugging.
   - Corre el servidor del lado de Windows, igual que desktop-control: `claude mcp add -s user chrome-win -- "/mnt/c/Program Files/nodejs/node.exe" 'C:\Program Files\nodejs\node_modules\npm\bin\npx-cli.js' -y chrome-devtools-mcp@latest --autoConnect --no-usage-statistics --no-performance-crux`
   - No lo probé en tu PC.

### C. Documentos
Ya tienes:
- `Read`: lee PDF de hasta 20 páginas por llamada e imágenes, con visión.
- Las skills pdf, xlsx, docx y pptx.
- `firecrawl_parse`: sube el archivo a la nube de Firecrawl.

| Herramienta | Qué gana | Evidencia | Costo | Comando | Riesgo |
|---|---|---|---|---|---|
| **Firecrawl en YouTube (ya lo tienes)** | Transcripción sin instalar nada | **Lo probé hoy**: `firecrawl_scrape` sobre un video devolvió la transcripción (5 créditos). Falta probar un video en español con subtítulos automáticos | Créditos | — | El texto puede traer instrucciones inyectadas |
| yt-dlp (programa de línea de comandos) | Respaldo local | Sin verificar en 2026 | Gratis | `pipx install yt-dlp`; `yt-dlp --skip-download --write-auto-subs --sub-langs "es.*" URL` | — |
| **docling** | Tablas fieles y OCR de escaneados, todo en tu PC | danilchenko (2026): tablas «excelentes» en docling y «rotas» en markitdown, pero 41 s contra 0,6 s por documento. ChatForest (23-04-2026): el servidor docling-mcp no tiene versiones nuevas desde ene-2026 | Gratis | Directo: `uvx docling --to md archivo.pdf`. Como MCP: `claude mcp add docling -- uvx --from docling-mcp docling-mcp-server` (confirmar en el README) | Nada sale de tu PC |
| markitdown (Microsoft) | Office o PDF a Markdown en menos de 1 s | Mismas fuentes; el OCR necesita un plugin | Gratis | `claude mcp add markitdown -- uvx markitdown-mcp` | Lee cualquier ruta o URL que le pases |
| MCP de Excel/Word (haris-musa, xlsx-for-ai, docx-mcp) | Solo xlsx-for-ai suma algo: recalcula unas 390 funciones sin Excel | READMEs de sus autores (2026) | Gratis | `claude mcp add excel -- uvx excel-mcp-server stdio` | — |

### Top 5
1. **Exa remoto**: la mejor precisión medida al buscar datos puntuales, no ocupa memoria en tu PC y es gratis para empezar. Su `agent_run` cubre la investigación profunda sin pagar Perplexity.
2. **Tu Playwright conectado a Chrome de Windows con un perfil aparte** (receta 1): entra a SUNAT, SERFOR y proveedores con tu sesión, con la herramienta que ya usaste 1.765 veces. Como el perfil está separado, tu Gmail y tu banco quedan fuera si una página trae instrucciones maliciosas.
3. **Firecrawl para YouTube**, con yt-dlp de respaldo: ya funciona, lo probé y no suma ningún servidor.
4. **docling** para lotes de GTF o PDF oficiales con tablas o escaneados: es local y fiel. Tarda unos 41 s por documento, así que conviene usarlo cuando haga falta y no dejarlo como MCP. Para una sola GTF alcanza con `Read`.
5. **Una skill `/investigar`**, el equivalente al modo Research del chat: varios subagentes buscan en paralelo (WebSearch extended + Exa + `firecrawl_scrape`) y un revisor coteja cada cifra con su fuente y su fecha, como hace tu `audit-verificado`. No cuesta nada fuera de Max y de los créditos gratis. Es una propuesta mía, no un producto que exista.

### No conviene (repite lo que ya tienes)
- **Tavily**: 87,7 % contra 99,3 % de Exa, y 5.º de 8 en AIMultiple.
- **Linkup, Jina o Brave como tercer buscador**: Firecrawl ya está entre los 4 primeros, y con varios buscadores el agente elige mal cuál usar.
- **Parallel**: sirve *en lugar de* Exa, no además.
- **Kagi**: es el más caro.
- **Perplexity**: Claude recibe el resumen de otro modelo, no las fuentes.
- **Browser Use y Browserbase**: cobran por algo que tu Chrome hace gratis.
- **Claude in Chrome**: no funciona en WSL.
- **Servidores de Excel/Word, markitdown-mcp, `server-pdf` y servidores de YouTube de terceros**: ya los cubren las skills, `Read` y Firecrawl. `server-pdf` es un visor para clientes con interfaz gráfica. Los de YouTube pasan tus pedidos por un intermediario desconocido.

**Riesgos comunes**
- Una clave puesta en la URL queda en texto plano en `~/.claude.json`, y así está hoy tu Firecrawl. Es mejor usar OAuth (`/mcp`) o `--header`.
- No pongas RUC, DNI ni precios de clientes en las búsquedas.
- Páginas, PDF y transcripciones pueden traer órdenes ocultas. Con la sesión abierta, que Claude te pida confirmación antes de enviar un formulario.

**Fuentes**: [openbenchmarks precisión](https://openbenchmarks.com/web-search/most-accurate-search-api) · [openbenchmarks Claude Code](https://openbenchmarks.com/web-search-for-coding-agents/best-web-search-mcp-for-claude-code) · [AIMultiple](https://aimultiple.com/agentic-search) · [Parallel, comparativa del vendedor](https://parallel.ai/articles/best-web-search-api) · [Exa MCP](https://exa.ai/docs/reference/exa-mcp) · [Exa precios](https://exa.ai/pricing) · [Parallel MCP](https://docs.parallel.ai/integrations/mcp/search-mcp) · [Tavily MCP](https://docs.tavily.com/documentation/mcp) · [Brave](https://brave.com/search/api/) · [Perplexity MCP](https://docs.perplexity.ai/docs/getting-started/integrations/mcp-server) · [Kagi](https://help.kagi.com/kagi/api/overview.html) · [Linkup](https://coldiq.com/blog/linkup-pricing) · [Jina MCP](https://github.com/jina-ai/MCP) · [Chrome DevTools MCP](https://developer.chrome.com/docs/devtools/agents/get-started/configuration) · [#1149](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1149) · [Playwright MCP](https://github.com/microsoft/playwright-mcp) · [Playwright attach](https://playwright.dev/agent-cli/commands/attach) · [tokens CLI](https://testcollab.com/blog/playwright-cli) · [Claude in Chrome](https://code.claude.com/docs/en/chrome) · [#93124](https://github.com/anthropics/claude-code/issues/93124) · [navegadores en la nube](https://proxidize.com/blog/best-cloud-browsers-for-ai-agents/) · [docling vs markitdown](https://www.danilchenko.dev/posts/markitdown-vs-docling-vs-marker/) · [ChatForest PDF](https://chatforest.com/guides/best-pdf-document-processing-mcp-servers/) · [Excel MCP](https://github.com/haris-musa/excel-mcp-server) · [xlsx-for-ai](https://github.com/senoff/xlsx-for-ai)

Para memoria: Firecrawl ya transcribe YouTube (probado el 09-10); Claude in Chrome no funciona en WSL; la categoría `gov` de Firecrawl es solo de EE. UU.
Para acelerar: `firecrawl_scrape` con `formats:["query"]` trae solo el dato pedido sin volcar la página entera; conviene dejarlo como opción por defecto en la skill de investigación.

---

## Uso de la computadora en Windows

## Control de la PC desde WSL: comparativa (verificado el 09-10-2026)

### 0. Medido hoy en tu PC (solo lectura)

| Medición | Resultado |
|---|---|
| Captura actual (nut-js + Jimp, igual que `server.mjs`) | capturar **26-29 ms** + convertir y pasar a JPEG **190-206 ms** (1920×1080, 239 KB). El 87 % del tiempo es la codificación en JS puro |
| UIA desde PowerShell (`System.Windows.Automation`) | 12 ventanas en 177 ms (en frío). Encontrar el «primer botón» con `FindFirst`: **2-14 ms** |
| Chrome por UIA | 75-79 nodos en total: muy pocos para incluir la página (deducido por la cantidad) |
| Tu Windows | 26H2 build 26300.9550 · `odr.exe` no aparece · `uvx` ya está instalado |

Qué significa: pasar a DXGI ahorraría como mucho 25 ms por captura. Lo que cuesta son los **turnos del modelo** (unos 10 s por inferencia con GPT-4o/o1 según el paper de UFO²) y el JPEG.

### 1. Computer use oficial, verificado de nuevo

| Superficie | ¿Windows? | ¿Desde tu CLI en WSL? | Candados |
|---|---|---|---|
| Claude Code CLI | **No**: «not available on Linux or Windows» (doc leída hoy) | No | — |
| Claude Desktop | Sí, research preview, plan Pro/Max. Se activa en Settings › This computer › System. La doc dice que es la vía «más lenta» | No, solo dentro de la app | Aprobación por app y por sesión. **Navegadores y plataformas de trading: solo ver**. Terminales: solo clic. Lista de apps denegadas, Esc para cortar, 1 sesión a la vez |
| API `computer_toolset_20260801` (sin beta header) | Lo que tú ejecutes | Sí, con un loop propio y API key (se cobra por token) | 17 acciones, incluido `zoom` de una región. Clasificadores de prompt injection sobre las capturas. Recomienda aislar (la referencia corre en Docker) |
| Claude in Chrome (`--chrome`) | Sí | La doc dice que no funciona en WSL (un changelog dice lo contrario). Truco no oficial: Chrome para Linux por WSLg + `CLAUDE_CODE_ENABLE_CFC=1` | — |

→ Claude Desktop no te sirve: Chrome e IBKR quedarían en **solo ver**.

### 2. Comparativa

| Opción | Precisión | Latencia | ¿WSL? | Instalación | Costo | Riesgos y candados |
|---|---|---|---|---|---|---|
| **Windows-MCP** (CursorTouch, 8,5 k★, v0.8.8 publicada hoy) | Sin benchmark publicado. Árbol UIA con ids + `use_dom=True` (Chrome/Edge/Firefox). Hace clic en las coordenadas exactas que da el árbol | «0,2-0,5 s entre acciones» (README) | Sí, documentado | Ver paso 3 | Gratis, MIT | «Full system access… irreversible». Trae PowerShell, FileSystem, Registry y Process. Telemetría PostHog **activada** por defecto. `--tools` funciona como lista blanca. Si retomas el control, bloquea llamadas nuevas. App-Tool prefiere Windows en inglés |
| **desktop-touch-mcp** (v2.2.0, 04-10, 22★) | Sin benchmark. Primero encuentra el elemento y después actúa sobre él, sin coordenadas. CDP para el navegador. OCR + SoM cuando UIA no ve | UIA 2 ms (foco) / ~100 ms (árbol) en Rust; ~300 ms por PowerShell | No documentado (sin verificar) | `npx -y @harusame64/desktop-touch-mcp` | Gratis, MIT | Comprueba la ventana y la posición antes de cada entrada. Parada de emergencia: mouse en la esquina 500 ms. Comunidad mínima |
| **Terminator** (mediar-ai) | Sin benchmark. Busca por nombre, rol o ventana | Sin datos | Sin verificar | `claude mcp add terminator "npx -y terminator-mcp-agent@latest"` | Gratis | Control total. Última publicación en npm: 28-01-2026 (¿pausado?) |
| **UFO² / UFO³** (Microsoft) | UFO²: WAA **30,5 %**, OSWorld-W **32,7 %** (o1), contra 20,8 % del mejor rival (Operator). UFO³: 70,9 % en NebulaBench (no comparable) | ~10 s por inferencia; OmniParser suma ~1 s por paso; ~1 min por tarea | No: es un agente con su propio LLM, no un MCP | Python 3.10/3.11 + `pip install -r requirements.txt` + claves | Gratis + tokens | Pide confirmación en acciones sensibles. UFO² está en soporte largo (LTS) desde abr-2025 |
| **MCP nativo de Windows (ODR)** | Solo conectores del Explorador y de Configuración | n/d | Sin verificar | Preview (Insider dic-2025; la doc dice «prerelease», 04-06-2026). En tu PC no aparece | Gratis | Aislado por defecto, auditoría, control por Intune. «App Actions»: no encontré fuente |
| **OmniParser v2 / Set-of-Marks** | ScreenSpot-Pro **39,6 %** (con GPT-4o). En WAA 2024, el mejor Navi (SoM + UIA + detector) llegó a 19,5 %. En UFO², el modo híbrido rescata hasta 9,86 % de los fallos | 0,6 s por cuadro en A100; 0,8 s en RTX 4090; en CPU, segundos (sin verificar) | Sí (servidor HTTP) | YOLO + Florence-2, necesita GPU | Gratis + GPU | CVE-2025-55322 (sin verificar) |
| **DXGI vs GDI** | No cambia la precisión | DXcam (DXGI) 239 fps ≈ 4 ms contra python-mss (GDI) 76 fps ≈ 13 ms. Tu captura: 28 ms | — | `pip install dxcam` o addon nativo | Gratis | Ganancia ≤25 ms: no es lo que importa |
| **pywinauto / FlaUI / AHK v2** | FlaUI: UIA2 funciona mal con WPF/Store; UIA3 (COM) funciona bien con WPF/Store y tiene bugs en WinForms (README). pywinauto y AHK (librería UIA-v2): sin medir | Tu PowerShell + UIA: 2-14 ms (medido) | A través de tu worker | UIA ya viene en .NET; FlaUI = DLL con `Add-Type` (sin probar) | Gratis | Los mismos de hoy |

Referencia del modelo (es el mismo Claude con cualquier herramienta):
- **WAA 2026**: Opus 4.8 **69,3 %** y Sonnet 5 68,8 %, según el paper UI-Mate. Es una evaluación de terceros y no lo verifiqué en el PDF. El humano llega a 74,5 %.
- **OSWorld-Verified**: ~83 % con Opus 4.7/4.8, según cifras de terceros. La cifra oficial está sin verificar.

### 3. Recomendación: agregar UIA a desktop-control y usar Windows-MCP solo para comparar

- **Sin dependencias nuevas**: el worker de PowerShell, que ya está cargado, resuelve `FindFirst` en 2-14 ms.
- **Menos turnos**: los pasos UIA entran en `batch`, así que buscar + clic + tipear cabe en una sola llamada. Eso es lo que acelera (~10 s por turno), no capturar más rápido.
- **Menos riesgo**: Windows-MCP agregaría Python, telemetría y Registry/Process, y repite casi todo lo que ya tienes (clic, teclado, captura, portapapeles, ventanas).
- **IBKR**: si usas TWS (Java), lo más probable es que UIA no vea sus controles, porque Java usa su propio puente de accesibilidad (sin verificar, y tampoco sé qué app usas). En ese caso sigue el OCR o la API de IBKR.

**Plan**

1. **UIA dentro del worker** (~150 líneas):
   - `ui_find {window, name|automationId, role, index}`: devuelve rectángulo, centro y si está habilitado.
   - `ui_act {…, invoke|click|set_value|focus}`: si falla, hace clic en el centro.
   - `ui_tree` filtrado: solo controles interactivos, máximo 60, JSON compacto.
   - `wait_for {name, timeout}`.
   - Todo usable dentro de `batch`.
   - Candados nuevos: comprobar la ventana activa antes de tipear, parada de emergencia en la esquina, ventanas prohibidas (IBKR real, banco) y un registro JSONL de cada acción.
2. **Web y captura**:
   - Abrir Chrome con `--force-renderer-accessibility` (sin verificar si alcanza), o usar CDP con un perfil aparte. Desde Chrome 136, `--remote-debugging-port` ignora el perfil por defecto, así que hay que pasar `--user-data-dir`.
   - Agregar `web_click {texto|selector, index}`.
   - Codificar el JPEG en nativo (sharp o .NET) en vez de Jimp: de 190 ms a menos de 40 ms (estimado).
   - Agregar `zoom(region)`, como en la API.
3. **Comparar A/B** con la tarea «abrir Chrome, buscar X, abrir el 2.º resultado orgánico», 5 corridas por variante:
   - (a) Como hoy (OCR).
   - (b) Con UIA/CDP: un `batch` que abre `google.com/search?q=X`, espera y hace clic en el resultado 2.
   - (c) Windows-MCP, registrado así (sin probar): `claude mcp add windows-mcp -s user -- powershell.exe -NoProfile -Command '$env:ANONYMIZED_TELEMETRY="false"; C:\Users\Usuario\.local\bin\uvx.exe windows-mcp serve --tools "App,Type,Shortcut,Snapshot,Click,WaitFor"'`
   - **Cómo medir**: el servidor anota `herramienta, ms, KB de imagen` en un JSONL.
     - **Llamadas por tarea**.
     - **Segundos**, desde la 1.ª llamada hasta tener abierta la URL correcta.
     - **Éxito**: el título de la ventana coincide con el resultado esperado.
     - **KB de imagen** por tarea.
   - Hoy serían ~5 llamadas (estimado). Meta: ≤2 llamadas, ≤10 s, 5 de 5.
   - Si (c) gana por más de 30 %, adoptarlo para web y UIA y quitar lo duplicado. Si no, desinstalarlo.

Para acelerar: con READMEs largos, usar `firecrawl` con `query` (el de Windows-MCP pesó 77 k caracteres).
Para memoria: Claude Desktop deja Chrome e IBKR en solo ver; el 87 % del tiempo de captura de desktop-control es el JPEG de Jimp; `odr.exe` no aparece en la build 26300.9550.

**Fuentes**: [CLI computer use](https://code.claude.com/docs/en/computer-use) · [Desktop](https://code.claude.com/docs/en/desktop) · [API computer use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) · [Chrome en CC](https://code.claude.com/docs/en/chrome) · [issue WSL](https://github.com/anthropics/claude-code/issues/79655) · [Windows-MCP](https://github.com/CursorTouch/Windows-MCP) · [desktop-touch-mcp](https://github.com/Harusame64/desktop-touch-mcp) · [Terminator](https://cdn.jsdelivr.net/npm/terminator-mcp-agent@0.24.28/README.md) · [UFO](https://github.com/microsoft/UFO) · [paper UFO²](https://arxiv.org/html/2504.14603v2) · [paper UFO³](https://arxiv.org/html/2511.11332v1) · [MCP en Windows](https://learn.microsoft.com/en-us/windows/ai/mcp/overview) · [Insider 26220.7344](https://4sysops.com/archives/windows-11-insider-preview-build-262207344-kb5070316-new-features-native-ai-agent-mcp-support-and-midi-20/) · [WAA](https://microsoft.github.io/WindowsAgentArena//static/files/windows_agent_arena.pdf) · [UI-Mate](https://arxiv.org/pdf/2608.15930) · [Pointer OSWorld](https://www.pointer.ai/blog/sota) · [OmniParser v2](https://replicate.com/microsoft/omniparser-v2/readme) · [DXcam](https://github.com/ra1nty/DXcam) · [FlaUI](https://github.com/FlaUI/FlaUI) · [Chrome 136](https://developer.chrome.com/blog/remote-debugging-port)

---

## Voz, imágenes, terminal y hábitos

## Claude Code en WSL2: voz, imágenes, terminal y hábitos (investigado el 09-10-2026)

«Oficial» quiere decir la documentación de code.claude.com, leída hoy. *Sin verificar* quiere decir que no lo confirmé.

### 1. Voz al escribir

| Opción | Qué ganas | Costo | Cómo se instala o configura (exacto) | Fuente + fecha |
|---|---|---|---|---|
| **`/voice` de Claude Code** | Español (`es`) con soporte oficial. Latencia: el texto aparece mientras hablas; mantener Espacio tiene un arranque corto. Nube de Anthropic. Funciona en WSL si hay WSLg. Reconoce jerga técnica y el nombre del repo | Incluido en el plan; no gasta tokens ni cuenta en `/usage` | `sudo apt install sox libsox-fmt-pulse`. En `~/.claude/settings.json`: `"language": "spanish", "voice": {"enabled": true, "mode": "hold"}`. Mantienes Espacio, sueltas y se agrega un tramo (puedes sumar varios); después Enter. Desaparece si tu shell exporta `ANTHROPIC_API_KEY` | [oficial: voice-dictation](https://code.claude.com/docs/en/voice-dictation), 09-10-2026 |
| Win+H (Windows) | Español México y España. Nube Azure. Latencia *sin verificar*; dentro de Windows Terminal *sin verificar* | 0 | Configuración › Hora e idioma › agregar Español (México). Win+H › engranaje › Puntuación automática | [Microsoft Support](https://support.microsoft.com/en-us/windows/use-voice-typing-to-talk-instead-of-type-on-your-pc-fec94565-c4bd-329d-e59a-af033fa5689f), 09-10-2026 |
| Wispr Flow | Unos 100 idiomas y formato con IA. Nube. En WSL puede no insertar el texto solo | Gratis hasta 2.000 palabras/semana; Pro US$15/mes (US$12 si pagas el año) | Desde Microsoft Store. Si no pega, **Alt+Shift+Z** pega la última transcripción. Se rompió con Claude Code 2.1.83 en Windows nativo; si ya lo arreglaron está *sin verificar*. Usa unos 800 MB de RAM | [Wispr: WSL](https://docs.wisprflow.ai/articles/6478598909-using-flow-with-linux-wsl-and-terminal-applications); [issue #38620](https://github.com/anthropics/claude-code/issues/38620), 25-03-2026; [precios](https://spokenly.app/blog/wispr-flow-pricing), 2026 |
| **Handy** (código abierto, MIT) | Local y sin internet; dicta en cualquier app. Parakeet V3 detecta el español. Espera de 2-5 s según la reseña de un competidor. Pegar en Windows Terminal *sin verificar* | 0 | `winget install cjpais.Handy` (ese paquete no lo mantiene el autor) o el instalador de GitHub. Modelo Parakeet V3 (usa CPU) o Whisper Turbo (usa GPU) | [GitHub](https://github.com/cjpais/handy); [reseña](https://spokenly.app/blog/handy-review), 2026 |
| OpenWhispr | Whisper o Parakeet local, más nube opcional y diccionario propio | Local 0; nube *sin verificar* | Solo lo afirma el fabricante; no hay reseñas independientes | [openwhispr.com](https://openwhispr.com/use-cases/windows-11), 09-10-2026 |
| Superwhisper | Ya existe para Windows (v1.0 del 26-11-2025, hoy v1.6.5). Latencia *sin verificar* | ~US$8/mes *sin verificar* | Página de descarga oficial; su integración con Claude Code es solo para Mac | [descarga](https://superwhisper.com/download); [anuncio](https://x.com/superwhisperapp/highlights), 02-12-2025 |
| faster-whisper / whisper.cpp a mano | Control total, local | 0 | Hay que programar atajo, grabación y pegado; Handy ya lo trae hecho | criterio propio |

### 2. Voz al responder

| Opción | Qué ganas | Costo | Cómo (exacto) | Fuente + fecha |
|---|---|---|---|---|
| **Hook `Stop` + edge-tts, voz `es-PE-CamilaNeural` o `es-PE-AlexNeural`** | Acento **peruano**. Me parece la más natural de las tres, pero no lo medí | 0; necesita internet (usa el servicio de lectura de Edge, sin acuerdo oficial) | Bloque A | [oficial: hooks](https://code.claude.com/docs/en/hooks) (confirma los campos `last_assistant_message` y `async`); [voces es-PE](https://json2video.com/ai-voices/azure/languages/spanish/), 09-10-2026 |
| Piper `es_MX-claude-high` | Sin internet, liviano, mexicano neutro | 0 | `pipx install piper-tts` y `python3 -m piper.download_voices es_MX-claude-high` (*sin probar*). Ya armado con hooks: [tts-companion](https://github.com/iamandroiduser/tts-companion) | [quick-tts](https://quick-tts.com/voice/es-mx-claude-high/), 2026 |
| Kokoro (`ef_dora`, `em_alex`) | Sin internet | 0 | No lo recomiendo para español: su propia ficha dice que fuera del inglés queda pobre | [VOICES.md](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md), 09-10-2026 |
| Aviso hablado en `Notification` | Te avisa que te necesita, sin leer la respuesta | 0 | Mismo script con un texto fijo; matcher `permission_prompt` o `idle_prompt` | oficial: hooks |

**Bloque A**: lee solo el último párrafo. *Sin probar en tu PC*; el audio sale por WSLg.
```bash
sudo apt install pipx mpv jq && pipx install edge-tts
cat > ~/.claude/hablar.sh <<'EOF'
#!/usr/bin/env bash
t=$(jq -r '.last_assistant_message // empty' | awk 'NF{p=$0}END{print p}' | tr -d '*#|`_')
[ -n "$t" ] && edge-tts --voice es-PE-CamilaNeural --rate=+15% --text "$t" --write-media /tmp/cc.mp3 && mpv --really-quiet /tmp/cc.mp3
EOF
chmod +x ~/.claude/hablar.sh
```
Después, en `~/.claude/settings.json`: `"hooks": {"Stop": [{"hooks": [{"type": "command", "command": "$HOME/.claude/hablar.sh", "async": true}]}]}`

### 3. Imágenes

| Opción | Qué ganas | Costo | Cómo (exacto) | Fuente + fecha |
|---|---|---|---|---|
| **Alt+V** | Pega la captura de Windows como `[Image #N]` | 0 | `claude update`, después Win+Shift+S y **Alt+V** (Windows Terminal se queda con Ctrl+V). La doc oficial: «On WSL, both Ctrl+V and Alt+V are bound» | [oficial: interactive-mode](https://code.claude.com/docs/en/interactive-mode), 09-10-2026 |
| Por qué fallaba | WSLg entrega la imagen como BMP y Claude Code no la leía | — | En qué versión se arregló: *sin verificar* | [issue #25935](https://github.com/anthropics/claude-code/issues/25935), 2026 |
| wsl-clip-bridge | Plan B si Alt+V falla | 0 | Seguir el README | [repo](https://github.com/rajveerb/wsl-clip-bridge); [explicación](https://rajveerbachkaniwala.com/blog/2026/05/24/on-the-difficulty-of-pasting-a-picture/), 24-05-2026 |
| Portapapeles a archivo | Funciona aunque falle todo lo demás | 0 | `powershell.exe -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [Windows.Forms.Clipboard]::GetImage().Save('C:\Users\Public\c.png')"` y en el prompt escribes `/mnt/c/Users/Public/c.png` (*sin probar*) | idea tomada de [SmartScope](https://smartscope.blog/en/generative-ai/claude/claude-code-image-guide/), 2026 |

### 4. Terminal y teclado (Warp no se considera)

| Opción | Qué ganas | Costo | Cómo (exacto) | Fuente + fecha |
|---|---|---|---|---|
| **Quedarte en Windows Terminal** | Según la doc oficial, Shift+Enter hace salto de línea sin configurar nada. Ctrl+J funciona en cualquier terminal | 0 | nada | [oficial: terminal-config](https://code.claude.com/docs/en/terminal-config), 09-10-2026 |
| Pantalla sin parpadeo | El scroll no salta en respuestas largas | 0 | `/tui fullscreen` o `"env": {"CLAUDE_CODE_NO_FLICKER": "1"}`. `maxProseWidth` acorta las líneas en pantallas anchas | ídem |
| Aviso al terminar | Parpadea el ícono en la barra de tareas | 0 | En Claude Code: `"preferredNotifChannel": "terminal_bell"`. En Windows Terminal, `profiles.defaults`: `"bellStyle": ["window", "taskbar"]` | ídem + [PR rkrysinski/hq](https://github.com/rkrysinski/hq/pull/18), 2026 |
| Atajos que valen | Menos espera | 0 | **Ctrl+G** abre el prompt en tu editor · **Enter** mientras Claude trabaja deja el mensaje en cola · **Ctrl+X Ctrl+S** lo envía ya · **Ctrl+S** guarda el borrador · **Ctrl+R** busca en el historial · **Esc Esc** abre el rewind. Para remapear: `~/.claude/keybindings.json` | oficial: interactive-mode |
| WezTerm | Trae multiplexor propio; Shift+Enter funciona | 0 | Se configura en Lua. Que sea «más rápido» solo lo dicen blogs de opinión | [yaw.sh](https://yaw.sh/blog/best-terminal-emulators-windows-2026/), 2026 |
| Ghostty | No existe para Windows | — | Sus notas dicen «not planned» | [notas 1.3.0](https://ghostty.org/docs/install/release-notes/1-3-0), marzo 2026 |

No encontré ningún ajuste que aproveche el monitor de 240 Hz en Claude Code (*sin verificar*).

### 5. Hábitos (guía oficial de Anthropic, [best-practices](https://code.claude.com/docs/en/best-practices), 09-10-2026)

| Hábito | Qué ganas | Cómo |
|---|---|---|
| Plan mode solo cuando toca varios archivos | No resolver el problema equivocado | Shift+Tab hasta ver `⏸ plan mode on`; Ctrl+G para editar el plan |
| Checkpoints | Probar algo arriesgado sin miedo | Esc Esc o `/rewind` restaura código, conversación o ambos (no recupera lo que cambió Bash) |
| `/clear` después de 2 correcciones fallidas | Una sesión limpia rinde más que una parchada | Lo dice la guía casi textual |
| `/btw` | Preguntas al paso sin llenar el contexto | `/btw ¿…?` |
| Pedido en archivo | Mensajes largos sin perder tareas | Claude te entrevista, escribe `SPEC.md` y una sesión nueva lo ejecuta |
| `/goal` | Claude sigue trabajando hasta que pase una prueba | `/goal <condición>` |
| Sesiones en paralelo | Varias tareas a la vez | `claude agents` (ya lo usas). Worktrees no, por la regla del proyecto |

### Top 5 para alguien que hoy dicta poco y escribe mucho

1. **`/voice` en español, modo hold**: una línea de apt y dos ajustes. Dictas por tramos, corriges con el teclado y das Enter.
2. **Ctrl+G** para armar en tu editor los pedidos largos de 3-6 tareas.
3. **Alt+V** para las capturas, después de `claude update`.
4. **Enter para dejar en cola y Esc Esc para deshacer**: mandas lo siguiente sin esperar a que termine.
5. **`terminal_bell` + `bellStyle` taskbar** para enterarte cuando termina; sumas la voz Camila (Bloque A) si quieres escuchar el cierre. Para dictar fuera de la terminal, Handy.

Para acelerar: el CHANGELOG de Claude Code pesa ~1 MB; para buscar una versión, mejor `gh api` y buscar en local que WebFetch.
