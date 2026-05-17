# Monitoring Hub TODO

## Current Direction

- ตอนนี้โฟกัสหลักคือ **ทำ capability ของ monitor ให้แน่นก่อน**
- แนวทางผลิตภัณฑ์คือ:
  - เอาความง่ายแบบ uptime tools
  - เอาความลึกด้านอุปกรณ์แบบ NMS
  - เอาความยืดหยุ่นของ inventory / grouping / credentials
  - แต่ตัดความรก, ตัดฟอร์มงง ๆ, และตัด setup ที่หนักเกินจำเป็น

## Done

### Core monitor types
- [x] PING
- [x] TCP
- [x] HTTP
- [x] HTTP advanced
  - auth
  - body text match
  - header match
  - JSON path / expected value
  - latency threshold
  - redirect control
- [x] TLS Certificate
  - cert expiry
  - warning days
- [x] DNS
  - resolve record
  - expected value
  - custom DNS server
- [x] SNMP
  - sysName
  - sysDescr
  - sysUpTime
  - custom OIDs
  - interface counters
- [x] SYSTEM via SNMP
  - CPU
  - RAM
  - Disk
  - load average
  - uptime
  - interface metrics
- [x] DOCKER via Portainer
  - endpoint overview
  - container by ID / name
  - managed stack by numeric ID
  - managed stack by name
  - external Swarm / Compose stack by Docker labels
- [x] DATABASE
  - PostgreSQL
  - MySQL
  - MariaDB
  - Redis
  - MongoDB
  - SQLite
  - SQL Server / MSSQL

### Monitor UX
- [x] Monitors list page
- [x] Add monitor page
- [x] Type guide panel
- [x] TCP presets
- [x] Monitor detail page
- [x] Check now
- [x] Enable / Disable
- [x] Edit / Delete
- [x] Recent results table
- [x] Time range filter
- [x] Load more results
- [x] Response time chart
- [x] Status timeline
- [x] Availability map

### Device / NMS foundation
- [x] Devices page
- [x] Vendor logo cards from URL
- [x] CPU / RAM / Disk gauges
- [x] Uptime / load / OS description
- [x] Device metric samples แยกออกจาก monitor_results
- [x] Metrics API สำหรับกราฟย้อนหลัง
- [x] Device detail graph section
- [x] Day / Week / Month / Custom filter สำหรับ metrics analysis
- [x] SNMP network counters fallback 32-bit / 64-bit
- [x] Network UI แสดง traffic rate แทน raw counters
- [x] Interface traffic graph เป็น bps/Kbps/Mbps/Gbps
- [x] Top interfaces / busiest links
- [x] Port/interface inventory page แยก
- [x] Error / discard counters

### Results / Incidents
- [x] Global results page `/results`
- [x] Filter day / week / month / custom
- [x] Incident page `/incidents`
- [x] Resolve / Reopen / Delete incident
- [x] Runner auto-create incident เมื่อ DOWN / DEGRADED
- [x] Runner auto-resolve incident เมื่อกลับมา UP
- [x] Incident Acknowledge — flow: Open → Acknowledged → Resolved
- [x] Badge สี 3 state (🔴 Open / 🟡 Acknowledged / 🟢 Resolved)
- [x] Filter tab: All / Open / Acknowledged / Resolved
- [x] Runner skip escalation/reminder เมื่อ incident ถูก acknowledge แล้ว
- [x] แสดง acknowledged by/at แม้ status ปัจจุบันจะเป็น Resolved แล้ว

### Inventory / Organization
- [x] Devices page route
- [x] Groups page `/groups`
- [x] Create / edit / delete group
- [x] Assign monitors into groups
- [x] Filter monitors/devices/results/incidents by group
- [x] Group summary page แบบ uptime/health ต่อกลุ่ม
- [x] Credentials page `/credentials`
- [x] Credential inventory types (SNMP, username/password, API token, SSH key)
- [x] Credential type guide
- [x] Credential preset selection in New Monitor
- [x] Auto-fill monitor fields from selected credential preset
- [x] Linked credential binding on monitor
- [x] Edit / unlink linked credential from monitor detail
- [x] Encrypt credential secret at rest
- [x] Credential usage map ("used by X monitors")

