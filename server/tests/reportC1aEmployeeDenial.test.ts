/** Phase 23/C1a: fail closed before ANY report DB read, all employee sources. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  reportAccessFor, assertReportAccess, ReportScopeNotReadyError,
} from '../src/authorization/reportAccess';
import { ReportApiService } from '../src/api/services/reportService';
import { PgReportRepository } from '../src/repositories/reportRepository';
import type { ReportAccessContext, ReportType, ReportRepository } from '../src/repositories/contracts';

const types: ReportType[] = [
  'monthly','incoming','outgoing','situation',
  'employees','leaves','timePermissions','requests',
  'circularsAndAcknowledgements','researchers','professors',
];

test('C1a: every employee report and export rejects before a repository operation', async () => {
  let reads=0;
  const repository: ReportRepository = {
    async list() { reads++; throw Error('FORBIDDEN_DB_READ'); },
    async readCircularAcknowledgements() { reads++; throw Error('FORBIDDEN_VIEWLOG_READ'); },
  };
  const service=new ReportApiService(repository);
  const owner=reportAccessFor({role:'employee', employeeId:'employee-a'});
  for(const type of types) {
    const filter={reportType:type};
    await assert.rejects(service.run(filter,owner),ReportScopeNotReadyError,type);
    await assert.rejects(service.export(filter,owner,'excel'),ReportScopeNotReadyError,type);
    await assert.rejects(service.export(filter,owner,'pdf'),ReportScopeNotReadyError,type);
    assert.equal(reads,0,`Unauthorized employee reached database on ${type}`);
  }
});

test('C1a: real PgReportRepository rejects all employee report kinds before DB access',async () => {
  let dbReads=0;
  const db={
    async query() { dbReads++; throw Error('UNEXPECTED_SQL'); },
    async connect() { dbReads++; throw Error('UNEXPECTED_CONNECTION'); },
  };
  const repository=new PgReportRepository(db as never,'Asia/Baghdad');
  const owner=reportAccessFor({role:'employee',employeeId:'employee-a'});
  for(const type of types) {
    await assert.rejects(
      repository.list(type,{reportType:type},owner),
      ReportScopeNotReadyError,type,
    );
    if(type==='circularsAndAcknowledgements') {
      await assert.rejects(
        repository.readCircularAcknowledgements({reportType:type},owner),
        ReportScopeNotReadyError,
      );
    }
    assert.equal(dbReads,0,`Unauthorized SQL or connection for ${type}`);
  }
});

test('C1a: privileged role scope forgeries are rejected before DB reads',async () => {
  let reads=0;
  const repository: ReportRepository = {
    async list(){reads++;throw Error('FORBIDDEN_DB_READ');},
    async readCircularAcknowledgements(){reads++;throw Error('FORBIDDEN_DB_READ');},
  };
  const service=new ReportApiService(repository);
  const admin=reportAccessFor({role:'admin',employeeId:null});
  const director=reportAccessFor({role:'director',employeeId:null});
  const invalid: ReportAccessContext[] = [
    {...admin,transactionScope:{visibilityIn:['PublicToEmployees']}},
    {...admin,personnelScope:{kind:'owner',employeeId:'employee-a'}},
    {...admin,requestScope:{kind:'owner',ownerEmployeeId:'employee-a'}},
    {...director,personnelScope:{kind:'empty'}},
    {...director,requestScope:{kind:'empty'}},
    {...admin,role:'employee',employeeId:'employee-a'},
    {...director,role:'employee',employeeId:'employee-b'},
  ] as ReportAccessContext[];
  for(const access of invalid) {
    for(const type of types) {
      await assert.rejects(service.run({reportType:type},access),
        /inconsistent|Report scope|Scoped report SQL|ReportScopeNotReadyError/,type);
      assert.equal(reads,0,`Forged privileges reached repository on ${type}`);
    }
  }
});

test('C1a: unlinked and unknown session identities cannot produce report scopes', () => {
  for(const viewer of [
    undefined,
    {role:'employee',employeeId:null},
    {role:'employee',employeeId:''},
    {role:'employee',employeeId:'  '},
    {role:'archivist',employeeId:'employee-a'},
  ]) {
    assert.throws(() => reportAccessFor(viewer as never));
  }
  for(const type of types) {
    assert.throws(()=>assertReportAccess(undefined,type));
  }
});
