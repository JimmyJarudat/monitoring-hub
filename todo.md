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
- [ ] Dark mode — UI ยังรองรับเฉพาะ light mode, ต้องเพิ่ม dark variant ทุก component
- [ ] Monitor Active Window — เช็คเฉพาะช่วงเวลาทำงานที่กำหนด (ดูรายละเอียดด้านล่าง)
- [ ] CPU / RAM / Disk ยังเป็น baseline graph — ยังไม่มี threshold overlay / anomaly hints
- [ ] Bind credential usage ให้เห็นจาก group / device context
- [ ] Rollup summaries สำหรับ long-term charts

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

- [ ] Migration: เพิ่ม columns ใน Monitor table
- [ ] Backend PATCH `/monitors/:id` รับและ validate active window fields
- [ ] Runner: เพิ่ม active window check ก่อน runMonitorCheck
- [ ] Frontend: เพิ่ม Active Window section ในฟอร์ม New/Edit Monitor
- [ ] Frontend: แสดง badge "Active window" ใน monitor list/detail ถ้าเปิดใช้
- [ ] i18n: เพิ่ม EN/TH keys สำหรับ Active Window UI

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

- [ ] Schema: สร้างตาราง insight ทั้งหมด + migration
- [ ] Insight config UI: toggle + interval + threshold ใน monitor edit page
- [ ] Collector: PostgreSQL ก่อน (ข้อมูลครบ, query ตรงไปตรงมา)
- [ ] Insight runner: scheduled job + last_collected_at tracking
- [ ] หน้า DB Insight: stat cards + tabs (slow / index / table+file / connections)
- [ ] Alert rules: เพิ่ม DB Insight condition types เข้าระบบ alert เดิม
- [ ] Collector: MySQL / MariaDB
- [ ] Collector: SQL Server / Azure SQL
- [ ] Collector: MongoDB
- [ ] Replication tab
- [ ] Explain plan viewer (phase 2)
