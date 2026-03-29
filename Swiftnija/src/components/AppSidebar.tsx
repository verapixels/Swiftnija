// components/AppSidebar.tsx
import { useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { useState, useEffect } from "react";
import { auth } from "../firebase";
import {
  FiGrid, FiSearch, FiPackage, FiUser,
  FiLogOut, FiShoppingCart, FiChevronRight,
  FiBox, FiHeart, FiHeadphones,
} from "react-icons/fi";
import {
  MdRestaurant, MdLocalPharmacy, MdLocalGroceryStore,
  MdStorefront, MdDirectionsBike, MdFastfood,
} from "react-icons/md";
import { RiDrinks2Line } from "react-icons/ri";
import { useCart } from "../context/Cartcontext";

const LOGO_SRC = "/src/assets/SWIFTNIJAS_LOGO_ICON-removebg-preview.png";

const NAV_LINKS = [
  { label: "Home",    icon: <FiGrid size={18}/>,        path: "/home" },
  { label: "Search",  icon: <FiSearch size={18}/>,      path: "/search" },
  { label: "Orders",  icon: <FiPackage size={18}/>,     path: "/orders" },
  { label: "Support", icon: <FiHeadphones size={18}/>,  path: "/support" },
  { label: "Profile", icon: <FiUser size={18}/>,        path: "/profile" },
];

const CATEGORIES = [
  { id: "restaurants", label: "Restaurants",  icon: <MdRestaurant size={18}/> },
  { id: "pharmacy",    label: "Pharmacy",     icon: <MdLocalPharmacy size={18}/> },
  { id: "supermarket", label: "Supermarket",  icon: <MdLocalGroceryStore size={18}/> },
  { id: "boutique",    label: "Boutique",     icon: <MdStorefront size={18}/> },
  { id: "logistics",   label: "Logistics",    icon: <MdDirectionsBike size={18}/> },
  { id: "fastfood",    label: "Fast Food",    icon: <MdFastfood size={18}/> },
  { id: "beauty",      label: "Beauty",       icon: <FiBox size={18}/> },
  { id: "drinks",      label: "Drinks",       icon: <RiDrinks2Line size={18}/> },
  { id: "health",      label: "Health",       icon: <FiHeart size={18}/> },
  { id: "electronics", label: "Electronics",  icon: <FiBox size={18}/> },
];

const HIDE_ON = ["/vendor", "/admin", "/signup", "/login", "/verify", "/address-map", "/track"];

export default function AppSidebar() {
  const navigate      = useNavigate();
  const location      = useLocation();
  const { cartCount } = useCart();

  const [user,     setUser]     = useState(auth.currentUser);
  const [userName, setUserName] = useState(
    auth.currentUser?.displayName || auth.currentUser?.email?.split("@")[0] || ""
  );

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => {
      setUser(u);
      setUserName(u?.displayName || u?.email?.split("@")[0] || "");
    });
    return () => unsub();
  }, []);

  const shouldHide = HIDE_ON.some(p => location.pathname.startsWith(p));
  if (shouldHide) return null;

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  const handleSignOut = async () => {
    await signOut(auth);
    navigate("/login");
  };

  return (
    <>
      <aside className="sn-sidebar">

        {/* Logo */}
        <div className="sn-logo" onClick={() => navigate("/home")}>
          <img src={LOGO_SRC} alt="Swift9ja"
            style={{ width: 34, height: 34, objectFit: "contain" }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          <span className="sn-logo-text">
            Swift<span className="sn-logo-9">9</span><span className="sn-logo-ja">ja</span>
          </span>
        </div>

        {/* Main nav links */}
        <nav className="sn-nav">
          {NAV_LINKS.map(item => (
            <button
              key={item.path}
              className={`sn-nav-link ${isActive(item.path) ? "active" : ""}`}
              onClick={() => navigate(item.path)}
            >
              <span className="sn-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}

          {/* Cart with badge */}
          <button
            className={`sn-nav-link ${location.pathname === "/cart" ? "active" : ""}`}
            onClick={() => navigate("/cart")}
          >
            <span className="sn-nav-icon" style={{ position: "relative" }}>
              <FiShoppingCart size={18} />
              {cartCount > 0 && (
                <span style={{
                  position: "absolute", top: -6, right: -8,
                  minWidth: 15, height: 15,
                  background: "#FF6B00", color: "white",
                  borderRadius: 8, fontSize: 9, fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "0 3px",
                }}>
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              )}
            </span>
            <span>Cart</span>
          </button>
        </nav>

        {/* Browse categories */}
        <div className="sn-section-label">Browse</div>
        <div className="sn-cats">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`sn-cat-link ${location.pathname === `/category/${cat.id}` ? "active" : ""}`}
              onClick={() => navigate(`/category/${cat.id}`)}
            >
              <span className="sn-cat-icon">{cat.icon}</span>
              <span>{cat.label}</span>
              <FiChevronRight size={11} className="sn-cat-arrow" />
            </button>
          ))}
        </div>

        {/* User section */}
        <div className="sn-user">
          {user ? (
            <>
              <div className="sn-avatar">
                {user.photoURL
                  ? <img src={user.photoURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                  : <span style={{ fontSize: 15, fontWeight: 900, color: "white" }}>{userName.charAt(0).toUpperCase()}</span>
                }
              </div>
              <div className="sn-user-info">
                <div className="sn-user-name">{userName}</div>
                <div className="sn-user-email">{user.email?.slice(0, 22)}</div>
              </div>
              <button className="sn-logout" onClick={handleSignOut} title="Sign out">
                <FiLogOut size={14} />
              </button>
            </>
          ) : (
            <button className="sn-signin-btn" onClick={() => navigate("/login")}>Sign In</button>
          )}
        </div>
      </aside>

      <style>{CSS}</style>
    </>
  );
}

