const LoadingSpinner = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400" />
    </div>
  );
};

export default LoadingSpinner;
