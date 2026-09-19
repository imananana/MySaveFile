/**
 * When does styling actually take effect on a cold visit?
 *
 * The site ships no utility CSS of its own — index.html pulls Tailwind from
 * cdn.tailwindcss.com, which GENERATES the stylesheet in the browser. So the
 * page paints unstyled and stays that way until a third-party script has
 * downloaded and run. This polls a real element until its utility classes bite,
 * which is the number that matters.
 *
 *   node scripts/diagnostics/diagStyleTiming.mjs        # full speed
 *   node scripts/diagnostics/diagStyleTiming.mjs slow   # ~900kbps
 */
import puppeteer from 'puppeteer';
const URL = 'https://mysavefile.com/';
const throttle = process.argv[2] === 'slow';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
await page.setViewport({ width: 1280, height: 800 });
const cdp = await page.target().createCDPSession();
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
if (throttle) await cdp.send('Network.emulateNetworkConditions', {
  offline: false, latency: 150, downloadThroughput: 900*1024/8, uploadThroughput: 400*1024/8 });

const t0 = Date.now();
const log = [];
page.on('response', r => log.push([Date.now()-t0, r.status(), r.url()]));
page.on('requestfailed', r => log.push([Date.now()-t0, 'FAIL', r.url()]));

page.goto(URL, { waitUntil: 'load' }).catch(()=>{});

// Poll until a Tailwind utility actually applies. `.max-w-7xl` or any element
// with a w-* class having a constrained width proves the utility CSS is live.
let settled = null;
for (let i = 0; i < 200; i++) {
  await new Promise(r => setTimeout(r, 100));
  const ok = await page.evaluate(() => {
    const el = document.querySelector('svg[class*="w-"], img[class*="w-"], [class*="max-w-"]');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { cls: el.getAttribute('class')?.slice(0,40), w: cs.width, maxW: cs.maxWidth };
  }).catch(()=>null);
  if (ok && ok.maxW !== 'none') { settled = [Date.now()-t0, ok]; break; }
  if (ok && ok.w && parseFloat(ok.w) < 200) { settled = [Date.now()-t0, ok]; break; }
}
console.log(`\n--- ${throttle ? 'THROTTLED (~900kbps)' : 'FULL SPEED'} ---`);
console.log('utility CSS became effective at:', settled ? settled[0]+'ms' : 'NEVER within 20s', settled?.[1] ?? '');
console.log('\nkey network events:');
for (const [t, s, u] of log) if (/tailwind|assets\/index|\.js($|\?)/.test(u)) console.log(`  +${t}ms  ${s}  ${u.slice(0,75)}`);
await browser.close();
