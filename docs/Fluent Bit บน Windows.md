# คู่มือการติดตั้งและตั้งค่า Fluent Bit บน Windows

> Log Collector & Forwarder สำหรับ Windows Server

---

## 1. ภาพรวม

Fluent Bit เป็น log collector ที่เบาและรวดเร็ว รองรับการเก็บ log จาก Windows Event Log และส่งต่อไปยัง API หรือระบบ monitoring ต่างๆ

**สิ่งที่ทำได้บน Windows:**
- เก็บ Windows Event Log (System, Application, Security)
- เก็บ log จากไฟล์ทั่วไป เช่น IIS, application logs
- ส่ง log เป็น JSON ไปยัง REST API
- รันเป็น Windows Service เปิดเครื่องทำงานอัตโนมัติ
- ใช้ RAM น้อยมาก ประมาณ 10-20MB

---

## 2. การดาวน์โหลด

1. เปิดเบราว์เซอร์ไปที่ https://fluentbit.io/download
2. เลือก **Windows** และดาวน์โหลด `fluent-bit-X.X.X-win64.exe`

> **หมายเหตุ:** เลือก `win64.exe` สำหรับ Windows 64-bit (แนะนำ)

---

## 3. การติดตั้ง

1. ดับเบิลคลิกไฟล์ `.exe` ที่ดาวน์โหลดมา
2. คลิก **Next** และทำตาม wizard จนเสร็จ
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

## 4. การตั้งค่า

แก้ไขไฟล์ `C:\Program Files\fluent-bit\conf\fluent-bit.conf`

### 4.1 ตัวอย่าง Config สำหรับส่ง Windows Event Log ไป API

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

[INPUT]
    Name                 winevtlog
    Tag                  windows.events
    Channels             System,Application,Security
    Read_Existing_Events false
    Interval_Sec         1

[OUTPUT]
    Name    http
    Match   *
    Host    YOUR_API_HOST
    Port    443
    URI     /api/server-logs/fluentbit/event
    Format  json
    Header  Authorization Bearer YOUR_API_KEY
    tls     on
```

> **หมายเหตุ:** เปลี่ยน `YOUR_API_HOST` และ `YOUR_API_KEY` ให้เป็นค่าจริงก่อนใช้งาน

### 4.2 อธิบาย Config แต่ละส่วน

| Section | คำอธิบาย |
|---|---|
| `[SERVICE]` | ตั้งค่าพื้นฐาน เช่น flush interval และ log level |
| `[INPUT]` | กำหนดแหล่งที่มาของ log เช่น Windows Event Log |
| `Channels` | ช่อง event ที่ต้องการเก็บ: System, Application, Security |
| `[OUTPUT]` | กำหนดปลายทางที่ส่ง log เช่น HTTP API |
| `Host` | domain หรือ IP ของ API ที่รับ log |
| `Header` | Authorization header สำหรับยืนยันตัวตน |
| `Format json` | ส่งข้อมูลในรูปแบบ JSON |

---

## 5. ติดตั้งเป็น Windows Service

ให้ Fluent Bit ทำงานอัตโนมัติทุกครั้งที่เปิดเครื่อง

### 5.1 สร้าง Service

เปิด **PowerShell ในฐานะ Administrator** แล้วรัน:

```powershell
New-Service fluent-bit `
  -BinaryPathName "`"C:\Program Files\fluent-bit\bin\fluent-bit.exe`" -c `"C:\Program Files\fluent-bit\conf\fluent-bit.conf`"" `
  -StartupType Automatic
```

### 5.2 Start Service

```powershell
Start-Service fluent-bit
```

### 5.3 ตรวจสอบสถานะ

```powershell
Get-Service fluent-bit | Format-List
```

ผลที่ถูกต้อง `Status` ต้องเป็น `Running`:

```
Name   : fluent-bit
Status : Running
...
```

---

## 6. คำสั่งที่ใช้บ่อย

| คำสั่ง (PowerShell Admin) | ความหมาย |
|---|---|
| `Start-Service fluent-bit` | เริ่มการทำงาน |
| `Stop-Service fluent-bit` | หยุดการทำงาน |
| `Restart-Service fluent-bit` | รีสตาร์ท service |
| `Get-Service fluent-bit` | ดูสถานะ |
| `Remove-Service fluent-bit` | ลบ service |

---

## 7. การทดสอบ

### 7.1 ทดสอบด้วย dummy input

เปลี่ยน `[INPUT]` เป็น dummy เพื่อทดสอบ connection ก่อน:

```ini
[INPUT]
    Name   dummy
    Tag    test
    Dummy  {"message": "hello from fluent bit"}
    Rate   1
```

ถ้า API ได้รับข้อมูล แสดงว่า Fluent Bit → API ทำงานปกติ

### 7.2 ทดสอบสร้าง Windows Event

รันใน PowerShell เพื่อสร้าง event ทดสอบ:

```powershell
Write-EventLog -LogName Application -Source "Application" -EventId 1000 -Message "Test Fluent Bit"
```

---

## 8. โครงสร้าง JSON ที่ API ได้รับ

```json
{
  "0": {
    "date": 1747000000.334755,
    "Channel": "System",
    "EventID": 1234,
    "Message": "...",
    "tag": "windows.events"
  }
}
```

> **หมายเหตุ:** แต่ละ Event จะถูก wrap อยู่ใน key `"0"`, `"1"`, ... ขึ้นอยู่กับจำนวน event ใน batch