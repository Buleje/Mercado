import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const SCREENSHOTS_DIR = '/home/usuario/proyectos/Mercado/reports/dark-mode-audit/screenshots';
const BASE_URL = 'http://mi-pollo.localhost:3000';

const ROUTES = [
  { tab: '', file: '01-dashboard-inicio' },
  { tab: 'ventas-caja', file: '02-ventas-caja' },
  { tab: 'productos', file: '03-productos' },
  { tab: 'inventario', file: '04-inventario' },
  { tab: 'pedidos', file: '05-pedidos' },
  { tab: 'clientes', file: '06-clientes' },
  { tab: 'config', file: '07-config' },
  { tab: 'mi-tienda', file: '08-mi-tienda' },
];

async function run() {
  const browser = await chromium.launch({
    executablePath: '/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  // Login
  console.log('Logging in...');
  await page.goto(`${BASE_URL}/admin/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Fill login form
  await page.fill('input[type="text"], input[name="username"], input[placeholder*="usuario" i], input[placeholder*="user" i]', 'qaadmin').catch(async () => {
    // Try by index
    const inputs = await page.locator('input').all();
    if (inputs.length > 0) await inputs[0].fill('qaadmin');
  });
  await page.fill('input[type="password"]', 'Qa-admin-1234');
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  
  console.log('Current URL after login:', page.url());

  // Close onboarding modal if present
  await page.evaluate(() => {
    localStorage.setItem('onboarding-completed-mi-pollo', '1');
    localStorage.setItem('onboarding-completed-main', '1');
  });

  // Enable dark mode via localStorage
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('color-theme', 'dark');
    localStorage.setItem('themeMode', 'dark');
  });
  
  await page.waitForTimeout(500);

  // Verify dark mode is on
  const hasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  console.log('Dark mode active:', hasDark);

  // Take screenshots
  for (const route of ROUTES) {
    const url = route.tab ? `${BASE_URL}/admin?tab=${route.tab}` : `${BASE_URL}/admin`;
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 }).catch(e => console.log('Nav error:', e.message));
    
    // Re-apply dark mode after navigation
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    
    await page.waitForTimeout(2000);
    
    const filePath = `${SCREENSHOTS_DIR}/${route.file}.png`;
    await page.screenshot({ path: filePath, fullPage: false });
    console.log(`Saved: ${filePath}`);
  }

  await browser.close();
  console.log('Done!');
}

run().catch(e => { console.error(e); process.exit(1); });
