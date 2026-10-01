/**
 * خدمات شؤون المنتسبين في طبقة الـAPI (Phase 10 — بند 5 من ترتيب النقل).
 *
 * أربعة كيانات مستقلة، كلٌّ في ملف وخدمته: الإجازة والزمنية والتكليف والدورة.
 * تتشارك نفس عقد القراءة/الكتابة ونفس فلترة `employeeId`، ولكلٍّ منها
 * مستودع مستقل في Phase 9.
 *
 * Phase 18: صارت خدمتا الإجازة والزمنية تمرّان بـ`PersonnelRulesEngine`
 * بدل CRUD فقط. **هذا هو موضع تطبيق القواعد** (§14): لا في React ولا في
 * مكوّنات العرض (§34 «يجب أن ينفَّذ منفصلاً عن React»).
 *
 * التكليف والدورة يبقيان CRUD: §14 لا يذكر لهما قاعدة رصيد، فلا يُخترع
 * لهما سلوك.
 */
import type {
  AssignmentRepository,
  CourseRepository,
  LeaveBalanceRepository,
  LeaveLedgerRepository,
  LeaveRepository,
  TimePermissionRepository,
} from '../../repositories/contracts';
import { ResourceNotFoundError } from '../errors';
import type {
  CreateEmployeeAssignmentDto,
  CreateEmployeeCourseDto,
  CreateEmployeeLeaveDto,
  CreateEmployeeTimePermissionDto,
  EmployeeAssignmentDto,
  EmployeeCourseDto,
  EmployeeLeaveDto,
  EmployeeTimePermissionDto,
  LeaveAdjustmentDto,
  LeaveBalanceDto,
  LeaveLedgerEntryDto,
  LeaveWithBalanceDto,
  OpeningBalanceDto,
  PersonnelListQuery,
  TimePermissionWithBalanceDto,
  UpdateEmployeeAssignmentDto,
  UpdateEmployeeCourseDto,
  UpdateEmployeeLeaveDto,
  UpdateEmployeeTimePermissionDto,
} from '../dto';
import type { PersonnelRulesEngine } from '../../services/personnelRules';
import { weekRange, weeklyLimitExceeded } from '../../services/personnelRules';

