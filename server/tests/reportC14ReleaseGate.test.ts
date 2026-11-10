/**
 * C14: owner release is a deliberate source-code approval, not a runtime switch.
 * The existing real-HTTP reportSecurityHttp.test.ts and browser pilot tests
 * still prove the deployed API stays 503 and the legacy UI notice stays visible.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OFFICIAL_REPORTS_RELEASE_APPROVED,
  officialReportViewer,
} from '../../src/core/reportReleaseGate';

describe('Phase 23 C14 code-locked official report release', () => {
  it('is CLOSED by default regardless of environment or URL-like switches', () => {
    const prior = process.env.ALSQAYA_REPORTS_ENABLED;
    process.env.ALSQAYA_REPORTS_ENABLED = 'true';
    try {
      assert.equal(OFFICIAL_REPORTS_RELEASE_APPROVED, false);
      assert.equal(officialReportViewer(false, {
        id:'fixture-admin', role:'admin', mustChangeSecret:false,
      }), null);
    } finally {
      if (prior === undefined) delete process.env.ALSQAYA_REPORTS_ENABLED;
      else process.env.ALSQAYA_REPORTS_ENABLED = prior;
    }
  });

  it('never selects official UI in local demo or without a validated account', () => {
    assert.equal(officialReportViewer(true, {
      id:'fixture-admin',role:'admin',mustChangeSecret:false,
    }), null);
    assert.equal(officialReportViewer(false,null),null);
    assert.equal(officialReportViewer(false, {
      id:'',role:'employee',mustChangeSecret:false,
    }),null);
    assert.equal(officialReportViewer(false, {
      id:'fixture-employee',role:'employee',mustChangeSecret:true,
    }),null);
    assert.equal(officialReportViewer(false, {
      id:'fixture-archivist',role:'archivist',mustChangeSecret:false,
    }),null);
  });
});
