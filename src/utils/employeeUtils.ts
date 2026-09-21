import { Employee, EmployeeCategory, Transaction } from '../types';

/**
 * Common institutional/departmental names that should never be treated as employees
 */
const ENTITY_KEYWORDS = [
  'شعبة',
  'قسم',
  'إدارة',
  'الأمانة العامة',
  'مركز الدراسات',
  'مركز',
  'مكتب',
  'دائرة',
  'رئاسة',
  'وزارة',
  'جامعة',
  'كلية',
  'الخدمات',
  'الآليات',
  'المخازن',
  'الذاتية',
  'الإدارية',
  'المالية',
  'الحسابات',
  'الشؤون الفكرية',
  'عام',
  'غير محدد',
  'عام / غير محدد',
];

/**
 * Check if a text represents an entity or department rather than a human name
 */
export const isEntityOrDepartmentName = (text?: string): boolean => {
  if (!text || !text.trim()) return true;
  const clean = text.trim().toLowerCase();
  if (clean.length < 2) return true;
  return ENTITY_KEYWORDS.some((kw) => clean === kw || clean.startsWith(kw) || clean.includes(kw));
};

/**
 * Normalize Arabic name for comparison (strips honorifics and standardizes letters)
 */
export const normalizeArabicName = (name?: string): string => {
  if (!name) return '';
  let clean = name.trim().toLowerCase();

  // Strip common academic and official honorifics
  clean = clean.replace(/^(أ\.د\.|أ\.د|د\.|دكتور|الدكتور|أستاذ|الاستاذ|الأستاذ|الباحث|السيد|السيدة|م\.م\.|م\.)\s+/, '');
  
  // Normalize letters
  clean = clean
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\(اسم تجريبي\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return clean;
};

/**
 * Splits raw employee name text that may contain multiple names.
 * Supports:
 * - Arabic comma (،)
 * - English comma (,)
 * - Newlines (\n)
 * - Semicolons (; / ؛)
 * - Numbered lines (1- أحمد 2- محمد)
 * - "و" conjunction when separated by punctuation
 */
export const splitEmployeeNames = (raw?: string): string[] => {
  if (!raw || !raw.trim()) return [];

  return raw
    .split(/[\n,،;؛]+/)
    .map((item) => {
      // Remove numbering like "1-", "1.", bullets "-", "*", "•", leading "و " if present
      let clean = item
        .replace(/^[\s\d\.\-•*–—]+\s*/, '')
        .replace(/^و\s+/, '')
        .replace(/\s+/g, ' ')
        .trim();
      return clean;
    })
    .filter((name) => {
      if (name.length < 2) return false;
      if (isEntityOrDepartmentName(name)) return false;
      return true;
    });
};

/**
 * Check if two employee names match (supports exact, partial, or multi-word similarity)
 */
export const isEmployeeMatch = (nameA?: string, nameB?: string): boolean => {
  if (!nameA || !nameB) return false;
  const rawA = nameA.trim().toLowerCase();
  const rawB = nameB.trim().toLowerCase();
  if (rawA === rawB) return true;

  const normA = normalizeArabicName(nameA);
  const normB = normalizeArabicName(nameB);

  if (normA === normB && normA.length > 1) return true;

  // Multi-word exact inclusions
  const wordsA = normA.split(/\s+/).filter((w) => w.length > 2);
  const wordsB = normB.split(/\s+/).filter((w) => w.length > 2);

  // If one name is a full sequence inside the other (e.g. a shorter name contained within a longer one)
  if (wordsA.length >= 2 && wordsB.length >= 2) {
    if (normA.includes(normB) || normB.includes(normA)) return true;
    
    // Check common words overlap
    const commonWords = wordsA.filter((w) => wordsB.includes(w));
    if (commonWords.length >= 2) return true;
  }

  // Exact single-word match only if equal
  if (wordsA.length === 1 && wordsB.length === 1) {
    return wordsA[0] === wordsB[0];
  }

  return false;
};

/**
 * Check if a transaction mentions or is linked to an employee
 * Prioritizes employeeIds as the primary relation, falling back to name matching for legacy data
 */
export const isEmployeeInTransaction = (tr: Transaction, emp: Employee | string): boolean => {
  if (!emp) return false;
  const empId = typeof emp === 'object' ? emp.id : undefined;
  const empName = typeof emp === 'object' ? emp.name : emp;

  // 1. Primary Check: If employeeId is present in tr.employeeIds
  if (empId && Array.isArray(tr.employeeIds) && tr.employeeIds.includes(empId)) {
    return true;
  }

  if (!empName) return false;

  // 2. Check employeeName field (which may contain multiple names)
  if (tr.employeeName) {
    const names = splitEmployeeNames(tr.employeeName);
    if (names.some((n) => isEmployeeMatch(n, empName))) return true;
    if (isEmployeeMatch(tr.employeeName, empName)) return true;
  }

  // 3. Check in dailySituationData entries
  if (tr.dailySituationData) {
    const d = tr.dailySituationData;
    const allEntries = [
      ...(d.permanentLeaves || []),
      ...(d.permanentTimePermissions || []),
      ...(d.permanentShiftChanges || []),
      ...(d.temporaryLeaves || []),
      ...(d.temporaryTimePermissions || []),
      ...(d.temporaryShiftChanges || []),
    ];
    if (allEntries.some((e) => isEmployeeMatch(e.employeeName, empName))) {
      return true;
    }
  }

  // 4. Check subject ONLY if tr.employeeName is empty or mentions the employee directly
  if (!tr.employeeName && tr.subject) {
    const normSubject = normalizeArabicName(tr.subject);
    const normEmp = normalizeArabicName(empName);
    const empWords = normEmp.split(/\s+/).filter((w) => w.length > 2);
    if (empWords.length >= 2 && normSubject.includes(normEmp)) {
      return true;
    }
  }

  return false;
};

/**
 * Classify whether an employee belongs to:
 * - 'منتسب' (Administrative / Technical / General Staff)
 * - 'باحث' (Academic / Professor / Researcher)
 */
export const determineEmployeeCategory = (
  emp: Partial<Employee>
): EmployeeCategory => {
  if (emp.category) return emp.category;

  const text = `${emp.title || ''} ${emp.department || ''} ${emp.name || ''} ${emp.academicDegree || ''}`.toLowerCase();

  const researcherKeywords = [
    'باحث',
    'أستاذ',
    'استاذ',
    'دكتور',
    'د.',
    'أ.د',
    'مدرس',
    'بحوث',
    'أكاديمي',
    'مترجم',
    'دراسات',
    'شؤون علمية',
    'الأساتذة',
  ];

  if (researcherKeywords.some((kw) => text.includes(kw))) {
    return 'باحث';
  }

  return 'منتسب';
};
