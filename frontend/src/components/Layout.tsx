import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { SubjectOut } from "../types/api";
import Logo from "./Logo";
import UploadModal from "./UploadModal";

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

const GraphIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="6" cy="6" r="2.3" stroke="currentColor" strokeWidth="1.7" />
    <circle cx="18" cy="7" r="2.3" stroke="currentColor" strokeWidth="1.7" />
    <circle cx="9" cy="18" r="2.3" stroke="currentColor" strokeWidth="1.7" />
    <circle cx="17" cy="16" r="2.3" stroke="currentColor" strokeWidth="1.7" />
    <path d="M8 7.2L16 7" stroke="currentColor" strokeWidth="1.5" />
    <path d="M7.2 8L15 15" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.5 2.5" />
    <path d="M10.5 17L15.5 16.5" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const AccountIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="8.5" r="3.2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M4.5 20c1.4-3.6 4.4-5.5 7.5-5.5s6.1 1.9 7.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const links = [
  { to: "/", label: "My Library", icon: DocumentsIcon },
  { to: "/knowledge-graph", label: "Knowledge Graph", icon: GraphIcon },
  { to: "/progress", label: "Growth Dashboard", icon: GrowthIcon },
];

export default function Layout() {
  const { signOut, session } = useAuth();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [subjects, setSubjects] = useState<SubjectOut[]>([]);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  // Loaded once for the "New Entry" modal's subject picker - cheap, and
  // every page under this Layout benefits from it being ready immediately.
  useEffect(() => {
    api.listSubjects().then(setSubjects).catch(() => {});
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="min-h-screen flex bg-background text-on-background font-body-md">
      <nav className="w-sidebar-width shrink-0 h-screen sticky top-0 bg-surface-container border-r-[1.5px] border-outline-variant flex flex-col p-gutter space-y-6">
        <div className="mb-2">
          <Logo />
        </div>

        <button
          onClick={() => setUploadOpen(true)}
          className="spring-btn w-full bg-primary text-on-primary py-3 px-4 rounded-full font-label-md text-label-md flex items-center justify-center gap-2"
        >
          <PlusIcon />
          New Entry
        </button>

        <div className="flex-1 flex flex-col space-y-2">
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <NavLink
                key={l.to}
                to={l.to}
                end
                className={({ isActive }) =>
                  `relative flex items-center gap-3 px-4 py-3 rounded-lg font-label-md text-label-md transition-transform duration-200 hover:scale-[1.02] ${
                    isActive ? "washi-tape-active text-primary font-bold" : "text-on-surface-variant hover:text-primary"
                  }`
                }
              >
                <Icon />
                {l.label}
              </NavLink>
            );
          })}
        </div>

        <div ref={accountRef} className="relative pt-4 border-t-[1.5px] border-outline-variant/60">
          <button
            onClick={() => setAccountOpen((v) => !v)}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors"
          >
            <AccountIcon />
            <span className="font-label-md text-label-md truncate">{session?.user.email ?? "Account"}</span>
          </button>
          {accountOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-full journal-card static-card p-2 shadow-lg">
              <button
                onClick={signOut}
                className="w-full text-left px-3 py-2 rounded-md text-label-md font-label-md text-error hover:bg-error-container/40 transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </nav>

      <div className="flex-1 min-w-0 flex flex-col">
        <main className="flex-1 px-margin-desktop py-10 max-w-content-max-width mx-auto w-full">
          <Outlet />
        </main>
      </div>

      <UploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        subjects={subjects}
        onUploaded={() => {
          // Document list pages already poll every 4s (DocumentsPage) or
          // refetch on their own triggers, so no cross-component refresh
          // wiring is needed here.
        }}
      />
    </div>
  );
}
