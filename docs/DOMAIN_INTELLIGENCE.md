# Domain Intelligence — การทำงานและข้อกฎหมาย

## ภาพรวม

Domain Intelligence เป็นฟีเจอร์ที่ช่วยวิเคราะห์ข้อมูล DNS, registrar, และค้นหา subdomains ของ domain ที่กำหนด โดยรวบรวมข้อมูลจากหลาย source พร้อมกัน

---

## การทำงานของระบบ

### 1. Registrar Lookup (Passive)

ดึงข้อมูล registrar จาก **RDAP** (Registration Data Access Protocol)

```
GET https://rdap.org/domain/{domain}
```

- ข้อมูลสาธารณะที่ ICANN กำหนดให้เปิดเผย
- ไม่มีการเชื่อมต่อกับ server เป้าหมาย
- ความเสี่ยง: **ไม่มี**

---

### 2. DNS Lookup

ใช้ `dns.resolveNs()` และ `dns.resolve4()` เพื่อดึง nameserver และ A records จาก public DNS resolver

- วิเคราะห์ DNS provider จาก nameserver pattern (Cloudflare, AWS, Google ฯลฯ)
- เป็น query ปกติของ internet protocol
- ความเสี่ยง: **ต่ำมาก** — เทียบเท่าการ `nslookup`

---

### 3. Subdomain Discovery (Passive Sources)

ค้นหา subdomains จากฐานข้อมูลสาธารณะที่มีอยู่แล้ว ไม่มีการเชื่อมต่อกับ server เป้าหมาย:

| Source | วิธี | ความเสี่ยง |
|--------|------|-----------|
| **crt.sh** | Certificate Transparency logs — ใบรับรอง SSL ที่ออกไปแล้วทุกใบเป็นสาธารณะ | ไม่มี |
| **AlienVault OTX** | Passive DNS database จาก threat intelligence | ไม่มี |
| **CommonCrawl** | Web crawl index สาธารณะ | ไม่มี |
| **Wayback Machine** | Web archive index สาธารณะ | ไม่มี |
| **SecurityTrails** | Passive DNS (ต้องมี API key) | ไม่มี |

---

### 4. DNS Brute-force (Active — ต่ำ)

ทดสอบ subdomain ทั่วไปโดยการ query DNS resolver สาธารณะ

```
ns1.example.com → resolve → มี IP → subdomain นี้มีอยู่
api.example.com → NXDOMAIN → subdomain นี้ไม่มี
```

- ใช้ wordlist ~290 คำ (www, api, mail, vpn, admin ฯลฯ)
- **ไม่ได้เชื่อมต่อกับ server เป้าหมาย** — query แค่ DNS resolver สาธารณะ
- ความเสี่ยง: **ต่ำ** — เป็นที่ยอมรับในวงการ security โดยทั่วไป

---

### 5. HTTP Probe & SSL Check (Active — สูง)

**ส่วนนี้เชื่อมต่อกับ server เป้าหมายโดยตรง**

```
fetch("https://api.example.com")     ← HTTP GET request
tls.connect(443, "api.example.com")  ← TCP/TLS connection
```

- ตรวจสอบว่า subdomain online หรือไม่
- ดึงข้อมูล SSL certificate (expiry date, issuer)
- ทุก subdomain ที่พบจะถูก probe พร้อมกัน (concurrency 10)
- **นี่คือส่วนที่มีความเสี่ยงทางกฎหมายมากที่สุด**

---

## ความเสี่ยงทางกฎหมาย

### กฎหมายไทย

**พ.ร.บ. ว่าด้วยการกระทำความผิดเกี่ยวกับคอมพิวเตอร์ พ.ศ. 2550 (แก้ไข 2560)**

| มาตรา | บทบัญญัติ | ความเกี่ยวข้อง |
|-------|-----------|---------------|
| **มาตรา 5** | เข้าถึงระบบคอมพิวเตอร์โดยมิชอบ — จำคุกไม่เกิน 6 เดือน หรือปรับไม่เกิน 10,000 บาท หรือทั้งจำทั้งปรับ | HTTP probe / TLS connect ไปยัง server โดยไม่ได้รับอนุญาต |
| **มาตรา 7** | เข้าถึงข้อมูลคอมพิวเตอร์โดยมิชอบ — จำคุกไม่เกิน 2 ปี หรือปรับไม่เกิน 40,000 บาท หรือทั้งจำทั้งปรับ | อ่านข้อมูลจาก server ที่ไม่ได้รับอนุญาต |

