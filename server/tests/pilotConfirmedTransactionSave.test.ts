/** Phase 23 official pilot create/edit — strict DTO and truthful save UI. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Transaction } from '../../src/core/models/transaction';
import { buildPilotTransactionCreatePayload } from '../../src/services/pilotTransactionCreatePayload';
import { createTransactionBody } from '../src/api/validation/transactionValidators';
import { NewTransactionModal } from '../../src/components/modals/NewTransactionModal';
import { ArchivistEditorModal } from '../../src/components/modals/ArchivistEditorModal';
import { pilotSaveFailureMessage } from '../../src/api/pilotSaveFeedback';
import { ApiError } from '../../src/api/apiError';

const employeeId = '22222222-2222-4222-8222-222222222222';
const transaction: Transaction = {
  id: 'temporary-client-ID', version: 1, number: '٢٠٠/و', sequence: '٠١',
  date: '2026-11-07', month: '2026-11', direction: 'وارد',
  category: 'إدارية', subType: 'مراسلات', entity: 'جهة اصطناعية',
  subject: 'كتاب إنشاء تجريبي', status: 'قيد المراجعة',
  employeeIds: [employeeId], employeeName: 'موظف اصطناعي',
  visibility: 'SpecificEmployees', priority: 'عادي',
  notes: 'ملاحظات', attachments: [], isRead: false,
  readAt: 'temporary local read', createdAt: '2026-11-07T00:00:00Z',
};

test('pilot CREATE payload is accepted by actual server validator and excludes every local/system field', () => {
  const payload = buildPilotTransactionCreatePayload(transaction);
  const body = payload as Record<string, unknown>;
  const outcome = createTransactionBody(payload);
  assert.equal(outcome.kind, 'valid', JSON.stringify(outcome));
  assert.deepEqual(body.employeeLinks, [{employeeId}]);
  assert.equal(body.subject, transaction.subject);
  for (const name of ['id','month','version','createdAt','isRead','readAt','employeeIds','updatedAt','importedAt']) {
    assert.ok(!(name in body), `forbidden field ${name} must not be sent`);
  }
  assert.equal((body.attachments as unknown[]|undefined)?.length??0,0);
});

test('old spread CREATE would be rejected by the same server validator', () => {
  const legacy = {...transaction,employeeLinks:[{employeeId}]};
  assert.equal(createTransactionBody(legacy).kind,'invalid');
});

test('pilot refuses metadata-only attachments, daily form and invalid employee IDs before POST', () => {
  const file = {
    id:'att-synthetic', name:'لا_بايتات.pdf', type:'ملحق',fileSize:'1 MB', uploadDate:'2026-11-07',
  } as Transaction['attachments'][number];
  assert.throws(()=>buildPilotTransactionCreatePayload({...transaction,attachments:[file]}),
    /OFFICIAL_ATTACHMENTS_REQUIRE_UPLOAD/);
  assert.throws(()=>buildPilotTransactionCreatePayload({...transaction,isDailySituation:true}),
    /OFFICIAL_DAILY_CREATION_NOT_ATOMIC/);
  assert.throws(()=>buildPilotTransactionCreatePayload({...transaction,employeeIds:['']}),
    /INVALID_EMPLOYEE_LINK/);
});

test('pilot create payload deduplicates employee relations and preserves exact IDs', () => {
  const payload = buildPilotTransactionCreatePayload({...transaction,employeeIds:[employeeId,employeeId]});
  assert.deepEqual(payload.employeeLinks,[{employeeId}]);
});

test('API failures have safe contextual text without leaking server messages', () => {
  const leaked = 'sensitive SQL trace synthetic';
  const messages = [400,401,403,404,409,503].map((status) =>
    pilotSaveFailureMessage(new ApiError(status,{error:{code:'ERROR',message:leaked}})),
  );
  for (const message of messages) {
    assert.ok(message.length>15);
    assert.doesNotMatch(message,/sensitive SQL trace/i);
  }
  assert.match(messages[4]??'',/تغيّر السجل/);
  assert.match(pilotSaveFailureMessage(new Error('OFFICIAL_ATTACHMENTS_REQUIRE_UPLOAD')),/مرفق/);
});

test('official create form has no synthetic attachment, upload action or daily form shortcut', () => {
  const html=renderToStaticMarkup(React.createElement(NewTransactionModal,{
    isOpen:true,officialMode:true,onClose:()=>{},onAddTransaction:()=>{},employees:[],
  }));
  assert.match(html,/لا توجد مرفقات مضافة حالياً/);
  assert.doesNotMatch(html,/id="mode-daily-situation"|رفع كتاب \/ ملحق ممسوح/);
  assert.match(html,/سيُحفظ الكتاب في الخادم بعد تأكيده/);
});

test('official editor retains current attachments as read-only and does not claim save on first render', () => {
  const html=renderToStaticMarkup(React.createElement(ArchivistEditorModal,{
    isOpen:true,transaction,officialMode:true,onClose:()=>{},
    onSaveTransaction:()=>{},employees:[],allEmployees:[],
  }));
  assert.match(html,/تعديل بيانات الكتاب يُحفظ في الخادم بعد التأكيد/);
  assert.match(html,/حفظ بيانات الكتاب/);
  assert.doesNotMatch(html,/تم حفظ كافة التعديلات والمرفقات بنجاح/);
  assert.match(html,/id="btn-upload-new-attachment"[^>]*disabled/);
});

test('App official CRUD waits for server response and never changes UI state from a failed request', () => {
  const app=readFileSync(new URL('../../src/App.tsx',import.meta.url),'utf8');
  const newModal=readFileSync(new URL('../../src/components/modals/NewTransactionModal.tsx',import.meta.url),'utf8');
  const editModal=readFileSync(new URL('../../src/components/modals/ArchivistEditorModal.tsx',import.meta.url),'utf8');
  assert.match(app,/buildPilotTransactionCreatePayload\(normalized\)/);
  assert.match(app,/const created = await getDataAdapter\(\)\.createTransaction\(payload\)/);
  assert.match(app,/const saved = await getDataAdapter\(\)\.updateTransaction\(normalized\.id, patch\)/);
  assert.match(app,/saved.version <= normalized.version/);
  assert.match(app,/delete patch\.attachments/);
  assert.match(app,/delete patch\.isRead/);
  assert.match(app,/delete patch\.readAt/);
  assert.match(app,/onSaveTransaction=\{isLocalDemo \? handleSaveTransaction : undefined\}/);
  assert.match(app,/allowCreate=\{isLocalDemo\}/);
  assert.match(newModal,/await onAddTransaction\(newTr\)/);
  assert.match(newModal,/setSaveError\(pilotSaveFailureMessage\(error\)\)/);
  assert.match(editModal,/await onSaveTransaction\(updatedTransaction\)/);
  assert.match(editModal,/setSaveError\(pilotSaveFailureMessage\(error\)\)/);
  assert.match(editModal,/disabled=\{officialMode \|\| isSaving\}/);
});
