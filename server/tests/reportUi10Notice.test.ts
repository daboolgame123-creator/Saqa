/** Phase23 UI-10: safe report status notice, no API/data dependency. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReportsAvailabilityNotice, ReportsView } from '../../src/components/views/ReportsView';

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
