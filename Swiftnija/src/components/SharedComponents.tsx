// components/SharedComponents.tsx
import type { ReactNode } from "react";
import { FiArrowUp, FiArrowDown } from "react-icons/fi";
import { STATUS_CONFIG, type StatusKey } from "../types";

// ── Status Badge ──────────────────────────────────────────────
export function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status as StatusKey] ?? { label: status, color: "#888", bg: "rgba(136,136,136,0.1)" };
  return (
    <span style={{
      background: c.bg, color: c.color,
      padding: "3px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
    }}>{c.label}</span>
  );
}

// ── Stat Card ─────────────────────────────────────────────────
type StatCardProps = {
  icon: ReactNode; label: string; value: string | number;
  sub?: string; trend?: number; color?: string;
};
export function StatCard({ icon, label, value, sub, trend, color = "#FF6B00" }: StatCardProps) {
  return (
    <div className="vd-stat-card">
      <div className="vd-stat-top">
        <div className="vd-stat-icon" style={{ background: `${color}1a`, color }}>{icon}</div>
        {trend !== undefined && (
          <div className="vd-stat-trend" style={{ color: trend >= 0 ? "#10B981" : "#EF4444" }}>
            {trend >= 0 ? <FiArrowUp size={12} /> : <FiArrowDown size={12} />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div className="vd-stat-value">{value}</div>
      <div className="vd-stat-label">{label}</div>
      {sub && <div className="vd-stat-sub">{sub}</div>}
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────
export function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} className={`vd-toggle ${on ? "on" : ""}`}>
      <div className="vd-toggle-knob" />
    </div>
  );
}

// ── Bar Chart ─────────────────────────────────────────────────
export function BarChart({ data, color = "#FF6B00" }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="vd-bar-chart">
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
          <div style={{
            width: "100%",
            height: `${(d.value / max) * 90}px`,
            minHeight: 4,
            background: d.value === 0 ? "var(--border)" : color,
            borderRadius: "5px 5px 0 0",
            transition: "height 0.5s ease",
            opacity: d.value === 0 ? 0.3 : 1,
          }} />
          <span style={{ fontSize: 9, color: "var(--text3)", fontWeight: 600 }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Donut Chart ───────────────────────────────────────────────
export function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let cumulative = 0;
  const r = 40, cx = 50, cy = 50, circumference = 2 * Math.PI * r;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <svg width="100" height="100" viewBox="0 0 100 100">
        {segments.map((seg, i) => {
          const pct = seg.value / total;
          const offset = circumference * (1 - cumulative - pct);
          const dash = circumference * pct;
          const el = (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color}
              strokeWidth="18" strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={offset} style={{ transition: "stroke-dasharray 0.5s" }}
              transform={`rotate(-90 ${cx} ${cy})`} />
          );
          cumulative += pct;
          return el;
        })}
        {total === 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth="18" />}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "var(--text2)" }}>{seg.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginLeft: "auto" }}>
              {total > 0 ? Math.round((seg.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────
export function Spinner({ size = 18, color = "white" }: { size?: number; color?: string }) {
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid ${color === "white" ? "rgba(255,255,255,0.3)" : "rgba(255,107,0,0.2)"}`,
      borderTopColor: color, borderRadius: "50%",
      animation: "spin 0.7s linear infinite", flexShrink: 0,
    }} />
  );
}

// ── Alert ─────────────────────────────────────────────────────
export function Alert({ type, children }: { type: "error"|"success"|"warning"|"info"; children: ReactNode }) {
  const icons = { error: "⚠", success: "✓", warning: "⚡", info: "ℹ" };
  return (
    <div className={`vd-alert ${type}`}>
      <span>{icons[type]}</span>
      <span>{children}</span>
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────
export function Divider({ label }: { label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      {label && <span style={{ color: "var(--text3)", fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>{label}</span>}
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}