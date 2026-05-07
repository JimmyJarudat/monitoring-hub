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

## Remaining Known Gaps

- [ ] CPU / RAM / Disk ยังเป็น baseline graph — ยังไม่มี threshold overlay / anomaly hints
- [ ] Bind credential usage ให้เห็นจาก group / device context
- [ ] Rollup summaries สำหรับ long-term charts
- [ ] Notification delivery retry / failure tracking

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
- [ ] Scheduled availability reports

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
