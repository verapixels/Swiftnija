// pages/OverviewPage.tsx
import { FiDollarSign, FiShoppingBag, FiPackage, FiStar, FiMapPin } from "react-icons/fi";
import { RiBankLine } from "react-icons/ri";
import { MdVerified } from "react-icons/md";
import { FiBarChart2, FiPlus } from "react-icons/fi";
import { StatCard, StatusBadge } from "../components/SharedComponents";
import type { VendorProfile, Product, Order } from "../types";

type Props = {
  vendor: VendorProfile;
  products: Product[];
  orders: Order[];
  loading: boolean;
  setActiveTab: (t: string) => void;
  setShowAddProduct: (v: boolean) => void;
};

export default function OverviewPage({ vendor, products, orders, loading, setActiveTab, setShowAddProduct }: Props) {
  const totalRevenue = orders.filter(o => o.status === "delivered").reduce((s, o) => s + o.amount, 0);
  const activeProducts = products.filter(p => p.status === "active").length;
  const pendingOrders = orders.filter(o => o.status === "processing").length;

  return (
    <div className="vd-page vd-fade-up">
      <div className="vd-page-header">
        <div>
          <div className="vd-greeting">Good day, {vendor.owner.split(" ")[0]} 👋</div>
          <h1 className="vd-page-title">Business Overview</h1>
        </div>
        {!vendor.verified && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 12, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
            <span style={{ color: "#F59E0B", fontSize: 11, fontWeight: 700 }}>⏳ Pending admin approval</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="vd-loading">Loading your dashboard…</div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="vd-stats-grid">
            <StatCard icon={<FiDollarSign size={20} />} label="Total Revenue" value={`₦${totalRevenue.toLocaleString()}`} sub="Delivered orders" trend={12} />
            <StatCard icon={<FiShoppingBag size={20} />} label="Total Orders" value={orders.length} sub={`${pendingOrders} pending`} trend={8} color="#3B82F6" />
            <StatCard icon={<FiPackage size={20} />} label="Products" value={products.length} sub={`${activeProducts} active`} color="#8B5CF6" />
            <StatCard icon={<FiStar size={20} />} label="Avg. Rating" value="4.8" sub="89 reviews" trend={2} color="#F59E0B" />
          </div>

          {/* Recent orders */}
          <div className="vd-card">
            <div className="vd-card-header">
              <span className="vd-card-title">Recent Orders</span>
              <span className="vd-see-all" onClick={() => setActiveTab("orders")}>See all</span>
            </div>
            {orders.length === 0 ? (
              <div className="vd-empty">No orders yet — they'll appear here once customers start ordering</div>
            ) : (
              orders.slice(0, 4).map((o, i) => (
                <div key={i} className="vd-order-row">
                  <div className="vd-order-avatar">{o.customer[0]}</div>
                  <div className="vd-order-info">
                    <div className="vd-order-name">{o.customer}</div>
                    <div className="vd-order-item">{o.item}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#FF6B00", fontWeight: 800, fontSize: 13 }}>₦{o.amount.toLocaleString()}</div>
                    <StatusBadge status={o.status} />
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Top products */}
          <div className="vd-card">
            <div className="vd-card-header">
              <span className="vd-card-title">Top Products</span>
              <span className="vd-see-all" onClick={() => setActiveTab("products")}>Manage</span>
            </div>
            {products.length === 0 ? (
              <div className="vd-empty">No products yet</div>
            ) : (
              products.slice(0, 3).map((p, i) => (
                <div key={i} className="vd-top-product">
                  <div className="vd-tp-img">
                    <img src={p.img} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "var(--text)", fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                    <div style={{ color: "var(--text3)", fontSize: 12 }}>{p.sales} sales · ₦{p.price.toLocaleString()}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <StatusBadge status={p.status} />
                    <div style={{ color: "#FF6B00", fontSize: 11, fontWeight: 700, marginTop: 4 }}>#{i + 1}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Quick actions */}
          <div className="vd-quick-actions">
            {[
              { label: "Add Product",  bg: "rgba(255,107,0,0.15)",  c: "#FF6B00", icon: <FiPlus size={22} />,        fn: () => setShowAddProduct(true)    },
              { label: "View Orders",  bg: "rgba(59,130,246,0.15)", c: "#3B82F6", icon: <FiShoppingBag size={22} />, fn: () => setActiveTab("orders")     },
              { label: "Bank Details", bg: "rgba(16,185,129,0.15)", c: "#10B981", icon: <RiBankLine size={22} />,    fn: () => setActiveTab("profile")    },
              { label: "Analytics",   bg: "rgba(139,92,246,0.15)", c: "#8B5CF6", icon: <FiBarChart2 size={22} />,   fn: () => setActiveTab("analytics")  },
            ].map((q, i) => (
              <div key={i} className="vd-qa-item" onClick={q.fn}>
                <div className="vd-qa-icon" style={{ background: q.bg, color: q.c }}>{q.icon}</div>
                <div className="vd-qa-label">{q.label}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}