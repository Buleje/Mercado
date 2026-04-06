/**
 * scripts/verify-redis.ts
 *
 * Run: npx tsx scripts/verify-redis.ts
 *
 * Checks:
 * 1. REDIS_URL env var exists
 * 2. Can connect to Redis
 * 3. Can read/write
 * 4. BullMQ queues can be created
 * 5. Measures latency
 */

async function main() {
  console.log("🔍 Verificando Redis para Bodega San Martín...\n");

  // Check 1: REDIS_URL
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log("❌ REDIS_URL no está configurada");
    console.log("   Configura en .env.local o Vercel env vars");
    console.log("   Guía: docs/redis-activation-guide.md");
    process.exit(1);
  }
  console.log("✅ REDIS_URL configurada");

  // Check 2: Connection
  try {
    const Redis = (await import("ioredis")).default;
    const client = new Redis(url, {
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
    });

    // Check 3: Read/Write
    const testKey = `bsm-health-${Date.now()}`;
    await client.set(testKey, "ok", "EX", 10);
    const val = await client.get(testKey);
    await client.del(testKey);

    if (val === "ok") {
      console.log("✅ Redis lectura/escritura OK");
    } else {
      console.log("⚠️  Redis escritura OK pero lectura falló");
    }

    // Check 4: Latency
    const start = Date.now();
    await client.ping();
    const latency = Date.now() - start;
    console.log(`✅ Redis latencia: ${latency}ms`);

    // Check 5: BullMQ
    try {
      const { Queue } = await import("bullmq");
      const parsed = new URL(url);
      const q = new Queue("health-check", {
        connection: {
          host: parsed.hostname,
          port: Number(parsed.port) || 6379,
          password: parsed.password || undefined,
          maxRetriesPerRequest: null,
        },
      });
      await q.close();
      console.log("✅ BullMQ queues operativas");
    } catch (e) {
      console.log("⚠️  BullMQ no disponible:", String(e));
    }

    // Check 6: Memory info
    const info = await client.info("memory");
    const usedMemory = info.match(/used_memory_human:(.+)/)?.[1]?.trim();
    console.log(`📊 Redis memoria usada: ${usedMemory || "unknown"}`);

    await client.quit();
    console.log("\n✅ Redis verificado correctamente!");
  } catch (err) {
    console.log(
      `❌ Error de conexión: ${err instanceof Error ? err.message : String(err)}`
    );
    console.log(
      "   Verifica que REDIS_URL es correcto y el servidor está accesible"
    );
    process.exit(1);
  }
}

main();

export {};
