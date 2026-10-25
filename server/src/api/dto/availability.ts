/**
 * DTOs إتاحة الكتاب للمنتسب (Phase 13 — §9.3/§9.4 و§29).
 *
 * `revokedAt` هو الفرق بين إتاحة سارية وسُحبت: السحب لا يحذف الصف (§9.3)،
 * فالغياب يعني «سارية» ووجوده يعني «انتهت صلاحيتها» — ولا حقل مشتق.
 */
export interface TransactionAvailabilityDto {
  id: string;
  transactionId: string;
  employeeId: string;
  grantedAt: string;
  /** يغيب ما دامت الإتاحة سارية، ويظهر بتاريخه بعد السحب (§9.3). */
  revokedAt?: string;
}

/** منح إتاحة لمنتسب واحد أو عدة منتسبين (§9.3). */
export interface GrantAvailabilityDto {
  employeeIds: string[];
}