### Alerting & Notifications
- [x] Notification channels page `/channels`
  - LINE Notify
  - Email (SMTP)
  - Telegram
  - Slack (Block Kit)
  - Discord (Embeds)
  - Custom Webhook
- [x] Alert rules management page `/alerts`
- [x] Rich notification templates per channel type
- [x] Payload preview in channel form
- [x] Alert cooldown / dedupe / escalation logic
- [x] Notification delivery retry / failure tracking
- [x] In-app notifications with read-all and notification center

### Access control & Audit
- [x] Role-based access control
  - `admin` = full control
  - `user` = read-only operator
  - backend route guard
  - frontend route / nav / action guard
- [x] Audit logs page `/audit-logs`
- [x] Login history page

### User & Account management
- [x] Users management page `/users` (admin)
  - Create user
  - Edit user
  - Reset password (admin force-reset)
  - Delete user
- [x] Profile page `/profile`
  - Edit display name / username / email
  - DiceBear avatar (deterministic seed)
- [x] Change password page `/change-password`
  - Password strength meter
  - Session revocation warning

### System Settings
- [x] General / Branding
  - System name, tagline, logo text
  - Logo upload (stored in `backend/uploads/`)
  - Live sidebar update after save
- [x] Alerting Defaults
  - Incident reminder interval (hours)
  - Hot-reload in monitor runner (5-min cache TTL)
- [x] Monitor Defaults
  - Default interval / timeout
- [x] Security
  - Password min length
  - Session duration
  - Max login attempts
- [x] Data Retention
  - Results / metrics / audit retention days
  - Auto cleanup schedule
  - Manual clear history
- [x] Sidebar footer — version badge from `package.json` (build-time injection)

## Developer Guidelines

> กฎที่ทุกคนที่พัฒนาต่อต้องรู้ก่อนแตะโค้ด

### Frontend — i18n (ภาษา)

- **ทุกเพจ** ต้องรองรับ 2 ภาษา: ไทย (`th`) และ อังกฤษ (`en`)
- ใช้ `useTranslation()` จาก `react-i18next` และเรียก `t('key')` แทน hardcode string
- เพิ่ม key ใหม่ลงทั้ง `frontend/src/i18n/locales/en.json` และ `frontend/src/i18n/locales/th.json` ควบคู่กันทุกครั้ง
- i18n แปลครบทุกเพจแล้ว — เพจใหม่ที่เพิ่มต้องทำ i18n ตั้งแต่ต้น ไม่ hardcode

### Frontend — Toast notifications

- Toast (`toast.success`, `toast.error`, ฯลฯ) ต้องเป็น **ภาษาอังกฤษเท่านั้น**
- ไม่ใช้ `t('key')` กับ toast — toast เป็น developer-facing message ไม่ใช่ UI label
- เหตุผล: toast มักแสดงข้อความจาก error ที่มาจาก API ซึ่งเป็นภาษาอังกฤษอยู่แล้ว การผสมภาษาทำให้ดูไม่สอดคล้อง

### Backend — API response messages

- ข้อความใน `fail(...)`, `throw new Error(...)`, และ message fields ทุกจุดต้องเป็น **ภาษาอังกฤษเท่านั้น**
- ห้าม hardcode ภาษาไทยใน backend ไม่ว่ากรณีใด
- Frontend รับ message จาก API แล้วแสดงผ่าน toast — ถ้า backend เป็นไทยจะทำให้ toast เป็นไทยโดยไม่ตั้งใจ

### Frontend — Dark mode

- UI ต้องรองรับ **dark mode** — ยังไม่ได้ implement
- ใช้ Tailwind dark mode (`dark:` prefix) และ class-based toggle (`class="dark"` บน `<html>`)
- สี, background, border, text ทุกจุดต้องมี dark variant ครบ
- toggle เก็บค่าใน `localStorage` และ respect `prefers-color-scheme` เป็น default

---

