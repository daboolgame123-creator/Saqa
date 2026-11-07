/** Deployment-owned calendar zone for report registration/acknowledgement day filters.
 *
 * This value is NEVER a query parameter. Absence deliberately preserves the
 * ReportDateZoneRequiredError guard for date-filtered reports.
 * An invalid explicit setting must not silently fall back to UTC or host TZ.
 */
export function resolveInstitutionReportDateTimeZone(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const zone = raw.trim();
  if (!zone || zone.length > 128 || !/^[A-Za-z0-9_+/-]+$/.test(zone)) {
    throw new Error('Invalid ALSQAYA_REPORT_TIME_ZONE configuration');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(0);
  } catch {
    throw new Error('Invalid ALSQAYA_REPORT_TIME_ZONE configuration');
  }
  return zone;
}
