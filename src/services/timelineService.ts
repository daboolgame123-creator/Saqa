/**
 * TimelineService — طبقة تجميع الأحداث الزمنية من مصادرها الأصلية (PHASE 7).
 *
 * القواعد المعمارية الملتزم بها (ALSQAYA_PLAN.md — Phase 7):
 * - Timeline مشتق من البيانات الأصلية عند الطلب، لا يُخزن نسخاً مستقلة.
 * - لا saveTimeline / loadTimeline / Timeline storage / قاعدة بيانات أو localStorage خاصة.
 * - لا نظام صلاحيات تفصيلي للـTimeline (يُعالج في مرحلة Access Scope لاحقاً).
 * - المصادر المعتمدة فقط: Leave, Time Permission, Assignment, Course, Transaction, Daily Situation.
 * - لا Appointment أو Transfer (ليست كيانات فعلية جاهزة).
 * - نطاق معاملات المنتسب يُمرَّر صراحةً عبر transactionIds (علاقة TransactionEmployee + الروابط القديمة
 *   الآمنة) أو يُشتق من المرآة employeeIds — لا مطابقة بالاسم النصي (Rule 7).
 * - مستقل عن React وlocalStorage — قابل للنقل إلى Backend لاحقاً دون إعادة تصميم.
 */
import type {
  EmployeeLeave,
  EmployeeTimePermission,
  EmployeeAssignment,
  EmployeeCourse,
  Transaction,
  DailySituationRecord,
  TimelineEntry,
  TimelineSourceType,
} from '../core/models';
import { TimelineMappers } from '../core/models/timeline';
import { PersonnelService } from './personnelService';
import { DailySituationService } from './dailySituationService';

/**
 * مفتاح مجموعة الأحداث التي لا تحمل تاريخاً صالحاً (مثلاً دورة مسجلة بلا تاريخ بداية).
 * لا تُحذف من العرض — تُعرض في مجموعة أخيرة «بدون تاريخ» بدل اختلاق تاريخ غير موجود.
 */
const UNKNOWN_PERIOD_KEY = 'unknown';

/** خيارات تصفية الخط الزمني */
export interface TimelineFilterOptions {
  /** تصفية حسب نوع المصدر */
  sourceTypes?: TimelineSourceType[];
  /** نطاق تاريخي: البداية (شاملة) */
  dateFrom?: string;
  /** نطاق تاريخي: النهاية (شاملة) */
  dateTo?: string;
  /** نص للبحث في العنوان/الوصف */
  searchText?: string;
  /** حد أقصى للنتائج */
  limit?: number;
}

/** نتيجة الخط الزمني مع بيانات تجميعية للعرض */
export interface TimelineResult {
  entries: TimelineEntry[];
  /** إحصائيات عدد الأحداث لكل نوع مصدر */
  countsBySource: Record<TimelineSourceType, number>;
  /** إجمالي الأحداث */
  totalCount: number;
}

/** تجميع زمني للأحداث (للواجهة: تجميع يوم/أسبوع/شهر) */
export interface TimelineGrouped {
  period: string;           // مفتاح التجميع (مثلاً: "2025-01", "2025-W03", "2025-01-15")
  periodLabel: string;      // تسمية للعرض
  entries: TimelineEntry[];
  count: number;
}

