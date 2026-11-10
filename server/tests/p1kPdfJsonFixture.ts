/** Synthetic ALT-08 fixture: real buildReportExportModel -> real ALT-07 encoder. */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReportResponse } from '../src/api/dto/report';
import { buildReportExportModel } from '../src/api/services/reportExport';
import { encodeReportPdfInput } from '../src/api/services/reportPdfInput';

const dir = process.env.ALSQAYA_PREVIEW_DIR;
if (!dir) throw new Error('Synthetic preview directory required');
const rows = Array.from({length: 3}, (_, i) => ({
  id: 'synthetic-id-'+i, date: `2026-11-0${i+1}T10:00:00Z`,
  type: 'وارد', status: 'مكتمل', title: `ALT08_ROW_00${i+1} موضوع تجريبي`,
  notes: i === 0 ? '<img src="file:///etc/passwd" onerror="x">' : 'ملاحظات اصطناعية',
}));
const details: ReportResponse = {
  rows,
  summary: {totalCount:rows.length, generatedAt:'2026-11-06T10:00:00Z'},
};
const circularRows = [{
  id:'synthetic-circular', date:'2026-11-06T09:00:00Z', type:'تعميم',
  title:'ALT08_CIRCULAR_001 <script>alert(1)</script>',
}];
const circular: ReportResponse = {
  rows:circularRows,
  summary:{totalCount:1,generatedAt:'2026-11-06T10:00:00Z'},
  circularAcknowledgements:{
    acknowledgements:Array.from({length:2},(_,i)=>({
      transactionId:'synthetic-circular', employeeId:`hidden-id-${i}`,
      employeeName:`ALT08_ACK_00${i+1} منتسب تجريبي`,
      acknowledgedAt:`2026-11-0${i+1}T12:00:00Z`,
    })),
    statistics:{
      circularCount:1, acknowledgementOperations:2, uniqueEmployees:2,
      verifiedAcknowledgementOperations:2,verifiedUniqueEmployees:2,
      problemRecords:0,problemReasons:{
        missingEmployeeId:0,identityMismatch:0,conflictingAcknowledgementTime:0,
      },complete:true,
    },
  },
};
await mkdir(dir,{recursive:true});
for(const [name,type,response] of [
  ['details','incoming',details],
  ['ack','circularsAndAcknowledgements',circular],
] as const) {
  const payload=encodeReportPdfInput(buildReportExportModel(type,response));
  const text=payload.toString('utf8');
  if(text.includes('hidden-id-')||text.includes('synthetic-id-'))throw Error('Internal IDs leaked');
  await writeFile(join(dir,`p1k-alt08-${name}.json`),payload,{flag:'wx'});
  console.log(`P1K_ALT08_JSON_FIXTURE_PASS kind=${name} bytes=${payload.length}`);
}
