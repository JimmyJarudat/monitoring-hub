import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import th from "./locales/th.json";

const savedLang = (() => {
  try { return localStorage.getItem("lang") ?? "en"; } catch { return "en"; }
})();

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    th: { translation: th },
  },
  lng: savedLang,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export const toggleLanguage = () => {
  const next = i18n.language === "en" ? "th" : "en";
  void i18n.changeLanguage(next);
  try { localStorage.setItem("lang", next); } catch {}
};

export default i18n;
