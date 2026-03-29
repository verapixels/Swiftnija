// components/NavTabs.tsx
import { useNavigate, useLocation } from "react-router-dom";
import { FiHome, FiSearch, FiUser, FiShoppingCart, FiHeadphones } from "react-icons/fi";
import { useCart } from "../context/Cartcontext";

const TABS = [
  { label: "HOME",    icon: FiHome,       path: "/home" },
  { label: "CART",    icon: FiShoppingCart, path: "/cart" },
  { label: "SEARCH",  icon: FiSearch,     path: "/search" },
  { label: "SUPPORT", icon: FiHeadphones, path: "/support" },
  { label: "PROFILE", icon: FiUser,       path: "/profile" },
];

export default function NavTabs() {
  const navigate      = useNavigate();
  const location      = useLocation();
  const { cartCount } = useCart();

  const isActive = (path: string) =>
  location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <>
      <nav className="nav-dock">
        {TABS.map(({ label, icon: Icon, path }) => {
          const active = isActive(path);
          const isCart = path === "/cart";

          return (
            <button
              key={path}
              className={`nav-tab ${active ? "active" : ""}`}
              onClick={() => navigate(path)}
            >
              <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={22} />
                {isCart && cartCount > 0 && (
                  <span style={{
                    position: "absolute", top: -7, right: -9,
                    minWidth: 16, height: 16,
                    background: "#FF6B00", color: "white",
                    borderRadius: 10, fontSize: 9, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "0 3px", lineHeight: 1,
                  }}>
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                )}
              </span>
              <span className="nav-label">{label}</span>
            </button>
          );
        })}
      </nav>

      <style>{`
        .nav-dock {
          display: flex;
          align-items: center;
          justify-content: space-around;
          background: var(--surface, #111115);
          border-top: 1px solid var(--border, #1e1e26);
          height: 68px;
          flex-shrink: 0;
          position: fixed;
          bottom: 0; left: 0; right: 0;
          z-index: 200;
          transition: background 0.3s, border-color 0.3s;
        }
        @media (min-width: 768px) { .nav-dock { display: none; } }

        .nav-tab {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 6px 0;
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--text2, #8888a0);
          transition: color 0.2s;
          -webkit-tap-highlight-color: transparent;
        }
        .nav-tab.active { color: #FF6B00; }
        .nav-label {
          font-size: 8px; font-weight: 800;
          font-family: 'Nunito', sans-serif;
          letter-spacing: 0.5px;
        }
        [data-theme="light"] .nav-dock { background: #ffffff; border-top-color: #e0e0e8; }
        [data-theme="light"] .nav-tab  { color: #888890; }
        [data-theme="light"] .nav-tab.active { color: #FF6B00; }
      `}</style>
    </>
  );
}