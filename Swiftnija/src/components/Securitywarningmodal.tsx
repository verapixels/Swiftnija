// components/SecurityWarningModal.tsx
// Shown when an attack/injection attempt is detected in any input.
// Displayed over the entire screen. Tells the user to stop.
// All info is already logged to Firestore by secureInput().

import { useEffect } from "react";

interface Props {
  onDismiss: () => void;
}

export default function SecurityWarningModal({ onDismiss }: Props) {
  // Prevent background scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {/* Warning icon */}
        <div style={styles.iconWrap}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L2 21h20L12 2z"
              fill="rgba(239,68,68,.15)"
              stroke="#ef4444"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <line x1="12" y1="9" x2="12" y2="14" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="12" cy="17.5" r="1" fill="#ef4444"/>
          </svg>
        </div>

        <h2 style={styles.title}>⚠️ Security Warning</h2>

        <p style={styles.body}>
          We detected a potentially malicious input in this session.
          This activity has been <strong style={{ color: "#ef4444" }}>logged and reported</strong> to our security team.
        </p>

        <p style={styles.body2}>
          Continued attempts may result in your account being <strong>permanently suspended</strong>.
          If this was a mistake, please contact support.
        </p>

        <div style={styles.tagsRow}>
          <span style={styles.tag}>🔒 Activity Logged</span>
          <span style={styles.tag}>👁 Account Flagged</span>
        </div>

        <button style={styles.btn} onClick={onDismiss}>
          I Understand — Go Back
        </button>

        <p style={styles.footer}>SwiftNija Security System v1.0</p>
      </div>

      <style>{`
        @keyframes warn-pop {
          from { opacity:0; transform:scale(.85) translateY(30px); }
          to   { opacity:1; transform:scale(1) translateY(0); }
        }
        @keyframes pulse-red {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,.4); }
          50%      { box-shadow: 0 0 0 16px rgba(239,68,68,0); }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.88)",
    backdropFilter: "blur(12px)",
    zIndex: 99999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
  },
  card: {
    background: "#111115",
    border: "2px solid rgba(239,68,68,.4)",
    borderRadius: "24px",
    padding: "36px 28px",
    maxWidth: 420,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "16px",
    animation: "warn-pop .4s cubic-bezier(.34,1.56,.64,1)",
    boxShadow: "0 0 60px rgba(239,68,68,.2), 0 24px 60px rgba(0,0,0,.6)",
  },
  iconWrap: {
    animation: "pulse-red 2s ease-in-out infinite",
    borderRadius: "50%",
    padding: "4px",
  },
  title: {
    fontFamily: "'Syne', sans-serif",
    fontSize: "22px",
    fontWeight: 800,
    color: "#ef4444",
    textAlign: "center",
  },
  body: {
    fontSize: "14px",
    color: "#c8c8d8",
    fontFamily: "'Nunito', sans-serif",
    fontWeight: 600,
    lineHeight: 1.6,
    textAlign: "center",
  },
  body2: {
    fontSize: "13px",
    color: "#8888a0",
    fontFamily: "'Nunito', sans-serif",
    fontWeight: 600,
    lineHeight: 1.6,
    textAlign: "center",
  },
  tagsRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap" as const,
    justifyContent: "center",
  },
  tag: {
    background: "rgba(239,68,68,.1)",
    border: "1px solid rgba(239,68,68,.3)",
    borderRadius: "20px",
    padding: "5px 14px",
    fontSize: "12px",
    color: "#ef4444",
    fontWeight: 700,
    fontFamily: "'Nunito', sans-serif",
  },
  btn: {
    marginTop: "8px",
    width: "100%",
    padding: "14px",
    background: "linear-gradient(135deg, #ef4444, #dc2626)",
    border: "none",
    borderRadius: "14px",
    color: "white",
    fontFamily: "'Nunito', sans-serif",
    fontSize: "15px",
    fontWeight: 800,
    cursor: "pointer",
  },
  footer: {
    fontSize: "11px",
    color: "#44445a",
    fontFamily: "monospace",
  },
};