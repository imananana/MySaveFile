import puppeteer from 'puppeteer';

const URL = process.argv[2] ?? 'https://mysavefile.com/';
const OUT = process.argv[3] ?? '.selftest';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const ctx = await browser.createBrowserContext();       // fresh profile = incognito
const page = await ctx.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

const cdp = await page.target().createCDPSession();
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });   // cold cache
// Throttle so the gap is wide enough to photograph. This does not create the
// flash; it slows the same sequence a real cold visit runs.
await cdp.send('Network.emulateNetworkConditions', {
  offline: false, latency: 150, downloadThroughput: 900 * 1024 / 8, uploadThroughput: 400 * 1024 / 8,
});

const t0 = Date.now();
const marks = [];
page.on('response', (r) => {
  const u = r.url();
  if (/tailwindcss|\.css($|\?)|fonts\.googleapis/.test(u)) marks.push(`+${Date.now() - t0}ms  ${u.slice(0, 70)}`);
});

page.goto(URL, { waitUntil: 'load' }).catch(() => {});

const shots = [];
const TIMES = (process.env.SHOT_MS ?? '300,600,900,1400,2600').split(',').map(Number);
for (const at of TIMES) {
  const wait = at - (Date.now() - t0);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const f = `${OUT}/fouc-${at}ms.png`;
  await page.screenshot({ path: f }).catch(() => {});
  shots.push(f);
}
console.log('stylesheet/script arrivals:');
for (const m of marks) console.log('  ' + m);
console.log('\nshots: ' + shots.join(' '));
await browser.close();
