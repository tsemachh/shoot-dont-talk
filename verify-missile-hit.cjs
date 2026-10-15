// Lunar: upward shots destroy UFO missiles across the missile's full width.
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:8123/?scene=lunar', { waitUntil: 'load' });
  for (let i = 0; i < 30; i++) { if (await p.evaluate(() => window.__sdt.scene.getScene('lunar').state === 'play')) break; await p.waitForTimeout(400); }
  const r = await p.evaluate(async () => {
    const s = window.__sdt.scene.getScene('lunar');
    s.invuln = 1e6;
    const out = {};
    for (const dx of [0, 4, 7, 10]) {
      s.bombs.forEach((m) => s.deactivate(m)); s.upBullets.forEach((m) => s.deactivate(m));
      const m = s.getFromPool(s.bombs, 'ln-missile').setScale(1.6);
      const shotX = s.roverX + 3;
      m.setPosition(shotX + dx, 60).setDepth(7).setData('vy', 0.5);
      s.fireCooldown = 0; s.fireWeapon();
      await new Promise((res) => setTimeout(res, 900));
      out['offset ' + dx + 'px'] = m.active ? 'missed' : 'destroyed';
    }
    return out;
  });
  console.log(JSON.stringify(r));
  await b.close();
  console.log(errors.length ? 'ERRORS: ' + errors.join('\n') : 'NO PAGE ERRORS');
})();
