// Lunar: forward shot destroys rocks, big rocks AND mines; bombs leave no craters in loop 1.
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:8123/?scene=lunar', { waitUntil: 'load' });
  for (let i = 0; i < 30; i++) { if (await p.evaluate(() => window.__sdt.scene.getScene('lunar').state === 'play')) break; await p.waitForTimeout(400); }
  const res = await p.evaluate(async () => {
    const s = window.__sdt.scene.getScene('lunar');
    s.invuln = 1e6;
    s.obstacles.forEach((o) => o.sprite?.destroy()); s.obstacles.length = 0; s.nextSpawnX = s.worldX + 1e6;
    const out = {};
    for (const kind of ['mine', 'rock', 'bigrock']) {
      s.addObstacle(kind, s.worldX + s.roverX + 70, kind === 'bigrock' ? 14 : kind === 'rock' ? 10 : 8);
      const o = s.obstacles[s.obstacles.length - 1];
      for (let i = 0; i < 6 && o.alive; i++) { s.fireCooldown = 0; s.fireWeapon(); await new Promise((r) => setTimeout(r, 260)); }
      out[kind] = o.alive ? 'STILL THERE' : 'destroyed';
    }
    // bomb impact well ahead of the rover, loop 1
    const before = s.obstacles.filter((o) => o.alive && o.kind === 'crater').length;
    s.bombImpact(s.roverX + 120);
    out.bombCraterLoop1 = s.obstacles.filter((o) => o.alive && o.kind === 'crater').length > before;
    s.loop = 2; s.bombImpact(s.roverX + 160);
    out.bombCraterLoop2 = s.obstacles.filter((o) => o.alive && o.kind === 'crater').length > before;
    return out;
  });
  console.log(JSON.stringify(res));
  await b.close();
  console.log(errors.length ? 'ERRORS: ' + errors.join('\n') : 'NO PAGE ERRORS');
})();
