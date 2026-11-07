/** Pilot startup: prevent masked API errors from displaying local demo data. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { IDataAdapter } from '../../src/core/interfaces/dataAdapter';
import { ApiError } from '../../src/api/apiError';
import { getDataAdapter, hasFallenBackToLocal, primeDataSource, resetDataAdapter, setDataAdapter } from '../../src/api';
import { LocalDataAdapter } from '../../src/api/localDataAdapter';

function apiFailure(status:number,code:string) {
  let calls = 0;
  const expected = new ApiError(status,{error:{code,message:'Private backend error details'}});
  const adapter = {
    kind:'api',
    async loadEmployees() {
      calls++;
      throw expected;
    },
  } as unknown as IDataAdapter;
  return {adapter,expected,calls:()=>calls};
}

test('pilot: authorization, network and backend failures never silently switch from API to localStorage', async()=>{
  for(const [status,code] of [[401,'AUTH_REQUIRED'],[403,'PERMISSION_DENIED'],[0,'NETWORK_ERROR'],[408,'REQUEST_TIMEOUT'],[500,'INTERNAL_ERROR']] as const) {
    const fixture=apiFailure(status,code);
    setDataAdapter(fixture.adapter);
    try {
      await assert.rejects(primeDataSource(),error=>error===fixture.expected,code);
      assert.equal(getDataAdapter(),fixture.adapter,'API adapter must remain selected');
      assert.equal(hasFallenBackToLocal(),false,'silent fallback is forbidden');
      await assert.rejects(primeDataSource(),error=>error===fixture.expected);
      assert.equal(fixture.calls(),2,'a retry reuses the selected API rather than local demo');
    } finally {
      resetDataAdapter();
    }
  }
});

test('pilot: explicit local development adapter works without any API call',async()=>{
  const local=new LocalDataAdapter();
  setDataAdapter(local);
  try {
    assert.equal(await primeDataSource(),local);
    assert.equal(getDataAdapter().kind,'local');
    assert.equal(hasFallenBackToLocal(),false,'explicit local mode is not fallback');
  } finally {
    resetDataAdapter();
  }
});

test('pilot: successful API bootstrap preserves the original API adapter',async()=>{
  let calls=0;
  const adapter={kind:'api',async loadEmployees(){calls++;return []}} as unknown as IDataAdapter;
  setDataAdapter(adapter);
  try{
    assert.equal(await primeDataSource(),adapter);
    assert.equal(calls,1);
    assert.equal(getDataAdapter(),adapter);
  }finally{resetDataAdapter()}
});

test('pilot: startup error is a blocking UI state, not an empty successfully loaded app',()=>{
  const app=readFileSync(new URL('../../src/App.tsx',import.meta.url),'utf8');
  assert.match(app,/setStartupError\(message\)/);
  assert.match(app,/if \(startupError !== null\) \{[\s\S]*role="alert"/);
  const errorIndex=app.indexOf('if (startupError !== null) {');
  const mainIndex=app.indexOf('{/* App Header */}');
  assert.ok(errorIndex>=0&&mainIndex>errorIndex,'error view must return before app shell');
  assert.match(app,/يلزم تسجيل الدخول أولًا/);
  assert.match(app,/لم يتم الانتقال إلى التخزين المحلي/);
  const source=readFileSync(new URL('../../src/api/index.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/catch\s*\([^)]*\)\s*\{[\s\S]*?new LocalDataAdapter\(/);
});
