# Monitoring Hub

ระบบ monitoring แบบ all-in-one สำหรับเครือข่ายและเซิร์ฟเวอร์องค์กร — เบา setup ง่ายแบบ uptime tool แต่ลึกด้านอุปกรณ์แบบ NMS

---

## สารบัญ

- [ภาพรวม](#ภาพรวม)
- [ความสามารถหลัก](#ความสามารถหลัก)
- [Tech Stack](#tech-stack)
- [สถาปัตยกรรม](#สถาปัตยกรรม)
- [ประเภท Monitor](#ประเภท-monitor)
- [หน้าจอและฟีเจอร์](#หน้าจอและฟีเจอร์)
  - [Dashboard](#dashboard)
  - [Monitors](#monitors)
  - [Devices (NMS)](#devices-nms)
  - [Incidents](#incidents)
  - [Alerts & Notifications](#alerts--notifications)
  - [Groups & Credentials](#groups--credentials)
  - [Reports](#reports)
  - [Access Control & Audit](#access-control--audit)
  - [System Settings](#system-settings)
- [การ Deploy ด้วย Docker](#การ-deploy-ด้วย-docker)
  - [Mode A — มี PostgreSQL อยู่แล้ว](#mode-a--มี-postgresql-อยู่แล้ว)
  - [Mode B — ไม่มี PostgreSQL](#mode-b--ไม่มี-postgresql)
  - [Environment Variables](#environment-variables)
  - [DB_MODE](#db_mode)
- [การพัฒนาต่อ (Developer Guidelines)](#การพัฒนาต่อ-developer-guidelines)
- [Roadmap](#roadmap)

---

## ภาพรวม

**Monitoring Hub** เป็น self-hosted monitoring platform ที่รวมจุดแข็งของ 3 แนวทางเข้าด้วยกัน:

| จาก | สิ่งที่นำมา |
|---|---|
| Uptime tools (UptimeRobot, Freshping) | Setup ง่าย, สร้าง monitor เร็ว, อ่านสถานะได้ทันที |
| NMS (PRTG, LibreNMS) | Device identity, interface traffic, CPU/RAM/Disk history |
| Modern infra tools (Grafana, Datadog) | กราฟอ่านง่าย, filter ช่วงเวลาเร็ว, credential reusable |

ระบบรัน backend และ frontend ในคอนเทนเนอร์เดียว ต้องการแค่ PostgreSQL และ Docker — ไม่มี agent ติดตั้งในเครื่องปลายทาง

![Monitoring Hub Overview](./docs/screenshots/overview.png)

---

## ความสามารถหลัก

- **9 ประเภท Monitor** — PING, TCP, HTTP, TLS, DNS, SNMP, SYSTEM, Docker, Database
- **Device/NMS View** — กราฟ CPU / RAM / Disk / Network แบบย้อนหลัง
- **Incident Management** — auto open/resolve + acknowledge flow + escalation
- **Alert Rules** — กฎ threshold ต่อ monitor ส่งผ่าน 6 ช่องทาง
- **Notification Channels** — LINE, Telegram, Email (SMTP), Slack, Discord, Webhook
- **Groups & Credentials** — จัด monitor เป็นกลุ่ม, reuse credential ปลอดภัย
- **Reports** — availability report แบบ on-demand และ scheduled
- **Role-based Access** — admin (ควบคุมเต็ม) และ user (อ่านอย่างเดียว)
- **Bilingual UI** — อังกฤษ / ไทย สลับได้ทุกหน้า
- **API Tokens** — สำหรับการ integrate จากภายนอก

---

## Tech Stack

### Frontend
| ส่วน | เทคโนโลยี |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| Styling | Tailwind CSS 4 |
| Routing | React Router v7 |
| Charts | Recharts |
| i18n | react-i18next (EN / TH) |
| HTTP | Axios |
| Notifications | React Toastify |

### Backend
| ส่วน | เทคโนโลยี |
|---|---|
| Runtime | Bun |
| Framework | Elysia |
| ORM | Prisma |
| Database | PostgreSQL |
| SNMP | net-snmp |
| Email | Nodemailer |
| Auth | JWT (Elysia JWT plugin) |

### Infrastructure
| ส่วน | เทคโนโลยี |
|---|---|
| Web server | nginx (serve frontend + reverse proxy API) |
| Container | Docker (single container) |
| Orchestration | Docker Swarm / Docker Compose |
| Image | `jimmy1998/monitoring-hub:latest` |

---

## สถาปัตยกรรม

```
┌─────────────────────────────────────────┐
│          Docker Container               │
│                                         │
│  ┌─────────┐     ┌──────────────────┐  │
│  │  nginx  │────▶│  Elysia Backend  │  │
│  │  :80    │     │  (Bun runtime)   │  │
│  │         │     │  /api/*          │  │
│  │ [React  │     └────────┬─────────┘  │
│  │  SPA]   │              │ Prisma     │
│  └─────────┘              ▼            │
│                   ┌───────────────┐    │
│  Volumes:         │  PostgreSQL   │    │
│  /app/uploads     │  (external)   │    │
│  /app/logs        └───────────────┘    │
└─────────────────────────────────────────┘
```

- nginx รับ request ทุกตัวที่ port 80
- path `/api/*` → proxy ไป Elysia backend
- path อื่นๆ → serve React SPA (index.html)
- Backend เปิด monitor runner loop ทุก 5 วินาที ตรวจว่า monitor ไหนถึงเวลาเช็ค

---

## ประเภท Monitor

| Type | ตรวจอะไร | ตัวอย่างการใช้งาน |
|---|---|---|
| **PING** | ICMP round-trip time | ตรวจว่าอุปกรณ์ online ไหม |
| **TCP** | TCP port open/close + latency | ตรวจ service port เช่น 22, 3389, 1433 |
| **HTTP** | Status code, body match, header, JSON path, latency | ตรวจ web app, API endpoint |
| **TLS_CERT** | SSL certificate expiry + validity | แจ้งเตือนก่อน cert หมดอายุ |
| **DNS** | DNS record resolve + expected value | ตรวจว่า DNS ตอบถูก |
| **SNMP** | OID ตามกำหนด + interface counters | Router, Switch, Firewall, Printer |
| **SYSTEM** | CPU, RAM, Disk, load, uptime (via SNMP) | Server, NAS, ตรวจ resource |
| **DOCKER** | Container status via Portainer API | ตรวจ container up/down |
| **DATABASE** | Connectivity + latency | PostgreSQL, MySQL, MariaDB, Redis, MongoDB, SQLite, SQL Server |

### HTTP Monitor — Advanced Options

- **Authentication** — Basic auth, Bearer token
- **Body match** — ตรวจ keyword ใน response body
- **Header match** — ตรวจ header ที่ต้องการ
- **JSON path** — ดึง value จาก JSON response เทียบกับ expected value
- **Latency threshold** — alert เมื่อ response ช้าเกินกำหนด
- **Redirect control** — ตาม redirect หรือ fail ทันที

---

## หน้าจอและฟีเจอร์

### Dashboard

`/dashboard`

หน้าแรกที่เห็นภาพรวมทั้งระบบ

- **Stat cards** — Online / Offline / Degraded / Unknown + open incidents
- **Attention list** — monitor ที่มีปัญหาอยู่ตอนนี้
- **Open incidents** — รายการ incident ที่ยังค้างอยู่
- **Group summary** — สุขภาพรวมของแต่ละกลุ่ม

![Dashboard](./docs/screenshots/dashboard.png)

---

### Monitors

`/monitors` · `/monitors/new` · `/monitors/:id`

จัดการ monitor ทุกตัว

- **สร้าง monitor** ด้วย Type Guide Panel — อธิบาย config แต่ละ field
- **TCP Presets** — เลือก service สำเร็จรูป เช่น SSH, RDP, MySQL
- **Monitor Detail** — กราฟ response time, status timeline, availability map
- **Check Now** — สั่งเช็คทันทีโดยไม่รอ interval
- **Enable / Disable** — ปิด monitor ชั่วคราว
- **Time range filter** — ดูผลย้อนหลัง Day / Week / Month / Custom
- **Load more results** — ดูผล check ในอดีตทั้งหมด

![Monitors](./docs/screenshots/monitors.png)

---

### Devices (NMS)

`/devices` · `/devices/:id` · `/interfaces`

มุมมองแบบ Network Management System

- **Device cards** — แสดง vendor logo, สถานะ, CPU/RAM/Disk gauge
- **Device Detail** — กราฟย้อนหลัง CPU, RAM, Disk, Network interface
- **Time range** — Day / Week / Month / Custom
- **Interface inventory** — แสดงทุก interface, traffic rate (bps/Kbps/Mbps/Gbps)
- **Top interfaces** — busiest links ปัจจุบัน
- **Error / Discard counters** — ตรวจ packet error ใน interface
- **32-bit / 64-bit counter** — รองรับ counter rollover ของอุปกรณ์เก่า

![Devices NMS](./docs/screenshots/devices.png)

---

### Incidents

`/incidents`

ระบบ incident tracking ที่ runner สร้างอัตโนมัติ

- **Auto open** — สร้าง incident ทันทีเมื่อ monitor DOWN / DEGRADED
- **Auto resolve** — ปิด incident ทันทีเมื่อ monitor กลับมา UP
- **Acknowledge** — รับเรื่องแล้ว กำลังแก้ (flow: Open → Acknowledged → Resolved)
- **Resolve / Reopen / Delete** — จัดการ manual ได้
- **Filter** — All / Open / Acknowledged / Resolved
- **Escalation** — ส่งแจ้งเตือนซ้ำเมื่อ incident เปิดนานเกิน (L1/L2/L3)
- **Reminder** — แจ้งเตือนซ้ำตาม interval ที่ตั้งไว้

![Incidents](./docs/screenshots/incidents.png)

---

### Alerts & Notifications

`/alerts` · `/channels`

**Alert Rules** — กฎ threshold ต่อ monitor:

- Metrics: status, response time, CPU %, RAM %, Disk %
- Operators: GT, LT, EQ, NEQ
- Severity: INFO / WARNING / CRITICAL
- กำหนด channel เฉพาะต่อ rule ได้

**Notification Channels** ที่รองรับ:

| Channel | รูปแบบ |
|---|---|
| LINE | Flex Message (rich card) |
| Telegram | HTML message |
| Email (SMTP) | HTML email พร้อมตาราง |
| Slack | Block Kit |
| Discord | Embeds |
| Custom Webhook | JSON payload |

**คุณสมบัติระบบ alert:**

- **Cooldown / Deduplication** — ไม่ส่งซ้ำถ้าเพิ่งส่งไปแล้ว
- **Delivery retry** — retry อัตโนมัติ 3 รอบถ้า channel ล่ม
- **Failure tracking** — บันทึกและแจ้งเตือน admin เมื่อส่งไม่สำเร็จ
- **Payload preview** — ดูตัวอย่าง message ก่อน save channel

![Alerts and Notifications](./docs/screenshots/alerts.png)

---

### Groups & Credentials

`/groups` · `/groups/:id` · `/credentials`

**Groups** — จัด monitor เป็นกลุ่ม:

- สร้าง / แก้ไข / ลบ group
- filter monitor, device, result, incident ตาม group
- Group summary — uptime และ health รวมของกลุ่ม

**Credentials** — เก็บ secret ปลอดภัย:

| ประเภท | ใช้กับ |
|---|---|
| SNMP Community String | SNMP, SYSTEM monitor |
| Username / Password | HTTP Basic auth, DATABASE |
| API Token | HTTP Bearer, DOCKER |
| SSH Key | สำหรับ future use |

- Credential เข้ารหัสก่อนเก็บ — ไม่เห็น plaintext ใน UI
- **Credential usage map** — เห็นว่า credential นี้ผูกกับ monitor ไหนบ้าง
- เลือก credential ตอนสร้าง monitor — auto-fill field ที่เกี่ยวข้อง

---

### Reports

`/reports` · `/scheduled-reports`

- **On-demand report** — เลือก monitor / group และช่วงวันที่ export ได้ทันที
- **Scheduled report** — ตั้งเวลาส่ง report อัตโนมัติผ่าน notification channels
- รูปแบบรายงาน: สรุป uptime %, downtime windows, incident count

---

### Access Control & Audit

`/users` · `/audit-logs` · `/login-history`

**Roles:**

- `admin` — เข้าถึงทุกส่วน, สร้าง/แก้ไข/ลบทุกอย่าง
- `user` — อ่านอย่างเดียว ไม่สามารถแก้ไข config ได้

**Audit Logs** — บันทึกทุก action สำคัญ เช่น monitor สร้าง/แก้ไข/ลบ, incident เปลี่ยนสถานะ, notification ส่ง/ล้มเหลว

**Login History** — ดูประวัติการเข้าสู่ระบบ, บล็อก login หลังพยายามเกินจำนวนที่กำหนด

---

### System Settings

`/settings`

| หมวด | รายละเอียด |
|---|---|
| General / Branding | ชื่อระบบ, tagline, logo upload |
| Alerting Defaults | interval การส่ง reminder (hours) |
| Monitor Defaults | interval / timeout เริ่มต้น |
| Security | password min length, session duration, max login attempts |
| Data Retention | กำหนดอายุ results / metrics / audit logs, manual clear |

---

## การ Deploy ด้วย Docker

Image: `jimmy1998/monitoring-hub:latest`

ระบบรองรับ 2 โหมด ขึ้นอยู่กับว่ามี PostgreSQL อยู่แล้วหรือไม่

---

### Mode A — มี PostgreSQL อยู่แล้ว

> เหมาะสำหรับองค์กรที่มี PostgreSQL server อยู่แล้ว

```yaml
version: '3.8'

services:
  monitoring_hub:
    image: jimmy1998/monitoring-hub:latest
    ports:
      - "4000:80"
    environment:
      DB_MODE: "existing"
      NODE_ENV: production
      HOST: 0.0.0.0
      TZ: Asia/Bangkok
      DATABASE_URL: "postgresql://username:password@host:5432/mydb?schema=public"
      JWT_SECRET: "replace-with-openssl-rand-hex-64"
      CORS_ORIGINS: "https://yourdomain.com"
    volumes:
      - uploads_data:/app/uploads
      - logs_data:/app/logs
    networks:
      - main_public

volumes:
  uploads_data:
  logs_data:

networks:
  main_public:
    external: true
```

**ครั้งแรก** ให้เปลี่ยน `DB_MODE: "init"` เพื่อสร้าง schema และ seed ข้อมูลเริ่มต้น จากนั้นเปลี่ยนกลับเป็น `"existing"`

---

### Mode B — ไม่มี PostgreSQL

> ให้ Docker สร้าง PostgreSQL ขึ้นมาเองในระบบเดียวกัน

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: monitoring
      POSTGRES_PASSWORD: secret1234
      POSTGRES_DB: monitoring_hub
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - main_public

  monitoring_hub:
    image: jimmy1998/monitoring-hub:latest
    ports:
      - "4000:80"
    depends_on:
      - postgres
    environment:
      DB_MODE: "init"
      NODE_ENV: production
      HOST: 0.0.0.0
      TZ: Asia/Bangkok
      DATABASE_URL: "postgresql://monitoring:secret1234@postgres:5432/monitoring_hub?schema=public"
      JWT_SECRET: "replace-with-openssl-rand-hex-64"
      CORS_ORIGINS: "https://yourdomain.com"
    volumes:
      - uploads_data:/app/uploads
      - logs_data:/app/logs
    networks:
      - main_public

volumes:
  uploads_data:
  logs_data:
  postgres_data:

networks:
  main_public:
    external: true
```

หลังรันครั้งแรกสำเร็จให้เปลี่ยน `DB_MODE` เป็น `"existing"` เพื่อป้องกัน re-seed

---

### Environment Variables

| Variable | ค่าตัวอย่าง | คำอธิบาย |
|---|---|---|
| `DB_MODE` | `existing` | โหมดจัดการ database ตอน container start |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db?schema=public` | PostgreSQL connection string |
| `JWT_SECRET` | _(64-byte hex)_ | Secret สำหรับ sign JWT — สร้างด้วย `openssl rand -hex 64` |
| `CORS_ORIGINS` | `https://yourdomain.com` | Domain ที่อนุญาต CORS คั่นด้วย comma ถ้าหลาย origin |
| `NODE_ENV` | `production` | Environment |
| `HOST` | `0.0.0.0` | Host ที่ backend รับ connection |
| `TZ` | `Asia/Bangkok` | Timezone ของ container |

---

### DB_MODE

| Mode | พฤติกรรม | ใช้เมื่อ |
|---|---|---|
| `existing` | ไม่แตะ schema — ใช้ DB ที่มีอยู่เลย | production ปกติ |
| `init` | `prisma db push` + seed ข้อมูลเริ่มต้น | ติดตั้งครั้งแรกกับ DB ว่างเปล่า |
| `migrate` | `prisma migrate deploy` | อัปเดต schema หลัง upgrade version |
| `fresh` | ล้าง DB ทั้งหมด แล้วสร้างใหม่ + seed | ⚠️ ลบข้อมูลทั้งหมด — ใช้แค่ dev/test |

**Workflow ปกติ:**

1. ติดตั้งครั้งแรก: ตั้ง `DB_MODE=init` → รัน → เปลี่ยนเป็น `DB_MODE=existing`
2. Upgrade version ที่มี schema change: ตั้ง `DB_MODE=migrate` → รัน → เปลี่ยนกลับ

---

## การพัฒนาต่อ (Developer Guidelines)

### i18n

- **ทุกเพจใหม่** ต้องรองรับ 2 ภาษา ไทย / อังกฤษ ตั้งแต่ต้น
- ใช้ `useTranslation()` + `t('key')` — ห้าม hardcode string ในหน้า
- เพิ่ม key ใหม่ใน `frontend/src/i18n/locales/en.json` และ `th.json` ควบคู่กันทุกครั้ง

### Toast notifications

- Toast ต้องเป็น **ภาษาอังกฤษเท่านั้น** — ไม่ใช้ `t()` กับ toast
- เหตุผล: toast มักต่อกับ error message จาก API การผสมภาษาทำให้ไม่สอดคล้อง

### API response messages

- `fail(...)`, `throw new Error(...)`, และ message fields ใน backend ต้องเป็น **ภาษาอังกฤษเท่านั้น**

### Dark mode

- UI ยังไม่รองรับ dark mode — เมื่อ implement ให้ใช้ Tailwind `dark:` prefix
- class-based toggle (`class="dark"` บน `<html>`) + เก็บค่าใน `localStorage`

---

## Roadmap

| Feature | สถานะ | รายละเอียด |
|---|---|---|
| **Monitor Active Window** | Planned | กำหนดวัน/เวลาที่ monitor จะทำงาน เช่น จ-ศ 08:00–17:00 นอกเวลาหยุดเช็ค |
| **Maintenance Window** | Planned | ประกาศ planned downtime ล่วงหน้า — ระงับ alert ไม่นับ downtime ช่วงนั้น |
| **Incident Acknowledge** | In progress | flow: Open → Acknowledged → Resolved |
| **Printer SNMP Preset** | Planned | Preset สำเร็จรูป toner, กระดาษ, สถานะ printer (Standard Printer MIB) |
| **Dark Mode** | Planned | รองรับ dark theme ครบทุก component |
| **DB Insight** | Planned | วิเคราะห์ประสิทธิภาพ database: slow queries, index, connections |

---

*Monitoring Hub — frontend v1.2.11 · backend v1.0.50*
