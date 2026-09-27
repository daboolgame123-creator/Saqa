/**
 * خدمات شؤون المنتسبين في طبقة الـAPI (Phase 10 — بند 5 من ترتيب النقل).
 *
 * أربعة كيانات مستقلة، كلٌّ في ملف وخدمته: الإجازة والزمنية والتكليف والدورة.
 * تتشارك نفس عقد القراءة/الكتابة ونفس فلترة `employeeId`، ولكلٍّ منها
 * مستودع مستقل في Phase 9.
 *
 * ملاحظة مهمة: هذه المرحلة **تنقل** السجلات ولا تحكمها.
 * لا يُفحص هنا أي شرط على الإجازة (الاعتيادية/الطارئة/المرضية…) ولا
 * أي رصيد أو حد أسبوعي — ذلك محرك قواعد Phase 18. تطبيق تلك القواعد
 * الآن يعني اختراع قيم لم تحسمها الخطة.
 */
import type {
  AssignmentRepository,
  CourseRepository,
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
  PersonnelListQuery,
  UpdateEmployeeAssignmentDto,
  UpdateEmployeeCourseDto,
  UpdateEmployeeLeaveDto,
  UpdateEmployeeTimePermissionDto,
} from '../dto';

/** المستودعات الأربعة التي تحتاجها خدمات شؤون المنتسبين. */
export interface PersonnelRepositories {
  leaves: LeaveRepository;
  timePermissions: TimePermissionRepository;
  assignments: AssignmentRepository;
  courses: CourseRepository;
}

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

// ══════════════════════════════════════════════════════════════════
// الإجازات (EmployeeLeave)
// ══════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════
// الإجازات (EmployeeLeave)
// ══════════════════════════════════════════════════════════════════

const ARABIC_LEAVE = 'سجل الإجازة';

export class LeaveApiService {
  constructor(private readonly leaves: LeaveRepository) {}

  async list(filter: PersonnelListQuery = {}): Promise<EmployeeLeaveDto[]> {
    return this.leaves.list({ employeeId: filter.employeeId });
  }

  async getById(id: string): Promise<EmployeeLeaveDto> {
    const record = await this.leaves.findById(id);
    if (record === null) {
      throw new ResourceNotFoundError('leave', id, ARABIC_LEAVE);
    }
    return record;
  }

  async create(dto: CreateEmployeeLeaveDto): Promise<EmployeeLeaveDto> {
    return this.leaves.create(definedOnly(dto) as Omit<EmployeeLeaveDto, 'id'>);
  }

  async update(id: string, dto: UpdateEmployeeLeaveDto): Promise<EmployeeLeaveDto> {
    const record = await this.leaves.update(
      id,
      definedOnly(dto) as Partial<Omit<EmployeeLeaveDto, 'id'>>,
    );
    if (record === null) {
      throw new ResourceNotFoundError('leave', id, ARABIC_LEAVE);
    }
    return record;
  }
}

// ══════════════════════════════════════════════════════════════════
// الزمنيات (EmployeeTimePermission)
// ══════════════════════════════════════════════════════════════════

const ARABIC_TIME_PERMISSION = 'سجل الزمنية';

export class TimePermissionApiService {
  constructor(private readonly records: TimePermissionRepository) {}

  async list(filter: PersonnelListQuery = {}): Promise<EmployeeTimePermissionDto[]> {
    return this.records.list({ employeeId: filter.employeeId });
  }

  async getById(id: string): Promise<EmployeeTimePermissionDto> {
    const record = await this.records.findById(id);
    if (record === null) {
      throw new ResourceNotFoundError('timePermission', id, ARABIC_TIME_PERMISSION);
    }
    return record;
  }

  async create(dto: CreateEmployeeTimePermissionDto): Promise<EmployeeTimePermissionDto> {
    return this.records.create(definedOnly(dto) as Omit<EmployeeTimePermissionDto, 'id'>);
  }

  async update(
    id: string,
    dto: UpdateEmployeeTimePermissionDto,
  ): Promise<EmployeeTimePermissionDto> {
    const record = await this.records.update(
      id,
      definedOnly(dto) as Partial<Omit<EmployeeTimePermissionDto, 'id'>>,
    );
    if (record === null) {
      throw new ResourceNotFoundError('timePermission', id, ARABIC_TIME_PERMISSION);
    }
    return record;
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