/** يُسقط الحقول غير المعرَّفة قبل الإرسال (PATCH = تعريف ما تغيّر فقط). */
export function definedOnly(dto: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(dto)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

/** المستودعات التي تحتاجها خدمات شؤون المنتسبين. */
export interface PersonnelRepositories {
  leaves: LeaveRepository;
  timePermissions: TimePermissionRepository;
  assignments: AssignmentRepository;
  courses: CourseRepository;
  /** Phase 18 — الأرصدة وسجل الحركات. */
  leaveBalances: LeaveBalanceRepository;
  leaveLedger: LeaveLedgerRepository;
}

// ══════════════════════════════════════════════════════════════════
// الإجازات (EmployeeLeave) — Phase 18: مع محرّك القواعد
// ══════════════════════════════════════════════════════════════════

const ARABIC_LEAVE = 'سجل الإجازة';

/**
 * خدمة الإجازات فوق محرّك القواعد.
 *
 * `create` ينشئ السجل **ثم** يترك المحرّك يخصم/يستحق (§14) في نفس الطلب.
 * الإلغاء يمرّ بـ`cancelLeave` فلا يُحذف السجل ولا تُمحى حركاته.
 */
export class LeaveApiService {
  constructor(
    private readonly leaves: LeaveRepository,
    private readonly rules: PersonnelRulesEngine,
    private readonly balances: LeaveBalanceRepository,
  ) {}

  async list(filter: PersonnelListQuery = {}): Promise<EmployeeLeaveDto[]> {
    return this.leaves.list({ employeeId: filter.employeeId });
  }

  /** إجازة واحدة مع رصيدها المحسوب — نفس عقد الإنشاء والتعديل (§34). */
  async getById(id: string): Promise<LeaveWithBalanceDto> {
    const record = await this.leaves.findById(id);
    if (record === null) {
      throw new ResourceNotFoundError('leave', id, ARABIC_LEAVE);
    }
    return this.withBalance(record);
  }

  /** إنشاء إجازة مع أثر الرصيد (§14.1/§14.2/§14.7/§14.8/§14.10). */
  async create(dto: CreateEmployeeLeaveDto): Promise<LeaveWithBalanceDto> {
    const id = await this.rules.recordLeave({
      id: '',
      employeeId: dto.employeeId,
      type: dto.type,
      startDate: dto.startDate,
      endDate: dto.endDate,
      ...(dto.days !== undefined && { days: dto.days }),
      status: dto.status,
    });
    return this.getById(id);
  }

  /**
   * تعديل إجازة.
   *
   * التحوّل إلى `cancelled` **يلغي الأثر**: حركة عكسية مرتبطة (§15) بلا
   * حذف ولا محو. أي تعديل بعدها لا يُعاد تطبيقه — الرصيد صار محمولاً
   * بحركة عكسية وتطبيق خصم جديد كان سيضاعف الأثر.
   */
  async update(id: string, dto: UpdateEmployeeLeaveDto): Promise<LeaveWithBalanceDto> {
    const existing = await this.leaves.findById(id);
    if (existing === null) {
      throw new ResourceNotFoundError('leave', id, ARABIC_LEAVE);
    }
    if (dto.status === 'cancelled' && existing.status !== 'cancelled') {
      await this.rules.cancelLeave(id);
      return this.getById(id);
    }
    const record = await this.leaves.update(
      id,
      definedOnly(dto) as Partial<Omit<EmployeeLeaveDto, 'id'>>,
    );
    if (record === null) {
      throw new ResourceNotFoundError('leave', id, ARABIC_LEAVE);
    }
    return this.withBalance(record);
  }

  /** إلغاء صريح — نفس أثر `status: 'cancelled'` بلا تكرار. */
  async cancel(id: string): Promise<LeaveWithBalanceDto> {
    const existing = await this.leaves.findById(id);
    if (existing === null) {
      throw new ResourceNotFoundError('leave', id, ARABIC_LEAVE);
    }
    if (existing.status !== 'cancelled') {
      await this.rules.cancelLeave(id);
    }
    return this.getById(id);
  }

  /** الرصيد بعد العملية — يُقرأ من المحرك ولا يُحسب هنا. */
  private async withBalance(leave: EmployeeLeaveDto): Promise<LeaveWithBalanceDto> {
    const balance = await this.balances.findByEmployeeYear(
      leave.employeeId,
      leave.startDate.slice(0, 4),
    );
    return { leave, balance, unpaidDays: balance?.unpaidDays ?? 0 };
  }
}

// ══════════════════════════════════════════════════════════════════
// الزمنيات (EmployeeTimePermission) — Phase 18: محرك الدقائق
// ══════════════════════════════════════════════════════════════════

const ARABIC_TIME_PERMISSION = 'سجل الزمنية';

/**
 * خدمة الزمنيات فوق محرك الدقائق والتحويل (§14.3/§14.4/§14.5).
 *
 * `durationMinutes` **لا تُقبل من العميل**: المحرّك يحسبها من `timeOut`/
 * `timeIn` ويخزّنها، فالمدة محسوبة ومخزّنة لا مرسلتان (§14.3). وتجاوز
 * 4 ساعات أسبوعياً يعيد مؤشراً ولا يمنع التسجيل (§14.4).
 */
export class TimePermissionApiService {
  constructor(
    private readonly records: TimePermissionRepository,
    private readonly rules: PersonnelRulesEngine,
    private readonly balances: LeaveBalanceRepository,
  ) {}

  async list(filter: PersonnelListQuery = {}): Promise<EmployeeTimePermissionDto[]> {
    return this.records.list({ employeeId: filter.employeeId });
  }

  /**
   * زمنية واحدة مع رصيدها ومؤشر أسبوعها — نفس عقد الإنشاء والتعديل.
   *
   * القراءة تحسب المؤشر الأسبوعي ولا تغيّر شيئاً: `exceedsWeeklyLimit`
   * قياس (§14.4) لا قرار.
   */
  async getById(id: string): Promise<TimePermissionWithBalanceDto> {
    const record = await this.records.findById(id);
    if (record === null) {
      throw new ResourceNotFoundError('timePermission', id, ARABIC_TIME_PERMISSION);
    }
    const week = weekRange(record.date);
    const weeklyMinutes = await this.records.sumMinutesBetween(
      record.employeeId,
      week.from,
      week.to,
    );
    const balance = await this.balances.findByEmployeeYear(
      record.employeeId,
      record.date.slice(0, 4),
    );
    return {
      record,
      balance,
      weeklyMinutes,
      exceedsWeeklyLimit: weeklyLimitExceeded(weeklyMinutes),
      coveredEmergencyDays: 0,
      unpaidDays: 0,
      remainderMinutes: balance?.emergencyRemainderMinutes ?? 0,
    };
  }

  /** تسجيل زمنية: حساب المدة + تحويل 420 دقيقة + المؤشر الأسبوعي. */
  async create(dto: CreateEmployeeTimePermissionDto): Promise<TimePermissionWithBalanceDto> {
    const registration = await this.rules.registerTimePermission({
      employeeId: dto.employeeId,
      date: dto.date,
      timeOut: dto.timeOut,
      ...(dto.timeIn !== undefined && { timeIn: dto.timeIn }),
      ...(dto.reason !== undefined && { reason: dto.reason }),
      status: dto.status,
      ...(dto.transactionId !== undefined && { transactionId: dto.transactionId }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
    });
    const result = await this.getById(registration.record.id);
    return {
      ...result,
      coveredEmergencyDays: registration.conversion?.covered ?? 0,
      unpaidDays: registration.conversion?.unpaid ?? 0,
    };
  }

  /**
   * تعديل زمنية: الحقول الوصفية فقط.
   *
   * `timeOut`/`timeIn` لا تُعدَّل بعد التسجيل لأن التحويل تمّ بالفعل، وتغيير
   * المدة لاحقاً يحتاج عكساً وتحويلاً جديدين (§15) — وهي عملية إدارية
   * موثّقة عبر `LeaveBalanceApiService.adjust`، لا تعديل صامت هنا.
   */
  async update(
    id: string,
    dto: UpdateEmployeeTimePermissionDto,
  ): Promise<TimePermissionWithBalanceDto> {
    const patch = definedOnly(dto) as Partial<Omit<EmployeeTimePermissionDto, 'id'>>;
    delete patch.durationMinutes;
    delete patch.timeOut;
    delete patch.timeIn;
    const record = await this.records.update(id, patch);
    if (record === null) {
      throw new ResourceNotFoundError('timePermission', id, ARABIC_TIME_PERMISSION);
    }
    return this.getById(record.id);
  }
}

// ══════════════════════════════════════════════════════════════════
// الأرصدة وسجل الحركات (Phase 18 — §7.9/§7.10/§15)
// ══════════════════════════════════════════════════════════════════

/**
 * خدمة الأرصدة وسجل الـledger — قراءة + الافتتاح والتصحيح.
 *
 * **لا مسار لتعديل رقم رصيد مباشرة**: كل تغيير يمرّ بحركة `opening_balance`
 * أو `adjustment` في السجل (§15). خدمة القراءة لا تحسب شيئاً — تعرض ما
 * حسبه المحرّك.
 */
export class LeaveBalanceApiService {
  constructor(
    private readonly balances: LeaveBalanceRepository,
    private readonly ledger: LeaveLedgerRepository,
    private readonly rules: PersonnelRulesEngine,
  ) {}

  async listBalances(
    filter: { employeeId?: string; year?: string } = {},
  ): Promise<LeaveBalanceDto[]> {
    return this.balances.list(filter);
  }

  async listLedger(
    filter: {
      employeeId?: string;
      year?: number;
      leaveId?: string;
      movementType?: string;
    } = {},
  ): Promise<LeaveLedgerEntryDto[]> {
    return this.ledger.list({
      ...(filter.employeeId !== undefined && { employeeId: filter.employeeId }),
      ...(filter.year !== undefined && { year: filter.year }),
      ...(filter.leaveId !== undefined && { leaveId: filter.leaveId }),
      ...(filter.movementType !== undefined && {
        movementType: filter.movementType as LeaveLedgerEntryDto['movementType'],
      }),
    });
  }

  /** نقطة بداية افتتاحية موثّقة (§34) — لا تُكرَّر بلا تصحيح. */
  async opening(dto: OpeningBalanceDto): Promise<LeaveBalanceDto> {
    return this.rules.recordOpeningBalance(dto);
  }

  /** تصحيح إداري موثّق (§15). */
  async adjust(dto: LeaveAdjustmentDto): Promise<LeaveBalanceDto> {
    return this.rules.recordAdjustment(dto);
  }
}

// ══════════════════════════════════════════════════════════════════
// التكليفات (EmployeeAssignment)
// ══════════════════════════════════════════════════════════════════

const ARABIC_ASSIGNMENT = 'سجل التكليف';

export class AssignmentApiService {
  constructor(private readonly records: AssignmentRepository) {}

  async list(filter: PersonnelListQuery = {}): Promise<EmployeeAssignmentDto[]> {
    return this.records.list({ employeeId: filter.employeeId });
  }

  async getById(id: string): Promise<EmployeeAssignmentDto> {
    const record = await this.records.findById(id);
    if (record === null) {
      throw new ResourceNotFoundError('assignment', id, ARABIC_ASSIGNMENT);
    }
    return record;
  }

  async create(dto: CreateEmployeeAssignmentDto): Promise<EmployeeAssignmentDto> {
    return this.records.create(definedOnly(dto) as Omit<EmployeeAssignmentDto, 'id'>);
  }

  async update(id: string, dto: UpdateEmployeeAssignmentDto): Promise<EmployeeAssignmentDto> {
    const record = await this.records.update(
      id,
      definedOnly(dto) as Partial<Omit<EmployeeAssignmentDto, 'id'>>,
    );
    if (record === null) {
      throw new ResourceNotFoundError('assignment', id, ARABIC_ASSIGNMENT);
    }
    return record;
  }
}

// ══════════════════════════════════════════════════════════════════
// الدورات (EmployeeCourse)
// ══════════════════════════════════════════════════════════════════

const ARABIC_COURSE = 'سجل الدورة';

export class CourseApiService {
  constructor(private readonly records: CourseRepository) {}

  async list(filter: PersonnelListQuery = {}): Promise<EmployeeCourseDto[]> {
    return this.records.list({ employeeId: filter.employeeId });
  }

  async getById(id: string): Promise<EmployeeCourseDto> {
    const record = await this.records.findById(id);
    if (record === null) {
      throw new ResourceNotFoundError('course', id, ARABIC_COURSE);
    }
    return record;
  }

  async create(dto: CreateEmployeeCourseDto): Promise<EmployeeCourseDto> {
    return this.records.create(definedOnly(dto) as Omit<EmployeeCourseDto, 'id'>);
  }

  async update(id: string, dto: UpdateEmployeeCourseDto): Promise<EmployeeCourseDto> {
    const record = await this.records.update(
      id,
      definedOnly(dto) as Partial<Omit<EmployeeCourseDto, 'id'>>,
    );
    if (record === null) {
      throw new ResourceNotFoundError('course', id, ARABIC_COURSE);
    }
    return record;
  }
}

