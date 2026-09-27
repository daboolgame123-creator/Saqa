/**
 * DTOs المصادقة (Phase 11) — أشكال المدخلات والمخرجات عند HTTP.
 *
 * مبدأ: DTO لا يحمل أي سرّ إلا في المخرجات التي تُعرض عمداً
 * (`temporarySecret`, `secret`) وفي `sessionToken` الذي يُسلَّم مرة واحدة.
 * لا يُعاد أي سرّ مجزّأ ولا `code_hash` ولا مفتاح.
 */

/** جسم طلب رمز التسجيل: رقم الباج + الهاتف المسجَّل (§11.1). */
export interface RegistrationOtpDto {
  badgeNumber: string;
  phone: string;
}

/** جسم طلب رمز الاستعادة: رقم الهاتف (§11.6). */
export interface RecoveryOtpDto {
  phone: string;
}

/** جسم التحقق من الرمز مع إنشاء/استبدال الرمز السري. */
export interface VerifyOtpDto {
  phone: string;
  code: string;
  secret: string;
}

/** جسم الدخول المعتاد: رقم الباج أو الهاتف + الرمز (§11.2). */
export interface LoginDto {
  identifier: string;
  secret: string;
}

/** جسم تغيير الرمز السري للحساب نفسه. */
export interface ChangeSecretDto {
  currentSecret: string;
  newSecret: string;
}

/** جسم مسار إدارة حساب: معرّف الحساب الهدف. */
export interface AccountTargetDto {
  userId: string;
}

/** ملخّص الحساب في المخرجات — لا سرّ ولا تجزئة. */
export interface AccountDto {
  id: string;
  employeeId: string | null;
  username: string;
  displayName: string;
  role: string;
  status: string;
  mustChangeSecret: boolean;
}

/** مخرجات تسجيل OTP: محايدة بالكامل (لا تكشف نجاح المطابقة). */
export interface OtpAcceptedDto {
  accepted: true;
}

/** مخرجات إنشاء الحساب بعد التفعيل. */
export interface AccountResponseDto {
  account: AccountDto;
}

/** مخرجات الدخول: الحساب + رفة الجلسة + علامة تغيير الرمز. */
export interface LoginResponseDto {
  account: AccountDto;
  sessionToken: string;
  mustChangeSecret: boolean;
}

/** مخرجات إعادة الضبط الإدارية: الرمز المؤقت الجديد. */
export interface AdminResetResponseDto {
  account: AccountDto;
  temporarySecret: string;
}

/** مخرجات كشف الرمز السري (§11.8). */
export interface RevealSecretResponseDto {
  account: AccountDto;
  secret: string;
}
