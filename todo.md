# Monitoring Hub TODO

## Done

### Monitor types
- [x] PING
- [x] TCP
- [x] HTTP (พร้อม auth, body/header/JSON path check, latency threshold, redirect)
- [x] TLS Certificate (ตรวจวันหมดอายุ cert)
- [x] DNS (resolve record + expected value)
- [x] SNMP (sysName, sysDescr, sysUpTime, custom OIDs)
- [x] SYSTEM (CPU%, RAM%, Disk%, load average, uptime ผ่าน SNMP)
- [x] DOCKER via Portainer
- [x] DATABASE (PostgreSQL, MySQL, MariaDB, Redis, MongoDB, SQLite, SQL Server/MSSQL)

### Monitor UX
- [x] Monitors list page
- [x] Add monitor page (พร้อม type guide panel, TCP presets)
- [x] Monitor detail page
- [x] Check now / enable-disable / edit / delete
- [x] Recent results table + time range filter + load more
- [x] Response time chart, status timeline, availability map

### Devices
- [x] Devices page — แสดง CPU/RAM/Disk gauge สำหรับ SYSTEM monitors
- [x] Uptime, load average, OS description (optional ถ้า device ไม่มี)

### Incident engine
- [x] Auto create incident เมื่อ DOWN/DEGRADED
- [x] Auto resolve incident เมื่อ UP กลับมา
- [x] Incidents page

### Backend/API
- [x] Manual check endpoint
- [x] Monitor summary endpoint
- [x] Incident CRUD endpoint

## Still Missing

### Priority 1 — Dashboard Overview
- [ ] Stat cards: total monitors, UP/DOWN/DEGRADED, open incidents, uptime 24h%, avg response
- [ ] Monitors needing attention (DOWN/DEGRADED list)
- [ ] Open incidents list

### Priority 2 — Alert / Notification engine
- [ ] ส่ง LINE / Email เมื่อ monitor DOWN
- [ ] Alert rules management page
- [ ] Notification channels management page

### Priority 3 — History retention
- [ ] ตั้งค่าเก็บ raw results ได้ เช่น 7 / 14 / 30 / 90 วัน
- [ ] Auto cleanup ตาม schedule
- [ ] Manual clear history ราย monitor

## Nice to Have Later

- [ ] Status page สำหรับแชร์ให้คนอื่นดู
- [ ] PING: packet loss, jitter, multiple probes
- [ ] DATABASE: custom query, expected result
- [ ] Agent-based Linux monitor (metrics ลึกกว่า SNMP)
- [ ] Uptime SLA summaries
- [ ] Cert expiry warning views
