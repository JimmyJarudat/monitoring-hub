# Monitoring Hub TODO

## Current Direction

- ตอนนี้โฟกัสหลักคือ **ทำ capability ของ monitor ให้แน่นก่อน**
- **Dashboard** และ **Notification / Channels** จะเก็บไว้ช่วงท้าย
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

### Results / incidents
- [x] Global results page `/results`
- [x] Filter day / week / month / custom
- [x] Incident page `/incidents`
- [x] Resolve / Reopen / Delete incident
- [x] Runner auto-create incident เมื่อ DOWN / DEGRADED
- [x] Runner auto-resolve incident เมื่อกลับมา UP

### Inventory / organization
- [x] Devices page route
- [x] Groups page `/groups`
- [x] Create / edit / delete group
- [x] Assign monitors into groups
- [x] Credentials page `/credentials`
- [x] Role-based access control
  - [x] `admin` = full control
  - [x] `user` = read-only operator
  - [x] backend route guard
  - [x] frontend route / nav / action guard
- [x] Credential inventory types
  - SNMP community
  - username / password
  - API token
  - SSH key
- [x] Credential type guide
- [x] Credential preset selection in New Monitor
- [x] Auto-fill monitor fields from selected credential preset
- [x] Linked credential binding on monitor

### Backend / API
- [x] Manual check endpoint
- [x] Monitor summary endpoint
- [x] Global results endpoint
- [x] Incidents CRUD endpoint
- [x] Groups CRUD endpoint
- [x] Credentials CRUD endpoint
- [x] Metrics timeseries endpoint

## Known Gaps Right Now

### Credentials
- [x] หน้า Edit monitor เปลี่ยนหรือ unlink credential ได้โดยตรง
- [x] Secret เข้ารหัสใน DB แล้ว (encrypt at rest)
- [x] มี permission control เรื่องใครดู secret ได้
- [x] มี usage map ว่า credential ไหนถูกใช้กับ monitor ไหนบ้าง

### Device / network analytics
- [x] Network UI แสดง **traffic rate** แทน raw counters ในหน้า detail
- [x] Interface traffic graph เป็น bps/Kbps/Mbps/Gbps แบบอ่านง่าย
- [x] Top interfaces / busiest links ในหน้า detail
- [x] มี port/interface inventory page แยก
- [x] Error / discard counters ในหน้า detail
- [ ] CPU / RAM / Disk ยังเป็น baseline graph — ยังไม่มี threshold overlay / anomaly hints

### Inventory flow
- [x] Filter monitors/devices/results/incidents by group
- [x] Group summary page แบบ uptime/health ต่อกลุ่ม
- [ ] Bind credential usage ให้เห็นจาก group / device context

## Next Recommended Work

### Priority 1 — Make device monitoring feel like a real NMS
- [x] Convert network counters to traffic rate
  - [x] RX/TX bps
  - [x] Kbps / Mbps / Gbps formatting
  - [x] per-interface history
- [x] Add interface-focused device detail
  - [x] top active interfaces
  - [x] interface operational status
  - [x] error / discard counters ให้ครบขึ้น
- [x] Add group-aware views
  - [x] filter devices by group
  - [x] filter monitors by group
  - [x] results/incidents by group

### Priority 2 — Make credentials first-class
- [x] Store `credentialId` on monitor config/model
- [x] Resolve credential in checker/runner at runtime
- [x] Update monitor automatically when shared credential changes
- [x] Show credential usage map
- [x] Add “used by X monitors” in credentials page
- [x] Edit / unlink linked credential from monitor detail
- [x] Encrypt credential secret at rest

### Priority 3 — Retention and storage hygiene
- [x] History retention settings
  - 7 / 14 / 30 / 90 days
- [x] Auto cleanup ตาม schedule
- [x] Manual clear history
- [ ] Rollup summaries สำหรับ long-term charts

## Deliberately Later

### Notifications / alerting
- [ ] Notification channels page
- [ ] LINE / Email / Slack / Discord delivery
- [ ] Alert rules management page
- [ ] Cooldown / dedupe / escalation

### Dashboard
- [ ] Dashboard overview
- [ ] Stat cards
- [ ] attention list
- [ ] open incidents summary
- [ ] group/device summary widgets

## Product Strategy — Take the Best, Cut the Worst

### What to keep
- [ ] **From uptime tools**
  - setup ง่าย
  - monitor create flow ตรงไปตรงมา
  - อ่านสถานะเร็ว
- [ ] **From NMS tools**
  - device identity
  - interface metrics
  - CPU/RAM/Disk history
  - grouped inventory
- [ ] **From modern infra tools**
  - graph ดูง่าย
  - filter ช่วงเวลาเร็ว
  - reusable credentials
  - clean API-first structure

### What to avoid
- [ ] ฟอร์มที่บังคับกรอกเยอะทั้งที่ไม่จำเป็น
- [ ] แยกหน้าเยอะเกินจนหาไม่เจอว่าอะไรอยู่ตรงไหน
- [ ] raw counters ที่คนอ่านไม่รู้เรื่อง
- [ ] credential กระจายอยู่หลายหน้าแบบไม่รู้ว่าตัวไหนใช้อยู่
- [ ] dashboard สวยแต่ไม่ช่วย action
- [ ] monitor type เยอะ แต่ใช้งานจริงแล้วไม่ลึกพอ

## Target Shape

ถ้าพัฒนาไปตามแนวนี้ ตัวระบบควรออกมาเป็น:

- สร้าง monitor ง่ายแบบ lightweight monitoring
- ดูอุปกรณ์ลึกพอสำหรับงาน network/server จริง
- reuse credential และ group ได้เป็นระบบ
- ขยายไป alerting/dashboard ทีหลังโดยไม่ต้องรื้อแกนข้อมูลใหม่
