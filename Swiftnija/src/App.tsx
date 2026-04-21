// App.tsx
import { Routes, Route, Outlet, useParams, useNavigate, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./context/AuthContext";
import ScrollToTop from "./components/Scrolltotop";
import Homepage from "./components/Homepage";
import CustomerOrdersPage from "./Pages/CustomerOrdersPage";
import SearchPage from "./Pages/SearchPage";
import NavTabs from "./components/NavTabs";
import VendorDashboard from "./components/VendorDashboard.";
import VendorAccount from "./components/VendorAccount";
import VendorLogin from "./components/Vendorlogin ";
import UserSignup from "./components/UserSignup";
import UserLogin from "./components/UserLogin";
import UserProfile from "./Pages/Userprofile";
import VerifyAccount from "./Pages/VerifyAccount";
import AdminDashboard from "./components/Admindashboard";
import SwiftAdminDashboard from "./components/Swiftadmindashboard";
import AdminLogin from "./Pages/Adminlogin";
import AddressMap from "./components/Addressmap";
import TrackDeliveryMap from "./components/Trackdeliverymap";
import AppSidebar from "./components/AppSidebar";
import VendorListPage from "./Pages/Vendorlistpage";
import VendorDetailPage from "./Pages/Vendordetailpage";
import SendPickup from "./Pages/Sendpickup";
import OrderTrackingPage from "./Pages/Ordertrackingpage";
import VendorBlueBadge from "./Pages/Vendorbluebadge";
import AdminSignupPage from "./Pages/Adminsignuppage";
import SupportPage from "./Pages/Supportpage";
import RiderDashboard from "./Pages/RiderDashboard";
import RiderLogin from "./Pages/RidersLoginPage";
import RiderSignup from "./Pages/RidersSignupPage";
import RiderProfile from "./Pages/Riderprofile";
import LandingPage from "./Pages/Landingpage";
import   ResetPassword from "./Pages/ResetPassword";
import { VendorCartPage } from "./Pages/CustomerOrdersPage";
import UserOrderHistory from "./Pages/Userorderhistory";
import AdminEntityDetailPage from "./Pages/Adminentitydetailpage";


function OrderTrackingWrapper() {
  const navigate = useNavigate();
  return <OrderTrackingPage onClose={() => navigate(-1)} />;
}

function RiderPublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [check, setCheck] = useState<{ isRider: boolean; status: string } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { setCheck({ isRider: false, status: "" }); return; }
    getDoc(doc(db, "riders", user.uid)).then((snap) => {
      if (!snap.exists()) { setCheck({ isRider: false, status: "" }); return; }
      setCheck({ isRider: true, status: snap.data().status ?? "under_review" });
    });
  }, [user, loading]);

  if (loading || check === null) return null;
  if (check.isRider && check.status === "active") return <Navigate to="/rider" replace />;
  return <>{children}</>;
}

function RiderProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [hasDoc, setHasDoc] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { setHasDoc(false); return; }
    getDoc(doc(db, "riders", user.uid)).then((snap) => setHasDoc(snap.exists()));
  }, [user, loading]);

  if (loading || hasDoc === null) return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "#0a0a0e",
      color: "#f97316", fontSize: 18, fontWeight: 700,
      fontFamily: "Space Grotesk, sans-serif",
    }}>SwiftNija…</div>
  );

  return hasDoc ? <>{children}</> : <Navigate to="/rider/login" replace />;
}

function MobileLayout() {
  return (
    <>
      <AppSidebar />
      <div className="mobile-layout-shell">
        <div className="mobile-layout-content">
          <Outlet />
        </div>
        <NavTabs />
      </div>
      <style>{`
        .mobile-layout-shell {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          background: var(--bg, #0a0a0d);
        }
        .mobile-layout-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding-bottom: 80px;
        }
        @media (min-width: 768px) {
          .mobile-layout-shell { margin-left: 240px; }
          .mobile-layout-content { padding-bottom: 0; }
        }
      `}</style>
    </>
  );
}

function FullscreenLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="fullscreen-shell">{children}</div>
      <style>{`
        .fullscreen-shell {
          width: 100vw; height: 100vh;
          display: flex; flex-direction: column;
          overflow: hidden; background: var(--bg, #0a0a0d);
        }
      `}</style>
    </>
  );
}

