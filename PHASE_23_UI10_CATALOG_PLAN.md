# Phase 23 UI-10: inert report catalog — 7 Nov 2026

Analysis: the legacy MonthlyReportView uses UI data, while official Phase23 reports remain behind HTTP 503. Researchers and professors lack approved independent sources. A list must not imply these reports are live.

Plan: add a read-only catalog of 11 approved types, explicitly mark all as unavailable; distinguish researchers/professors as lacking source approval. Render beside the existing notice, preserving MonthlyReportView. No fetch, exports, role assumptions or counts. Add SSR assertions for labels and absence of action controls. Verify lint/server/db/api/build with exact SHA. Keep PR #8 draft, no merge and no security gate change.

Acceptance: visible, truthful planned coverage and passing regression. This remains a preparatory UI component; OpenCode independently owns PR #4.
