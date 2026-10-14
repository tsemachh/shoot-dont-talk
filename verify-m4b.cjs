const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 936, height: 432 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'info' && m.text().startsWith('[lunar]')) console.log(m.text());
    if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text());
  });
  await page.goto('http://localhost:8123/?scene=lunar&auto=1', { waitUntil: 'load' });
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(7000);
    await page.screenshot({ path: `m4b_${String(i).padStart(2, '0')}.png` });
  }
  const fps = await page.evaluate(() => 0);
  await browser.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE ERRORS');
})();
