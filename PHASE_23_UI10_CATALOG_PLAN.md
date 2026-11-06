# Phase 23 UI-10: inert report catalog — 7 Nov 2026

Analysis: the legacy MonthlyReportView uses UI data, while official Phase23 reports remain behind HTTP 503. Researchers and professors lack approved independent sources. A list must not imply these reports are live.

Plan: add a read-only catalog of 11 approved types, explicitly mark all as unavailable; distinguish researchers/professors as lacking source approval. Render beside the existing notice, preserving MonthlyReportView. No fetch, exports, role assumptions or counts. Add SSR assertions for labels and absence of action controls. Verify lint/server/db/api/build with exact SHA. Keep PR #8 draft, no merge and no security gate change.

Acceptance: visible, truthful planned coverage and passing regression. This remains a preparatory UI component; OpenCode independently owns PR #4.

## UI-10 scoped relation handoff — plan before change

Finding: App.tsx feeds MonthlyReportView with `visibleTransactions` but the entire `transactionEmployees` collection. The current legacy view only maps linked transaction IDs for its local classification, so **no demonstrated cross-employee name leak** exists; however, passing records for non-visible transaction IDs violates least-data handoff. Bound this *presentation-only* relation input to the IDs in `visibleTransactions` and test with a hidden transaction and a visible one. Do not alter shared App relationships, production authorization or scoped server API. Guard against treating this client filter as a security boundary; server-side access remains authoritative. Run full exact-SHA regression and keep PR8 draft.
