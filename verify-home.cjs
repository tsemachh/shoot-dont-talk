// HOME: one tap pauses + opens QUIT TO TITLE? dialog; NO resumes, YES goes to title. Phone + desktop Esc.
const { chromium, devices } = require('playwright-core');
const OUT = process.env.OUT || '.';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const errors = [];
  const ctx = await b.newContext({ ...devices['Pixel 7 landscape'] });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:8123/', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.touchscreen.tap(400, 150);
  await p.waitForTimeout(3000);
  const scenes = () => p.evaluate(() => window.__sdt.scene.getScenes(false).filter((s) => s.sys.isActive() || s.sys.isPaused()).map((s) => s.sys.settings.key + (s.sys.isPaused() ? '(paused)' : '')).join(','));
  const scr = (gx, gy) => p.evaluate(([gx, gy]) => { const c = window.__sdt.canvas.getBoundingClientRect(); const g = window.__sdt.scale; return { x: c.left + gx * c.width / g.width, y: c.top + gy * c.height / g.height }; }, [gx, gy]);
  const home = await p.evaluate(() => { const s = window.__sdt.scene.getScene('invasion'); const r = s.children.list.find((o) => o.type === 'Rectangle' && o.strokeColor === 0xff46c8); return [r.x, r.y]; });
  const W = await p.evaluate(() => window.__sdt.scale.width);
  console.log('playing        ', await scenes());
  let pt = await scr(home[0], home[1] - 9); // tap a little ABOVE the icon
  await p.touchscreen.tap(pt.x, pt.y); await p.waitForTimeout(500);
  console.log('tap near HOME  ', await scenes());
  await p.screenshot({ path: `${OUT}/quit_dialog.png` });
  pt = await scr(W / 2 + 44, 216 / 2 - 6 + 20); await p.touchscreen.tap(pt.x, pt.y); await p.waitForTimeout(500);
  console.log('tap NO         ', await scenes());
  pt = await scr(home[0], home[1]); await p.touchscreen.tap(pt.x, pt.y); await p.waitForTimeout(500);
  pt = await scr(W / 2 - 44, 216 / 2 - 6 + 20); await p.touchscreen.tap(pt.x, pt.y); await p.waitForTimeout(1200);
  console.log('HOME then YES  ', await scenes());
  // desktop: Esc, Esc
  const d = await b.newPage({ viewport: { width: 1280, height: 720 } });
  d.on('pageerror', (e) => errors.push(e.message));
  await d.goto('http://localhost:8123/?scene=swarm', { waitUntil: 'load' });
  await d.waitForTimeout(3000);
  await d.keyboard.press('Escape'); await d.waitForTimeout(400);
  const ds = () => d.evaluate(() => window.__sdt.scene.getScenes(false).filter((s) => s.sys.isActive() || s.sys.isPaused()).map((s) => s.sys.settings.key + (s.sys.isPaused() ? '(paused)' : '')).join(','));
  console.log('desktop Esc    ', await ds());
  await d.keyboard.press('Escape'); await d.waitForTimeout(1000);
  console.log('desktop Esc x2 ', await ds());
  await b.close();
  console.log(errors.length ? 'ERRORS: ' + errors.join('\n') : 'NO PAGE ERRORS');
})();