## Remaining Known Gaps
- [x] Docker monitor: รองรับ target เดียวต่อ monitor (`stackId` หรือ `stackName` หรือ `containerId`) และรองรับ external stack ผ่าน `stackName` แล้ว — lookup `/api/stacks` ก่อน แล้ว fallback ไป Docker labels (`com.docker.stack.namespace`, `com.docker.compose.project`)


- [x] Dark mode — implement แล้ว ใช้งานได้
- [x] Monitor Active Window — เสร็จแล้ว (commit: feat: add monitor active windows)
- [x] Incident Acknowledge timeline — แสดง "acknowledged by / at" แม้ incident จะ resolved แล้ว
- [x] CPU / RAM / Disk metrics polish — มี threshold overlay, anomaly hints, และ rollup summary แล้ว
- [x] Bind credential usage ให้เห็นจาก group / device context
- [x] Rollup summaries สำหรับ long-term charts
- [x] Maintenance Window core — CRUD, monitor/group target, sidebar menu, และ runner suppress incident/alert ระหว่าง window
- [x] Maintenance Window reports — toggle "Exclude planned downtime" ใน Reports page ตัด results ที่ตกอยู่ในช่วง maintenance window ออกจาก uptime calculation

---

## Feature: Report Export Overhaul

> ปัญหาปัจจุบัน: export เป็น CSV/JSON/HTML-as-Excel ที่อ่านไม่ออก สรุปข้อมูลไม่ได้ ไม่มีกราฟ ไม่มีหน้าสรุป

### เป้าหมาย

แทนที่ระบบ export เดิม (CSV + JSON + HTML-Excel) ด้วย:
1. **Excel จริงด้วย ExcelJS** — หลายชีท สีสวย มีกราฟ มี filter อ่านได้
2. **PDF รายงานมืออาชีพ** — โลโก้บริษัท ชื่อบริษัท หลายหน้า เหมือนรีพอร์ตจริง
3. **ตัดส่วน Export CSV ออก** — ไม่ต้องการแล้ว

---

### 1. Excel Export (ExcelJS)

**Library:** `exceljs` (client-side via browser bundle หรือ generate ที่ backend)

> แนะนำ: generate ที่ backend endpoint `/reports/export/excel` เพื่อให้ใช้ Node.js API ได้เต็มที่

#### Sheet 1 — Executive Summary (หน้าแรก)

```
Row 1-3:   Header block — ชื่อระบบ, ช่วงเวลารายงาน, วันที่ generate, ชื่อบริษัท
Row 5+:    Stat cards แถว (merged cells):
             Report Uptime | Down Checks | Incidents | Avg Response | Fleet Uptime 24h
Row 12+:   Status distribution table (UP / DEGRADED / DOWN counts + %)
Row 18+:   Top 3 ปัญหา monitors (brief)
```

- สีพื้นหลัง header: `#0f172a` (slate-950) ตัวหนังสือขาว
- stat cells ใช้สีตาม status (เขียว/แดง/เหลือง)
- ใส่ border และ alternating row color

#### Sheet 2 — Monitor Reliability

| Monitor | Type | Checks | Uptime % | Down | Degraded | Avg Response | Last Status |
- freeze row header
- auto filter บน column ทั้งหมด
- conditional formatting: Uptime < 95% → แดงอ่อน, < 99% → เหลือง, ≥ 99% → เขียวอ่อน
- sort default: uptime ASC (แย่สุดอยู่บน)
- Bar chart ข้าง table แสดง Top 10 Uptime

#### Sheet 3 — Incident Report

| Started | Monitor | Type | Status | Duration | Severity | Resolved At | Message |
- conditional formatting: OPEN → แดง, ACKNOWLEDGED → เหลือง, RESOLVED → เขียว
- auto filter
- duration คำนวณและแสดง "2h 15m" format

#### Sheet 4 — Group Summary

| Group | Monitors | Checks | Uptime % | UP | Down | Degraded | Incidents | Avg Response |
- uptime % bar mini chart ถ้า ExcelJS รองรับ
- conditional formatting เหมือน Sheet 2

#### Sheet 5 — Raw Results (sample)

- Result samples (ไม่เกิน 500 แถว)
- ใช้ Table style ของ Excel
- Filter พร้อมใช้งาน

---

### 2. PDF Export

