---
name: voice
description: Habla en voz alta usando TTS de Windows (PowerShell SAPI). Útil para anunciar fin de tareas largas o leer alertas críticas. Usar cuando Brandon esté lejos del monitor.
---

# /voice — Text-to-speech vía Windows SAPI

## Uso

```bash
node .claude/skills/voice/say.mjs "Tests pasaron, listo para deploy."
```

Configurable por env:
- `BSM_VOICE_RATE` — velocidad (-10 a 10, default 0)
- `BSM_VOICE_VOLUME` — volumen (0-100, default 80)

## Combo común

```bash
node .claude/skills/notify/send.mjs "Build OK"  # toast + telegram
node .claude/skills/voice/say.mjs "Build terminado correctamente"  # voz
```
