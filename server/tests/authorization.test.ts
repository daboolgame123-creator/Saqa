/**
 * اختبارات Phase 12 — مصفوفة الصلاحيات ووسيط الفرض (وحدة).
 *
 * المرجع: `ALSQAYA_PLAN.md` §28 (الأدوار وعائلات الصلاحيات) و§10
 * (من يملك ماذا: §10.1 المسؤول، §10.2 المدير، §10.3 المنتسب).
 *
 * هذه اختبارات وحدة سريعة؛ الاختبار الإلزامي المصفوفي (Role × عملية
 * حساسة × رفض مباشر عبر API) في `tests/api/rbac.test.ts`.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Request, Response } from 'express';
import {
  PERMISSION_VALUES,
  PermissionDeniedError,
  ROLE_PERMISSIONS,
  ROLE_VALUES,
  isPlanRole,
  requirePermission,
  requireResourcePermission,
  requiredPermissionForMethod,
  roleHasPermission,
  type Permission,
} from '../src/authorization';
import { AuthenticationRequiredError } from '../src/auth/authErrors';

/** يشغّل الوسيط ويجمع الخطأ الذي وصل إلى next (أو null عند السماح). */
function runMiddleware(
  handler: ReturnType<typeof requirePermission>,
  req: object,
): unknown {
  let outcome: unknown = 'NOT_CALLED';
  handler(
    req as Request,
    {} as Response,
    (error?: unknown): void => {
      outcome = error ?? null;
    },
  );
  return outcome;
}

/** هوية جلسة صغرى كما يكتفي بها الوسيط (يقرأ role فقط). */
function identityWithRole(role: string | undefined): object {
  return role === undefined ? {} : { auth: { role } };
}

describe('Phase 12 — مصفوفة الصلاحيات (§28 و§10)', () => {
  test('عائلات الصلاحيات هي عشر عائلات الخطة بالضبط', () => {
    assert.deepEqual(
      [...PERMISSION_VALUES].sort(),
      [
        'approve_request',
        'backup_restore',
        'create',
        'delete_archive',
        'manage_accounts',
        'manage_availability',
        'manage_security',
        'update',
        'view',
        'view_audit_logs',
      ].sort(),
      '§28 يحدد عشر عائلات — لا زيادة ولا نقصان',
    );
  });

  test('أدوار الخطة ثلاثة: admin/responsible Saqa · director · employee', () => {
    assert.deepEqual([...ROLE_VALUES], ['admin', 'director', 'employee']);
    assert.deepEqual(Object.keys(ROLE_PERMISSIONS).sort(), ['admin', 'director', 'employee']);
  });

  test('admin يملك كل العائلات ما عدا approve_request (§10.1)', () => {
    // §10.1 تمنح المسؤول إدارة المنتسبين والكتب والمرفقات والإتاحة والحالات
    // والحسابات، رؤية سجلات الدخول، البيانات الوظيفية، النسخ الاحتياطي،
    // ومتابعة Audit Log. موافقة الطلبات ليست ضمن قائمته ولا نضيفها له.
    const expected = PERMISSION_VALUES.filter((p) => p !== 'approve_request');
    assert.deepEqual([...ROLE_PERMISSIONS.admin].sort(), [...expected].sort());
    assert.equal(roleHasPermission('admin', 'approve_request'), false);
  });

  test('director: رؤية + موافقة الطلب فقط، ونفيات §10.2 صريحة (§10.2)', () => {
    assert.deepEqual([...ROLE_PERMISSIONS.director].sort(), ['approve_request', 'view']);
    // «لا يستطيع» الصريحة:
    for (const denied of [
      'create',
      'update',
      'delete_archive', // إنشاء/تعديل/حذف كتاب كبيانات أرشيفية
      'manage_accounts', // إدارة حسابات المستخدمين + الحظر والتجميد
      'manage_security', // رؤية سجلات الدخول الأمنية
      'manage_availability', // إدارة إتاحة الكتب
    ] as Permission[]) {
      assert.equal(
        roleHasPermission('director', denied),
        false,
        `المدير يجب ألا يملك ${denied}`,
      );
    }
  });

  test('employee: رؤية فقط — لا كتابات ولا حسابات ولا أمن (§10.3)', () => {
    assert.deepEqual([...ROLE_PERMISSIONS.employee], ['view']);
    for (const denied of [
      'create',
      'update',
      'delete_archive',
      'manage_accounts',
      'manage_security',
      'manage_availability',
      'view_audit_logs',
      'backup_restore',
      'approve_request',
    ] as Permission[]) {
      assert.equal(roleHasPermission('employee', denied), false);
    }
  });
});