**Library:** `@react-pdf/renderer` (client-side) หรือ `puppeteer` (server-side screenshot)

> แนะนำ: `@react-pdf/renderer` — generate ใน browser ไม่ต้องการ server

#### หน้า 1 — Cover Page

```
[โลโก้บริษัท]
[ชื่อบริษัท / System Name]

Availability Report
[ช่วงเวลา: Week / Day / Month / Custom]
Generated: [วันที่]
```

- พื้นหลัง: dark slate gradient
- ตัวอักษร: ขาวบน dark / slate บน light

#### หน้า 2 — Executive Summary

- Stat cards 2×3 grid (Uptime, Down, Degraded, Incidents, Avg Response, Fleet 24h)
- Pie chart สัดส่วน UP/DOWN/DEGRADED
- ตาราง Top 5 ปัญหา monitors

#### หน้า 3 — Monitor Reliability Ranking (ทั้งหมด)

- ตารางเต็ม: Monitor, Uptime%, Down, Degraded, Avg Response
- uptime bar mini visual (colored rectangle)
- แบ่งหน้าอัตโนมัติถ้า monitors เยอะ

#### หน้า 4 — Incident Report

- ตาราง incidents: Started, Monitor, Duration, Status, Message
- สี badge ตาม status

#### หน้า 5 — Group Summary

- ตาราง group: Group name, Monitors, Uptime%, Checks, Incidents
- uptime bar visual

#### หน้า N — Footer ทุกหน้า

- ชื่อบริษัท | ชื่อระบบ | Page X of Y | Generated at [timestamp]

---

### 3. Company branding (Settings page)

เพิ่มใน `/settings` tab ใหม่หรือ section ใน General:

```
Report Branding
  Company name:    [____________]     ← ใช้ใน PDF cover + Excel header
  Company logo:    [Upload logo]      ← รูปที่ใช้ใน PDF cover (PNG/SVG, max 2MB)
  Report footer:   [____________]     ← footer text เช่น "Confidential"
```

- เก็บใน `SystemSetting` table เหมือน branding เดิม (key-value)
- `report_company_name`, `report_logo_url`, `report_footer_text`
- ถ้าไม่ตั้งค่า ใช้ `system_name` และ `system_logo_url` เป็น fallback

---

### Implementation order

- [x] **Step 1 — Report Branding (Settings)** ✅ commit: `feat: add report branding config`
  - Backend: `reportBranding` section ใน `systemConfig.service.ts` (companyName, logoUrl, footerText)
  - Admin routes: PATCH `/admin/system-config` รองรับ reportBranding patch, POST/DELETE `/admin/system-config/report-logo`
  - Context: `ReportBrandingConfig` type + `DEFAULTS` ใน `systemConfig.context.tsx`
  - Settings UI: card "Report Branding" ใน `/settings` — company name input, footer text input, logo upload/remove (PNG/JPG/WEBP/SVG ≤2MB)
  - i18n: EN/TH keys ครบ (`settings.sections.reportBranding.*`, `settings.reportCompanyName`, ฯลฯ)

- [x] **Step 2 — Excel Export (ExcelJS)** ✅ commit: `feat: Excel report export via ExcelJS (5-sheet workbook)`
  - Backend: `excelExport.service.ts` — generate workbook จาก Prisma data โดยตรง
  - Route: `GET /reports/export/excel?from&to&rangeLabel` → ส่ง `.xlsx` binary
  - 5 Sheets สำเร็จรูป:
    - Sheet 1 Executive Summary: company name header, KPI row (Checks/UP/DEGRADED/DOWN/Open Incidents/Avg Response), uptime banner color-coded, status distribution
    - Sheet 2 Monitor Reliability: sort worst-first, conditional format Uptime % (≥99% เขียว, ≥95% เหลือง, <95% แดง), freeze row + auto-filter
    - Sheet 3 Incident Report: color-coded status (OPEN=แดง, ACKNOWLEDGED=เหลือง, RESOLVED=เขียว), freeze + auto-filter
    - Sheet 4 Group Summary: conditional format uptime เหมือน Sheet 2
    - Sheet 5 Raw Results: max 500 rows, freeze + auto-filter
  - Frontend: ลบปุ่ม CSV/JSON/HTML-Excel ออก แทนด้วยปุ่ม "Export Excel" (เขียว) เรียก backend endpoint แล้ว download `.xlsx`
  - i18n: เพิ่ม `reportsPage.exportingExcel` EN/TH

