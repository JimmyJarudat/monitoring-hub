# Office Monitoring — Feature Additions

> ส่วนเพิ่มเติมสำหรับ office use เฉพาะ 3 features
> ต่อยอดจาก core ที่มีอยู่แล้ว ไม่รื้อโครงสร้างใหม่

---

## 1. Maintenance Window

> กำหนดช่วง planned downtime ล่วงหน้า — ระบบหยุด alert และไม่นับ downtime ช่วงนั้น

### แนวคิด

ออฟฟิศมี maintenance จริง เช่น patch server, reboot switch, ต่อสายใหม่ ถ้าไม่มี Maintenance Window
ระบบจะ alert ตลอด และนับเป็น downtime ทำให้ availability report ผิดเพี้ยน และทำให้คนเริ่มเพิกเฉย alert

**พฤติกรรมที่ต้องการ:**
- สร้าง window ล่วงหน้า ระบุ monitor หรือ group ที่ได้รับผล
- ระหว่าง window: runner ยังเช็คอยู่ แต่ไม่ส่ง alert และไม่นับ downtime
- incidents ที่เกิดระหว่าง window แท็กว่า `planned` — ไม่ขึ้น attention list
- เมื่อ window สิ้นสุด: กลับมา alert ปกติ, incidents ที่ยัง open และไม่ได้ resolve ยังคงอยู่
- แสดงใน incident timeline และ availability report ว่าช่วงไหนเป็น planned downtime

### UI — หน้า Maintenance Windows `/maintenance`

```
[+ New Window]

ตาราง:
Name | Scope | Start | End | Status | Actions
-----|-------|-------|-----|--------|--------
Patch Tuesday | Group: Servers | 2 Jun 01:00 | 2 Jun 04:00 | Scheduled | Edit / Delete
Switch reboot  | Monitor: Core-SW-01 | (done) | | Completed | Delete
```

### UI — ฟอร์ม New / Edit Maintenance Window

```
Name:        [Patch Tuesday                    ]

Scope:       ( ) All monitors
             (•) Specific group   [Servers ▼]
             ( ) Specific monitor [-- select --]

Type:        (•) One-time
             ( ) Recurring

One-time:
  Start:     [2025-06-02]  [01:00]
  End:       [2025-06-02]  [04:00]
  Timezone:  [Asia/Bangkok ▼]

Recurring:
  Repeat:    [Monthly ▼]   on [First ▼] [Tuesday ▼]
  Time:      [01:00] → [04:00]
  Timezone:  [Asia/Bangkok ▼]

Description: [optional note]
```

### Schema

```sql
maintenance_windows (
  id                  UUID PRIMARY KEY,
  name                TEXT NOT NULL,
  description         TEXT,

  -- scope
  scope_type          TEXT NOT NULL,   -- all | group | monitor
  scope_group_id      UUID REFERENCES groups(id),
  scope_monitor_id    UUID REFERENCES monitors(id),

  -- timing
  window_type         TEXT NOT NULL,   -- one_time | recurring
  start_at            TIMESTAMPTZ,     -- one_time
  end_at              TIMESTAMPTZ,     -- one_time
  timezone            TEXT NOT NULL DEFAULT 'Asia/Bangkok',

  -- recurring fields
  recur_pattern       TEXT,            -- monthly | weekly
  recur_day_of_week   INT,             -- 0=Sun .. 6=Sat
  recur_week_of_month INT,             -- 1=first, 2=second, -1=last
  recur_time_from     TIME,
  recur_time_to       TIME,

  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
)
```

เพิ่ม column ใน `incidents`:
```sql
is_planned   BOOLEAN DEFAULT false   -- แท็กเมื่อเกิดระหว่าง maintenance window
```

### Runner Logic

ก่อน trigger alert ใน `monitor.Runner.ts`:

```ts
const activeMaintenance = await getActiveMaintenanceWindow(monitor)
if (activeMaintenance) {
  // บันทึก result ตามปกติ
  // แต่ mark incident ว่า is_planned = true
  // และไม่ส่ง notification
  return
}
```

### Implementation Order

- [ ] Schema: สร้างตาราง `maintenance_windows` + เพิ่ม `is_planned` ใน incidents
- [ ] Backend: CRUD API `/maintenance`
- [ ] Backend: helper `getActiveMaintenanceWindow(monitor)` สำหรับ runner
- [ ] Runner: เช็ค active window ก่อน trigger alert
- [ ] Frontend: หน้า `/maintenance` list + form
- [ ] Frontend: แสดง badge "Planned" ใน incident ที่ `is_planned = true`
- [ ] Frontend: แสดง maintenance window ใน incident timeline
- [ ] Reports: exclude planned downtime ออกจาก availability calculation (optional toggle)
- [ ] i18n: EN/TH keys

