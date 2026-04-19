/** Shared status badge styles for light-mode appointment cards. */
export const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  requested: "bg-amber-100 text-amber-800 border-amber-200",
  completed: "bg-sky-100 text-sky-800 border-sky-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  no_show: "bg-gray-100 text-gray-700 border-gray-200",
  scheduled: "bg-violet-100 text-violet-800 border-violet-200",
};

export const STATUS_FALLBACK = "bg-gray-100 text-gray-700 border-gray-200";
