// Shared on-screen controller in every world (emulated Android phone): stick moves the craft, FIRE shoots.
const { chromium, devices } = require('playwright-core');
const OUT = process.env.OUT || '.';
const POS = {
  invasion: 's.ship.x', swarm: 's.ship.x', lunar: 's.roverX', warp: 's.theta', canyon: 's.jx'
};
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const errors = [];
  for (const key of Object.keys(POS)) {
    const ctx = await b.newContext({ ...devices['Pixel 7 landscape'] });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(key + ': ' + e.message));
    await p.goto('http://localhost:8123/?scene=' + key, { waitUntil: 'load' });
    // keep the player alive while measuring
    await p.evaluate((k) => setInterval(() => { const s = window.__sdt.scene.getScene(k); if (s) { s.invuln = 1e6; if (k === 'lunar') { s.nextSpawnX = s.worldX + 1e6; s.obstacles.length = 0; } } }, 50), key);
    for (let i = 0; i < 30; i++) { if (await p.evaluate((k) => { const s = window.__sdt.scene.getScene(k); return s && s.state === 'play'; }, key)) break; await p.waitForTimeout(400); }
    const pos = () => p.evaluate(([k, e]) => { const s = window.__sdt.scene.getScene(k); return +(eval(e)).toFixed(2); }, [key, POS[key]]);
    const cd = () => p.evaluate((k) => window.__sdt.scene.getScene(k).fireCooldown, key);
    const scr = (gx, gy) => p.evaluate(([gx, gy]) => { const c = window.__sdt.canvas.getBoundingClientRect(); const g = window.__sdt.scale; return { x: c.left + gx * c.width / g.width, y: c.top + gy * c.height / g.height }; }, [gx, gy]);
    const W = await p.evaluate(() => window.__sdt.scale.width);
    const cdp = await ctx.newCDPSession(p);
    const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    const x0 = await pos();
    const low = key === 'invasion' || key === 'swarm';
    const stick = low ? await scr(30 + 18, 216 - 34) : await scr(32 + 20, 128);
    await T('touchStart', [{ ...stick, id: 1 }]);
    await p.waitForTimeout(700);
    const x1 = await pos();
    const fireBtn = low ? await scr(W - 30, 216 - 34) : await scr(key === 'lunar' ? W - 72 : W - 32, key === 'lunar' ? 118 : 136);
    await T('touchStart', [{ ...stick, id: 1 }, { ...fireBtn, id: 2 }]);
    let shots = 0, last = -1e9;
    for (let i = 0; i < 12; i++) { await p.waitForTimeout(60); const c = await cd(); if (c > last + 1) shots++; last = c; }
    await p.screenshot({ path: `${OUT}/pad_${key}.png` });
    await T('touchEnd', []);
    console.log(key.padEnd(9), 'moved', x0, '->', x1, '| fire cycles', shots);
    await ctx.close();
  }
  await b.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
})();