---

## 2. Incident Acknowledge

> เพิ่ม state กลางระหว่าง Open → Resolved เพื่อให้รู้ว่ามีคนรับเรื่องแล้ว

### แนวคิด

ตอนนี้ incident มีแค่ Open / Resolved — ออฟฟิศต้องการรู้ว่า alert ที่ดังอยู่ "มีคนเห็นและกำลังแก้" หรือ "ยังไม่มีใครรู้"
โดยเฉพาะเมื่อมีหลายคนในทีม IT

**พฤติกรรมที่ต้องการ:**
- flow: `Open` → `Acknowledged` → `Resolved`
- เมื่อ acknowledge: หยุดส่ง alert ซ้ำ (หยุด escalation / reminder)
- บันทึกว่าใคร acknowledge และเมื่อไหร่
- ยัง reopen ได้ถ้า acknowledge แล้วปัญหากลับมา
- ใน-app notification แสดงสถานะ acknowledged

### UI — Incident Detail

```
[Incident] Core-SW-01 — SNMP Unreachable
Status: 🔴 Open        Started: 10 Jun 09:15

[ Acknowledge ]  [ Resolve ]  [ Delete ]

─────────────────────────────────────────
Timeline:
  09:15  Incident opened
  ...
```

หลัง acknowledge:

```
Status: 🟡 Acknowledged  by somchai  at 09:22

[ Resolve ]  [ Reopen ]  [ Delete ]

Timeline:
  09:15  Incident opened
  09:22  Acknowledged by somchai
  ...
```

### UI — Incident List

เพิ่ม filter tab:
```
All | Open | Acknowledged | Resolved
```

แสดง badge สี:
- 🔴 Open — ยังไม่มีใครรับ
- 🟡 Acknowledged — มีคนรับแล้ว กำลังแก้
- 🟢 Resolved

### Schema

เพิ่ม columns ใน `incidents`:

```sql
status               TEXT DEFAULT 'open'   -- open | acknowledged | resolved
acknowledged_by      UUID REFERENCES users(id)
acknowledged_at      TIMESTAMPTZ
```

### Alert / Escalation Logic

```ts
// ใน notification sender
if (incident.status === 'acknowledged') {
  // ไม่ส่ง reminder / escalation ซ้ำ
  return
}
```

### Implementation Order

- [ ] Schema: เพิ่ม `status`, `acknowledged_by`, `acknowledged_at` ใน incidents
- [ ] Backend: PATCH `/incidents/:id/acknowledge`
- [ ] Alert runner: skip reminder ถ้า incident ถูก acknowledge แล้ว
- [ ] Frontend: ปุ่ม Acknowledge ใน incident detail + list
- [ ] Frontend: badge สี 3 state, filter tab
- [ ] Frontend: แสดง acknowledged by/at ใน timeline
- [ ] i18n: EN/TH keys

---

## 3. Printer SNMP Preset

> เพิ่ม preset สำเร็จรูปสำหรับ printer — ใช้ SNMP engine ที่มีอยู่แล้ว

### แนวคิด

Printer เป็นอุปกรณ์ที่ IT ออฟฟิศโดนถามทุกวัน — หมึกหมด, กระดาษหมด, เครื่อง error
ทั้งหมดอ่านได้ผ่าน Standard Printer MIB (RFC 3805) ที่เกือบทุกแบรนด์ implement

### แบรนด์ที่รองรับได้เลย

| แบรนด์ | Standard MIB | หมายเหตุ |
|---|---|---|
| Fuji Xerox / Fujifilm BI | ✅ ครบ | |
| Ricoh / NRG | ✅ ครบ | |
| Canon | ✅ ครบ | |
| HP / HP Enterprise | ✅ ครบ | |
| Konica Minolta | ✅ ครบ | |
| Kyocera | ✅ ครบ | |
| Brother (business) | ✅ ส่วนใหญ่ | |
| Epson (business) | ✅ ส่วนใหญ่ | inkjet ถูกๆ อาจไม่มี SNMP |

### OID Reference (Standard Printer MIB)

```
# Toner / Supplies
prtMarkerSuppliesDescription  1.3.6.1.2.1.43.11.1.1.23.1.x  → ชื่อ cartridge (Black, Cyan, ...)
prtMarkerSuppliesLevel        1.3.6.1.2.1.43.11.1.1.9.1.x   → ระดับปัจจุบัน
prtMarkerSuppliesMaxCapacity  1.3.6.1.2.1.43.11.1.1.8.1.x   → ความจุสูงสุด

# Paper Trays
prtInputDescription           1.3.6.1.2.1.43.8.2.1.18.1.x   → ชื่อถาด
prtInputCurrentLevel          1.3.6.1.2.1.43.8.2.1.10.1.x   → กระดาษปัจจุบัน
prtInputMaxCapacity           1.3.6.1.2.1.43.8.2.1.9.1.x    → ความจุสูงสุด

# Printer Status
hrPrinterStatus               1.3.6.1.2.1.25.3.5.1.1.1      → idle(3) | printing(4) | error(5)
hrPrinterDetectedErrorState   1.3.6.1.2.1.25.3.5.1.2.1      → bitmask error

# General
prtGeneralPrinterName         1.3.6.1.2.1.43.5.1.1.16.1     → ชื่อเครื่อง
```

