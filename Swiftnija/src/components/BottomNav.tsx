import { useTheme } from "../context/ThemeContext";
import {
  RiHomeLine, RiHomeFill,
  RiWalletLine, RiWallet3Fill,
  RiHistoryLine, RiTimeFill,
  RiUserLine, RiUserFill,
} from "react-icons/ri";

const O = "#FF6B00";

type Props = {
  activeTab: number;
  onTabChange: (index: number) => void;
};

const TABS = [
  { label: "Home",     icon: RiHomeLine,    activeIcon: RiHomeFill    },
  { label: "Earnings", icon: RiWalletLine,  activeIcon: RiWallet3Fill },
  { label: "History",  icon: RiHistoryLine, activeIcon: RiTimeFill    },
  { label: "Profile",  icon: RiUserLine,    activeIcon: RiUserFill    },
];

export default function BottomNav({ activeTab, onTabChange }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const navBg    = isDark ? "rgba(9,9,15,0.98)"        : "rgba(250,250,252,0.98)";
  const border   = isDark ? "rgba(255,255,255,0.07)"   : "rgba(0,0,0,0.08)";
  const inactive = isDark ? "rgba(255,255,255,0.25)"   : "rgba(0,0,0,0.28)";

  return (
    <>
      <style>{`
        .bnav-btn {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 11px 8px 10px;
          background: none;
          border: none;
          cursor: pointer;
          transition: color 0.18s;
          -webkit-tap-highlight-color: transparent;
          font-family: 'DM Sans', sans-serif;
          font-size: 10px;
          font-weight: 700;
          position: relative;
          letter-spacing: 0.3px;
          touch-action: manipulation;
        }
        .bnav-btn:active { opacity: 0.75; }
        .bnav-pip {
          position: absolute;
          top: 5px;
          left: 50%;
          transform: translateX(-50%);
          width: 20px;
          height: 3px;
          border-radius: 2px;
          background: ${O};
        }
        .bnav-icon-wrap {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>

      <nav style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: 480,
        zIndex: 99,
        background: navBg,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: `1px solid ${border}`,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        transition: "background 0.3s, border-color 0.3s",
      }}>
        <div style={{ display: "flex" }}>
          {TABS.map((t, i) => {
            const isActive = activeTab === i;
            const Icon = isActive ? t.activeIcon : t.icon;
            return (
              <button
                key={t.label}
                className="bnav-btn"
                onClick={() => onTabChange(i)}
                style={{ color: isActive ? O : inactive }}
              >
                {isActive && <div className="bnav-pip" />}
                <div className="bnav-icon-wrap">
                  <Icon size={22} />
                </div>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}