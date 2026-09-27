/**
 * خدمة الخط الزمني في طبقة الـAPI (Phase 10 — بند 6: قراءة فقط).
 *
 * المبدأ الحاكم (الخطة §22 و§7.17 و§57-9): الخط الزمني **ناتج مشتق**
 * ولا يُخزَّن. لا يوجد جدول timeline في الـschema ولن يُضاف.
 *
 * التنفيذ: يقرأ المصادر الستة الأصلية من القاعدة ثم يطبّق نفس حساب
 * `TimelineService` (Phase 7) الموجود في `src/services/timelineService.ts`.
 * إعادة استعمال نفس الدالة مقصودة: لولا ذلك لاختففت القاعدة 7 في
 * حساب متشعّب — من أين جاءت المعاملات (روابط لا أسماء).
 *
 * لا يُقبل نطاق «كل المنتسبين» في هذه المرحلة (الفلتر إلزامي بمنتسب).
 */
import type { ApiRepositories } from './index';
import { ResourceNotFoundError } from '../errors';
import { TimelineService } from '../../../../src/services/timelineService';
import type { TimelineQuery, TimelineResponseDto } from '../dto';
import type { TimelineSourceType } from '../../../../src/core/models/timeline';

const ARABIC_EMPLOYEE = 'الموظف';

export class TimelineApiService {
  constructor(private readonly repositories: ApiRepositories) {}

  /**
   * يبني الخط الزمني لمنتسب واحد من مصادره الأصلية.
   *
   * ترتيب المصادر يتبع Phase 7: الإجازات، الزمنيات، التكليفات، الدورات،
   * المعاملات (عبر روابط TransactionEmployee)، الموقف اليومي.
   */
  async forEmployee(query: TimelineQuery): Promise<TimelineResponseDto> {
    const { employeeId } = query;

    // 404 إن لم يوجد الموظف: نطاق خط زمني لمنتسب غير موجود خطأ في الطلب
    // لا نتيجة فارغة، وإلا ظهر المنتسب بلا أحداث بلا سبب.
    const employee = await this.repositories.employees.findById(employeeId);
    if (employee === null) {
      throw new ResourceNotFoundError('employee', employeeId, ARABIC_EMPLOYEE);
    }

    const [leaves, timePermissions, assignments, courses, transactions, dailySituations] =
      await Promise.all([
        this.repositories.leaves.list({ employeeId }),
        this.repositories.timePermissions.list({ employeeId }),
        this.repositories.assignments.list({ employeeId }),
        this.repositories.courses.list({ employeeId }),
        this.repositories.transactions.list(),
        this.repositories.dailySituations.list({ employeeId }),
      ]);

    // نطاق المعاملات للخط الزمني يأتي من جدول الروابط لا من الاسم النصي
    // ولا من مرآة employeeIds (القاعدة 7). الروابط فريدة بالـPK في القاعدة،
    // لكن التفرد يبقى صريحاً هنا حتى لا يتكرر كتاب لو تغيّر الاستعلام لاحقاً.
    const links = await this.repositories.transactionEmployees.listByEmployee(employeeId);
    const transactionIds = [...new Set(links.map((link) => link.transactionId))];

    const result = TimelineService.buildForEmployee({
      employeeId,
      leaves,
      timePermissions,
      assignments,
      courses,
      transactions,
      transactionIds,
      dailySituations,
      filter: {
        sourceTypes: query.sourceTypes as TimelineSourceType[] | undefined,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        searchText: query.searchText,
        limit: query.limit,
      },
    });

    return {
      entries: result.entries,
      countsBySource: result.countsBySource,
      totalCount: result.totalCount,
    };
  }
}