### Error Bitmask (hrPrinterDetectedErrorState)

```
bit 0  = lowPaper
bit 1  = noPaper
bit 2  = lowToner
bit 3  = noToner
bit 4  = doorOpen
bit 5  = jammed
bit 6  = offline
bit 7  = serviceRequested
```

### Presets ที่ควรเพิ่ม

**Preset A — Printer Status**
```
OIDs:
  hrPrinterStatus               → แสดงเป็น idle / printing / error
  hrPrinterDetectedErrorState   → แปล bitmask เป็น label

Alert condition:
  hrPrinterStatus = error(5)
  หรือ bitmask มี jammed / doorOpen / noToner / noPaper
```

**Preset B — Toner Levels**
```
Method: SNMP Walk (ไม่ใช่ GET ตรงๆ เพราะเป็น array)
OIDs walk:
  prtMarkerSuppliesDescription  → ชื่อ cartridge
  prtMarkerSuppliesLevel        → ระดับปัจจุบัน
  prtMarkerSuppliesMaxCapacity  → ความจุสูงสุด

คำนวณ: level / maxCapacity * 100 = %
กรองออก: level = -1 หรือ -2 (unknown)

Alert condition:
  toner % < threshold (default 15%)
```

**Preset C — Paper Trays**
```
Method: SNMP Walk
OIDs walk:
  prtInputDescription     → ชื่อถาด (Tray 1, Bypass ...)
  prtInputCurrentLevel    → กระดาษปัจจุบัน
  prtInputMaxCapacity     → ความจุสูงสุด

คำนวณ: currentLevel / maxCapacity * 100 = %
กรองออก: maxCapacity = -1 หรือ -2 (unknown)

Alert condition:
  paper % < threshold (default 10%)
```

**Preset D — Full (รวมทั้งหมด)**
```
รวม A + B + C ไว้ใน preset เดียว
เหมาะสำหรับ add printer แบบ one-shot
```

### ข้อควรระวัง

- **Level = -1 หรือ -2** หมายถึง "ไม่รู้" / "ไม่มีข้อมูล" ต้องกรองออก ไม่ใช่แสดงว่าหมด
- **Supplies เป็น array** ต้องใช้ SNMP Walk ไม่ใช่ GET
- **บางรุ่น** maxCapacity = -1 แม้มีหมึก — ให้แสดง raw level แทน % ถ้า max ไม่รู้
- **Community string** ส่วนใหญ่ใช้ `public` (read-only) เพียงพอสำหรับ monitoring

### UI — การเพิ่ม Printer Monitor

เพิ่มใน New Monitor → Type: SNMP → Preset selector:

```
Preset:  [Printer — Full (Toner + Paper + Status) ▼]
         ├─ Printer — Status only
         ├─ Printer — Toner levels
         ├─ Printer — Paper trays
         └─ Printer — Full

Toner alert threshold:  [15] %
Paper alert threshold:  [10] %
```

### Implementation Order

- [ ] Backend: เพิ่ม printer OID presets ใน SNMP preset config
- [ ] Backend: SNMP Walk support สำหรับ supplies/input arrays (ถ้ายังไม่มี)
- [ ] Backend: แปล bitmask `hrPrinterDetectedErrorState` → human-readable labels
- [ ] Backend: คำนวณ % จาก level/maxCapacity พร้อม guard -1/-2
- [ ] Frontend: เพิ่ม Printer preset group ใน preset selector
- [ ] Frontend: threshold fields สำหรับ toner/paper %
- [ ] Frontend: monitor detail แสดง toner bars แต่ละ cartridge + paper trays
- [ ] i18n: EN/TH keys

---

## สรุปภาพรวม

| Feature | Depends On | Complexity | Value |
|---|---|---|---|
| Maintenance Window | Core incidents, Groups | Medium | 🔴 High |
| Incident Acknowledge | Core incidents | Low | 🔴 High |
| Printer SNMP Preset | SNMP engine | Low-Medium | 🟡 Medium |

ทั้ง 3 features ต่อยอดจาก core ที่มีอยู่แล้ว ไม่ต้องเพิ่ม dependency ใหม่
แนะนำทำตามลำดับ: **Acknowledge → Maintenance Window → Printer Preset**