export class TimelineService {
  /**
   * بناء الخط الزمني لمنتسب واحد من جميع المصادر الأصلية.
   * لا يخزن شيئاً — يحسب عند الطلب ويرجع مصفوفة مرتبة تنازلياً (الأحدث أولاً).
   */
  static buildForEmployee(params: {
    employeeId: string;
    leaves: EmployeeLeave[];
    timePermissions: EmployeeTimePermission[];
    assignments: EmployeeAssignment[];
    courses: EmployeeCourse[];
    /**
     * معاملات الكتب/المعاملات التي تُفحص للربط بالمنتسب.
     * يمكن تمرير قائمة كاملة أو قائمة مصفّاة مسبقاً من الطبقة المستدعية.
     */
    transactions: Transaction[];
    /**
     * معرفات المعاملات المرتبطة بهذا المنتسب (من علاقة TransactionEmployee أو المرآة employeeIds).
     * عند تمريرها فهي المصدر الحصري لنطاق المعاملات — مع الحفاظ على الرجوع الآمن للروابط القديمة
     * التي يحسبها المستدعي (Rule 3). عند عدم تمريرها يُستخدم employeeIds على المعاملة (Rule 7).
     */
    transactionIds?: string[];
    dailySituations: DailySituationRecord[];
    filter?: TimelineFilterOptions;
  }): TimelineResult {
    const {
      employeeId,
      leaves,
      timePermissions,
      assignments,
      courses,
      transactions,
      transactionIds,
      dailySituations,
      filter,
    } = params;

    // 1) جمع الأحداث من كل مصدر
    const entries: TimelineEntry[] = [];

    // Leaves
    const employeeLeaves = PersonnelService.getByEmployee(leaves, employeeId);
    entries.push(...employeeLeaves.map(TimelineMappers.fromLeave));

    // Time Permissions
    const employeeTimePermissions = PersonnelService.getByEmployee(timePermissions, employeeId);
    entries.push(...employeeTimePermissions.map(TimelineMappers.fromTimePermission));

    // Assignments
    const employeeAssignments = PersonnelService.getByEmployee(assignments, employeeId);
    entries.push(...employeeAssignments.map(TimelineMappers.fromAssignment));

    // Courses
    const employeeCourses = PersonnelService.getByEmployee(courses, employeeId);
    entries.push(...employeeCourses.map(TimelineMappers.fromCourse));

    // Transactions — عبر نطاق المعاملات المرتبط بالمنتسب:
    // 1) transactionIds إن مرّرها المستدعي (يشمل علاقة TransactionEmployee والروابط القديمة الآمنة)،
    // 2) وإلا المرآة employeeIds على المعاملة (Rule 7).
    // لا مطابقة بالاسم النصي هنا — الربط بالمعرّف فقط (Rule 7).
    const scopedTransactions = transactionIds
      ? transactions.filter((tr) => transactionIds.includes(tr.id))
      : transactions.filter((tr) => tr.employeeIds?.includes(employeeId) === true);
    entries.push(...scopedTransactions.map((tr) => TimelineMappers.fromTransaction(tr, employeeId)));

    // Daily Situations
    const employeeDailySituations = DailySituationService.getByEmployee(dailySituations, employeeId);
    entries.push(...employeeDailySituations.map(TimelineMappers.fromDailySituation));

    // 2) تطبيق الفلاتر
    let filtered = this.applyFilter(entries, filter);

    // 3) ترتيب تنازلياً (الأحدث أولاً)
    filtered.sort((a, b) => {
      // فرز أساسي بالتاريخ
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      // كسر التعادل: endDate إذا وجد
      if (a.endDate && b.endDate) return b.endDate.localeCompare(a.endDate);
      if (a.endDate) return -1;
      if (b.endDate) return 1;
      // ثم بـ id للاستقرار
      return b.id.localeCompare(a.id);
    });

    // 4) حد أقصى
    if (filter?.limit && filter.limit > 0) {
      filtered = filtered.slice(0, filter.limit);
    }

    // 5) إحصائيات
    const countsBySource = this.computeCountsBySource(entries);

    return {
      entries: filtered,
      countsBySource,
      totalCount: entries.length,
    };
  }

  /**
   * تطبيق الفلاتر على قائمة الأحداث
   */
  private static applyFilter(entries: TimelineEntry[], filter?: TimelineFilterOptions): TimelineEntry[] {
    if (!filter) return entries;

    return entries.filter((entry) => {
      // تصفية بنوع المصدر
      if (filter.sourceTypes && filter.sourceTypes.length > 0) {
        if (!filter.sourceTypes.includes(entry.sourceType)) return false;
      }

      // نطاق تاريخي
      if (filter.dateFrom && entry.date < filter.dateFrom) return false;
      if (filter.dateTo && entry.date > filter.dateTo) return false;

      // بحث نصي
      if (filter.searchText) {
        const text = filter.searchText.toLowerCase();
        const titleMatch = entry.title.toLowerCase().includes(text);
        const descMatch = entry.description?.toLowerCase().includes(text) ?? false;
        if (!titleMatch && !descMatch) return false;
      }

      return true;
    });
  }

  /**
   * حساب عدد الأحداث لكل نوع مصدر
   */
  private static computeCountsBySource(entries: TimelineEntry[]): Record<TimelineSourceType, number> {
    const counts: Record<TimelineSourceType, number> = {
      leave: 0,
      timePermission: 0,
      assignment: 0,
      course: 0,
      transaction: 0,
      dailySituation: 0,
      appointment: 0,
      transfer: 0,
      other: 0,
    };

    for (const entry of entries) {
      if (counts[entry.sourceType] !== undefined) {
        counts[entry.sourceType]++;
      }
    }

    return counts;
  }

