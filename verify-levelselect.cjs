// Level-select cheat: corner button opens the list, tap a row / press 1-5 jumps into that world.
const { chromium, devices } = require('playwright-core');
const OUT = process.env.OUT || '.';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const errors = [];
  const active = (p) => p.evaluate(() => window.__sdt.scene.getScenes(true).map((s) => s.sys.settings.key).join(','));
  const scr = (p, gx, gy) => p.evaluate(([gx, gy]) => { const c = window.__sdt.canvas.getBoundingClientRect(); const g = window.__sdt.scale; return { x: c.left + gx * c.width / g.width, y: c.top + gy * c.height / g.height }; }, [gx, gy]);
  // phone: tap corner button, tap WARP RING row
  const ctx = await b.newContext({ ...devices['iPhone 13 landscape'] });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:8123/', { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  const W = await p.evaluate(() => window.__sdt.scale.width);
  let pt = await scr(p, W - 30, 9); await p.touchscreen.tap(pt.x, pt.y);
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/levelselect.png` });
  pt = await scr(p, W / 2, 112 - 30 + 3 * 17); await p.touchscreen.tap(pt.x, pt.y);
  await p.waitForTimeout(1500);
  console.log('phone tap WARP RING ->', await active(p), 'cheat=', await p.evaluate(() => 0));
  // desktop: press 5
  const d = await b.newPage({ viewport: { width: 1280, height: 720 } });
  d.on('pageerror', (e) => errors.push(e.message));
  await d.goto('http://localhost:8123/', { waitUntil: 'load' });
  await d.waitForTimeout(2500);
  await d.keyboard.press('Digit5');
  await d.waitForTimeout(1500);
  console.log('desktop key 5 ->', await active(d));
  // normal start still works
  await d.goto('http://localhost:8123/', { waitUntil: 'load' });
  await d.waitForTimeout(2500);
  await d.keyboard.press('KeyL'); await d.waitForTimeout(200); await d.keyboard.press('Escape'); await d.waitForTimeout(200);
  await d.keyboard.press('Space'); await d.waitForTimeout(2500);
  console.log('L, Esc, Space ->', await active(d));
  // HOME: one tap arms, second tap quits to title
  const W2 = await d.evaluate(() => window.__sdt.scale.width);
  const home = await d.evaluate(() => { const s = window.__sdt.scene.getScene('invasion'); const r = s.children.list.find((o) => o.type === 'Rectangle' && o.strokeColor === 0xff46c8); return r ? [r.x, r.y] : null; });
  const hp = await scr(d, home[0], home[1]);
  await d.screenshot({ path: `${OUT}/bar.png` });
  await d.mouse.click(hp.x, hp.y); await d.waitForTimeout(300);
  console.log('home tap 1 ->', await active(d));
  await d.screenshot({ path: `${OUT}/home_armed.png` });
  await d.mouse.click(hp.x, hp.y); await d.waitForTimeout(800);
  console.log('home tap 2 ->', await active(d));
  // iPhone: install hint
  pt = await scr(p, 30, 9);
  await p.goto('http://localhost:8123/', { waitUntil: 'load' }); await p.waitForTimeout(1200);
  pt = await scr(p, 30, 9); await p.touchscreen.tap(pt.x, pt.y); await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/ios_install.png` });
  console.log('ios hint visible ->', await p.evaluate(() => window.__sdt.scene.getScene('attract').iosHint.visible));
  await b.close();
  console.log(errors.length ? 'ERRORS: ' + errors.join('\n') : 'NO PAGE ERRORS');
})();
