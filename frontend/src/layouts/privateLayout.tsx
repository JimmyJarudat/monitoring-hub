import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "./navbar";
import Sidebar from "./sidebar";
import { Outlet } from "react-router-dom";
import { useSession } from "@/contexts/session.context";
import { SystemConfigProvider } from "@/contexts/systemConfig.context";
import LoadingSpinner from "@/components/LoadingSpinner";

const PrivateLayout = () => {
  const { isAuthenticated, isLoading, accessToken, refreshAccessToken } = useSession();
  const navigate = useNavigate();
  const hasRedirected = useRef(false);


  useEffect(() => {
    // จัดการกับ page visibility เพื่อ sync token ระหว่างแท็บ
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // เมื่อกลับมาที่แท็บ ตรวจสอบสถานะ token
        const checkTokenStatus = async () => {
          if (isAuthenticated && !accessToken) {
            await refreshAccessToken();
          }
        };
        checkTokenStatus();
      }
    };

    // จัดการกับ beforeunload เพื่อ cleanup
    const handleBeforeUnload = () => {
      // ไม่ต้องทำอะไรเพิ่มเติม เพราะ TokenManager จะ cleanup เอง
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isAuthenticated, accessToken]);

  useEffect(() => {
    // ⭐ เพิ่มเงื่อนไข: ต้องไม่อยู่ในสถานะ loading และไม่มี accessToken ด้วย
    if (!isLoading && !isAuthenticated && !accessToken && !hasRedirected.current) {
      console.log('🚪 Redirecting to login - not authenticated and no access token');
      hasRedirected.current = true;
      navigate("/login", { replace: true });
    }

    // ⭐ Reset hasRedirected เมื่อ authenticated แล้ว
    if (isAuthenticated && accessToken) {
      hasRedirected.current = false;
    }
  }, [isAuthenticated, isLoading, accessToken, navigate]);

  // ⭐ แสดง loading ถ้า isLoading หรือ กำลังรอ refresh token
  if (isLoading || (!isAuthenticated && !accessToken)) {
    return <LoadingSpinner />
  }

  // ⭐ ตรวจสอบทั้ง isAuthenticated และ accessToken
  if (!isAuthenticated || !accessToken) {
    return null; // ไม่แสดงอะไรระหว่างรอ redirect
  }

  // 🌐 Web Mode Layout
  return (
    <SystemConfigProvider>
    <div className="flex h-screen overflow-hidden">
      <div className="flex-shrink-0">
        <Sidebar />
      </div>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Fixed Navbar */}
        <div className="sticky top-0 z-50 bg-white shadow-sm">
          <Navbar />
        </div>

        <main className="flex-1 bg-base overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
    </SystemConfigProvider>
  );
};

export default PrivateLayout;


