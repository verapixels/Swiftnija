import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { useNavigate } from "react-router-dom";
import { RiFlashlightLine, RiEyeLine, RiEyeOffLine } from "react-icons/ri";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const snap = await getDoc(doc(db, "admins", cred.user.uid));

      if (!snap.exists()) {
        await auth.signOut();
        setError("Access denied. This account is not an admin.");
        setLoading(false);
        return;
      }

      const data = snap.data();
      const role = data?.role;

      if (role === "superadmin") {
        navigate("/superadmin"); // → old AdminDashboard (full super admin)
      } else if (role === "admin") {
        navigate("/admin"); // → SwiftAdminDashboard (regular admin)
      } else {
        // No role set — deny access
        await auth.signOut();
        setError("Access denied. No role assigned to this account.");
        setLoading(false);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      const msgs: Record<string, string> = {
        "auth/user-not-found":     "No account found with this email.",
        "auth/wrong-password":     "Incorrect password.",
        "auth/invalid-email":      "Invalid email format.",
        "auth/too-many-requests":  "Too many attempts. Try again later.",
        "auth/invalid-credential": "Invalid email or password.",
      };
      setError(msgs[code] || "Login failed. Check your credentials.");
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080810",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Nunito', sans-serif",
        padding: 20,
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: "linear-gradient(135deg,#FF6B00,#FF8C00)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              boxShadow: "0 8px 28px rgba(255,107,0,0.4)",
            }}
          >
            <RiFlashlightLine size={24} color="white" />
          </div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 900, color: "white" }}>
            swift<span style={{ color: "#FF6B00" }}>nija</span>
          </div>
          <div style={{ color: "#555", fontSize: 13, marginTop: 4 }}>Admin Portal</div>
        </div>

        {/* Card */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 24,
            padding: 32,
          }}
        >
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 900, color: "white", marginBottom: 6 }}>
            Sign in
          </h2>
          <p style={{ color: "#555", fontSize: 14, marginBottom: 24 }}>
            Restricted access — authorised personnel only.
          </p>

          {error && (
            <div
              style={{
                padding: "12px 16px",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: 12,
                color: "#EF4444",
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 20,
              }}
            >
              ⚠ {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  color: "#555",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@swiftnija.com"
                style={{
                  width: "100%",
                  padding: "13px 16px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1.5px solid rgba(255,255,255,0.07)",
                  borderRadius: 14,
                  color: "white",
                  fontSize: 14,
                  fontFamily: "'Nunito', sans-serif",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label
                style={{
                  display: "block",
                  color: "#555",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  style={{
                    width: "100%",
                    padding: "13px 44px 13px 16px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1.5px solid rgba(255,255,255,0.07)",
                    borderRadius: 14,
                    color: "white",
                    fontSize: 14,
                    fontFamily: "'Nunito', sans-serif",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{
                    position: "absolute",
                    right: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#555",
                    display: "flex",
                  }}
                >
                  {showPw ? <RiEyeOffLine size={18} /> : <RiEyeLine size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 14,
                background: loading
                  ? "rgba(255,107,0,0.5)"
                  : "linear-gradient(135deg,#FF6B00,#FF8C00)",
                border: "none",
                color: "white",
                fontWeight: 800,
                fontSize: 15,
                cursor: loading ? "default" : "pointer",
                fontFamily: "'Nunito', sans-serif",
                boxShadow: "0 6px 20px rgba(255,107,0,0.3)",
              }}
            >
              {loading ? "Signing in…" : "Sign In to Dashboard"}
            </button>
          </form>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Syne:wght@900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        input:focus { border-color: #FF6B00 !important; box-shadow: 0 0 0 3px rgba(255,107,0,0.1) !important; }
      `}</style>
    </div>
  );
}