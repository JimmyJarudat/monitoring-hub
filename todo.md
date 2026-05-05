# Monitoring Hub TODO

## Current Status

ตอนนี้เป้าหมายหลักคือทำ capability ของตัว monitor ให้ครบก่อน แล้วค่อยปิดท้ายด้วย Dashboard Overview

สถานะล่าสุด:
- มีหน้า monitor list
- มีหน้า add monitor
- มีหน้า monitor detail
- มี check now / enable-disable / edit / delete
- มี recent results, time range filter, load more
- มีกราฟ response time, status timeline, availability map

## Done

### Core monitor types
- [x] PING
- [x] TCP
- [x] HTTP
- [x] DOCKER via Portainer
- [x] DATABASE

### Database support
- [x] PostgreSQL
- [x] MySQL
- [x] MariaDB
- [x] Redis
- [x] MongoDB
- [x] SQLite
- [x] SQL Server / MSSQL

### Monitor UX
- [x] Monitors list page
- [x] Add monitor page
- [x] Monitor detail page
- [x] Open web target from list page
- [x] Compact actions menu with 3-dot dropdown
- [x] Recent results table
- [x] Time range filter: 1h / 6h / 24h / 7d / 30d / custom
- [x] Load more results
- [x] Response time chart
- [x] Status timeline chart
- [x] Availability map แบบดูภาพรวมรายวัน/รายชั่วโมง

### Backend/API
- [x] Manual check endpoint
- [x] Monitor summary endpoint
- [x] Monitor detail endpoint with result filters
- [x] Database type validation whitelist
- [x] MongoDB URI / authSource support
- [x] MongoDB credential encoding for special characters

## Still Missing

สิ่งที่ยังขาด ถ้าจะให้ capability ของ monitor ค่อนข้างครบ:

### New monitor types
- [ ] SNMP สำหรับอุปกรณ์ network
- [ ] HTTPS/TLS certificate ตรวจวันหมดอายุ cert
- [ ] DNS ตรวจ resolve record
- [ ] Keyword / content check สำหรับเว็บ
- [ ] HTTP advanced เช่น follow redirect, auth, body match, latency threshold
- [ ] Port/service preset เช่น SSH / RDP / SMTP / LDAP แบบใช้ TCP แต่ตั้งง่าย
- [ ] Webhook / API health ที่เช็ก response body หรือ JSON path ได้
- [ ] Docker direct แบบไม่พึ่ง Portainer

### Deeper capabilities for existing monitor types
- [ ] PING: packet loss, jitter, multiple probes, threshold
- [ ] TCP: banner check / protocol-aware check
- [ ] HTTP: header match, auth options, redirect policy, SSL validation options
- [ ] DATABASE: custom query, expected result, threshold, role-aware checks
- [ ] DOCKER: unhealthy state mapping, resource metrics, richer container checks

### Monitoring flow around the checks
- [ ] Alert rule evaluation after each check
- [ ] Auto create / resolve incident
- [ ] Notification channels execution
- [ ] Alert rules management page
- [ ] Notification channels management page
- [ ] Incidents page

## Recommended Next Order

### Priority 1
- [ ] SNMP monitor
  - host
  - port
  - version
  - community
  - sysName
  - sysDescr
  - sysUpTime

เหตุผล:
- ใกล้ LibreNMS มากที่สุด
- เติมช่องว่างฝั่งอุปกรณ์/network โดยตรง
- ต่อไปหน้า detail ของ device ได้อีกเยอะ

### Priority 2
- [ ] HTTPS/TLS certificate monitor

เหตุผล:
- มีประโยชน์กับเว็บจำนวนมาก
- effort ไม่สูงเมื่อเทียบกับ value

### Priority 3
- [ ] HTTP advanced checks

รายละเอียดที่ควรมี:
- follow redirect
- basic/bearer auth
- expected body text
- expected header
- latency threshold
- optional degraded status on slow response

### Priority 4
- [ ] DNS monitor
- [ ] Webhook / API health
- [ ] Port/service presets

### Priority 5
- [ ] Docker direct

### Priority 6
- [ ] Alert / incident / notification engine

## Dashboard

- [ ] Dashboard Overview

หมายเหตุ:
- ควรทำท้ายสุด หลังจาก monitor capabilities หลักเริ่มครบแล้ว
- จะได้ไม่ต้องแก้ dashboard ซ้ำหลายรอบทุกครั้งที่เพิ่ม monitor type ใหม่

## Nice to Have Later

- [ ] Status page สำหรับแชร์ให้คนอื่นดู
- [ ] Device detail page แนว NMS
- [ ] Interface / sensor summary for SNMP devices
- [ ] Uptime SLA summaries
- [ ] Cert expiry warning views
- [ ] Per-monitor threshold presets

## Next Best Step

ถ้าจะเริ่มงานถัดไปทันที:
- ทำ `SNMP monitor` ก่อน
