import { useTheme } from "../context/ThemeContext";
import { RiHomeLine, RiHomeFill, RiWalletLine, RiWallet3Fill, RiHistoryLine, RiUserLine, RiUserFill } from "react-icons/ri";

const O = "#FF6B00";

type Props = {
  activeTab: number;
  onTabChange: (index: number) => void;
};

const TABS = [
  { label: "Home",     icon: <RiHomeLine size={22} />,    activeIcon: <RiHomeFill size={22} /> },
  { label: "Earnings", icon: <RiWalletLine size={22} />,  activeIcon: <RiWallet3Fill size={22} /> },
  { label: "History",  icon: <RiHistoryLine size={22} />, activeIcon: <RiHistoryLine size={22} /> },
  { label: "Profile",  icon: <RiUserLine size={22} />,    activeIcon: <RiUserFill size={22} /> },
];

export default function BottomNav({ activeTab, onTabChange }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const navBg      = isDark ? "rgba(10,10,14,0.97)"      : "rgba(245,245,240,0.97)";
  const border     = isDark ? "rgba(255,255,255,0.08)"   : "rgba(0,0,0,0.08)";
  const inactive   = isDark ? "rgba(255,255,255,0.28)"   : "rgba(0,0,0,0.3)";

  return (
    <nav style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: 480, zIndex: 99,
      background: navBg,
      backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
      borderTop: `1px solid ${border}`,
      paddingBottom: "env(safe-area-inset-bottom)",
      transition: "background 0.3s, border-color 0.3s",
    }}>
      <div style={{ display: "flex" }}>
        {TABS.map((t, i) => {
          const isActive = activeTab === i;
          return (
            <button key={t.label} onClick={() => onTabChange(i)} style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 4,
              padding: "12px 8px 10px",
              background: "none", border: "none",
              cursor: "pointer",
              color: isActive ? O : inactive,
              transition: "color 0.2s",
              WebkitTapHighlightColor: "transparent",
              fontFamily: "'DM Sans',sans-serif",
              fontSize: 10, fontWeight: 700,
              position: "relative",
            }}>
              {isActive && (
                <div style={{
                  position: "absolute", top: 6, left: "50%",
                  transform: "translateX(-50%)",
                  width: 4, height: 4, borderRadius: "50%", background: O,
                }} />
              )}
              {isActive ? t.activeIcon : t.icon}
              <span style={{ letterSpacing: 0.3 }}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}