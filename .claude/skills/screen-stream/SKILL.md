---
name: screen-stream
description: Captura screenshots periódicos durante una tarea larga y los guarda en reports/screen-stream/. Útil para auditar trabajo autónomo nocturno o sesiones de loop largas.
---

# /screen-stream — Stream de capturas durante tareas largas

## Uso

```bash
# Arrancar stream cada 30s en background, hasta máx 60 capturas
node .claude/skills/screen-stream/stream.mjs --interval 30 --max 60 &

# Hacer trabajo normal…

# Detener (mata el proceso por nombre)
pkill -f "screen-stream/stream.mjs"
```

## Output

`reports/screen-stream/<timestamp>/frame-NNN.png` — series numeradas, fácil de revisar después.

## Combinado con loop largo

```bash
# Arrancar stream + tarea + notify al final
node .claude/skills/screen-stream/stream.mjs --interval 60 --max 120 &
STREAM_PID=$!
npm run test:e2e
kill $STREAM_PID 2>/dev/null
node .claude/skills/notify/send.mjs "E2E terminado, revisar reports/screen-stream/"
```