const CSS = `
.sn-sidebar { display: none; }

@media (min-width: 768px) {
  .sn-sidebar {
    display: flex; flex-direction: column;
    width: 240px; position: fixed; top: 0; left: 0;
    height: 100vh;
    background: var(--surface, #111115);
    border-right: 1px solid var(--border, #1e1e26);
    padding: 20px 14px; overflow-y: auto; z-index: 200;
    gap: 2px; scrollbar-width: none;
    transition: background .3s, border-color .3s;
  }
  .sn-sidebar::-webkit-scrollbar { display: none; }
}

.sn-logo {
  display: flex; align-items: center; gap: 9px;
  padding: 0 4px 18px; cursor: pointer;
  border-bottom: 1px solid var(--border, #1e1e26);
  margin-bottom: 10px; flex-shrink: 0;
}

.sn-logo-text {
  font-family: 'Syne', sans-serif;
  font-size: 20px; font-weight: 800;
  color: var(--text, #e8e8f0);
  display: flex; align-items: flex-end; line-height: 1;
}
.sn-logo-9 {
  color: #FF6B00; font-style: italic;
  font-size: 26px; line-height: .85;
  display: inline-block; margin-right: 2px;
}
.sn-logo-ja {
  color: var(--text, #e8e8f0);
  font-style: normal; font-size: 20px;
  font-family: 'Nunito', sans-serif; font-weight: 900;
  line-height: 1; display: inline-block;
  vertical-align: bottom; margin-bottom: 1px;
}

.sn-nav { display: flex; flex-direction: column; gap: 2px; margin-bottom: 14px; flex-shrink: 0; }
.sn-nav-link {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 12px;
  background: transparent; border: none;
  color: var(--text2, #8888a0);
  font-family: 'Nunito', sans-serif; font-size: 14px; font-weight: 700;
  cursor: pointer; transition: background .15s, color .15s;
  text-align: left; width: 100%;
}
.sn-nav-link:hover  { background: rgba(255,107,0,.07); color: var(--text, #e8e8f0); }
.sn-nav-link.active { background: rgba(255,107,0,.12); color: #FF6B00; }
.sn-nav-icon { display: flex; align-items: center; color: inherit; }

.sn-section-label {
  font-size: 10px; font-weight: 800; color: var(--text3, #44445a);
  text-transform: uppercase; letter-spacing: .9px;
  padding: 4px 4px 3px; margin-top: 4px; flex-shrink: 0;
}

.sn-cats { display: flex; flex-direction: column; gap: 1px; flex: 1; overflow-y: auto; scrollbar-width: none; }
.sn-cats::-webkit-scrollbar { display: none; }
.sn-cat-link {
  display: flex; align-items: center; gap: 9px;
  padding: 7px 10px; border-radius: 10px;
  background: transparent; border: none;
  color: var(--text2, #8888a0);
  font-family: 'Nunito', sans-serif; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: background .15s, color .15s;
  width: 100%; text-align: left;
}
.sn-cat-link:hover  { background: rgba(255,107,0,.06); color: var(--text, #e8e8f0); }
.sn-cat-link.active { background: rgba(255,107,0,.1);  color: #FF6B00; }
.sn-cat-icon  { color: #FF6B00; display: flex; align-items: center; }
.sn-cat-arrow { margin-left: auto; color: var(--text3, #44445a); }

.sn-user {
  margin-top: auto; padding-top: 14px;
  border-top: 1px solid var(--border, #1e1e26);
  display: flex; align-items: center; gap: 10px; flex-shrink: 0;
}
.sn-avatar {
  width: 34px; height: 34px; border-radius: 50%;
  background: linear-gradient(135deg, #FF6B00, #FF8C00);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; overflow: hidden;
}
.sn-user-info { flex: 1; min-width: 0; }
.sn-user-name  { font-size: 13px; font-weight: 800; color: var(--text, #e8e8f0); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sn-user-email { font-size: 11px; font-weight: 600; color: var(--text3, #44445a); }
.sn-logout {
  width: 30px; height: 30px; border-radius: 8px;
  background: transparent; border: 1.5px solid rgba(239,68,68,.2);
  color: #ef4444; display: flex; align-items: center; justify-content: center;
  cursor: pointer; flex-shrink: 0; transition: background .2s;
}
.sn-logout:hover { background: rgba(239,68,68,.1); }
.sn-signin-btn {
  width: 100%; padding: 10px;
  background: linear-gradient(135deg, #FF6B00, #FF8C00);
  border: none; border-radius: 12px;
  color: white; font-family: 'Nunito', sans-serif; font-size: 13px; font-weight: 800;
  cursor: pointer; transition: opacity .15s;
}
.sn-signin-btn:hover { opacity: .88; }

[data-theme="light"] .sn-sidebar     { background: #ffffff; border-right-color: #e0e0e8; }
[data-theme="light"] .sn-logo        { border-bottom-color: #e0e0e8; }
[data-theme="light"] .sn-logo-text   { color: #111118; }
[data-theme="light"] .sn-logo-ja     { color: #111118; }
[data-theme="light"] .sn-nav-link    { color: #555570; }
[data-theme="light"] .sn-nav-link:hover { color: #111118; }
[data-theme="light"] .sn-cat-link    { color: #666680; }
[data-theme="light"] .sn-cat-link:hover { color: #111118; }
[data-theme="light"] .sn-section-label { color: #aaaabc; }
[data-theme="light"] .sn-user        { border-top-color: #e0e0e8; }
[data-theme="light"] .sn-user-name   { color: #111118; }
[data-theme="light"] .sn-user-email  { color: #aaaabc; }
`;