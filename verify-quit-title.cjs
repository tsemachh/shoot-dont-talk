// Quit to title after starting from a demo tap: must stay on the title (no stale auto-start).
const { chromium, devices } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const ctx = await b.newContext({ ...devices['Pixel 7 landscape'] });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const active = () => p.evaluate(() => window.__sdt.scene.getScenes(true).map((s) => s.sys.settings.key).join(','));
  const scr = (gx, gy) => p.evaluate(([gx, gy]) => { const c = window.__sdt.canvas.getBoundingClientRect(); const g = window.__sdt.scale; return { x: c.left + gx * c.width / g.width, y: c.top + gy * c.height / g.height }; }, [gx, gy]);
  await p.goto('http://localhost:8123/?scene=swarm&demo', { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  console.log('demo running   ', await active());
  await p.touchscreen.tap(400, 150); await p.waitForTimeout(3000);   // tap during demo -> real game
  console.log('after demo tap ', await active());
  const key = (await active()).split(',')[0];
  const home = await p.evaluate((k) => { const s = window.__sdt.scene.getScene(k); const r = s.children.list.find((o) => o.type === 'Rectangle' && o.strokeColor === 0xff46c8); return [r.x, r.y]; }, key);
  let pt = await scr(home[0], home[1]); await p.touchscreen.tap(pt.x, pt.y); await p.waitForTimeout(500);
  const W = await p.evaluate(() => window.__sdt.scale.width);
  pt = await scr(W / 2 - 44, 216 / 2 - 6 + 20); await p.touchscreen.tap(pt.x, pt.y);
  await p.waitForTimeout(3000);
  console.log('3s after YES   ', await active());
  await b.close();
  console.log(errors.length ? 'ERRORS: ' + errors.join('\n') : 'NO PAGE ERRORS');
})();
