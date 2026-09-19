import puppeteer from 'puppeteer-core';

const errors = [];
const failed = [];
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });
page.on('requestfailed', (r) => failed.push('FAILED: ' + r.url().slice(0, 120) + ' :: ' + (r.failure()?.errorText ?? '')));

await page.goto('http://localhost:5174/?profile=bank_atm', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 9000));
// dismiss ignition overlay
await page.evaluate(() => {
  const b = document.querySelector('.ignition-card button');
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 3000));
await page.screenshot({ path: '.e2e-tmp/shot-A-dark-initial.png' });

// toggle to light
await page.click('button.theme-toggle');
await new Promise((r) => setTimeout(r, 6000));
await page.screenshot({ path: '.e2e-tmp/shot-B-light.png' });

// toggle back to dark (obsidian)
await page.click('button.theme-toggle');
await new Promise((r) => setTimeout(r, 6000));
await page.screenshot({ path: '.e2e-tmp/shot-C-dark-return.png' });

const themeAttr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const legendText = await page.evaluate(() => document.querySelector('.legend')?.innerText.slice(0, 200));
console.log('THEME_ATTR:', themeAttr);
console.log('LEGEND:', JSON.stringify(legendText));
console.log('ERRORS(' + errors.length + '):');
errors.slice(0, 15).forEach((e) => console.log('  ' + e));
console.log('FAILED_REQ(' + failed.length + '):');
failed.slice(0, 15).forEach((e) => console.log('  ' + e));
await browser.close();
