/** Phase23 UI-10: safe report status notice, no API/data dependency. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReportsAvailabilityNotice, ReportsCatalog, ReportsView } from '../../src/components/views/ReportsView';
import { scopedReportPreviewLinks } from '../../src/components/views/reportPreviewScope';

test('UI-10 does not misrepresent legacy monthly analytics as an authorized official report', () => {
  const html = renderToStaticMarkup(React.createElement(ReportsAvailabilityNotice));
  assert.match(html, /العرض الشهري الحالي/);
  assert.match(html, /ليس تقريرًا رسميًا معتمدًا/);
  assert.match(html, /الصلاحيات والفلاتر والإحصاءات على الخادم/);
  assert.match(html, /غير متاحين حاليًا/);
  assert.doesNotMatch(html, /\b[0-9]+\s+كتاب/);
  assert.match(renderToStaticMarkup(React.createElement(ReportsView)), /حالة التقارير/);
});

test('UI-10 embeds the notice alongside the existing monthly view and never enables report HTTP', () => {
  const app = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /currentView === 'report'[\s\S]*<ReportsAvailabilityNotice \/>[\s\S]*<MonthlyReportView/);
  const notice = readFileSync(new URL('../../src/components/views/ReportsView.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(notice, /\bfetch\s*\(|\baxios\b|\/api\/reports/);
});


test('UI-10 catalog lists exactly 11 official report types without enabled actions', () => {
  const html = renderToStaticMarkup(React.createElement(ReportsCatalog));
  const labels = [
    'التقرير الشهري','الكتب الواردة','الكتب الصادرة','الإجازات','الزمنيات',
    'الإعمامات والاطلاع','الطلبات','المنتسبون','الباحثون','الأساتذة','حالة الكتب',
  ];
  for (const label of labels) assert.ok(html.includes(label), label);
  assert.equal((html.match(/<li /g) ?? []).length, 11);
  assert.equal((html.match(/مصدر البيانات المستقل غير معتمد/g) ?? []).length, 2);
  assert.equal((html.match(/بانتظار الاعتماد والتفعيل/g) ?? []).length, 9);
  assert.doesNotMatch(html, /<(?:button|a|form|input|select)\b/i);
  assert.ok(!html.includes('تنزيل ملف منه الآن'));
  const app = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /currentView === 'report'[\s\S]*<ReportsAvailabilityNotice \/>[\s\S]*<ReportsCatalog \/>[\s\S]*<MonthlyReportView/);
  assert.match(renderToStaticMarkup(React.createElement(ReportsView)), /أنواع التقارير المخطط لها/);
});


test('UI-10 monthly preview receives only relations of visible books', () => {
  const visible = [{id:'visible-public'},{id:'visible-private-for-owner'}];
  const relations = [
    {transactionId:'hidden-foreign',employeeId:'foreign-person',relationshipType:'recipient'},
    {transactionId:'visible-public',employeeId:'owner-person',relationshipType:'recipient'},
    {transactionId:'hidden-admin',employeeId:'secret-person',relationshipType:'recipient'},
    {transactionId:'visible-private-for-owner',employeeId:'owner-person',relationshipType:'recipient'},
  ] as unknown as Parameters<typeof scopedReportPreviewLinks>[1];
  const inputLength = relations.length;
  const result = scopedReportPreviewLinks(visible,relations);
  assert.deepEqual(result.map(entry=>entry.transactionId),['visible-public','visible-private-for-owner']);
  assert.equal(relations.length,inputLength,'source collection remains unchanged');
  const serialized=JSON.stringify(result);
  for(const hidden of ['hidden-foreign','hidden-admin','foreign-person','secret-person']) {
    assert.ok(!serialized.includes(hidden),hidden);
  }
  const app=readFileSync(new URL('../../src/App.tsx',import.meta.url),'utf8');
  assert.match(app,/scopedReportPreviewLinks\(visibleTransactions, transactionEmployees\)/);
  assert.match(app,/<MonthlyReportView[\s\S]*transactionEmployees=\{visibleReportTransactionEmployees\}/);
});
