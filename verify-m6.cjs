// M6 Canyon River check: jump in, autopilot run (bridges, fuel, crashes), manual smoke test.
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
  const probe = () =>
    page.evaluate(() => {
      const s = window.__sdt.scene.getScene('canyon');
      if (!s || !s.sys.isActive()) return { scene: window.__sdt.scene.getScenes(true).map((x) => x.sys.settings.key) };
      return {
        state: s.state,
        dist: Math.round(s.dist),
        bridges: s.bridgesDown,
        fuel: +s.fuel.toFixed(2),
        lives: s.lives,
        score: s.hud.score
      };
    });

  // warp -> canyon jump (warp fighter rebuilds as the river jet)
  await page.goto('http://localhost:8123/?scene=jump&to=canyon', { waitUntil: 'load' });
  await page.waitForTimeout(5500);
  await page.screenshot({ path: `${OUT}/m6_jump.png` });

  // demo pilot: long run
  await page.goto('http://localhost:8123/?scene=canyon&demo', { waitUntil: 'load' });
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(5000);
    console.log(`t+${(i + 1) * 5}s`, JSON.stringify(await probe()));
    if (i === 1 || i === 4 || i === 7) await page.screenshot({ path: `${OUT}/m6_demo_${i}.png` });
  }

  // manual: start, steer, accelerate, fire
  await page.goto('http://localhost:8123/?scene=canyon', { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/m6_intro.png` });
  await page.keyboard.down('Space');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(3000);
  await page.keyboard.up('ArrowUp');
  await page.screenshot({ path: `${OUT}/m6_manual.png` });
  await page.keyboard.up('Space');
  console.log('manual', JSON.stringify(await probe()));

  await browser.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE ERRORS');
})();
