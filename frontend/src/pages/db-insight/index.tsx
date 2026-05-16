import { useTranslation } from "react-i18next";

const DbInsightPage = () => {
  const { t } = useTranslation();

  return (
    <div className="min-h-full bg-slate-50 p-6 dark:bg-slate-900">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <p className="text-sm font-medium text-cyan-700 dark:text-cyan-400">{t("sidebar.dbInsight")}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">
            {t("sidebar.dbInsightOverview")}
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Deep analysis for database monitors — slow queries, index health, table sizes, connections, and replication.
          </p>
        </div>

        <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-24 dark:border-slate-700 dark:bg-slate-800">
          <div className="text-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.25S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
            </svg>
            <p className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Coming soon</p>
            <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
              DB Insight is under development.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DbInsightPage;
