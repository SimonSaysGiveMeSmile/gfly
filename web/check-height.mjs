import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto('http://localhost:3000/lab/baseline-room');
await page.waitForTimeout(2000);

// Get body height
const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
const viewportHeight = 900;
const ratio = (bodyHeight / viewportHeight).toFixed(2);

console.log(`Body height: ${bodyHeight}px`);
console.log(`Viewport: ${viewportHeight}px`);
console.log(`Ratio: ${ratio}x viewport height`);

// Check each major section
const sections = await page.evaluate(() => {
  const article = document.querySelector('article');
  const sections = Array.from(article?.querySelectorAll('.space-y-4 > *') || []);
  return sections.map((el, i) => ({
    index: i,
    height: el.getBoundingClientRect().height,
    classes: el.className,
  }));
});

console.log('\nSection heights:');
sections.forEach(s => {
  console.log(`  [${s.index}] ${s.height.toFixed(0)}px - ${s.classes.substring(0, 50)}`);
});

await browser.close();
