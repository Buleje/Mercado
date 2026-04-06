/**
 * apply-migration.mjs
 * Ejecuta migration-prestamos-guia.sql contra Supabase usando el pooler
 * Uso: node scripts/apply-migration.mjs
 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Leer DATABASE_URL del .env manualmente (evita problemas con $ en PowerShell)
function loadEnv() {
  const envFile = path.join(__dirname, '..', '.env.local');
  const content = fs.readFileSync(envFile, 'utf-8');
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error('DATABASE_URL no encontrado en .env.local');
  return match[1].replace(/^["']|["']$/g, '').trim();
}

// Dividir SQL en statements individuales respetando bloques $$ ... $$
function splitSQL(sql) {
  const statements = [];
  let current = '';
  let inDollarQuote = false;

  const lines = sql.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Ignorar lineas de comentario puros
    if (trimmed.startsWith('--') && !inDollarQuote) {
      continue;
    }

    current += line + '\n';

    // Detectar apertura/cierre de bloques $$ 
    const dollarCount = (current.match(/\$\$/g) || []).length;
    if (dollarCount % 2 === 0 && dollarCount > 0) {
      // Número par de $$ → no estamos dentro de un bloque dollar quote
      inDollarQuote = false;
    } else if (dollarCount % 2 === 1) {
      inDollarQuote = true;
    }

    if (!inDollarQuote && trimmed.endsWith(';')) {
      const stmt = current.trim();
      if (stmt && stmt !== ';') {
        statements.push(stmt);
      }
      current = '';
    }
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements.filter(s => s.length > 0);
}

async function main() {
  const databaseUrl = loadEnv();
  console.log('📡 Conectando al pooler de Supabase...');
  console.log('   Host:', new URL(databaseUrl).hostname);

  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  
  try {
    await client.connect();
    console.log('✅ Conexión establecida\n');

    const sqlPath = path.join(__dirname, '..', 'migration-prestamos-guia.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    const statements = splitSQL(sql);

    console.log(`📋 Ejecutando ${statements.length} sentencias SQL...\n`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      // Obtener primera linea como descripción
      const firstLine = stmt.split('\n')[0].substring(0, 80);
      process.stdout.write(`  [${i + 1}/${statements.length}] ${firstLine}... `);
      
      try {
        await client.query(stmt);
        console.log('✅');
      } catch (err) {
        if (err.code === '42710' || err.message.includes('already exists')) {
          console.log('⚠️  ya existe (ok)');
        } else if (err.code === '42P07') {
          console.log('⚠️  tabla ya existe (ok)');
        } else {
          console.log('❌ ERROR');
          console.error('    Sentencia:', stmt.substring(0, 200));
          console.error('    Error:', err.message);
          // Continuar con las demás sentencias
        }
      }
    }

    console.log('\n🎉 Migración completada. Verificando tablas...\n');

    // Verificar que las tablas existen
    const { rows } = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('Prestamo', 'PrestamoCuota', 'PrestamoDocumento')
      ORDER BY tablename
    `);

    if (rows.length > 0) {
      console.log('✅ Tablas creadas:');
      rows.forEach(r => console.log(`   - ${r.tablename}`));
    } else {
      console.log('⚠️  Las tablas no aparecen en pg_tables');
      // Intentar con nombre en minúsculas (PostgreSQL case)
      const { rows: rows2 } = await client.query(`
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename ILIKE '%prestamo%'
      `);
      console.log('Tablas encontradas con ILIKE:', rows2.map(r => r.tablename));
    }

  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});
