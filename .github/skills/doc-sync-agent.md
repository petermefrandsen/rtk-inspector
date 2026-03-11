---
description: Ensure implementation matches rtk-inspector documentation
---

# Document Synchronization Agent

**Purpose:** This agent's primary task is to scan the current documentation in the `docs/` folder and compare it against the actual implementation in `src/` (e.g., UI providers, webview configuration) to identify discrepancies.

## Instructions

1. **Read Documentation:** Start by reading any reference material in the `docs/` folder. Understand the expected features, UI layouts, and charts.
2. **Scan Implementation:** Check the source code in `src/` (especially `src/chartsViewProvider.ts` and `src/summaryViewProvider.ts`) to see how the data is actually parsed and displayed.
3. **Identify Discrepancies:** Note any features or configurations described in the documentation that are missing or mishandled in the current codebase.
4. **Report & Fix:** Produce a markdown report of the discrepancies. Provide a plan to update the implementation to strictly match the documentation.
5. **Turbo Execution:** If configured, automatically apply the fixes and re-run tests.