- [x] **Step 3 — PDF Export** ✅ commit: `feat: PDF report export via @react-pdf/renderer`
  - Install: `@react-pdf/renderer` ใน frontend
  - Component: `frontend/src/components/reports/AvailabilityReportPdf.tsx`
  - 5 หน้า: Cover (logo+company+range) → Executive Summary (uptime banner, KPI grid, status dist, top 5) → Monitor Reliability (ranked table + uptime bar mini visual) → Incident Report (status badge) → Group Summary (uptime bar)
  - Footer ทุกหน้า: company | footer text | Page X of Y
  - Branding จาก `useSystemConfig()` — reportBranding.logoUrl → fallback general.logoUrl
  - ปุ่ม "Export PDF" (สีแดง) ใน Reports page ถัดจากปุ่ม Excel
  - i18n: `reportsPage.exportPdf`, `reportsPage.exportingPdf` EN/TH ✅

- [x] **Step 4 — i18n สำหรับปุ่ม PDF** ✅ รวมใน Step 3 แล้ว

---

## Feature: Monitor Active Window

> เพิ่มเงื่อนไขเวลาทำงานให้ monitor — ระบบจะเช็คเฉพาะช่วงที่กำหนด นอกเวลาหยุดเช็คทันที

### แนวคิด

อุปกรณ์บางอย่างทำงานเฉพาะช่วงเวลาทำการ เช่น เครื่องปริ้น, จอแสดงผล, workstation ถ้า monitor ตลอด 24 ชม. จะได้ alert ตอนกลางคืนหรือวันหยุดโดยไม่จำเป็น

**พฤติกรรมที่ต้องการ:**
- Default: ไม่กำหนดเวลา → เช็คตลอดเหมือนเดิม (ไม่กระทบ monitor ที่มีอยู่)
- เมื่อเปิด Active Window: runner จะ **หยุดเช็คทันที** นอกช่วงเวลาที่กำหนด
- นอกเวลา: ไม่บันทึก result, ไม่สร้าง incident, ไม่ส่ง notification
- Open incidents ที่ค้างอยู่ก่อนหมดเวลา → ทิ้งไว้ เมื่อเข้าเวลาใหม่ ถ้าเช็คแล้ว UP จะ auto-resolve ตามปกติ

### UI — ส่วน "Active Window" ในฟอร์ม monitor

```
[ ] Restrict monitoring to active window

Days:  [✓] Mon  [✓] Tue  [✓] Wed  [✓] Thu  [✓] Fri  [ ] Sat  [ ] Sun

Time:  [08:00] → [17:00]

Timezone:  [Asia/Bangkok ▼]

Note: Outside this window the monitor will not run.
```

- toggle off = ซ่อน section วัน/เวลาทั้งหมด (ไม่บังคับกรอก)
- days เป็น multi-select checkbox อิสระ — เลือกได้ทุกวันหรือบางวัน
- time เป็น HH:MM จาก/ถึง — รองรับข้ามคืน เช่น 22:00 → 06:00
- timezone default ตาม system settings ของ backend

### Schema

เพิ่ม columns ใน `Monitor` table (nullable ทั้งหมด = ไม่กำหนด):

```sql
active_window_enabled   BOOLEAN   DEFAULT false
active_window_days      INT[]     -- [1,2,3,4,5] = Mon-Fri (0=Sun, 6=Sat)
active_window_from      TIME      -- "08:00"
active_window_to        TIME      -- "17:00"
active_window_timezone  TEXT      -- "Asia/Bangkok"
```

### Runner logic

ใน `monitor.Runner.ts` ก่อน `runMonitorCheck()`:

