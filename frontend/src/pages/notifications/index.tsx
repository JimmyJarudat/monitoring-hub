import { Link } from "react-router-dom";
import { mockNotifications, type MockNotification } from "@/data/mockNotifications";

const dateTimeFormatter = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
});

const typeClass: Record<MockNotification["type"], string> = {
  incident: "bg-rose-50 text-rose-700",
  alert: "bg-amber-50 text-amber-700",
  resolved: "bg-emerald-50 text-emerald-700",
  system: "bg-slate-100 text-slate-700",
};

const typeLabel: Record<MockNotification["type"], string> = {
  incident: "Incident",
  alert: "Alert",
  resolved: "Resolved",
  system: "System",
};

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date);
};

const NotificationsPage = () => {
  const unreadCount = mockNotifications.filter((item) => !item.read).length;

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">บัญชีของฉัน</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">การแจ้งเตือนทั้งหมด</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            โครง UI สำหรับ notification center ตอนนี้ใช้ mock data ก่อน และจะต่อข้อมูลจริงภายหลัง
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
          <span className="font-semibold text-slate-950">{unreadCount}</span>
          <span className="ml-1 text-slate-500">ยังไม่ได้อ่าน</span>
        </div>
      </div>

      <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-950">Notifications</h2>
          <p className="mt-1 text-xs text-slate-500">{mockNotifications.length} mock records</p>
        </div>

        <div className="divide-y divide-slate-200">
          {mockNotifications.map((item) => (
            <Link
              key={item.id}
              to={item.href}
              className="grid gap-3 px-4 py-4 transition hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {!item.read ? <span className="h-2 w-2 rounded-full bg-cyan-500" /> : null}
                  <h3 className="font-semibold text-slate-950">{item.title}</h3>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${typeClass[item.type]}`}>
                    {typeLabel[item.type]}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.message}</p>
              </div>
              <time className="text-xs text-slate-500">{formatDate(item.createdAt)}</time>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};

export default NotificationsPage;
