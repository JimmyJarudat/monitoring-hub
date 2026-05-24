# 🖥️ คู่มือ Windows Monitoring ฉบับสมบูรณ์
### ติดตั้ง Fluent Bit + ส่ง Log เข้าระบบ monitoring.jarudat.com

> อ้างอิง: Microsoft Docs, Ponder The Bits, DFIR Spot, NinjaOne, BeyondTrust, EpicDetect — 2025-2026

---

## 📋 สารบัญ

1. [ภาพรวม](#1-ภาพรวม)
2. [ขั้นตอนที่ 1 — สร้าง API Token](#2-ขั้นตอนที่-1--สร้าง-api-token)
3. [ขั้นตอนที่ 2 — ติดตั้ง Fluent Bit](#3-ขั้นตอนที่-2--ติดตั้ง-fluent-bit)
4. [ขั้นตอนที่ 3 — ตั้งค่า Config](#4-ขั้นตอนที่-3--ตั้งค่า-config)
5. [ขั้นตอนที่ 4 — เปิดใช้งาน Windows Auditing](#5-ขั้นตอนที่-4--เปิดใช้งาน-windows-auditing)
6. [ขั้นตอนที่ 5 — ติดตั้งเป็น Windows Service](#6-ขั้นตอนที่-5--ติดตั้งเป็น-windows-service)
7. [ขั้นตอนที่ 6 — ทดสอบ](#7-ขั้นตอนที่-6--ทดสอบ)
8. [คำสั่งที่ใช้บ่อย](#8-คำสั่งที่ใช้บ่อย)
9. [โครงสร้าง JSON ที่ระบบได้รับ](#9-โครงสร้าง-json-ที่ระบบได้รับ)
10. [Windows Event ID — อ้างอิงครบทุกหมวด](#10-windows-event-id--อ้างอิงครบทุกหมวด)

---

## 1. ภาพรวม

Fluent Bit จะทำหน้าที่เก็บ Windows Event Log จากเครื่อง Windows แล้วส่งเป็น JSON ผ่าน HTTPS ไปยัง `monitoring.jarudat.com` แบบ real-time

```
Windows Event Log
      │
      ▼
 Fluent Bit (Windows Service)
      │  HTTPS + Bearer Token
      ▼
monitoring.jarudat.com
```

**สิ่งที่ Fluent Bit เก็บ:**
- Security Log — Login, Authentication, User Management
- System Log — Service, Boot, Disk
- Application Log — App crash, SQL Server
- RDP/Terminal Services — Remote access ทุก session
- PowerShell — Script execution

**ความต้องการของระบบ:**
- Windows Server 2016 / 2019 / 2022 หรือ Windows 10/11
- RAM เพิ่มแค่ประมาณ 10–20 MB
- ต้องรันในฐานะ Administrator

---

## 2. ขั้นตอนที่ 1 — สร้าง API Token

> ⚠️ **ต้องเป็น Admin** ในระบบ monitoring.jarudat.com ถึงจะสร้าง token ได้

1. เข้าสู่ระบบที่ **https://monitoring.jarudat.com**
2. กดรูป **โปรไฟล์** มุมขวาบน (Nav ด้านขวา)
3. เลือก **API Tokens**
4. กด **New API Token**
5. ตั้งชื่อ token เช่น `fluent-bit-server01`
6. กด **Create**
7. **คัดลอก token ทันที** — ระบบแสดงครั้งเดียวเท่านั้น ไม่สามารถดูซ้ำได้

> 💡 แนะนำสร้าง token แยกต่างหากสำหรับแต่ละเครื่อง เพื่อให้ revoke ได้เฉพาะเครื่อง

---

## 3. ขั้นตอนที่ 2 — ติดตั้ง Fluent Bit

### 3.1 ดาวน์โหลด

1. เปิดเบราว์เซอร์ไปที่ **https://fluentbit.io/download**
2. เลือก **Windows** → ดาวน์โหลด `fluent-bit-X.X.X-win64.exe`

### 3.2 ติดตั้ง

1. ดับเบิลคลิกไฟล์ `.exe`
2. คลิก **Next** ตาม wizard จนเสร็จ
3. โปรแกรมจะติดตั้งที่ `C:\Program Files\fluent-bit\`

**โครงสร้างไฟล์หลังติดตั้ง:**

```
C:\Program Files\fluent-bit\
├── bin\
│   ├── fluent-bit.exe
│   └── fluent-bit.dll
└── conf\
    ├── fluent-bit.conf   ← แก้ไขไฟล์นี้
    ├── parsers.conf
    └── plugins.conf
```

---

## 4. ขั้นตอนที่ 3 — ตั้งค่า Config

แก้ไขไฟล์ `C:\Program Files\fluent-bit\conf\fluent-bit.conf`

ลบเนื้อหาเดิมออกทั้งหมด แล้ววางข้อความด้านล่างนี้แทน โดยเปลี่ยน `YOUR_TOKEN_HERE` เป็น token ที่ได้จากขั้นตอนที่ 1

```ini
[SERVICE]
    flush        1
    daemon       Off
    log_level    info
    parsers_file parsers.conf
    plugins_file plugins.conf
    http_server  Off
    http_listen  0.0.0.0
    http_port    2020
    storage.metrics on

# ── INPUT ──────────────────────────────────────────────
[INPUT]
    Name                 winevtlog
    Tag                  windows.security
    Channels             Security
    Read_Existing_Events false
    Interval_Sec         1

[INPUT]
    Name                 winevtlog
    Tag                  windows.system
    Channels             System
    Read_Existing_Events false
    Interval_Sec         1

[INPUT]
    Name                 winevtlog
    Tag                  windows.application
    Channels             Application
    Read_Existing_Events false
    Interval_Sec         1

[INPUT]
    Name                 winevtlog
    Tag                  windows.rdp
    Channels             Microsoft-Windows-TerminalServices-LocalSessionManager/Operational,Microsoft-Windows-TerminalServices-RemoteConnectionManager/Operational
    Read_Existing_Events false
    Interval_Sec         1

[INPUT]
    Name                 winevtlog
    Tag                  windows.powershell
    Channels             Microsoft-Windows-PowerShell/Operational
    Read_Existing_Events false
    Interval_Sec         1

# ── FILTER ─────────────────────────────────────────────
[FILTER]
    Name    grep
    Match   windows.security
    Regex   EventID ^(4624|4625|4634|4647|4648|4649|4656|4657|4658|4660|4663|4670|4672|4673|4674|4688|4689|4697|4698|4699|4700|4701|4702|4719|4720|4722|4723|4724|4725|4726|4727|4728|4729|4730|4731|4732|4733|4734|4735|4737|4738|4740|4756|4757|4764|4767|4768|4769|4770|4771|4776|4778|4779|4800|4801|4802|4803|4825|4907|4908|4946|4947|4948|4950|5140|5142|5143|5144|5145|5152|5153|5154|5155|5156|5157|5158|5159|1102|4616)$

[FILTER]
    Name    grep
    Match   windows.system
    Regex   EventID ^(7|51|55|104|129|153|6005|6006|6008|6013|7000|7001|7009|7011|7022|7023|7024|7026|7031|7034|7036|7040|7045)$

[FILTER]
    Name    grep
    Match   windows.application
    Regex   EventID ^(1000|1001|1002|1026|18456|17204|17207|17806|701|832|833|855)$

[FILTER]
    Name    grep
    Match   windows.rdp
    Regex   EventID ^(21|22|24|25|39|40|1149)$

[FILTER]
    Name    grep
    Match   windows.powershell
    Regex   EventID ^(400|600|800|4103|4104)$

# ── OUTPUT ─────────────────────────────────────────────
[OUTPUT]
    Name    http
    Match   windows.*
    Host    monitoring.jarudat.com
    Port    443
    URI     /api/server-logs/fluentbit/event
    Format  json
    Header  Authorization Bearer YOUR_TOKEN_HERE
    tls     on
```

---

## 5. ขั้นตอนที่ 4 — เปิดใช้งาน Windows Auditing

> ⚠️ ถ้าไม่เปิดขั้นตอนนี้ บาง Event ID จะไม่ถูกบันทึกและส่งไม่ได้

เปิด **PowerShell ในฐานะ Administrator** แล้วรันทีละคำสั่ง:

```powershell
# เปิด Process Creation Auditing (ต้องการสำหรับ Event 4688)
auditpol /set /subcategory:"Process Creation" /success:enable

# เปิด Command Line Logging (เห็น command ที่รันใน 4688)
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\Audit" /v ProcessCreationIncludeCmdLine_Enabled /t REG_DWORD /d 1 /f

# เปิด Script Block Logging (PowerShell Event 4104)
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ScriptBlockLogging" /v EnableScriptBlockLogging /t REG_DWORD /d 1 /f

# เปิด Module Logging (PowerShell Event 4103)
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ModuleLogging" /v EnableModuleLogging /t REG_DWORD /d 1 /f
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ModuleLogging\ModuleNames" /v "*" /t REG_SZ /d "*" /f

# เปิด TerminalServices Log (RDP Event 21, 22, 24, 25)
wevtutil sl Microsoft-Windows-TerminalServices-LocalSessionManager/Operational /e:true
wevtutil sl Microsoft-Windows-TerminalServices-RemoteConnectionManager/Operational /e:true

# เพิ่มขนาด Security Log เป็น 1GB (ป้องกัน overwrite)
wevtutil sl Security /ms:1073741824
```

---

## 6. ขั้นตอนที่ 5 — ติดตั้งเป็น Windows Service

ให้ Fluent Bit ทำงานอัตโนมัติทุกครั้งที่เปิดเครื่อง

เปิด **PowerShell ในฐานะ Administrator** แล้วรัน:

```powershell
# สร้าง Service
New-Service fluent-bit `
  -BinaryPathName "`"C:\Program Files\fluent-bit\bin\fluent-bit.exe`" -c `"C:\Program Files\fluent-bit\conf\fluent-bit.conf`"" `
  -StartupType Automatic

# เริ่มการทำงาน
Start-Service fluent-bit

# ตรวจสอบสถานะ
Get-Service fluent-bit | Format-List
```

ผลที่ถูกต้อง `Status` ต้องเป็น `Running`:

```
Name        : fluent-bit
Status      : Running
StartType   : Automatic
```

---

## 7. ขั้นตอนที่ 6 — ทดสอบ

### 7.1 ทดสอบ connection ก่อนใช้จริง

แก้ `[INPUT]` ใน config ชั่วคราวเป็น dummy แล้ว restart service:

```ini
[INPUT]
    Name   dummy
    Tag    windows.security
    Dummy  {"EventID": 4624, "message": "test from fluent bit"}
    Rate   1
```

ถ้าระบบ monitoring.jarudat.com ได้รับข้อมูล แสดงว่า connection ทำงานปกติ จากนั้นค่อยเปลี่ยน `[INPUT]` กลับเป็นของจริง

### 7.2 ทดสอบสร้าง Windows Event จริง

```powershell
# สร้าง Event ทดสอบใน Application Log (Event ID 1000)
Write-EventLog -LogName Application -Source "Application" -EventId 1000 -Message "Test Fluent Bit"
```

### 7.3 ดู log ของ Fluent Bit

```powershell
# ดู log ว่า Fluent Bit มี error ไหม
Get-EventLog -LogName System -Source "fluent-bit" -Newest 20
```

---

## 8. คำสั่งที่ใช้บ่อย

| คำสั่ง (PowerShell Admin) | ความหมาย |
|---|---|
| `Start-Service fluent-bit` | เริ่มการทำงาน |
| `Stop-Service fluent-bit` | หยุดการทำงาน |
| `Restart-Service fluent-bit` | รีสตาร์ท (ใช้หลังแก้ config) |
| `Get-Service fluent-bit` | ดูสถานะ |
| `Remove-Service fluent-bit` | ลบ service |

> ⚠️ **ทุกครั้งที่แก้ไข config** ต้อง `Restart-Service fluent-bit` ถึงจะมีผล

---

## 9. โครงสร้าง JSON ที่ระบบได้รับ

```json
{
  "date": 1747000000.334755,
  "Channel": "Security",
  "EventID": 4624,
  "Message": "An account was successfully logged on...",
  "tag": "windows.security"
}
```

---

## 10. Windows Event ID — อ้างอิงครบทุกหมวด

### 📊 ระดับความสำคัญ

| สัญลักษณ์ | ระดับ | การตอบสนอง |
|:---:|---|---|
| 🚨 | **Critical** | แจ้งเตือนทันที — Telegram/LINE alert |
| ⚠️ | **Warning** | Monitor และเก็บ log ไว้วิเคราะห์ |
| ℹ️ | **Info** | ข้อมูลทั่วไป เก็บไว้อ้างอิง |

---

### 🖥️ Remote Desktop (RDP) & Remote Access

> ⚠️ ต้อง monitor **2 log ต่างหาก**: Security Log + TerminalServices Operational Logs

**ลำดับ event เมื่อมีคนรีโมตเข้ามา:**
```
1149 → 4624 (Type 10/7) → 21 → 22   ←── ครบ 4 ตัวนี้ = เข้าถึง Desktop แล้ว
```

| Event ID | ระดับ | ความหมาย | หมายเหตุ / สิ่งที่ต้องดู |
|:---:|:---:|---|---|
| 1149 | ⚠️ | RDP Network connection สำเร็จ (ก่อน login) | TerminalServices-RemoteConnectionManager — เห็นก่อนใครเลย |
| 21 | ⚠️ | RDP Session logon succeeded | TerminalServices-LocalSessionManager — ดู Source Network Address |
| 22 | 🚨 | RDP Shell start (เห็น Desktop แล้ว) | ยืนยันว่า attacker เข้าถึง GUI จริง — อันตรายสุด |
| 24 | ℹ️ | RDP Session disconnected | ผู้ใช้ปิดหน้าต่าง RDP |
| 25 | ℹ️ | RDP Session reconnected | กลับมา session เดิม — ดู Session ID |
| 39 | ⚠️ | Session ถูก disconnect โดย session อื่น | session ID ต่างกัน = admin ไล่ออก |
| 40 | ℹ️ | Session disconnect + reason code | reason 5 = replaced by another connection |
| 4624 | ⚠️ | Login สำเร็จผ่าน RDP | Type 10 = session ใหม่, Type 7 = reconnect จาก remote IP |
| 4625 | ⚠️ | Login ล้มเหลวผ่าน RDP | Type 10 หรือ Type 3 (NLA) — Brute Force RDP |
| 4648 | ⚠️ | Runas / Pass-the-Hash ผ่าน RDP | Lateral movement ข้ามเครื่อง |
| 4825 | ⚠️ | ปฏิเสธการ RDP เพราะไม่มีสิทธิ์ | User authenticated แล้วแต่ไม่อยู่ใน RDP group |

---

### 🔐 Authentication & Logon

**Channel:** Security Log

| Event ID | ระดับ | ความหมาย | หมายเหตุ / สิ่งที่ต้องดู |
|:---:|:---:|---|---|
| 4624 | ℹ️ | Login สำเร็จ | Logon Type: 2=Local, 3=Network, 7=Unlock/RDP reconnect, 10=RDP ใหม่, 4=Batch, 5=Service |
| 4625 | ⚠️ | Login ล้มเหลว | หลายครั้งต่อเนื่อง = Brute Force — ดู Sub-Status code |
| 4634 | ℹ️ | Logout (system) | |
| 4647 | ℹ️ | User-initiated logout | |
| 4648 | ⚠️ | Login ด้วย credential อื่น (runas) | Lateral movement — ดู account ที่ใช้ |
| 4672 | ⚠️ | ได้รับสิทธิ์ Admin พิเศษ | SeDebugPrivilege, SeBackupPrivilege, SeTakeOwnershipPrivilege |
| 4740 | 🚨 | Account ถูก lock out | อาจเกิดจาก Brute Force — ดู Caller Computer Name |
| 4767 | ⚠️ | Account unlock | ใครปลดล็อค — อาจเป็น attacker ปลดล็อค account ตัวเอง |
| 4778 | ℹ️ | Session reconnect (RDP/Console) | ดู Source Address |
| 4779 | ℹ️ | Session disconnect | |
| 4800 | ℹ️ | Workstation ล็อคหน้าจอ | |
| 4801 | ℹ️ | Workstation ปลดล็อค | |
| 4802 | ℹ️ | Screen saver เปิด | |
| 4803 | ℹ️ | Screen saver ปิด | |

---

### 🎫 Kerberos (Domain Controller)

**Channel:** Security Log — ต้องเป็น Domain Controller

| Event ID | ระดับ | ความหมาย | หมายเหตุ / สิ่งที่ต้องดู |
|:---:|:---:|---|---|
| 4768 | ⚠️ | Kerberos TGT requested | RC4 encryption (0x17) = Golden Ticket / Overpass-the-Hash |
| 4769 | ⚠️ | Kerberos TGS requested | RC4 + หลายครั้ง + หลาย service = Kerberoasting |
| 4770 | ℹ️ | Kerberos TGT renewed | ปกติ — ดูถ้าถี่ผิดปกติ |
| 4771 | ⚠️ | Kerberos pre-auth ล้มเหลว | Brute force domain account — ดู Failure Code |
| 4776 | ⚠️ | NTLM authentication | ใน domain ที่ควรใช้ Kerberos = ผิดปกติ, อาจเป็น NTLM relay |
| 4649 | ⚠️ | Replay attack detected | Kerberos replay — rare แต่ critical |

---

### 👤 User & Group Management

**Channel:** Security Log

| Event ID | ระดับ | ความหมาย | หมายเหตุ / สิ่งที่ต้องดู |
|:---:|:---:|---|---|
| 4720 | 🚨 | สร้าง user ใหม่ | ดูว่าใครสร้าง และ user ที่สร้างมีสิทธิ์ไหม |
| 4722 | ⚠️ | เปิด user account | Disabled account ถูกเปิด |
| 4723 | ⚠️ | User เปลี่ยน password ตัวเอง | |
| 4724 | ⚠️ | Admin reset password | ดูว่า reset password ใคร |
| 4725 | ⚠️ | ปิด user account | |
| 4726 | 🚨 | ลบ user | |
| 4727 | 🚨 | สร้าง Global Security Group | |
| 4728 | 🚨 | เพิ่ม user เข้า Global Security Group | Domain Admins — privilege escalation |
| 4729 | ⚠️ | ลบ user ออกจาก Global Security Group | |
| 4730 | 🚨 | ลบ Global Security Group | |
| 4731 | 🚨 | สร้าง Local Security Group | |
| 4732 | 🚨 | เพิ่ม user เข้า Local Security Group | Local Administrators — privilege escalation |
| 4733 | ⚠️ | ลบ user ออกจาก Local Security Group | |
| 4734 | 🚨 | ลบ Local Security Group | |
| 4735 | ⚠️ | แก้ไข Local Security Group | |
| 4737 | ⚠️ | แก้ไข Global Security Group | |
| 4738 | ⚠️ | แก้ไข user account | เปลี่ยน flag, UAC, หรือ attribute |
| 4756 | 🚨 | เพิ่ม user เข้า Universal Security Group | Enterprise Admins, Schema Admins |
| 4757 | ⚠️ | ลบ user ออกจาก Universal Security Group | |
| 4764 | 🚨 | เปลี่ยน group type | |

---

### ⚙️ Process, Service & Scheduled Task

**Channel:** Security Log — ต้องเปิด Process Creation Auditing และ Command Line Auditing

| Event ID | ระดับ | ความหมาย | หมายเหตุ / สิ่งที่ต้องดู |
|:---:|:---:|---|---|
| 4688 | ⚠️ | สร้าง process ใหม่ | ต้องเปิด command-line auditing — ดู Process Name + Command Line |
| 4689 | ℹ️ | Process สิ้นสุด | ดู Exit Code |
| 4656 | ⚠️ | Handle requested to object | LSASS access = credential dump (Mimikatz) |
| 4657 | ⚠️ | Registry value ถูกแก้ไข | ดู Object Name + New Value |
| 4658 | ℹ️ | Handle ถูกปิด | |
| 4660 | ⚠️ | Object ถูกลบ | |
| 4663 | ⚠️ | เข้าถึง object (file/folder/registry) | ดู Accesses field |
| 4670 | ⚠️ | Permission ของ object ถูกเปลี่ยน | SACL/DACL change |
| 4673 | ⚠️ | ใช้สิทธิ์พิเศษ (privileged service called) | SeDebugPrivilege บน non-system process = อันตราย |
| 4674 | ⚠️ | Operation บน privileged object | |
| 4697 | 🚨 | ติดตั้ง service ใหม่ | ดู binary path — PsExec ใช้ช่องนี้ |
| 4698 | 🚨 | สร้าง Scheduled Task | Persistence — ดู Task Name + Action |
| 4699 | 🚨 | ลบ Scheduled Task | Cleanup หลัง attack |
| 4700 | ⚠️ | เปิด Scheduled Task | |
| 4701 | ⚠️ | ปิด Scheduled Task | |
| 4702 | ⚠️ | แก้ไข Scheduled Task | |

---

### 🛡️ Audit Policy & System Time

**Channel:** Security Log

| Event ID | ระดับ | ความหมาย | หมายเหตุ / สิ่งที่ต้องดู |
|:---:|:---:|---|---|
| 1102 | 🚨 | ลบ Security audit log | เกือบ 100% คือ attacker ลบหลักฐาน |
| 4719 | 🚨 | เปลี่ยน audit policy | ปิด logging เพื่อซ่อนตัว |
| 4616 | 🚨 | เปลี่ยน system time | ซ่อน timestamp ใน log |
| 4907 | ⚠️ | เปลี่ยน auditing settings บน object | |
| 4908 | ⚠️ | Special Groups Logon Table เปลี่ยน | |

---

### 🌐 Network Share & Firewall

**Channel:** Security Log

| Event ID | ระดับ | ความหมาย | หมายเหตุ / สิ่งที่ต้องดู |
|:---:|:---:|---|---|
| 5140 | ⚠️ | เข้าถึง network share | ADMIN$, C$ = Lateral movement (PsExec, SMB) |
| 5142 | ⚠️ | เพิ่ม network share | |
| 5143 | ⚠️ | แก้ไข network share | |
| 5144 | ⚠️ | ลบ network share | |
| 5145 | ⚠️ | ตรวจสอบสิทธิ์ network share | SMB enumeration |
| 5152 | ⚠️ | Firewall บล็อก packet | |
| 5153 | ⚠️ | Firewall บล็อก packet (restrictive filter) | |
| 5154 | ℹ️ | อนุญาต connection | |
| 5155 | ⚠️ | บล็อก application ฟัง port | |
| 5156 | ℹ️ | อนุญาต network connection | |
| 5157 | ⚠️ | บล็อก network connection | |
| 5158 | ℹ️ | อนุญาต bind port | |
| 5159 | ⚠️ | บล็อก bind port | |
| 4946 | ⚠️ | เพิ่ม rule ใน Windows Firewall | |
| 4947 | ⚠️ | แก้ไข rule ใน Windows Firewall | attacker เปิด port 3389 หรือ allow inbound |
| 4948 | ⚠️ | ลบ rule ใน Windows Firewall | |
| 4950 | ⚠️ | เปลี่ยน Windows Firewall setting | |

---

### 💻 System Log — Service & Boot

**Channel:** System Log

| Event ID | ระดับ | ความหมาย | หมายเหตุ / สิ่งที่ต้องดู |
|:---:|:---:|---|---|
| 7000 | 🚨 | Service start ล้มเหลว | ดู Error Code + Service Name |
| 7001 | 🚨 | Service ที่ depend กัน start ไม่ได้ | |
| 7009 | ⚠️ | Service timeout ตอน start | |
| 7011 | ⚠️ | Service timeout ตอน transaction | |
| 7022 | ⚠️ | Service hang ตอน start | |
| 7023 | 🚨 | Service หยุดด้วย error | ดู Error Code |
| 7024 | 🚨 | Service หยุดด้วย service-specific error | SQL Server, Exchange มักใช้ code นี้ |
| 7026 | ⚠️ | Driver ไม่สามารถโหลดได้ตอน boot | |
| 7031 | 🚨 | Service หยุดโดยไม่คาดคิด | ดู Recovery Action |
| 7034 | 🚨 | Service หยุดกะทันหัน | |
| 7036 | ℹ️ | Service เปลี่ยนสถานะ (running/stopped) | baseline ปกติ |
| 7040 | ⚠️ | เปลี่ยน service start type | Manual→Auto หรือ Disabled→Auto = suspicious |
| 7045 | 🚨 | ติดตั้ง service ใหม่ | ดู binary path — PsExec, malware mounts service |
| 6005 | ℹ️ | Windows EventLog service เริ่มทำงาน (boot) | |
| 6006 | ℹ️ | Windows shutdown ปกติ | |
| 6008 | 🚨 | Shutdown กะทันหัน / crash | BSOD, power failure, หรือ kill |
| 6013 | ℹ️ | System uptime (วันละครั้ง) | ดู uptime ผิดปกติ |
| 104 | 🚨 | System log ถูกลบ | attacker ลบหลักฐาน |

---

### 💾 Disk & Hardware

**Channel:** System Log

| Event ID | ระดับ | ความหมาย | หมายเหตุ / สิ่งที่ต้องดู |
|:---:|:---:|---|---|
| 7 | 🚨 | Disk error (bad sector / I/O error) | ดู Device + Error — HDD/SSD กำลังพัง |
| 51 | ⚠️ | Disk warning (paging operation error) | |
| 55 | 🚨 | File system corruption (NTFS) | ต้อง chkdsk ทันที |
| 129 | ⚠️ | Storage controller reset | SAN/NAS/RAID controller issue |
| 153 | ⚠️ | Disk timeout (StorPort) | SAN latency สูง หรือ disk เริ่มพัง |

---

### 📋 Application Log

**Channel:** Application Log

| Event ID | ระดับ | ความหมาย | หมายเหตุ / สิ่งที่ต้องดู |
|:---:|:---:|---|---|
| 1000 | 🚨 | Application crash | ดู Faulting Module + Exception Code |
| 1001 | ⚠️ | Windows Error Reporting (WER) | |
| 1002 | 🚨 | Application hang (not responding) | ดู PID + Hang Time |
| 1026 | ⚠️ | .NET Runtime error | ดู Exception Type |

---

### 🗄️ SQL Server

**Channel:** Application Log

| Event ID | ระดับ | ความหมาย | หมายเหตุ / สิ่งที่ต้องดู |
|:---:|:---:|---|---|
| 18456 | ⚠️ | SQL Server login fail | State: 5=invalid user, 8=bad pwd, 18=must change pwd |
| 17204 | 🚨 | ไม่สามารถเปิด database file | Path ผิด หรือ file เสีย |
| 17207 | 🚨 | SQL Server database error | Database corrupt หรือ disk เต็ม |
| 701 | 🚨 | SQL Server out of memory | RAM ไม่พอ หรือ memory leak |
| 832 | 🚨 | SQL Server page corruption | CHECKSUM fail — data อาจเสียหาย |
| 833 | ⚠️ | SQL I/O request > 15 sec | Disk latency สูงมาก — storage issue |
| 855 | ⚠️ | SQL Server non-yielding scheduler | CPU ตัน หรือ deadlock |
| 17806 | 🚨 | SSPI handshake fail | Kerberos/NTLM fail ใน SQL — อาจมีการ tamper |

---

### 🛡️ Windows Defender

**Channel:** Microsoft-Windows-Windows Defender/Operational

| Event ID | ระดับ | ความหมาย | หมายเหตุ / สิ่งที่ต้องดู |
|:---:|:---:|---|---|
| 1116 | 🚨 | พบ malware | ดู Threat Name + Path + Detection Source |
| 1117 | ⚠️ | Defender จัดการ malware แล้ว | ดู Action: quarantine/remove/block |
| 1118 | ⚠️ | Defender remediation เริ่ม | |
| 1119 | 🚨 | Remediation failed | ลบ malware ไม่สำเร็จ — ต้องดำเนินการเอง |
| 5001 | 🚨 | Real-time protection ถูกปิด | attacker ปิด AV ก่อน deploy malware |
| 5004 | 🚨 | Real-time protection config เปลี่ยน | exclusion path ถูกเพิ่ม = attacker bypass AV |
| 5007 | ⚠️ | Defender configuration เปลี่ยน | ดู Old Value vs New Value |
| 5010 | 🚨 | Antispyware ถูกปิด | |
| 5012 | 🚨 | Antivirus ถูกปิด | |
| 2004 | ⚠️ | เพิ่ม firewall rule (Defender Firewall) | |
| 3002 | 🚨 | Real-time protection component ล้มเหลว | Defender ทำงานไม่ได้บางส่วน |

---

### 📜 PowerShell Logging

**Channel:** Microsoft-Windows-PowerShell/Operational — ต้องเปิด Script Block Logging ใน Group Policy

| Event ID | ระดับ | ความหมาย | หมายเหตุ / สิ่งที่ต้องดู |
|:---:|:---:|---|---|
| 4104 | 🚨 | Script block logging — เห็น script จริง | หลัง deobfuscate — ดู ScriptBlock content |
| 4103 | ⚠️ | Module logging — cmdlet ที่ถูกเรียก | ดู Payload: Invoke-Mimikatz, DownloadString |
| 400 | ⚠️ | PowerShell engine start | PS v2 engine = downgrade attack เพื่อ bypass AMSI/logging |
| 600 | ℹ️ | PowerShell provider เปิด | |
| 800 | ⚠️ | Pipeline execution detail | |

---

### 🔍 Attack Scenarios

#### 🔴 Brute Force / Password Spray
```
4625 (login fail ซ้ำๆ) → 4740 (account lock) → 4624 (login สำเร็จ)
```
> ดู Sub-Status 0xC000006A (bad pwd) และ 0xC0000064 (no user) — Password Spray จะ fail หลาย account จาก IP เดียว

#### 🔴 RDP Intrusion
```
1149 (network conn) → 4624 Type 10 (auth) → 21 (session) → 22 (desktop access)
```
> ดู Source Network Address ใน Event 21 — ต่างประเทศ หรือ IP ที่ไม่เคยเห็น

#### 🟠 Lateral Movement
```
4624 Type 3/10 + 4648 → 5140 (ADMIN$) → 7045/4697 (PsExec service) → 4688 (cmd.exe)
```
> PsExec สร้าง service ชั่วคราวใน 7045/4697 แล้วลบทิ้ง — ดู binary path ที่มี \ADMIN$\

#### 🟠 Credential Dumping
```
4688 (mimikatz/procdump) → 4656 (LSASS handle) → 4769 RC4 (Kerberoasting)
```
> LSASS access จาก process ที่ไม่ใช่ SYSTEM หรือ AV = Mimikatz

#### 🟠 Persistence
```
4698 (Scheduled Task) หรือ 7045/4697 (Service) หรือ 4720+4732 (New Admin)
```
> ดู Task Name ที่แปลก และ Action path ที่ชี้ไป %TEMP%, AppData, หรือ network path

#### 🔴 Defense Evasion
```
1102 (Security log ถูกลบ) + 104 (System log ถูกลบ) + 4719 (Audit policy ปิด)
```
> 1102 เกิดขึ้นเกือบทุกครั้งที่มี attacker ที่มีสิทธิ์ Admin — ต้องแจ้งเตือนทันที

#### 🟠 Kerberoasting
```
4769 (TGS request) + RC4 encryption (0x17) + หลาย service ในเวลาสั้น
```
> ดู Ticket Encryption Type 0x17 และจำนวน request ต่อ user ต่อนาที

#### 🔴 SQL Server Attack
```
18456 (login fail) + 7000/7034 (service down) + 17204 (DB file error) + 701 (OOM)
```
> SQL Injection ที่สำเร็จมักไม่ทิ้ง event — ต้อง monitor SQL audit log แยกต่างหาก

#### 🔴 Malware / AV Bypass
```
5001/5012 (Defender ปิด) + 5004 (exclusion เพิ่ม) + 1116 (malware detected)
```
> ถ้า Defender ปิดก่อนแล้วค่อยมี 1116 แสดงว่ามี attacker ทำงานอยู่

#### 🟠 PowerShell Attack
```
400 (PS v2 engine = bypass AMSI) + 4103 (Invoke-Mimikatz, DownloadString) + 4104 (obfuscated script)
```
> ดู ScriptBlock ใน 4104 — หลัง deobfuscate จะเห็น payload จริง

---

*อ้างอิง: Microsoft Docs, Ponder The Bits RDP Event IDs, DFIR Spot, NinjaOne, BeyondTrust, EpicDetect — 2025-2026*