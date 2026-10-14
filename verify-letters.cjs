// Letter capsules: a dropped capsule shows its letter and applies its power on pickup (all five worlds).
const { chromium } = require('playwright-core');
const OUT = process.env.OUT || '.';
const SHIP = { invasion: 's.ship', swarm: 's.ship', lunar: null, warp: 's.ship', canyon: null };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const errors = [];
  for (const key of Object.keys(SHIP)) {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    p.on('pageerror', (e) => errors.push(key + ': ' + e.message));
    await p.goto('http://localhost:8123/?scene=' + key, { waitUntil: 'load' });
    for (let i = 0; i < 30; i++) { if (await p.evaluate((k) => { const s = window.__sdt.scene.getScene(k); return s && s.state === 'play'; }, key)) break; await p.waitForTimeout(400); }
    const r = await p.evaluate(async (k) => {
      const s = window.__sdt.scene.getScene(k);
      s.invuln = 1e6;
      const out = [];
      for (const slot of ['LSR', 'SHD', 'OPT']) {
        s.power.roll = () => slot; // force the letter for the test
        let x, y;
        if (k === 'lunar') { x = s.roverX; y = s.ry - 6; s.dropCapsule(x, y); }
        else if (k === 'canyon') { s.dropCapsule(s.jx, s.dist + 0); }
        else if (k === 'warp') { s.dropCapsule(s.R, s.theta); }
        else { s.dropCapsule(s.ship.x, s.ship.y); }
        await new Promise((res) => setTimeout(res, 700));
        out.push(slot + ':' + JSON.stringify({ fire: s.power.fireMode, shield: s.power.shieldHp, opt: s.power.options }));
      }
      return out.join(' ');
    }, key);
    await p.screenshot({ path: `${OUT}/letters_${key}.png` });
    console.log(key.padEnd(9), r);
    await p.close();
  }
  await b.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
})();
