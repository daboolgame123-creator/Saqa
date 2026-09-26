/**
 * أدوات إنشاء بيانات لمخزون اختبارات الـAPI (Phase 10).
 *
 * دوال معالجات HTTP صغيرة تُعيد جسم الاستجابة كاملاً (رمز + جسم) حتى
 * يستطيع كل اختبار أن يؤكد الرمز(body) وينفّذ التأكيد على البيانات
 * في موضعه — بدل دوال ح.Streamer تخفي رمز الحالة.
 */
import assert from 'node:assert/strict';
import type { ApiTestContext } from './apiTestHelpers';
import {
  getJson,
  patchJson,
  postJson,
  type JsonResponse,
} from './apiTestHelpers';

/** بنية موظف كما يعيدها الـAPI. */
export interface EmployeeBody {
  id: string;
  name: string;
  title: string;
  department: string;
  status: string;
  badgeNumber?: string;
  createdAt: string;
}

/** بنية كتاب كما يعيدها الـAPI. */
export interface TransactionBody {
  id: string;
  number: string;
  sequence: string;
  date: string;
  month: string;
  status: string;
  employeeIds: string[];
  attachments: { id: string; name: string }[];
}

/** ينشئ موظفاً عبر الـAPI ويؤكد 201 مع رسالة فشل واضحة. */
export async function newEmployee(
  context: ApiTestContext,
  overrides: Record<string, unknown> = {},
): Promise<EmployeeBody> {
  const response = await postJson<EmployeeBody>(context.baseUrl, '/api/employees', {
    name: 'منتسب اختبار',
    title: 'معاون إداري',
    department: 'الشؤون الإدارية',
    ...overrides,
  });
  assert.equal(response.status, 201, `فشل إنشاء الموظف: ${JSON.stringify(response.body)}`);
  return response.body;
}

/** ينشئ كتاباً عبر الـAPI ويؤكد 201. */
export async function newTransaction(
  context: ApiTestContext,
  overrides: Record<string, unknown> = {},
): Promise<TransactionBody> {
  const response = await postJson<TransactionBody>(context.baseUrl, '/api/transactions', {
    number: '١٠٠/ص',
    sequence: '٩٠٠',
    date: '2026-09-10',
    direction: 'صادر',
    category: 'إدارية',
    subType: 'تعميم',
    entity: 'إدارة المركز',
    subject: 'كتاب اختبار',
    status: 'قيد المراجعة',
    ...overrides,
  });
  assert.equal(response.status, 201, `فشل إنشاء الكتاب: ${JSON.stringify(response.body)}`);
  return response.body;
}

/** يقرأ مورداً واحداً ويتأكد من 200. */
export async function readOne<T>(
  context: ApiTestContext,
  path: string,
): Promise<T> {
  const response = await getJson<T>(context.baseUrl, path);
  assert.equal(response.status, 200, `فشل القراءة ${path}: ${JSON.stringify(response.body)}`);
  return response.body;
}

/** يقرأ قائمة مورد. */
export async function readMany<T>(
  context: ApiTestContext,
  path: string,
): Promise<T[]> {
  const response = await getJson<T[]>(context.baseUrl, path);
  assert.equal(response.status, 200, `فشل قراءة القائمة ${path}`);
  return response.body;
}

/** يحدّث مورداً جزئياً ويتأكد من 200. */
export async function updateOne<T>(
  context: ApiTestContext,
  path: string,
  patch: unknown,
): Promise<T> {
  const response = await patchJson<T>(context.baseUrl, path, patch);
  assert.equal(response.status, 200, `فشل التعديل ${path}: ${JSON.stringify(response.body)}`);
  return response.body;
}

/** ينشئ سجلاً subordinate عبر مساره (إجازة/زمنية/تكليف/دورة). */
export async function newPersonnelRecord<T>(
  context: ApiTestContext,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await postJson<T>(context.baseUrl, path, body);
  assert.equal(response.status, 201, `فشل إنشاء ${path}: ${JSON.stringify(response.body)}`);
  return response.body;
}

export type { JsonResponse };
