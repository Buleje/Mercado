# ADR-528 — Buleje IA: operar el negocio hablando, con el modelo de IA que cada negocio elija

- **Estado:** en construcción (2026-11-01). Schema EXPAND aplicado: `TenantIaProveedor`, `AsistenteMemoria`, `AsistenteConexion`, `AIMessage.extra` (migración `20261101a_buleje_ia_adr528`).
- **Pedido por:** Brandon (01-11): «una app tipo IA donde se pondrá el API del modelo que sea (ChatGPT, Claude, Gemini, DeepSeek y modelos chinos) … "anótame tanqueé 12 gal de petróleo para mi camión blanco N12, total 200 soles, recibo E242, te envío foto" y con eso registra en el sistema y lo guarda en memoria; devuelve liquidaciones, boletas, facturas, cotizaciones, reuniones … lo que antes se registraba a mano en cualquier ERP, ahora a través de una IA configurada con el modelo que más agrade».
- **Relacionados:** ADR-387 (el chat anota plata), ADR-388 (Telegram + Whisper), ADR-390 (conversa con memoria corta), ADR-391 (WhatsApp; fotos bloqueadas por falta de visión), ADR-523 (MCP «buleje» local de Claude Code), ADR-010 (router de modelos).

## Contexto
El motor ya existía: `conversar()` con 65 herramientas en 15 dominios, ensayo + confirmación humana en toda escritura de plata, memoria de 30 min en RAM, canales Telegram/WhatsApp/n8n/panel. Le faltaban cuatro cosas para ser «el ERP que se opera hablando»:

| Hueco medido | Efecto |
|---|---|
| Solo la IA de la plataforma (Groq gratis, 8.000 por minuto; xAI sin crédito) | 2 turnos por minuto; el negocio no puede elegir ni pagar uno mejor |
| Ningún modelo con visión en la plataforma | la foto del recibo no se puede leer (ADR-391 la bloqueó) |
| Memoria de 30 min, en RAM | «el camión blanco es el N12» se olvida en cada conversación |
| Sin papeles de salida ni app propia | todo vive en una pestaña del panel; nada de cotización/liquidación en el chat |

## Decisión
1. **El negocio trae su clave (BYOK).** Catálogo de 12 proveedores (`lib/ia-proveedores/catalogo.ts`); 10 hablan el protocolo de OpenAI (Gemini, DeepSeek, Qwen, Kimi, GLM, MiniMax, Groq, xAI, OpenRouter, uno propio) y Claude el suyo → un adaptador por protocolo, no por marca. La clave entra cifrada (`lib/cripto-secretos.ts`, AES-GCM) y nunca vuelve a la pantalla (solo sus últimos 4). La lista de modelos sale de `/models` del proveedor al probar la clave, no de una lista fija (Groq dio de baja modelos en silencio: lección de 09-2026).
2. **Un solo punto de entrada al modelo por negocio:** `callLLMDelNegocio(tenantId, tier, opts, { imagenes })`. Sin clave propia, cae a la plataforma como hoy. Con fotos usa `modeloVision ?? modelo`; si el modelo no ve fotos, lo dice claro.
3. **Memoria del negocio en la base** (`AsistenteMemoria`): alias, datos, preferencias. No es el registro de operaciones (eso ya está en los libros): es lo que hace falta para entender el próximo pedido. Entra al contexto solo lo que comparte palabras con el mensaje (≤8 + 3 más usadas).
4. **Papeles como resultado de una herramienta** (`data.papel: PapelDevuelto`): cotización, liquidación, comprobante, reunión. Lo que va a SUNAT con efecto legal pasa por confirmación y dice si se emite de verdad o queda en borrador.
5. **La foto es un documento**: se guarda en Documentos («Buleje IA · Fotos») antes de mandarla al modelo; el gasto lleva «Recibo E242 · foto: Documentos <id>» en sus notas (sin migración en `AssetExpense`/`Expense`).
6. **App propia** `/admin/ia` a pantalla completa (celular primero): chat con fotos y voz, conversaciones guardadas (`AIConversation` canal `app` + `AIMessage.extra`), Modelos, Memoria, Conectar apps.
7. **Servidor MCP del negocio** (`/api/mcp`, Streamable HTTP sin estado): ChatGPT, Claude, Gemini o Cursor se conectan con un token por conexión (hash SHA-256 en `AsistenteConexion`), actúan con el usuario y rol de quien la creó (re-leído en cada llamada), solo lectura hasta que el dueño prenda «puede anotar», y toda escritura pasa por ensayo + `confirmar_operacion`.

## Consecuencias
- La confirmación humana de plata NO se relaja: es la misma tarjeta en la app, Telegram, WhatsApp y MCP.
- El costo de la IA lo paga el negocio con su clave; la plataforma sigue siendo el respaldo gratis (sin fotos).
- Riesgos para revisar en seguridad: SSRF por `baseUrl` personalizado; token MCP en la URL (`/api/mcp/t/<token>`) queda en logs; exención del proxy solo para `/api/mcp*`; una app de afuera con «puede anotar» puede confirmarse sola si el humano no mira.
- Store de pendientes sigue en RAM (10 min): un reinicio del servidor pierde las tarjetas sin confirmar (igual que hoy).
