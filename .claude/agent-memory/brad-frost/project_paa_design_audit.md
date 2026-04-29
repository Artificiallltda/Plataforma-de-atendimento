---
name: PAA Dashboard Design Audit
description: Dark mode coverage gaps, contrast failures in MessageList/MessageInput/Inbox, and token inconsistency across legacy components (TicketCard, AgentsList, KpiCards)
type: project
---

Dark mode strategy: class-based via ThemeProvider toggling document.documentElement.classList. Correctly persists to localStorage. Theme toggle is working.

Token system: minimal — only --background, --foreground, --primary, --primary-dark, --accent, --sidebar-bg, --card-bg defined in globals.css. No semantic message tokens exist.

Critical contrast failures:
- MessageList customer bubble: bg-gray-100 + no text color = ~14:1 light, ~1.05:1 dark (FAIL dark)
- MessageInput container: bg-white hardcoded, no dark: = white panel on dark bg
- Inbox header/info bar: bg-white, bg-slate-50 hardcoded with no dark: variants

Components with ZERO dark mode support: MessageList, MessageInput, Inbox, TicketCard, TicketQueue, AgentsList, KpiCards, QueueBySector, ExportButton

**Why:** Product ships to production 2026-04-28. Dark mode was added at layout level (KanbanCard, ModernLayout) but inbox/chat components were built independently without dark: prefixes.

**How to apply:** Surgical fixes to 3-5 files resolve the P0 contrast issues. Full dark mode parity for legacy components (KpiCards, AgentsList) is a separate P1 pass.