describe('Phase 12 — قواعد التفويض الصغرى', () => {
  test('Fail-closed: أي دور خارج مصفوفة الخطة لا يملك شيئاً', () => {
    // `archivist` قيمة موروثة من قيد CHECK في Phase 9 والمواصفة الحالية
    // (§28) لا تعترف بها — لا تُحذف من البيانات ولا تُمنح صلاحية مخترعة.
    for (const unknownRole of ['archivist', 'root', 'Admin', '', null, undefined]) {
      assert.equal(isPlanRole(unknownRole as string | null | undefined), false);
      for (const permission of PERMISSION_VALUES) {
        assert.equal(
          roleHasPermission(unknownRole as string | null | undefined, permission),
          false,
          `الدور «${String(unknownRole)}» يجب ألا يملك ${permission}`,
        );
      }
    }
  });

  test('خريطة method ← عائلة لموارد /api/*', () => {
    assert.equal(requiredPermissionForMethod('GET'), 'view');
    assert.equal(requiredPermissionForMethod('HEAD'), 'view');
    assert.equal(requiredPermissionForMethod('POST'), 'create');
    assert.equal(requiredPermissionForMethod('PUT'), 'update');
    assert.equal(requiredPermissionForMethod('PATCH'), 'update');
    assert.equal(requiredPermissionForMethod('DELETE'), 'delete_archive');
    assert.equal(requiredPermissionForMethod('TRACE'), null);
  });
});

describe('Phase 12 — وسيط الفرض: 401 للهوية و403 للصلاحية', () => {
  test('بلا هوية على الطلب ⇒ AuthenticationRequiredError (401) لا 403', () => {
    const outcome = runMiddleware(requirePermission('manage_accounts'), identityWithRole(undefined));
    assert.ok(outcome instanceof AuthenticationRequiredError);
    assert.equal((outcome as AuthenticationRequiredError).statusCode, 401);
  });

  test('هوية بدور لا يملك العائلة ⇒ PermissionDeniedError (403)', () => {
    const outcome = runMiddleware(requirePermission('manage_accounts'), identityWithRole('employee'));
    assert.ok(outcome instanceof PermissionDeniedError);
    assert.equal((outcome as PermissionDeniedError).statusCode, 403);
    assert.equal((outcome as PermissionDeniedError).code, 'PERMISSION_DENIED');
    assert.equal((outcome as PermissionDeniedError).isOperational, true);
  });

  test('هوية بدور يملك العائلة ⇒ السماح (next بلا خطأ)', () => {
    const outcome = runMiddleware(requirePermission('manage_accounts'), identityWithRole('admin'));
    assert.equal(outcome, null);
  });

  test('requireResourcePermission يطبّق خريطة الـmethod بالدور نفسه', () => {
    const handler = requireResourcePermission();
    // employee: قراءة مسموحة، كتابة مرفوضة.
    assert.equal(runMiddleware(handler, { method: 'GET', ...identityWithRole('employee') }), null);
    assert.ok(
      runMiddleware(handler, { method: 'POST', ...identityWithRole('employee') }) instanceof
        PermissionDeniedError,
    );
    // director: كتابة مرفوضة (§10.2).
    assert.ok(
      runMiddleware(handler, { method: 'PATCH', ...identityWithRole('director') }) instanceof
        PermissionDeniedError,
    );
    // admin: كتابة مسموحة (§10.1).
    assert.equal(runMiddleware(handler, { method: 'POST', ...identityWithRole('admin') }), null);
    assert.equal(runMiddleware(handler, { method: 'DELETE', ...identityWithRole('admin') }), null);
    // method خارج الخريطة لا يُمنع (لا عائلة ولا مُنفِّذ له).
    assert.equal(runMiddleware(handler, { method: 'TRACE', ...identityWithRole('employee') }), null);
  });
});
