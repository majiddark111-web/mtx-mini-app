/* global Image, document */
// Re-encode the original pixels for delivery; no cropping or character edits.
import { Buffer } from 'node:buffer';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH)).href);
const source = await readFile('public/mtx-robot-scene.png');
const browser = await chromium.launch({headless:true,executablePath:process.env.REWARDS_BROWSER_PATH});
try {
  const page = await browser.newPage();
  const encoded = await page.evaluate(async data => {
    const img = new Image();
    img.src = data;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img,0,0);
    return canvas.toDataURL('image/webp',0.86);
  }, 'data:image/png;base64,'+source.toString('base64'));
  if (!encoded.startsWith('data:image/webp;base64,')) throw Error('WebP encoding unavailable');
  const output = Buffer.from(encoded.split(',')[1],'base64');
  await writeFile('public/mtx-robot-scene.webp',output);
  console.log('ROBOT_ART_ENCODED', {sourceBytes:source.length,webpBytes:output.length});
} finally {await browser.close();}
