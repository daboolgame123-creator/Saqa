/** P1k: fail if the offline Chromium PDF probe loses or duplicates rows.
 * Uses only generated synthetic PDF text from the isolated CI job.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

const dir=process.env.ALSQAYA_PREVIEW_DIR;
if (!dir) throw new Error('ALSQAYA_PREVIEW_DIR is required');
const controls=/[\u202a-\u202e\u2066-\u2069]/gu;
for (const prefix of ['chromium-', 'container-chromium-']) {
for (const {name,expected,marker} of [
  {name:'details',expected:85,marker:'سجل'},
  {name:'ack',expected:38,marker:'إقرار'},
]) {
  const content=(await readFile(join(dir,prefix+name+'-text.txt'),'utf8'))
    .replace(controls,'');
  const matches=[...content.matchAll(new RegExp(marker+' رقم\\s+(\\d+)','gu'))]
    .map(match=>Number(match[1]));
  assert.deepEqual(matches,Array.from({length:expected},(_,i)=>i+1),
    name+': PDF must contain every record ID exactly once in order');
  assert.match(content,/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/u,
    name+': ISO timestamps must remain present');
  console.log(JSON.stringify({probe:prefix+name,records:matches.length,ordered:true}));
}
}
