const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage({ viewport: { width: 1152, height: 648 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text());
  });

  // 1) jump transition -> arrives in swarm
  await page.goto('http://localhost:8123/?scene=jump', { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'm3_jump.png' });
  await page.waitForTimeout(2600); // arrival banner
  await page.screenshot({ path: 'm3_arrive.png' });

  // 2) swarm gameplay: entry streams, then dives
  await page.goto('http://localhost:8123/?scene=swarm', { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: 'm3_entry.png' });
  await page.keyboard.down('Space');
  for (let i = 0; i < 12; i++) {
    await page.keyboard.down(i % 2 ? 'ArrowLeft' : 'ArrowRight');
    await page.waitForTimeout(650);
    await page.keyboard.up(i % 2 ? 'ArrowLeft' : 'ArrowRight');
    if (i % 4 === 3) await page.keyboard.press('KeyX');
  }
  await page.screenshot({ path: 'm3_dives.png' });

  // 3) idle under the boss rows to invite a tractor beam (~16-19s mark)
  await page.keyboard.up('Space');
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(900);
    const shot = `m3_beam_${i}.png`;
    await page.screenshot({ path: shot });
  }
  await page.screenshot({ path: 'm3_late.png' });

  await browser.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE ERRORS');
})();