```ts
if (monitor.activeWindowEnabled) {
  const now = toZonedTime(new Date(), monitor.activeWindowTimezone)
  const day = getDay(now)        // 0=Sun ... 6=Sat
  const time = format(now, "HH:mm")
  const inDay = monitor.activeWindowDays.includes(day)
  const inTime = isWithinTimeRange(time, monitor.activeWindowFrom, monitor.activeWindowTo)
  if (!inDay || !inTime) return  // skip — นอกเวลา
}
```

- ใช้ `date-fns-tz` สำหรับ timezone conversion
- `isWithinTimeRange` ต้องรองรับ overnight range (from > to)

### Implementation order

- [x] Migration: เพิ่ม columns ใน Monitor table
- [x] Backend PATCH `/monitors/:id` รับและ validate active window fields
- [x] Runner: เพิ่ม active window check ก่อน runMonitorCheck
- [x] Frontend: เพิ่ม Active Window section ในฟอร์ม New/Edit Monitor
- [x] Frontend: แสดง badge "Active window" ใน monitor list/detail ถ้าเปิดใช้
- [x] i18n: เพิ่ม EN/TH keys สำหรับ Active Window UI

## Next Recommended Work

### Dashboard
- [x] Dashboard overview page `/dashboard`
- [x] Stat cards (monitors up/down, open incidents, recent events)
- [x] Attention list (degraded / down items)
- [x] Open incidents summary
- [x] Group / device summary widgets

### Status Map
- [x] Visual topology / status map

### Reports
- [x] On-demand availability reports
- [x] Scheduled availability reports

## Product Strategy — Take the Best, Cut the Worst

### What to keep
- **From uptime tools** — setup ง่าย, monitor create flow ตรงไปตรงมา, อ่านสถานะเร็ว
- **From NMS tools** — device identity, interface metrics, CPU/RAM/Disk history, grouped inventory
- **From modern infra tools** — graph ดูง่าย, filter ช่วงเวลาเร็ว, reusable credentials, clean API-first structure

### What to avoid
- ฟอร์มที่บังคับกรอกเยอะทั้งที่ไม่จำเป็น
- แยกหน้าเยอะเกินจนหาไม่เจอว่าอะไรอยู่ตรงไหน
- raw counters ที่คนอ่านไม่รู้เรื่อง
- credential กระจายอยู่หลายหน้าแบบไม่รู้ว่าตัวไหนใช้อยู่
- dashboard สวยแต่ไม่ช่วย action
- monitor type เยอะ แต่ใช้งานจริงแล้วไม่ลึกพอ

## Target Shape

ถ้าพัฒนาไปตามแนวนี้ ตัวระบบควรออกมาเป็น:

- สร้าง monitor ง่ายแบบ lightweight monitoring
- ดูอุปกรณ์ลึกพอสำหรับงาน network/server จริง
- reuse credential และ group ได้เป็นระบบ
- alerting ครบ ทั้ง channels, rules, และ templates
- dashboard และ reports เป็น layer สุดท้ายที่ขยายต่อได้โดยไม่ต้องรื้อแกนข้อมูลใหม่


---------------------- END Monitor ---------------------------

พอจบส่วนแรกทั้งหมดก่อน ค่อยมาเริ่มวางแฟนส่วนนี้

---

## DB Insight

> แยกออกจาก monitor checker ปกติ — เป็น deep analysis layer สำหรับ database monitors

### แนวคิดหลัก

- **Monitor** = connectivity check (ทำอยู่แล้ว) — รู้ว่า DB ขึ้นหรือลง
- **DB Insight** = analysis layer — รู้ว่า DB ทำงานอย่างไร สุขภาพเป็นยังไง
- Insight runner แยกจาก monitor runner — interval ยาวกว่า (นาที ไม่ใช่วินาที) และ opt-in ต่อ DB
- ดึง credential จาก credential store เดิม ไม่ต้องสร้างใหม่

---

### DB ที่รองรับ

