// pages/AnalyticsPage.tsx
import { FiDollarSign, FiShoppingBag, FiTrendingUp, FiPackage } from "react-icons/fi";
import { StatCard, BarChart, DonutChart } from "../components/SharedComponents";
import type { Product, Order } from "../types";

type Props = { products: Product[]; orders: Order[]; loading: boolean; };

export default function AnalyticsPage({ products, orders, loading }: Props) {
  const totalRevenue    = orders.filter(o => o.status === "delivered").reduce((s, o) => s + o.amount, 0);
  const deliveredOrders = orders.filter(o => o.status === "delivered").length;
  const cancelledOrders = orders.filter(o => o.status === "cancelled").length;
  const activeProducts  = products.filter(p => p.status === "active").length;
  const lowStock        = products.filter(p => p.stock > 0 && p.stock <= 5).length;
  const outOfStock      = products.filter(p => p.stock === 0).length;

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const label = d.toLocaleDateString("en", { weekday: "short" });
    const dayOrders = orders.filter(o => {
      if (!o.createdAt?.seconds) return false;
      return new Date(o.createdAt.seconds * 1000).toDateString() === d.toDateString();
    });
    return { label, value: dayOrders.length, revenue: dayOrders.reduce((s, o) => s + o.amount, 0) };
  });

  const statusBreakdown = [
    { label: "Delivered",  value: deliveredOrders, color: "#10B981" },
    { label: "Processing", value: orders.filter(o => o.status === "processing").length, color: "#F59E0B" },
    { label: "Shipped",    value: orders.filter(o => o.status === "shipped").length,    color: "#3B82F6" },
    { label: "Cancelled",  value: cancelledOrders, color: "#EF4444" },
  ];

  const topProducts = [...products].sort((a, b) => b.sales - a.sales).slice(0, 5);

  return (
    <div className="vd-page vd-fade-up">
      <div className="vd-page-header">
        <div>
          <h1 className="vd-page-title">Analytics</h1>
          <p className="vd-page-sub">Real-time business insights</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", padding: "6px 12px", borderRadius: 10 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", animation: "pulse 2s infinite" }} />
          <span style={{ fontSize: 11, color: "#10B981", fontWeight: 700 }}>Live</span>
        </div>
      </div>

      {loading ? <div className="vd-loading">Loading analytics…</div> : (
        <>
          <div className="vd-stats-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
            <StatCard icon={<FiDollarSign size={20} />} label="Total Revenue" value={`₦${totalRevenue.toLocaleString()}`} sub={`${deliveredOrders} delivered`} color="#10B981" />
            <StatCard icon={<FiShoppingBag size={20} />} label="Total Orders" value={orders.length} sub={`${cancelledOrders} cancelled`} color="#3B82F6" />
            <StatCard icon={<FiTrendingUp size={20} />} label="Completion Rate"
              value={orders.length > 0 ? `${Math.round((deliveredOrders / orders.length) * 100)}%` : "0%"}
              sub="Delivered / total" color="#8B5CF6" />
            <StatCard icon={<FiPackage size={20} />} label="Stock Health"
              value={`${activeProducts} active`} sub={`${lowStock} low · ${outOfStock} empty`}
              color={outOfStock > 0 ? "#EF4444" : "#F59E0B"} />
          </div>

          <div className="vd-card">
            <div className="vd-card-header">
              <span className="vd-card-title">Orders — Last 7 Days</span>
              <span style={{ fontSize: 12, color: "var(--text3)" }}>{last7Days.reduce((s, d) => s + d.value, 0)} total</span>
            </div>
            {last7Days.every(d => d.value === 0) ? <div className="vd-empty">No orders in the last 7 days</div> : <BarChart data={last7Days} color="#FF6B00" />}
          </div>

          <div className="vd-card">
            <div className="vd-card-header">
              <span className="vd-card-title">Revenue — Last 7 Days</span>
              <span style={{ fontSize: 12, color: "#10B981", fontWeight: 700 }}>₦{last7Days.reduce((s, d) => s + d.revenue, 0).toLocaleString()}</span>
            </div>
            {last7Days.every(d => d.revenue === 0) ? <div className="vd-empty">No revenue data yet</div> : <BarChart data={last7Days.map(d => ({ label: d.label, value: d.revenue }))} color="#10B981" />}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="vd-card">
              <div className="vd-card-header"><span className="vd-card-title">Order Status</span></div>
              {orders.length === 0 ? <div className="vd-empty">No orders yet</div> : <DonutChart segments={statusBreakdown} />}
            </div>
            <div className="vd-card">
              <div className="vd-card-header"><span className="vd-card-title">Top Products</span></div>
              {topProducts.length === 0 ? <div className="vd-empty">No products yet</div> : topProducts.map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: i < topProducts.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#FF6B00", minWidth: 18 }}>#{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>{p.sales} sold</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#FF6B00" }}>₦{p.price.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stock overview */}
          <div className="vd-card" style={{ marginTop: 16 }}>
            <div className="vd-card-header"><span className="vd-card-title">Stock Overview</span></div>
            {products.length === 0 ? <div className="vd-empty">No products yet</div> : products.map(p => {
              const pct = Math.min((p.stock / Math.max(...products.map(x => x.stock), 1)) * 100, 100);
              const color = p.stock === 0 ? "#EF4444" : p.stock <= 5 ? "#F59E0B" : "#10B981";
              return (
                <div key={p.id} style={{ marginBottom: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{p.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color }}>{p.stock} units</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.5s" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}