  /**
   * تجميع الأحداث زمنياً للعرض (يومي / أسبوعي / شهري)
   */
  static groupByPeriod(entries: TimelineEntry[], period: 'day' | 'week' | 'month'): TimelineGrouped[] {
    const groups = new Map<string, TimelineEntry[]>();

    for (const entry of entries) {
      const key = this.getPeriodKey(entry.date, period);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }

    // تحويل إلى مصفوفة مرتبة تنازلياً
    const result: TimelineGrouped[] = [];
    for (const [periodKey, periodEntries] of groups) {
      result.push({
        period: periodKey,
        periodLabel: this.formatPeriodLabel(periodKey, period),
        entries: periodEntries.sort((a, b) => b.date.localeCompare(a.date)),
        count: periodEntries.length,
      });
    }

    // ترتيب المجموعات تنازلياً — ومجموعة «بدون تاريخ» تبقى في النهاية دائماً
    result.sort((a, b) => {
      if (a.period === UNKNOWN_PERIOD_KEY) return 1;
      if (b.period === UNKNOWN_PERIOD_KEY) return -1;
      return b.period.localeCompare(a.period);
    });
    return result;
  }

  /**
   * استخراج مفتاح التجميع من التاريخ
   */
  private static getPeriodKey(date: string, period: 'day' | 'week' | 'month'): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return UNKNOWN_PERIOD_KEY;
    
    const [year, month, day] = date.split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));

    switch (period) {
      case 'day':
        return date; // YYYY-MM-DD
      case 'week': {
        // ISO week: YYYY-Www
        const weekStart = new Date(d);
        weekStart.setUTCDate(d.getUTCDate() - d.getUTCDay() + 1); // الاثنين
        const isoWeek = this.getISOWeek(weekStart);
        return `${weekStart.getUTCFullYear()}-W${isoWeek.toString().padStart(2, '0')}`;
      }
      case 'month':
        return `${year}-${month.toString().padStart(2, '0')}`; // YYYY-MM
      default:
        return date;
    }
  }

  /** حساب رقم الأسبوع ISO */
  private static getISOWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  /**
   * تنسيق تسمية الفترة للعرض
   */
  private static formatPeriodLabel(periodKey: string, period: 'day' | 'week' | 'month'): string {
    if (periodKey === UNKNOWN_PERIOD_KEY) {
      return 'بدون تاريخ';
    }
    if (period === 'day') {
      // YYYY-MM-DD -> تنسيق عربي
      const [y, m, d] = periodKey.split('-');
      return `${d}/${m}/${y}`;
    }
    if (period === 'week') {
      // YYYY-Www
      const [y, w] = periodKey.split('-W');
      return `أسبوع ${w}، ${y}`;
    }
    if (period === 'month') {
      const [y, m] = periodKey.split('-');
      const monthNames = [
        'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
      ];
      return `${monthNames[parseInt(m, 10) - 1]} ${y}`;
    }
    return periodKey;
  }

  /**
   * الحصول على تسميات أنواع المصادر بالعربية للعرض في الفلاتر
   */
  static getSourceTypeLabels(): Record<TimelineSourceType, string> {
    return {
      leave: 'إجازة',
      timePermission: 'إذن زمني',
      assignment: 'تكليف',
      course: 'دورة',
      transaction: 'كتاب/معاملة',
      dailySituation: 'موقف يومي',
      appointment: 'تعيين',
      transfer: 'نقل',
      other: 'أخرى',
    };
  }

  /**
   * الحصول على أيقونة/لون لكل نوع مصدر (للواجهة)
   */
  static getSourceTypeStyle(sourceType: TimelineSourceType): { icon: string; color: string; bgColor: string } {
    const styles: Record<TimelineSourceType, { icon: string; color: string; bgColor: string }> = {
      leave: { icon: '🏖️', color: 'text-blue-700 dark:text-blue-300', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
      timePermission: { icon: '⏰', color: 'text-amber-700 dark:text-amber-300', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
      assignment: { icon: '📋', color: 'text-purple-700 dark:text-purple-300', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
      course: { icon: '🎓', color: 'text-green-700 dark:text-green-300', bgColor: 'bg-green-100 dark:bg-green-900/30' },
      transaction: { icon: '📄', color: 'text-indigo-700 dark:text-indigo-300', bgColor: 'bg-indigo-100 dark:bg-indigo-900/30' },
      dailySituation: { icon: '📅', color: 'text-orange-700 dark:text-orange-300', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
      appointment: { icon: '👤', color: 'text-gray-700 dark:text-gray-300', bgColor: 'bg-gray-100 dark:bg-gray-900/30' },
      transfer: { icon: '🔄', color: 'text-teal-700 dark:text-teal-300', bgColor: 'bg-teal-100 dark:bg-teal-900/30' },
      other: { icon: '📌', color: 'text-stone-700 dark:text-stone-300', bgColor: 'bg-stone-100 dark:bg-stone-900/30' },
    };
    return styles[sourceType] ?? styles.other;
  }
}