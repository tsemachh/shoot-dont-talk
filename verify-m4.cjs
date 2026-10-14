const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1404, height: 648 } }); // ~2.17:1, phone-like
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text());
  });

  // 1) swarm -> lunar landing transition
  await page.goto('http://localhost:8123/?scene=jump&to=lunar', { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'm4_jump.png' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'm4_land.png' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'm4_arrive.png' });

  // 2) lunar gameplay: fire constantly, hop rhythmically, throttle up
  await page.goto('http://localhost:8123/?scene=lunar', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'm4_banner.png' });
  await page.keyboard.down('Space');
  for (let i = 0; i < 48; i++) {
    if (i % 3 === 0) await page.keyboard.press('ArrowUp');
    if (i === 10) await page.keyboard.down('ArrowRight');
    if (i === 20) await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(450);
    if (i === 8 || i === 18 || i === 30 || i === 44) await page.screenshot({ path: `m4_play_${i}.png` });
  }
  await page.keyboard.up('Space');
  await browser.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE ERRORS');
})();