| DB | Slow queries | Index analysis | Table sizes | Connections / locks | Replication lag | File sizes |
|---|---|---|---|---|---|---|
| PostgreSQL | pg_stat_statements | pg_stat_user_indexes | pg_relation_size() | pg_stat_activity | pg_stat_replication | pg_database_size() + log path |
| MySQL / MariaDB | performance_schema | sys.schema_unused_indexes | information_schema.TABLES | PROCESSLIST | SHOW REPLICA STATUS | data_length + SHOW VARIABLES |
| SQL Server / Azure SQL | sys.dm_exec_query_stats | sys.dm_db_missing_index_details | sys.dm_db_partition_stats | sys.dm_exec_sessions | sys.dm_hadr_database_replica_states | sys.master_files |
| MongoDB | system.profile | $indexStats | db.stats() + collection.stats() | serverStatus().connections | rs.status() | dbStats.dataSize + logPath |

---

### หน้า DB Insight `/db-insight/:monitorId`

#### Layout

```
[Page header]
  ชื่อ DB · badge (PostgreSQL / MySQL / etc.) · credential ที่ใช้ · เวลา collect ล่าสุด
  [Time range selector]  [Refresh]  [Export]

[Stat cards — 5 ใบ]
  Active connections | Slow queries (1h) | DB size | Locks / blocked | Replication lag

[Tabs]
  Slow queries | Index analysis | Table & file sizes | Connections | Replication
```

#### Tab: Slow queries
- ตาราง top N slow queries เรียงตาม avg duration
- คอลัมน์: query text (truncated), avg duration ms, call count, rows examined
- badge สี: แดง > threshold alert, เหลือง > threshold warn, น้ำเงิน > 1,000 ms
- ปุ่ม "Explain" ต่อแถว → แสดง execution plan (phase 2)
- filter: เลือก threshold / top N

#### Tab: Index analysis
- แบ่งกลุ่ม: Missing index · Unused index · Healthy
- Missing: แสดง table, column set, seq scan count, estimated gain, พร้อม suggested `CREATE INDEX` statement (copy)
- Unused: แสดง index name, last used, size — พร้อม suggested `DROP INDEX` statement (copy)
- Healthy: แสดง index name, scan count, index-only scan rate

#### Tab: Table & file sizes
- **File sizes** (ด้านบน)
  - DB data file size รวม
  - Log file size รวม — เน้นถ้าโตเกิน threshold
  - แต่ละ file path + size (SQL Server: sys.master_files / PostgreSQL: pg_relation_filepath)
- **Table sizes** (ด้านล่าง)
  - ตาราง: table name, total size, data size, index size, row count, last analyze/vacuum
  - sort by total size desc by default
  - bar chart mini แสดงสัดส่วนต่อ DB รวม

#### Tab: Connections
- สรุป: active / idle / idle in transaction / total vs max
- ตาราง process list: PID, user, app name, state, duration, query text (truncated)
- highlight blocked / long-running (> configurable threshold)
- ปุ่ม "Kill" ต่อแถว (admin only) — ยืนยันก่อนรัน

#### Tab: Replication
- ตาราง replica list: replica name, state, lag (seconds), sent/write/flush LSN
- badge: streaming (green) / lagging (amber) / stopped (red)
- แสดง lag เทียบกับ alert threshold ที่ตั้งไว้

---

### Insight Runner

แยกจาก monitor runner — ทำงานเป็น scheduled job ต่อ DB monitor ที่เปิด insight ไว้

#### การตั้งค่าต่อ DB monitor

```
[ ] Enable DB Insight
Collect interval:  [15] minutes
Slow query threshold:  [1000] ms  (บันทึกใน insight config)
Top N slow queries:  [20]
```

#### Flow ของ runner

```
1. ดึงรายการ DB monitors ที่ enable insight + ถึงเวลา collect
2. ต่อ DB ด้วย credential ที่ผูกไว้
3. รัน collector queries ตาม DB type
4. บันทึกผลลงตาราง insight (snapshot + detail tables)
5. เปรียบเทียบกับ alert rules → trigger alert ถ้าตรงเงื่อนไข
6. อัปเดต last_collected_at
```

#### Alert rules สำหรับ DB Insight

เพิ่มเข้าระบบ alert rules เดิม — เลือก condition type ได้:

