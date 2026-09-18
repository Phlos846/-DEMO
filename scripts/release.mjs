import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = path.join(root, 'version.json');
const previous = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')).version : '1.0.0';
const parts = previous.split('.').map(Number);
const version = process.argv[2] ?? `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('版本号格式应为 1.0.1');
// Version every local module reference, so transitive dependencies refresh too.
const stamp = text => text.replace(/(["'])(\.\.?\/[^"'\s?]+\.(?:js|css))(?:\?v=[^"'\s]*)?\1/g, (_, quote, url) => `${quote}${url}?v=${version}${quote}`);
for (const name of fs.readdirSync(path.join(root, 'js'))) {
  if (!name.endsWith('.js')) continue;
  const file = path.join(root, 'js', name);
  fs.writeFileSync(file, stamp(fs.readFileSync(file, 'utf8')));
}
const html = path.join(root, 'index.html');
fs.writeFileSync(html, stamp(fs.readFileSync(html, 'utf8')).replace(/(<span id="game-version"[^>]*>)[^<]*(<\/span>)/, `$1v${version}$2`));
fs.writeFileSync(manifest, JSON.stringify({version}, null, 2) + '\n');
console.log(`已更新至 v${version}，请一起上传 index.html、version.json、js 和 css 文件夹。`);