// ─── Auth gate — renders a spinner until Firebase resolves the session ────────
function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();

  if (loading) return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0d",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
    }}>
      <div style={{
        width: 38, height: 38,
        border: "3px solid rgba(255,107,0,.18)",
        borderTopColor: "#FF6B00",
        borderRadius: "50%",
        animation: "sn-spin .75s linear infinite",
      }} />
      <span style={{
        fontFamily: "'Nunito', sans-serif",
        fontWeight: 800,
        fontSize: 13,
        color: "#FF6B00",
        letterSpacing: ".5px",
      }}>
        swiftnija
      </span>
      <style>{`@keyframes sn-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return <>{children}</>;
}

// ─────────────────────────────────────────
// APP
// ─────────────────────────────────────────
export default function App() {
  return (
    // AuthGate sits inside AuthProvider (via main.tsx) so useAuth() works here.
    // Nothing renders until onAuthStateChanged fires — kills the guest flash on refresh.
    <AuthGate>
      <ScrollToTop />
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
         <Route path="/" element={<LandingPage />} />
        {/* ── Vendor routes ── */}
        <Route path="/vendor/login"    element={<VendorLogin />} />
        <Route path="/vendor/register" element={<VendorAccount />} />
        <Route path="/vendor"          element={<VendorDashboard />} />

        {/* ── Admin routes ── */}
        <Route path="/admin/login"  element={<AdminLogin />} />
        <Route path="/admin-signup" element={<AdminSignupPage />} />
        <Route path="/admin"        element={<SwiftAdminDashboard />} />
        <Route path="/superadmin"   element={<AdminDashboard />} />

<Route path="/admin/user/:id"   element={<AdminEntityDetailPage entityType="user"   />} />
<Route path="/admin/vendor/:id" element={<AdminEntityDetailPage entityType="vendor" />} />
<Route path="/admin/rider/:id"  element={<AdminEntityDetailPage entityType="rider"  />} />

        {/* ── Auth routes ── */}
        <Route path="/signup" element={<UserSignup />} />
        <Route path="/login"  element={<UserLogin />} />
        <Route path="/verify" element={<VerifyAccount />} />

        {/* ── Rider routes ── */}

        <Route path="/rider/login"   element={<RiderPublicRoute><RiderLogin /></RiderPublicRoute>} />
        <Route path="/rider/signup"  element={<RiderPublicRoute><RiderSignup /></RiderPublicRoute>} />
        <Route path="/rider"         element={<RiderProtectedRoute><RiderDashboard /></RiderProtectedRoute>} />
        <Route path="/rider/profile" element={<RiderProfile />} />

        {/* ── Map routes ── */}
        <Route path="/address-map" element={
          <FullscreenLayout>
            <AddressMap
              savedAddresses={[]} defaultAddressId=""
              onConfirm={(loc) => { console.log("Address confirmed:", loc); window.history.back(); }}
              onClose={() => window.history.back()}
            />
          </FullscreenLayout>
        } />
        <Route path="/track/:orderId" element={
          <FullscreenLayout>
            <TrackDeliveryMap
              orderId="test-order-001"
              storeLat={6.5833} storeLng={3.3667} storeName="Mama T's Spices"
              destLat={6.4281} destLng={3.4219}
              destAddress="14 Adeola Odeku St, Victoria Island"
              onClose={() => window.history.back()}
            />
          </FullscreenLayout>
        } />

        {/* ── User routes ── */}
        <Route element={<MobileLayout />}>
         
          <Route path="/home" element={<Homepage />} />
          <Route path="/orders"                  element={<CustomerOrdersPage />} />
          <Route path="/orders/cart/:vendorId" element={<VendorCartPage />} />
          <Route path="/search"                  element={<SearchPage />} />
          <Route path="/support"                 element={<SupportPage />} />
          <Route path="/profile"                 element={<UserProfile />} />
          <Route path="/cart"                    element={<CustomerOrdersPage />} />
          <Route path="/orders/history" element={<UserOrderHistory />} />
          <Route path="/send-pickup"             element={<SendPickup />} />
          <Route path="/category/:categoryId"    element={<VendorListPage />} />
          <Route path="/store/:vendorId"         element={<VendorDetailPage />} />
          <Route path="/orders/:orderId/track"   element={<OrderTrackingWrapper />} />
          <Route path="*" element={
            <div style={{
              color: "var(--text, white)", padding: "80px 24px",
              textAlign: "center", fontFamily: "'Nunito', sans-serif",
              fontWeight: 700, fontSize: 16,
            }}>
              404 — Page Not Found
            </div>
          } />
        </Route>

      </Routes>
    </AuthGate>
  );
}