| Condition | พารามิเตอร์ | ตัวอย่าง |
|---|---|---|
| Slow query avg > X ms | threshold ms | avg > 5,000 ms |
| Slow query count > N (per interval) | count | > 10 queries |
| Log file size > X MB/GB | size threshold | > 2 GB |
| DB data file size > X MB/GB | size threshold | > 50 GB |
| Table size > X MB/GB | table name + size | orders > 10 GB |
| Active connections > X% of max | percent | > 80% |
| Replication lag > X seconds | seconds | > 30 s |
| Blocked query duration > X seconds | seconds | > 60 s |
| Unused index count > N | count | > 5 |

Alert ส่งผ่าน notification channels เดิม (LINE / Email / Telegram / Slack / Discord / Webhook)

---

### Schema เพิ่ม

```sql
-- config ต่อ monitor
db_insight_config (
  id, monitor_id, enabled, collect_interval_minutes,
  slow_query_threshold_ms, top_n_queries,
  created_at, updated_at
)

-- snapshot หัว
db_insight_snapshots (
  id, monitor_id, db_type, collected_at, collection_duration_ms, error_message
)

-- slow queries
db_slow_queries (
  id, snapshot_id, query_hash, query_text,
  avg_duration_ms, max_duration_ms, call_count, rows_examined,
  collected_at
)

-- index stats
db_index_stats (
  id, snapshot_id, table_name, index_name,
  status,           -- missing | unused | healthy
  scans_count, size_bytes, last_used,
  suggested_sql     -- CREATE INDEX / DROP INDEX statement
)

-- table sizes
db_table_sizes (
  id, snapshot_id, table_name,
  total_bytes, data_bytes, index_bytes, row_count,
  last_analyzed_at
)

-- file sizes
db_file_sizes (
  id, snapshot_id,
  file_type,        -- data | log | wal
  file_path, size_bytes
)

-- connections snapshot
db_connection_stats (
  id, snapshot_id,
  total, active, idle, idle_in_transaction, max_connections,
  blocked_count, longest_blocked_seconds
)

-- replication
db_replication_status (
  id, snapshot_id, replica_name,
  state,            -- streaming | lagging | stopped
  lag_seconds, detail_json
)
```

> retention ใช้ Data Retention settings เดิมของระบบ — ไม่ต้องเพิ่ม config ใหม่

---

### Credential permissions ที่ต้องการ

เพิ่ม hint ใน credential form เมื่อ DB type ถูกเลือก:

```
PostgreSQL
  GRANT pg_monitor TO <user>;
  -- หรือ
  GRANT SELECT ON pg_stat_statements TO <user>;
  GRANT SELECT ON pg_stat_activity TO <user>;
  GRANT SELECT ON pg_stat_replication TO <user>;

MySQL / MariaDB
  GRANT PROCESS ON *.* TO '<user>';
  GRANT SELECT ON performance_schema.* TO '<user>';
  GRANT SELECT ON sys.* TO '<user>';

SQL Server
  GRANT VIEW SERVER STATE TO [<user>];

MongoDB
  db.grantRolesToUser("<user>", [{ role: "clusterMonitor", db: "admin" }])
```


---

### Implementation order (แนะนำ)

- [x] Schema: สร้างตาราง insight ทั้งหมด + migration
- [x] Insight config UI: toggle + interval + threshold ใน monitor edit page
- [x] Collector: PostgreSQL
- [x] Insight runner: scheduled job + last_collected_at tracking
- [x] หน้า DB Insight: stat cards + tabs (slow / index / table+file / connections / replication)
- [x] Collector: MySQL / MariaDB
- [x] Collector: SQL Server / Azure SQL — filter to monitored DB, per-login breakdown
- [x] Connections tab: per-user/login breakdown table (all 3 DB types)
- [x] Replication tab: AlwaysOn AG + Log Shipping + Mirroring fallback chain
- [x] Alert rules: เพิ่ม DB Insight condition types เข้าระบบ alert เดิม
- [x] Alert runner: evaluate DB Insight snapshot แล้วเปิด/ปิด incident + ส่ง notification ตาม rule
- [x] Alert UI: แสดง threshold ของ size metrics เป็น MB/GB/TB และแปลงกลับเป็น bytes ตอนบันทึก
- [x] Collector: MongoDB
- [ ] Explain plan viewer (phase 2)
