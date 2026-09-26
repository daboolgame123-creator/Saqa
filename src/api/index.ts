/**
 * نقطة اختيار مصدر البيانات (Phase 10).
 *
 * العنوان الفعلي لعميل الـAPI ← التنفيذ.
 *
 * ترتيب الاختيار:
 * 1. `VITE_DATA_SOURCE=local` ⇒ محلي صراحةً (تطوير بلا خادم).
 * 2. غير ذلك ⇒ API (الافتراضي المطلوب والخيار الصحيح في النشر).
 *
 * الـfallback التلقائي عند فشل **أول تحميل** مقصود: الشبكة أو تعطّل
 * الخادم لا يجوز أن يُظهر شاشة فارغة بلا تفسير، لكن developers محلياً
 * يحتاج أن يعمل التطبيق بلا تشغيل الـBackend. لذلك نُسجّل تحذيراً
 * صريحاً وننتقل للمحلي، **ولا نُبدّل المصدر بصمت** بعد نجاح أول تحميل:
 * الكتابة بعد ذلك يجب أن تبقى على مسار واحد متّسق حتى لا تتفرّق
 * البيانات بين localStorage والقاعدة.
 */
import type { Employee } from '../core/models';
import type { IDataAdapter } from '../core/interfaces/dataAdapter';
import { createApiDataAdapter } from './apiDataAdapter';
import { LocalDataAdapter } from './localDataAdapter';

/** المصدر الفعّال بعد أي تبديل تلقائي. */
let activeAdapter: IDataAdapter | null = null;

/** هل حدث تبديل تلقائي إلى المحلي؟ (لعرضه في الواجهة/التشخيص) */
let fellBackToLocal = false;

/** يقرأ نمط المصدر من إعدادات Vite. */
function requestedKind(): 'api' | 'local' {
  return import.meta.env?.VITE_DATA_SOURCE === 'local' ? 'local' : 'api';
}

/** المصدر الحالي (ينشئه بأول استدعاء). */
export function getDataAdapter(): IDataAdapter {
  if (activeAdapter === null) {
    activeAdapter = requestedKind() === 'local' ? new LocalDataAdapter() : createApiDataAdapter();
  }
  return activeAdapter;
}

/** هل استُخدم المصدر المحلي بسبب تعذّر الـAPI؟ */
export function hasFallenBackToLocal(): boolean {
  return fellBackToLocal;
}

/**
 * يبدّل المصدر صراحةً (استخدام/testing).
 * يصفّر علم الـfallback لأن الاختيار صار مقصوداً لا تلقائياً.
 */
export function setDataAdapter(adapter: IDataAdapter): void {
  activeAdapter = adapter;
  fellBackToLocal = false;
}

/** يعيد البناء من الإعدادات (إعادة تحميل الإعدادات في التطوير). */
export function resetDataAdapter(): void {
  activeAdapter = null;
  fellBackToLocal = false;
}

/**
 * أول تحميل: يجرّب الـAPI، وإن فشل يعود للمصدر المحلي مع تحذير.
 *
 * الفحص بمورد الموظفين وحده كافٍ كاختبار حياة الخادم: أي مورد آخر
 * يفشل معه، ووجود مسار بيانات فعلي يمنع اعتبار الخادم «حياً» وهو
 * معطّل.
 */
export async function primeDataSource(): Promise<IDataAdapter> {
  const adapter = getDataAdapter();
  if (adapter.kind === 'local' || fellBackToLocal) {
    return adapter;
  }

  try {
    await adapter.loadEmployees({});
    return adapter;
  } catch (error) {
    fellBackToLocal = true;
    activeAdapter = new LocalDataAdapter();
    // نُبلّغ في الطرفية: الرجوع للمحلي استثناء تشغيلي يجب أن يُرى.
    console.warn(
      '[alsqaya] تعذّر الوصول إلى الـAPI — التحويل إلى التخزين المحلي لأغراض التطوير.',
      error,
    );
    return activeAdapter;
  }
}

/** يقرأ الموظفين عبر المصدر الفعّال (الاستخدام الأول في `App.tsx`). */
export async function loadEmployeesAtStartup(): Promise<Employee[]> {
  return (await primeDataSource()).loadEmployees({});
}
