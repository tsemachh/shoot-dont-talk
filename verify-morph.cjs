// Jump morph check: each jump rebuilds one sector's craft into the next.
const { chromium } = require('playwright-core');
const OUT = process.env.OUT || '.';

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text());
  });
  const frameOf = () => page.evaluate(() => {
    const g = window.__sdt;
    return g ? g.scene.getScene('jump').frame : -1;
  });

  for (const to of ['swarm', 'lunar', 'warp']) {
    await page.goto(`http://localhost:8123/?scene=jump&to=${to}`, { waitUntil: 'load' });
    // sample until we have before / mid-morph / after shots
    const want = [100, 128, 150, 200];
    let k = 0;
    for (let i = 0; i < 400 && k < want.length; i++) {
      const f = await frameOf();
      if (f >= want[k]) {
        await page.screenshot({ path: `${OUT}/morph_${to}_${k}.png` });
        k++;
      }
      await page.waitForTimeout(40);
    }
  }
  for (const s of ['invasion', 'swarm', 'warp']) {
    await page.goto(`http://localhost:8123/?scene=${s}`, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/ship_${s}.png` });
  }
  await browser.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE ERRORS');
})();
