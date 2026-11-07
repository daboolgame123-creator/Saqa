/** C7b unmounted official-report UI adapter. Production report HTTP remains 503.
 *
 * The server derives role and owner from the authenticated session. These
 * role-aware client options are presentation only, NEVER authorization.
 */
import type { ReportFilter, ReportType } from '../../server/src/repositories/contracts';
import type { ReportResponse } from '../../server/src/api/dto/report';
import { ApiError, getApiClient, type ApiClient, type FetchLike } from './apiClient';
import { getBearerToken, invalidateBearerToken } from './sessionToken';

export type CandidateReportRole = 'admin' | 'director' | 'employee';
export type CandidateExportFormat = 'excel' | 'pdf';

export const CANDIDATE_REPORT_LABELS: Readonly<Record<ReportType,string>> = {
  monthly:'التقرير الشهري',
  incoming:'الكتب الواردة',
  outgoing:'الكتب الصادرة',
  situation:'حالة الكتب',
  leaves:'الإجازات',
  timePermissions:'الزمنيات',
  circularsAndAcknowledgements:'الإعمامات والاطلاع الرسمي',
  requests:'الطلبات',
  employees:'المنتسبون',
  researchers:'الباحثون',
  professors:'الأساتذة',
};
const PRIVILEGED_TYPES: readonly ReportType[] = [
  'monthly','incoming','outgoing','situation',
  'leaves','timePermissions','circularsAndAcknowledgements','requests','employees',
];
const EMPLOYEE_TYPES: readonly ReportType[] = [
  'incoming','leaves','timePermissions','requests','employees',
];
export function candidateReportTypesFor(role: CandidateReportRole): readonly ReportType[] {
  return role === 'employee' ? EMPLOYEE_TYPES : PRIVILEGED_TYPES;
}
export function isBookCandidateReport(type: ReportType): boolean {
  return ['monthly','incoming','outgoing','situation'].includes(type);
}
export interface CandidateReportFields {
  reportType: ReportType;
  dateFrom?: string;
  dateTo?: string;
  documentDateFrom?: string;
  documentDateTo?: string;
  section?: string;
  type?: string;
  employee?: string;
  status?: string;
}
/** A strict allowlist: never send a hidden or stale unsupported filter. */
export function candidateReportFilter(
  fields: CandidateReportFields, role: CandidateReportRole,
): ReportFilter {
  if (!candidateReportTypesFor(role).includes(fields.reportType)) {
    throw new Error('This report type is unavailable for the current view');
  }
  const result: ReportFilter={reportType:fields.reportType};
  const put=(field: keyof CandidateReportFields) => {
    const value=fields[field];
    if(typeof value==='string' && value.trim()) {
      (result as unknown as Record<string,string>)[field]=value.trim();
    }
  };
  put('dateFrom'); put('dateTo');
  if(isBookCandidateReport(fields.reportType)){
    put('documentDateFrom');put('documentDateTo');
    if(fields.reportType==='monthly' || fields.reportType==='situation') put('type');
  }
  if(fields.reportType==='employees')put('section');
  if(fields.reportType!=='circularsAndAcknowledgements' && role!=='employee')put('employee');
  if(isBookCandidateReport(fields.reportType) ||
     fields.reportType==='circularsAndAcknowledgements') put('status');
  return result;
}
function queryOf(filter: ReportFilter): Record<string,string> {
  const result: Record<string,string>={};
  for(const [field,value] of Object.entries(filter)){
    if(typeof value==='string' && value!=='')result[field]=value;
  }
  return result;
}
export async function previewCandidateReport(
  filter:ReportFilter, client:ApiClient=getApiClient(),
):Promise<ReportResponse>{
  const report=await client.get<ReportResponse>('/reports',queryOf(filter));
  if(!report || !Array.isArray(report.rows) || !report.summary ||
      report.summary.totalCount!==report.rows.length) {
    throw new Error('The report preview response is inconsistent');
  }
  return report;
}
export interface CandidateReportDownload {
  content:Blob;
  fileName:string;
  mimeType:string;
}
/** Separate binary transport because ApiClient deliberately parses JSON. */
export async function downloadCandidateReport(
  filter:ReportFilter,format:CandidateExportFormat,
  client:ApiClient=getApiClient(),
  fetchImpl:FetchLike=(input,init)=>fetch(input,init),
):Promise<CandidateReportDownload>{
  if(format!=='excel' && format!=='pdf')throw new Error('Unsupported report export');
  const token=getBearerToken();
  if(token===null)throw new Error('Authenticated session required');
  const query=new URLSearchParams({...queryOf(filter),format});
  const path=client.baseUrl.replace(/\/+$/,'')+'/reports/export?'+query.toString();
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),90_000);
  try{
    const response=await fetchImpl(path,{
      method:'GET',
      headers:{accept:'application/octet-stream',authorization:'Bearer '+token},
      signal:controller.signal,
    });
    if(!response.ok){
      if(response.status===401 && getBearerToken()===token)invalidateBearerToken();
      const body=await response.json().catch(()=>({}));
      throw new ApiError(response.status,body);
    }
    const mime=format==='excel'
      ?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      :'application/pdf';
    if(response.headers.get('content-type')?.split(';')[0]!==mime ||
        Number(response.headers.get('content-length')||'0')>16_000_000) {
      throw new Error('Unexpected report export content');
    }
    const content=await response.blob();
    if(content.size<64 || content.size>16_000_000){
      throw new Error('Report export exceeded allowed size');
    }
    const extension=format==='excel'?'xlsx':'pdf';
    return {content,mimeType:mime,fileName:'alsqaya-'+filter.reportType+'.'+extension};
  }finally{clearTimeout(timer);}
}
