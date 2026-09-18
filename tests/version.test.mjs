import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
test('HTML and all local module dependencies carry the published version and exist', () => {
  const {version}=JSON.parse(fs.readFileSync(new URL('version.json',root),'utf8'));
  const files=['index.html',...fs.readdirSync(new URL('js/',root)).filter(x=>x.endsWith('.js')).map(x=>'js/'+x)];
  let references=0;
  for(const file of files) {
    const url=new URL(file,root),text=fs.readFileSync(url,'utf8');
    for(const match of text.matchAll(/["'](\.\.?\/[^"'\s]+\.(?:js|css)(?:\?[^"'\s]*)?)["']/g)) {
      const dependency=new URL(match[1],url);
      assert.equal(dependency.searchParams.get('v'),version,`${file}: ${match[1]}`);
      dependency.search='';assert.ok(fs.existsSync(dependency),match[1]);references++;
    }
  }
  assert.ok(references>40);
  assert.ok(fs.readFileSync(new URL('index.html',root),'utf8').includes(`>v${version}</span>`));
});
