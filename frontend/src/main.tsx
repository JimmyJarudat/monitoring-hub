import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { RouterProvider } from 'react-router-dom'
import router from "@/routes/router";
import axios from "axios";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { SessionProvider } from './contexts/session.context';
import { ThemeProvider } from './contexts/theme.context';
import "./i18n";


// ตั้งค่า base URL สำหรับ axios
axios.defaults.baseURL = import.meta.env.VITE_API_URL || "/api";



createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
    <SessionProvider>
      <ToastContainer
        position="top-right"
        autoClose={4000}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnClick
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="colored"
        toastStyle={{
          borderRadius: "10px",
          padding: "12px 16px",
          fontSize: "14px",
          fontWeight: "500",
        }}
      />
      <RouterProvider router={router} />

    </SessionProvider>
    </ThemeProvider>
  </StrictMode>,
)
