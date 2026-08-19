import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "./Logo";

const DocumentsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M7 3.5H14L19 8.5V19.5C19 20.0523 18.5523 20.5 18 20.5H7C6.44772 20.5 6 20.0523 6 19.5V4.5C6 3.94772 6.44772 3.5 7 3.5Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
    <path d="M14 3.5V8.5H19" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M9 12.5H16M9 16H13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const GrowthIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 19H20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M6 19V13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M11 19V9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M16 19V5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M14.5 4L20 4L20 9.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 4L13 11L9.5 7.5L4 13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const links = [
  { to: "/", label: "My Documents", icon: DocumentsIcon },
  { to: "/progress", label: "My Growth", icon: GrowthIcon },
];

const pageTitles: Record<string, string> = {
  "/": "My Documents",
  "/progress": "My Growth",
  "/tests/new": "Create a test",
};

export default function Layout() {
  const { signOut, session } = useAuth();
  const location = useLocation();

  const title =
    pageTitles[location.pathname] ??
    (location.pathname.includes("/take")
      ? "Test"
      : location.pathname.includes("/results")
        ? "Results"
        : location.pathname.includes("/study-guide")
          ? "Study guide"
          : "GrowthPath");

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 shrink-0 flex flex-col border-r border-teal-100 dark:border-teal-900/40 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
        <div className="px-5 py-5 border-b border-teal-100 dark:border-teal-900/40">
          <Logo />
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <NavLink
                key={l.to}
                to={l.to}
                end
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium ${
                    isActive
                      ? "bg-gradient-to-r from-teal-500 to-sky-500 text-white shadow-sm shadow-teal-500/25"
                      : "text-slate-600 dark:text-slate-300 hover:bg-teal-50 dark:hover:bg-teal-950/50"
                  }`
                }
              >
                <Icon />
                {l.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-teal-100 dark:border-teal-900/40">
          <p className="text-xs text-slate-400 truncate mb-1.5">{session?.user.email}</p>
          <button
            onClick={signOut}
            className="text-sm text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 font-medium"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 flex items-center px-8 border-b border-teal-100 dark:border-teal-900/40 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
          <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h1>
        </header>
        <main className="flex-1 overflow-y-auto px-8 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