> กฎหมายไทยตีความกว้าง ไม่ต้องมีเจตนาทำลายหรือเข้าถึงข้อมูลลับ เพียงแค่ "เข้าถึง" โดยไม่ได้รับอนุญาตก็ผิดแล้ว

### กฎหมายต่างประเทศ

| ประเทศ | กฎหมาย | สรุป |
|--------|--------|------|
| สหรัฐฯ | Computer Fraud and Abuse Act (CFAA) | การ probe server โดยไม่ได้รับอนุญาตเป็นความผิดอาญาของรัฐบาลกลาง |
| EU | Directive 2013/40/EU | ครอบคลุมทุกประเทศสมาชิก EU |
| สิงคโปร์ | Computer Misuse Act | บทลงโทษหนักกว่าไทย |

---

## สรุประดับความเสี่ยงแต่ละเทคนิค

```
crt.sh / Wayback / AlienVault / CommonCrawl     ██░░░░  ต่ำมาก (ข้อมูลสาธารณะ)
RDAP registrar lookup                           ██░░░░  ต่ำมาก (ข้อมูลสาธารณะ)
DNS NS / A record lookup                        ███░░░  ต่ำ    (DNS สาธารณะ)
DNS brute-force (query resolver)                ████░░  ปานกลาง (gray area)
HTTP probe (fetch ไปหา server)                  █████░  สูง    (active connection)
TLS/SSL check (tls.connect)                     █████░  สูง    (active connection)
```

---

## การใช้งานอย่างถูกกฎหมาย

### ✅ กรณีที่ใช้ได้

1. **domain ของตัวเอง** — ไม่มีข้อจำกัด
2. **domain ลูกค้า** — ต้องมีหนังสือมอบอำนาจหรือ written authorization ระบุขอบเขตชัดเจน
3. **Penetration Testing** — ต้องมี signed scope-of-work และ statement of work
4. **Bug Bounty Program** — domain ที่อยู่ใน scope ของ program เท่านั้น
5. **Internal security audit** — domain ภายในองค์กรที่ได้รับมอบหมาย

### ❌ กรณีที่ห้ามใช้

1. domain ของบุคคลหรือองค์กรอื่นโดยไม่ได้รับอนุญาต
2. domain คู่แข่งทางธุรกิจ
3. domain ของหน่วยงานรัฐโดยไม่มี authorization
4. domain ที่อยู่นอก scope ของ pentest engagement

---

## คำแนะนำสำหรับผู้ดูแลระบบ

### การเก็บ Audit Log

ควรบันทึกทุก domain ที่ถูกสแกนพร้อม:
- User ที่ scan
- Timestamp
- IP ที่ใช้ scan

เพื่อใช้ป้องกันตัวในกรณีถูกร้องเรียน

### การ Rate Limit

ระบบมี rate limit ที่ endpoint `/domain/:domain` เพื่อป้องกันการใช้งานในทางที่ผิด

### การแจ้งเตือนผู้ใช้

ผู้ใช้ต้องยืนยัน consent ก่อนทุกครั้งที่ scan ว่า:
> "ฉันยืนยันว่า domain ที่จะสแกนเป็นของฉัน หรือได้รับอนุญาตเป็นลายลักษณ์อักษรจากเจ้าของแล้ว และรับผิดชอบต่อการใช้งานนี้ทั้งหมด"

---

## อ้างอิง

- [พ.ร.บ. คอมพิวเตอร์ 2550](https://www.etda.or.th/th/Our-Work/Laws-Regulations/law.aspx)
- [แนวทาง RDAP — ICANN](https://www.icann.org/rdap)
- [Certificate Transparency — Google](https://certificate.transparency.dev/)
- [OWASP Testing Guide — Subdomain Enumeration](https://owasp.org/www-project-web-security-testing-guide/)
