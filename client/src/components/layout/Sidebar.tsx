import { useState } from "react";
import { NavLink } from "react-router-dom";

const items = [
  { to: "/sessions", label: "Sessions", icon: "💬" },
  { to: "/nodes", label: "Nodes", icon: "🖥️" },
  { to: "/terminal", label: "Terminal", icon: "⬛" },
  { to: "/files", label: "Files", icon: "📁" },
  { to: "/monitor", label: "Monitor", icon: "📊" },
  { to: "/proxy-pool", label: "Proxy Pool", icon: "🔄" },
  { to: "/deploy", label: "Deploy", icon: "🚀" },
  { to: "/usage", label: "Usage", icon: "📈" },
  { to: "/users", label: "Users", icon: "👤" },
];

export default function Sidebar() {
  const [open, setOpen] = useState(false);

  const navLinks = items.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      onClick={() => setOpen(false)}
      className={({ isActive }) =>
        `flex items-center gap-2 px-4 py-2.5 text-sm transition-colors rounded-lg mx-2 ${
          isActive
            ? "bg-purple-600/20 text-purple-300"
            : "text-gray-400 hover:text-white hover:bg-gray-800/50"
        }`
      }
    >
      <span className="text-base">{item.icon}</span>
      {item.label}
    </NavLink>
  ));

  return (
    <>
      {/* Hamburger button - visible only on mobile */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white"
        aria-label="Open menu"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 12h18M3 6h18M3 18h18" />
        </svg>
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar - hidden on mobile unless open */}
      <aside
        className={`fixed md:sticky top-0 h-screen w-52 shrink-0 border-r border-gray-800 bg-gray-900/95 backdrop-blur flex flex-col z-40 transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <h1 className="text-sm font-bold">
            <span className="text-purple-400">Claude</span> Hub
          </h1>
          <button
            onClick={() => setOpen(false)}
            className="md:hidden p-1 text-gray-400 hover:text-white"
            aria-label="Close menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 py-2 space-y-0.5 overflow-y-auto">
          {navLinks}
        </nav>
      </aside>
    </>
  );
}
