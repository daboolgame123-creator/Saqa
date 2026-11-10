/** Phase 23 pilot — official personnel writes are server-validated and confirmed. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { Employee } from '../../src/core/models/employee';
import { buildPilotEmployeeBody } from '../../src/services/pilotEmployeePayload';
import { createEmployeeBody, updateEmployeeBody, changeEmployeeStatusBody } from '../src/api/validation/employeeValidators';
import { toEmployee } from '../../src/api/mappers';
import { pilotSaveFailureMessage } from '../../src/api/pilotSaveFeedback';

const employee:Employee={
  id:'11111111-1111-4111-8111-111111111111',
  name:'موظف اصطناعي تجريبي', title:'باحث', department:'قسم افتراضي',
  badgeNumber:'TEST-100', joinedDate:'2026-10-01',
  category:'باحث', academicDegree:'دكتوراه', specialization:'دراسات',
  userId:'33333333-3333-4333-8333-333333333333',
  status:'former',
};

test('personnel CREATE body matches real server validator and never sends ID/status/account linkage',()=>{
  const body=buildPilotEmployeeBody(employee);
  assert.equal(createEmployeeBody(body).kind,'valid');
  assert.equal(updateEmployeeBody(body).kind,'valid');
  for(const key of ['id','status','userId','createdAt','updatedAt','serviceEndReason']){
    assert.ok(!(key in body),`untrusted field ${key} must not cross API`);
  }
  assert.equal(body.badgeNumber,'TEST-100');
  assert.equal(createEmployeeBody({...employee}).kind,'invalid');
  assert.equal(updateEmployeeBody({...employee}).kind,'invalid');
});

test('personnel payload omits empty optional absent fields and rejects missing required identity',()=>{
  const payload=buildPilotEmployeeBody({
    name:'شخص تجريبي',title:'منتسب',department:'قسم تجريبي',
  });
  assert.equal(createEmployeeBody(payload).kind,'valid');
  assert.ok(!('badgeNumber' in payload));
  assert.throws(()=>buildPilotEmployeeBody({name:' ',title:'منتسب',department:'اختباري'}),/INVALID_EMPLOYEE/);
});

test('former transition requires approved reason; mapping retains authoritative former state',()=>{
  assert.equal(changeEmployeeStatusBody({status:'former'}).kind,'invalid');
  assert.equal(changeEmployeeStatusBody({status:'former',serviceEndReason:'تقاعد'}).kind,'valid');
  const mapped=toEmployee({
    id:employee.id,name:employee.name,title:employee.title,department:employee.department,
    status:'former',category:'باحث',
  });
  assert.equal(mapped.status,'former');
  assert.equal(mapped.id,employee.id);
});

test('App official personnel writes await server reply and preserve historical transaction relationships',()=>{
  const app=readFileSync(new URL('../../src/App.tsx',import.meta.url),'utf8');
  assert.match(app,/const created = await getDataAdapter\(\)\.createEmployee\(payload\)/);
  assert.match(app,/const saved = await getDataAdapter\(\)\.updateEmployee\(updatedEmp\.id, payload\)/);
  assert.match(app,/const moved = await getDataAdapter\(\)\.changeEmployeeStatus\(empId, \{/);
  assert.match(app,/if \(!moved \|\| moved\.id !== empId \|\| moved\.status !== 'former'\)/);
  assert.match(app,/No unlinking: past books must still refer to this employee/);
  const officialStart=app.indexOf("const handleDeleteEmployee =");
  const officialEnd=app.indexOf("  // Unread count",officialStart);
  const code=app.slice(officialStart,officialEnd);
  assert.doesNotMatch(code,/removeForEmployee|employeeIds\.filter/);
});

test('personnel modal actions await before closing; no official multi-name writes',()=>{
  const ui=readFileSync(new URL('../../src/components/views/EmployeesView.tsx',import.meta.url),'utf8');
  assert.match(ui,/officialMode && names\.length !== 1/);
  assert.match(ui,/await onAddEmployee\(item\)/);
  assert.match(ui,/await action\(\)/);
  assert.match(ui,/if \(success\) setEditingEmployee\(null\)/);
  assert.match(ui,/if \(success\) \{\s*setDeleteConfirmEmployee\(null\)/);
  assert.match(ui,/disabled=\{serviceEndReason === '' \|\| personnelActionBusy\}/);
  assert.match(ui,/personnelActionError && <p role="alert"/);
  assert.match(ui,/موظف سابق — السجل محفوظ/);
  assert.match(pilotSaveFailureMessage(new Error('INVALID_EMPLOYEE')),/غير مكتملة/);
});
