const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  const errors = [];
  for (const [name, w, h] of [['iphone', 844, 390], ['pixel', 915, 412], ['desktop', 1152, 648]]) {
    const mobile = name !== 'desktop';
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(name + ' pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('404')) errors.push(name + ' console: ' + m.text());
    });
    await page.goto('http://localhost:8123/', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const r = c.getBoundingClientRect();
      return { cw: c.width, ch: c.height, rw: Math.round(r.width), rh: Math.round(r.height), vw: innerWidth, vh: innerHeight };
    });
    console.log(name, JSON.stringify(info));
    await page.screenshot({ path: `mob_${name}_title.png` });
    await page.goto('http://localhost:8123/?scene=invasion', { waitUntil: 'load' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `mob_${name}_inv.png` });
    await ctx.close();
  }
  await browser.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE ERRORS');
})();
