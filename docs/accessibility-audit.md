# F7 accessibility audit

Automated coverage uses @axe-core/playwright with WCAG 2 A/AA, 2.1 A/AA and 2.2 AA tags. e2e/audit.spec.ts inspects 27 representative routes in both themes, including public forms, academic/schedule/import/task views, planning, AI action review, reminders, inbox, statistics and settings. The ordinary Chromium projects cover desktop and mobile-sized viewports; cross-browser configuration adds Firefox and WebKit.

A keyboard audit identified focus escaping the native modal's intended cycle. Both shared dialogs now explicitly cycle Tab/Shift+Tab through enabled visible controls and focus the dialog when all controls are disabled. Existing Escape, busy-state protection and focus restoration remain. Unit and browser regressions cover the change.

The audit checks overflow, accessible labels, headings, contrast, dialog keyboard behavior, reduced-motion preference and a text-size smoke. Charts retain textual/table equivalents. Screenshots are retained as Playwright artifacts. These checks do not establish full WCAG conformance: real screen-reader testing, physical touch devices, browser UI zoom and every possible dynamic error state remain manual follow-up work. Playwright WebKit is not native Safari certification.

Original Figma frames were unavailable through the current tools. Established semantic tokens, Manrope, flat bordered surfaces and existing navigation were preserved. No pixel-perfect claim is made. See f7-verification.md for actual command outcomes rather than assuming every configured project ran.

Firefox exposed an action UUID overflowing at intermediate widths; scoped wrapping preserves the complete identifier. WebKit exposed optional Subtask date clearing blocked by native bounds; bounds now apply only to a supplied date. These corrections retain existing lifecycle and timestamp assertions. Desktop Dashboard and mobile dark AI-review screenshots were visually inspected for token/layout consistency.
