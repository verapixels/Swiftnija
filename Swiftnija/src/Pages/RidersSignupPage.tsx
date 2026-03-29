import { useState, useRef, useEffect } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../firebase";
import { useNavigate, Link } from "react-router-dom";
import {
  RiArrowRightLine, RiArrowLeftLine,
  RiCheckLine, RiAlertLine, RiShieldCheckLine,
  RiMailLine, RiUserLine, RiMapPinLine, RiFileTextLine,
  RiCameraLine, RiUploadCloud2Line, RiCarLine, RiBikeLine,
  RiArrowDownSLine, RiEyeLine, RiEyeOffLine,
  RiSunLine, RiMoonLine,
} from "react-icons/ri";

const O = "#FF6B00";

type Theme = "dark" | "light";

type FormData = {
  country: string; dob: string; phone: string; email: string; password: string;
  firstName: string; lastName: string; city: string;
  selfieUrl: string; selfieFile: File | null;
  idType: string; idNumber: string;
  idFrontUrl: string; idFrontFile: File | null;
  idBackUrl: string; idBackFile: File | null;
  vehicleType: string;
};

const CITIES = ["Lagos","Abuja","Port Harcourt","Ibadan","Kano","Kaduna","Enugu","Onitsha","Benin City","Warri","Owerri","Abeokuta","Ile-Ife","Ilorin","Jos"];
const ID_TYPES = ["National ID (NIN)","Driver's License","International Passport","Voter's Card"];
const VEHICLES = [
  { value:"bike",  label:"Motorcycle", icon:<RiBikeLine size={26}/> },
  { value:"bicycle",label:"Bicycle",  icon:<RiBikeLine size={26}/> },
  { value:"car",   label:"Car",       icon:<RiCarLine size={26}/> },
  { value:"van",   label:"Van",       icon:<RiCarLine size={26}/> },
];
const STEPS = [
  { id:"welcome",title:"Welcome" },     { id:"dob",title:"Date of Birth" },
  { id:"phone",title:"Phone" },         { id:"email",title:"Email & Password" },
  { id:"name",title:"Your Name" },      { id:"city",title:"Your City" },
  { id:"docs_intro",title:"Documents"},  { id:"selfie",title:"Selfie" },
  { id:"id_type",title:"ID Type" },     { id:"id_image",title:"ID Upload" },
  { id:"vehicle",title:"Vehicle" },     { id:"review",title:"Review" },
];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ── Theme tokens ───────────────────────────────────────────────────────────────
const T = {
  dark: {
    bg: "#0a0a0e", bg2: "#0d0d14", leftBg: "linear-gradient(160deg,#0f0f15 0%,#1a1008 60%,#0a0a0e 100%)",
    card: "rgba(255,255,255,0.05)", cardBorder: "rgba(255,255,255,0.09)",
    text: "#ffffff", textSub: "rgba(255,255,255,0.4)", textMuted: "rgba(255,255,255,0.25)",
    input: "rgba(255,255,255,0.05)", inputBorder: "rgba(255,255,255,0.09)",
    inputFocus: "rgba(255,107,0,0.05)", placeholder: "rgba(255,255,255,0.18)",
    dropdownBg: "#181820", dropdownBorder: "rgba(255,255,255,0.12)",
    calBg: "#181820", navBg: "rgba(10,10,14,0.97)", headerBg: "rgba(10,10,14,0.96)",
    sectionBorder: "rgba(255,255,255,0.07)", hintColor: "rgba(255,255,255,0.3)",
    labelColor: "rgba(255,255,255,0.4)", pillBg: "rgba(255,255,255,0.08)",
    docsBg: "rgba(255,255,255,0.03)", docsBorder: "rgba(255,255,255,0.08)",
    reviewBg: "rgba(255,255,255,0.03)", reviewBorder: "rgba(255,255,255,0.08)",
    welcomeBg: `${O}0a`, welcomeBorder: `${O}22`,
  },
  light: {
    bg: "#f5f5f0", bg2: "#ffffff", leftBg: `linear-gradient(160deg,#fff8f3 0%,#fff3ea 60%,#f5f5f0 100%)`,
    card: "rgba(0,0,0,0.03)", cardBorder: "rgba(0,0,0,0.08)",
    text: "#111111", textSub: "rgba(0,0,0,0.5)", textMuted: "rgba(0,0,0,0.35)",
    input: "#ffffff", inputBorder: "rgba(0,0,0,0.12)",
    inputFocus: "rgba(255,107,0,0.04)", placeholder: "rgba(0,0,0,0.25)",
    dropdownBg: "#ffffff", dropdownBorder: "rgba(0,0,0,0.12)",
    calBg: "#ffffff", navBg: "rgba(245,245,240,0.97)", headerBg: "rgba(245,245,240,0.96)",
    sectionBorder: "rgba(0,0,0,0.07)", hintColor: "rgba(0,0,0,0.35)",
    labelColor: "rgba(0,0,0,0.45)", pillBg: "rgba(0,0,0,0.06)",
    docsBg: "rgba(0,0,0,0.02)", docsBorder: "rgba(0,0,0,0.07)",
    reviewBg: "rgba(0,0,0,0.02)", reviewBorder: "rgba(0,0,0,0.07)",
    welcomeBg: `${O}0d`, welcomeBorder: `${O}33`,
  },
};

// ── Custom Dropdown ────────────────────────────────────────────────────────────
function CustomDropdown({ value, onChange, options, placeholder, icon, theme }: {
  value: string; onChange: (v: string) => void;
  options: string[]; placeholder: string; icon?: React.ReactNode; theme: Theme;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tk = T[theme];
  useEffect(() => {
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={wrapRef} style={{ position:"relative", userSelect:"none" }}>
      <div onClick={() => setOpen(o => !o)} style={{
        display:"flex", alignItems:"center", gap:10,
        padding:"15px 16px", paddingLeft: icon ? 44 : 16,
        background: tk.input, border:`1.5px solid ${open ? O : tk.inputBorder}`,
        borderRadius:14, color: value ? tk.text : tk.textMuted,
        fontSize:15, fontFamily:"'DM Sans',sans-serif", cursor:"pointer",
        transition:"border-color 0.2s", WebkitTapHighlightColor:"transparent",
      }}>
        {icon && <span style={{ position:"absolute", left:14, color:tk.textMuted, display:"flex", pointerEvents:"none" }}>{icon}</span>}
        <span style={{ flex:1 }}>{value || placeholder}</span>
        <RiArrowDownSLine size={18} style={{ color:tk.textMuted, transition:"transform 0.2s", transform: open ? "rotate(180deg)" : "none", flexShrink:0 }}/>
      </div>
      {open && (
        <div style={{
          position:"absolute", top:"calc(100% + 8px)", left:0, right:0, zIndex:999,
          background:tk.dropdownBg, border:`1.5px solid ${tk.dropdownBorder}`,
          borderRadius:14, overflow:"hidden", boxShadow:"0 20px 60px rgba(0,0,0,0.2)",
          maxHeight:220, overflowY:"auto",
        }}>
          {options.map(opt => (
            <div key={opt} onClick={() => { onChange(opt); setOpen(false); }}
              onMouseEnter={e => (e.currentTarget.style.background = value===opt ? `${O}14` : theme==="dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)")}
              onMouseLeave={e => (e.currentTarget.style.background = value===opt ? `${O}14` : "transparent")}
              style={{
                padding:"13px 16px", fontSize:14, fontFamily:"'DM Sans',sans-serif",
                color: value===opt ? O : tk.text,
                background: value===opt ? `${O}14` : "transparent",
                borderBottom:`1px solid ${tk.cardBorder}`,
                cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between",
              }}>
              {opt}
              {value===opt && <RiCheckLine size={14} color={O}/>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Custom Calendar ────────────────────────────────────────────────────────────
function CustomCalendar({ value, onChange, maxDate, theme }: {
  value: string; onChange: (v: string) => void; maxDate?: string; theme: Theme;
}) {
  const tk = T[theme];
  const max = maxDate ? new Date(maxDate) : new Date();
  const initial = value ? new Date(value+"T12:00:00") : new Date(max.getFullYear()-20, max.getMonth(), 1);
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const [showYearPicker, setShowYearPicker] = useState(false);
  const selected = value ? new Date(value+"T12:00:00") : null;
  const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const years = Array.from({ length:80 }, (_,i) => max.getFullYear()-i);
  const prevMonth = () => { if (viewMonth===0) { setViewMonth(11); setViewYear(y=>y-1); } else setViewMonth(m=>m-1); };
  const nextMonth = () => { const nx = new Date(viewYear, viewMonth+1, 1); if (nx<=max) { if (viewMonth===11) { setViewMonth(0); setViewYear(y=>y+1); } else setViewMonth(m=>m+1); } };
  return (
    <div style={{ background:tk.calBg, border:`1.5px solid ${tk.inputBorder}`, borderRadius:16, padding:16, userSelect:"none" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
        <button onClick={prevMonth} style={{ width:32,height:32,borderRadius:8,background:tk.card,border:"none",color:tk.textSub,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
          <RiArrowLeftLine size={16}/>
        </button>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <span onClick={() => setShowYearPicker(v=>!v)} style={{ fontSize:14,fontWeight:800,color:tk.text,fontFamily:"'Syne',sans-serif",cursor:"pointer" }}>{MONTHS[viewMonth]}</span>
          <span onClick={() => setShowYearPicker(v=>!v)} style={{ fontSize:14,fontWeight:800,color:O,fontFamily:"'Syne',sans-serif",cursor:"pointer",display:"flex",alignItems:"center",gap:2 }}>
            {viewYear}<RiArrowDownSLine size={14} style={{ transform:showYearPicker?"rotate(180deg)":"none",transition:"transform 0.2s" }}/>
          </span>
        </div>
        <button onClick={nextMonth} style={{ width:32,height:32,borderRadius:8,background:tk.card,border:"none",color:tk.textSub,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
          <RiArrowRightLine size={16}/>
        </button>
      </div>
      {showYearPicker && (
        <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4,maxHeight:160,overflowY:"auto",marginBottom:12,padding:4,background:theme==="dark"?"rgba(0,0,0,0.3)":"rgba(0,0,0,0.04)",borderRadius:10 }}>
          {years.map(y => (
            <div key={y} onClick={() => { setViewYear(y); setShowYearPicker(false); }}
              style={{ padding:"6px 4px",textAlign:"center",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"'DM Sans',sans-serif",color:y===viewYear?"#fff":tk.textSub,background:y===viewYear?O:"transparent" }}>
              {y}
            </div>
          ))}
        </div>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:4 }}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
          <div key={d} style={{ textAlign:"center",fontSize:10,fontWeight:800,color:tk.textMuted,fontFamily:"'DM Sans',sans-serif",padding:"4px 0" }}>{d}</div>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2 }}>
        {Array.from({ length:firstDay }).map((_,i) => <div key={`e${i}`}/>)}
        {Array.from({ length:daysInMonth },(_,i) => {
          const day = i+1;
          const dateStr = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          const isSel = selected && selected.getFullYear()===viewYear && selected.getMonth()===viewMonth && selected.getDate()===day;
          const isDisabled = new Date(dateStr) > max;
          return (
            <div key={day} onClick={() => !isDisabled && onChange(dateStr)}
              onMouseEnter={e => { if (!isDisabled && !isSel) e.currentTarget.style.background = theme==="dark"?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.05)"; }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
              style={{ textAlign:"center",padding:"7px 4px",borderRadius:8,fontSize:13,fontFamily:"'DM Sans',sans-serif",fontWeight:isSel?800:500,cursor:isDisabled?"not-allowed":"pointer",color:isDisabled?tk.textMuted:isSel?"#fff":tk.text,background:isSel?O:"transparent",boxShadow:isSel?`0 2px 12px ${O}55`:"none",transition:"background 0.15s" }}>
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Password Input ─────────────────────────────────────────────────────────────
function PasswordInput({ value, onChange, placeholder, theme }: { value:string; onChange:(v:string)=>void; placeholder?:string; theme:Theme }) {
  const [show, setShow] = useState(false);
  const tk = T[theme];
  return (
    <div style={{ position:"relative", display:"flex", alignItems:"center" }}>
      <RiShieldCheckLine size={16} style={{ position:"absolute",left:14,color:tk.textMuted,pointerEvents:"none",zIndex:1 }}/>
      <input type={show?"text":"password"} value={value} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width:"100%",padding:"15px 44px 15px 44px",background:tk.input,border:`1.5px solid ${tk.inputBorder}`,borderRadius:14,color:tk.text,fontSize:16,fontFamily:"'DM Sans',sans-serif",outline:"none",WebkitAppearance:"none",appearance:"none",transition:"border-color 0.2s,background 0.2s" }}
        onFocus={e => { e.target.style.borderColor=O; e.target.style.background=tk.inputFocus; }}
        onBlur={e => { e.target.style.borderColor=tk.inputBorder; e.target.style.background=tk.input; }}
      />
      <button type="button" onClick={() => setShow(s=>!s)}
        style={{ position:"absolute",right:14,background:"none",border:"none",color:tk.textMuted,cursor:"pointer",display:"flex",padding:0 }}>
        {show ? <RiEyeOffLine size={16}/> : <RiEyeLine size={16}/>}
      </button>
    </div>
  );
}

// ── Theme toggle button ────────────────────────────────────────────────────────
function ThemeToggle({ theme, onToggle }: { theme:Theme; onToggle:()=>void }) {
  return (
    <button onClick={onToggle} style={{
      width:38, height:38, borderRadius:10,
      background: theme==="dark" ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)",
      border: `1px solid ${theme==="dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
      display:"flex", alignItems:"center", justifyContent:"center",
      cursor:"pointer", color: theme==="dark" ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.5)",
      WebkitTapHighlightColor:"transparent", transition:"all 0.2s", flexShrink:0,
    }}>
      {theme==="dark" ? <RiSunLine size={17}/> : <RiMoonLine size={17}/>}
    </button>
  );
}

// ── Step Wrapper ───────────────────────────────────────────────────────────────
function StepWrap({ title, sub, children, theme }: { title:string; sub:string; children:React.ReactNode; theme:Theme }) {
  const tk = T[theme];
  return (
    <div style={{ animation:"stepIn 0.35s cubic-bezier(.34,1.56,.64,1) both" }}>
      <h2 style={{ fontSize:26,fontWeight:900,color:tk.text,letterSpacing:"-0.8px",lineHeight:1.2 }}>{title}</h2>
      <p style={{ fontSize:14,color:tk.textSub,lineHeight:1.7,marginTop:10,fontFamily:"'DM Sans',sans-serif" }}>{sub}</p>
      <div style={{ display:"flex",flexDirection:"column",gap:20,marginTop:28 }}>{children}</div>
    </div>
  );
}

// ── Styled Input helper ────────────────────────────────────────────────────────
function SInput({ value, onChange, placeholder, type="text", inputMode, style: extraStyle, theme }: {
  value:string; onChange:(v:string)=>void; placeholder?:string; type?:string; inputMode?:React.HTMLAttributes<HTMLInputElement>["inputMode"]; style?:React.CSSProperties; theme:Theme;
}) {
  const tk = T[theme];
  return (
    <input type={type} inputMode={inputMode} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      style={{ width:"100%",padding:"15px 16px",background:tk.input,border:`1.5px solid ${tk.inputBorder}`,borderRadius:14,color:tk.text,fontSize:16,fontFamily:"'DM Sans',sans-serif",outline:"none",WebkitAppearance:"none",appearance:"none",transition:"border-color 0.2s,background 0.2s",...extraStyle }}
      onFocus={e => { e.target.style.borderColor=O; e.target.style.background=tk.inputFocus; }}
      onBlur={e => { e.target.style.borderColor=tk.inputBorder; e.target.style.background=tk.input; }}
    />
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function RidersSignupPage() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<Theme>("dark");
  const [splash, setSplash] = useState(true);
  const [btnVisible, setBtnVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selfieRef = useRef<HTMLInputElement>(null);
  const idFrontRef = useRef<HTMLInputElement>(null);
  const idBackRef = useRef<HTMLInputElement>(null);
  const tk = T[theme];

  const [form, setForm] = useState<FormData>({
    country:"Nigeria", dob:"", phone:"", email:"", password:"",
    firstName:"", lastName:"", city:"",
    selfieUrl:"", selfieFile:null,
    idType:"", idNumber:"",
    idFrontUrl:"", idFrontFile:null,
    idBackUrl:"", idBackFile:null,
    vehicleType:"",
  });

  useEffect(() => {
    const t = setTimeout(() => setBtnVisible(true), 3000);
    return () => clearTimeout(t);
  }, []);

  const upd = (k: keyof FormData, v: string | File | null) => setForm(f => ({ ...f, [k]:v }));
  const handleFilePreview = (file: File, urlKey: keyof FormData, fileKey: keyof FormData) => {
    setForm(f => ({ ...f, [urlKey]: URL.createObjectURL(file), [fileKey]: file }));
  };
  const next = () => { setError(""); setStep(s => Math.min(s+1, STEPS.length-1)); };
  const back = () => { setError(""); setStep(s => Math.max(s-1, 0)); };
  const calcAge = (dob: string) => {
    const b = new Date(dob), t = new Date();
    let a = t.getFullYear()-b.getFullYear();
    if (t.getMonth()<b.getMonth()||(t.getMonth()===b.getMonth()&&t.getDate()<b.getDate())) a--;
    return a;
  };
  const maxDob = new Date(new Date().setFullYear(new Date().getFullYear()-18)).toISOString().split("T")[0];

  const canNext = () => {
    const id = STEPS[step].id;
    if (id==="welcome") return true;
    if (id==="dob") return !!form.dob && calcAge(form.dob)>=18;
    if (id==="phone") return form.phone.length>=10;
    if (id==="email") return !!form.email && form.password.length>=6;
    if (id==="name") return !!form.firstName && !!form.lastName;
    if (id==="city") return !!form.city;
    if (id==="docs_intro") return true;
    if (id==="selfie") return !!form.selfieUrl;
    if (id==="id_type") return !!form.idType && !!form.idNumber;
    if (id==="id_image") return !!form.idFrontUrl && !!form.idBackUrl;
    if (id==="vehicle") return !!form.vehicleType;
    return true;
  };

  const uploadFile = async (file: File, path: string) => {
    const r = ref(storage, path);
    await uploadBytes(r, file);
    return getDownloadURL(r);
  };

  const handleSubmit = async () => {
    setLoading(true); setError("");
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await updateProfile(cred.user, { displayName:`${form.firstName} ${form.lastName}` });
      const uid = cred.user.uid;
      const selUrl = form.selfieFile ? await uploadFile(form.selfieFile,`riders/${uid}/selfie`) : "";
      const frontUrl = form.idFrontFile ? await uploadFile(form.idFrontFile,`riders/${uid}/id_front`) : "";
      const backUrl = form.idBackFile ? await uploadFile(form.idBackFile,`riders/${uid}/id_back`) : "";
      await setDoc(doc(db,"riders",uid), {
        uid, firstName:form.firstName, lastName:form.lastName,
        fullName:`${form.firstName} ${form.lastName}`,
        email:form.email, phone:form.phone, dob:form.dob,
        country:form.country, city:form.city, vehicleType:form.vehicleType,
        selfieUrl:selUrl, idType:form.idType, idNumber:form.idNumber,
        idFrontUrl:frontUrl, idBackUrl:backUrl,
        status:"under_review", approved:false, isOnline:false,
        stats:{ acceptanceRate:0, rating:0, totalDeliveries:0 },
        submittedAt:serverTimestamp(), createdAt:serverTimestamp(),
      });
      navigate("/rider");
    } catch (e: unknown) {
      setError((e as { message?:string }).message || "Submission failed.");
    }
    setLoading(false);
  };

  const progress = Math.round((step/(STEPS.length-1))*100);

  // ── SPLASH ───────────────────────────────────────────────────────────────────
  if (splash) return (
    <div style={{ position:"fixed",inset:0,background:"#000",zIndex:9999,overflow:"hidden" }}>
      <style>{CSS}</style>
      <video autoPlay muted playsInline loop style={{ position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",opacity:0.75 }}>
        <source src="/swiftnija.mp4" type="video/mp4"/>
      </video>
      <div style={{ position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,0.88) 0%,rgba(0,0,0,0.15) 50%,rgba(0,0,0,0.5) 100%)" }}/>
      <div style={{ position:"absolute",top:52,left:0,right:0,display:"flex",justifyContent:"center" }}>
        <div className="splash-logo">
          <img src="/SWIFTNIJAS_LOGO_ICON-removebg-preview.png" alt="SwiftNija" style={{ width:70,height:70,objectFit:"contain" }}/>
        </div>
      </div>
      <div style={{ position:"absolute",bottom:0,left:0,right:0,padding:"0 28px 64px",textAlign:"center" }}>
        <div className="splash-tagline">
          <span style={{ color:O }}>Swift.</span> <span style={{ color:"#fff" }}>Every delivery.</span>
        </div>
        <p className="splash-sub">Join thousands of riders earning daily across Nigeria.</p>
        {btnVisible ? (
          <button className="splash-cta" onClick={() => setSplash(false)}>
            Get Started <RiArrowRightLine size={18}/>
          </button>
        ) : (
          <div style={{ display:"flex",justifyContent:"center",gap:7,marginTop:36 }}>
            {[0,1,2].map(i => <div key={i} className="splash-dot" style={{ animationDelay:`${i*0.2}s` }}/>)}
          </div>
        )}
      </div>
    </div>
  );

  // ── SIGNUP ───────────────────────────────────────────────────────────────────
  const iconColor = tk.textMuted;

  return (
    <div style={{ display:"flex",minHeight:"100dvh",fontFamily:"'Syne',sans-serif",background:tk.bg,position:"relative",transition:"background 0.3s" }}>
      <style>{CSS}</style>

      {/* Mobile header */}
      <div style={{
        display:"none", position:"fixed", top:0, left:0, right:0, zIndex:100,
        background:tk.headerBg, backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)",
        borderBottom:`1px solid ${tk.cardBorder}`, padding:"13px 20px",
        flexDirection:"row", alignItems:"center", justifyContent:"space-between",
      }} className="sn-mobile-header">
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          <img src="/SWIFTNIJAS_LOGO_ICON-removebg-preview.png" alt="SwiftNija" style={{ width:30,height:30,objectFit:"contain" }}/>
          <span style={{ fontSize:16,fontWeight:900,color:O,fontFamily:"'Syne',sans-serif" }}>SwiftNija</span>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <div style={{ display:"flex",flexDirection:"column",alignItems:"flex-end",gap:1 }}>
            <span style={{ fontSize:10,fontWeight:700,color:O,fontFamily:"'DM Sans',sans-serif",letterSpacing:0.5 }}>{step+1} / {STEPS.length}</span>
            <span style={{ fontSize:11,fontWeight:800,color:tk.textSub,fontFamily:"'DM Sans',sans-serif" }}>{STEPS[step].title}</span>
          </div>
          <ThemeToggle theme={theme} onToggle={() => setTheme(t => t==="dark"?"light":"dark")}/>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height:3,background:tk.card,position:"fixed",top:0,left:0,right:0,zIndex:101 }}>
        <div style={{ height:"100%",background:`linear-gradient(90deg,${O},#FF9A00)`,transition:"width 0.5s ease",borderRadius:"0 2px 2px 0",width:`${progress}%` }}/>
      </div>

      {/* Desktop left panel */}
      <div style={{ width:340,flexShrink:0,background:tk.leftBg,position:"relative",overflow:"hidden",display:"flex",flexDirection:"column" }} className="sn-left">
        <div style={{ position:"absolute",inset:0,background:`radial-gradient(ellipse at 20% 70%,${O}1a 0%,transparent 65%)`,pointerEvents:"none" }}/>
        <div style={{ position:"relative",zIndex:2,padding:"40px 32px",display:"flex",flexDirection:"column",height:"100%",gap:32 }}>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <img src="/SWIFTNIJAS_LOGO_ICON-removebg-preview.png" alt="SwiftNija" style={{ width:36,height:36,objectFit:"contain" }}/>
            <span style={{ fontSize:20,fontWeight:900,color:O,fontFamily:"'Syne',sans-serif" }}>SwiftNija</span>
            <div style={{ marginLeft:"auto" }}>
              <ThemeToggle theme={theme} onToggle={() => setTheme(t => t==="dark"?"light":"dark")}/>
            </div>
          </div>
          <div style={{ marginTop:"auto" }}>
            <div style={{ display:"inline-block",fontSize:10,fontWeight:800,color:O,background:`${O}18`,border:`1px solid ${O}30`,borderRadius:20,padding:"4px 12px",textTransform:"uppercase",letterSpacing:1,marginBottom:16 }}>Rider Application</div>
            <h1 style={{ fontSize:36,fontWeight:900,color:tk.text,lineHeight:1.1,letterSpacing:"-1.5px",marginBottom:14 }}>Start earning<br/>on your terms.</h1>
            <p style={{ fontSize:13,color:tk.textSub,lineHeight:1.7,fontFamily:"'DM Sans',sans-serif" }}>Complete in minutes. Reviewed within 24 hours.</p>
          </div>
          <div style={{ display:"flex",flexWrap:"wrap",gap:6,marginTop:"auto" }}>
            {STEPS.map((s,i) => (
              <div key={s.id} style={{ width:22,height:22,borderRadius:"50%",background:i===step?O:i<step?"#10B981":tk.pillBg,display:"flex",alignItems:"center",justifyContent:"center",color:i===step||i<step?"#fff":tk.textMuted,transition:"all 0.3s",boxShadow:i===step?`0 0 10px ${O}66`:"none" }}>
                {i<step ? <RiCheckLine size={10}/> : <span style={{ fontSize:9,fontWeight:800 }}>{i+1}</span>}
              </div>
            ))}
          </div>
          <div style={{ fontSize:11,fontWeight:700,color:tk.textMuted,textTransform:"uppercase",letterSpacing:1,fontFamily:"'DM Sans',sans-serif",paddingBottom:8 }}>{STEPS[step].title}</div>
        </div>
      </div>

      {/* Right form */}
      <div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"auto",background:tk.bg2,borderLeft:`1px solid ${tk.cardBorder}`,transition:"background 0.3s" }}>
        <div style={{ flex:1,maxWidth:500,width:"100%",margin:"0 auto",padding:"52px 36px 90px" }} className="sn-form-wrap">

          {error && (
            <div style={{ display:"flex",alignItems:"center",gap:8,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",color:"#ef4444",borderRadius:14,padding:"13px 16px",fontSize:13,fontFamily:"'DM Sans',sans-serif",marginBottom:24 }}>
              <RiAlertLine size={15}/> {error}
            </div>
          )}

          {/* WELCOME */}
          {STEPS[step].id==="welcome" && (
            <StepWrap title="Welcome to SwiftNija 🏍️" sub="Nigeria's fastest-growing delivery network. This application takes about 5 minutes." theme={theme}>
              <div style={{ background:tk.welcomeBg,border:`1px solid ${tk.welcomeBorder}`,borderRadius:16,padding:"18px 20px" }}>
                <p style={{ color:tk.textSub,fontSize:14,lineHeight:1.75,fontFamily:"'DM Sans',sans-serif" }}>Join thousands of riders earning daily across Nigeria. Fast onboarding, flexible hours, daily payouts.</p>
              </div>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                <label style={{ fontSize:11,fontWeight:800,color:tk.labelColor,textTransform:"uppercase",letterSpacing:1,fontFamily:"'DM Sans',sans-serif" }}>Country</label>
                <CustomDropdown value={form.country} onChange={v=>upd("country",v)} options={["Nigeria"]} placeholder="Select country" icon={<RiMapPinLine size={16}/>} theme={theme}/>
                <p style={{ fontSize:11,color:tk.hintColor,fontFamily:"'DM Sans',sans-serif" }}>Currently only available in Nigeria</p>
              </div>
            </StepWrap>
          )}

          {/* DOB */}
          {STEPS[step].id==="dob" && (
            <StepWrap title="Date of Birth 🎂" sub="You must be at least 18 years old to ride with SwiftNija." theme={theme}>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                <label style={{ fontSize:11,fontWeight:800,color:tk.labelColor,textTransform:"uppercase",letterSpacing:1,fontFamily:"'DM Sans',sans-serif" }}>Select your date of birth</label>
                <CustomCalendar value={form.dob} onChange={v=>upd("dob",v)} maxDate={maxDob} theme={theme}/>
                {form.dob && <p style={{ fontSize:11,fontFamily:"'DM Sans',sans-serif",color:calcAge(form.dob)>=18?"#10B981":"#ef4444" }}>{calcAge(form.dob)>=18?`✓ Age: ${calcAge(form.dob)} years — eligible!`:"✗ Must be at least 18 years old"}</p>}
              </div>
            </StepWrap>
          )}

          {/* PHONE */}
          {STEPS[step].id==="phone" && (
            <StepWrap title="Phone Number 📱" sub="Used for order notifications and customer contact." theme={theme}>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                <label style={{ fontSize:11,fontWeight:800,color:tk.labelColor,textTransform:"uppercase",letterSpacing:1,fontFamily:"'DM Sans',sans-serif" }}>Nigerian Phone Number</label>
                <div style={{ position:"relative",display:"flex",alignItems:"center" }}>
                  <span style={{ position:"absolute",left:14,fontSize:12,fontWeight:800,color:tk.textMuted,fontFamily:"'DM Sans',sans-serif",zIndex:1 }}>+234</span>
                  <SInput value={form.phone} onChange={v=>upd("phone",v.replace(/\D/g,""))} placeholder="8012345678" inputMode="numeric" style={{ paddingLeft:58 }} theme={theme}/>
                </div>
                <p style={{ fontSize:11,color:tk.hintColor,fontFamily:"'DM Sans',sans-serif" }}>10–11 digits without leading zero</p>
              </div>
            </StepWrap>
          )}

          {/* EMAIL */}
          {STEPS[step].id==="email" && (
            <StepWrap title="Email & Password 🔐" sub="Your email is your login. Minimum 6 character password." theme={theme}>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                <label style={{ fontSize:11,fontWeight:800,color:tk.labelColor,textTransform:"uppercase",letterSpacing:1,fontFamily:"'DM Sans',sans-serif" }}>Email Address</label>
                <div style={{ position:"relative",display:"flex",alignItems:"center" }}>
                  <RiMailLine size={16} style={{ position:"absolute",left:14,color:iconColor,pointerEvents:"none",zIndex:1 }}/>
                  <SInput value={form.email} onChange={v=>upd("email",v)} placeholder="you@gmail.com" type="email" inputMode="email" style={{ paddingLeft:44 }} theme={theme}/>
                </div>
              </div>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                <label style={{ fontSize:11,fontWeight:800,color:tk.labelColor,textTransform:"uppercase",letterSpacing:1,fontFamily:"'DM Sans',sans-serif" }}>Password</label>
                <PasswordInput value={form.password} onChange={v=>upd("password",v)} placeholder="Min. 6 characters" theme={theme}/>
              </div>
            </StepWrap>
          )}

          {/* NAME */}
          {STEPS[step].id==="name" && (
            <StepWrap title="Your Name 👋" sub="As it appears on your government-issued ID." theme={theme}>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }} className="sn-two-col">
                <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                  <label style={{ fontSize:11,fontWeight:800,color:tk.labelColor,textTransform:"uppercase",letterSpacing:1,fontFamily:"'DM Sans',sans-serif" }}>First Name</label>
                  <div style={{ position:"relative",display:"flex",alignItems:"center" }}>
                    <RiUserLine size={16} style={{ position:"absolute",left:14,color:iconColor,pointerEvents:"none",zIndex:1 }}/>
                    <SInput value={form.firstName} onChange={v=>upd("firstName",v)} placeholder="John" style={{ paddingLeft:44 }} theme={theme}/>
                  </div>
                </div>
                <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                  <label style={{ fontSize:11,fontWeight:800,color:tk.labelColor,textTransform:"uppercase",letterSpacing:1,fontFamily:"'DM Sans',sans-serif" }}>Last Name</label>
                  <div style={{ position:"relative",display:"flex",alignItems:"center" }}>
                    <RiUserLine size={16} style={{ position:"absolute",left:14,color:iconColor,pointerEvents:"none",zIndex:1 }}/>
                    <SInput value={form.lastName} onChange={v=>upd("lastName",v)} placeholder="Doe" style={{ paddingLeft:44 }} theme={theme}/>
                  </div>
                </div>
              </div>
            </StepWrap>
          )}

          {/* CITY */}
          {STEPS[step].id==="city" && (
            <StepWrap title="Your City 📍" sub="We'll match you with orders in your area." theme={theme}>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                <label style={{ fontSize:11,fontWeight:800,color:tk.labelColor,textTransform:"uppercase",letterSpacing:1,fontFamily:"'DM Sans',sans-serif" }}>Delivery City</label>
                <CustomDropdown value={form.city} onChange={v=>upd("city",v)} options={CITIES} placeholder="Select your city" icon={<RiMapPinLine size={16}/>} theme={theme}/>
              </div>
            </StepWrap>
          )}

          {/* DOCS INTRO */}
          {STEPS[step].id==="docs_intro" && (
            <StepWrap title="Document Verification 📋" sub="We verify every rider's identity before activation." theme={theme}>
              <div style={{ background:tk.docsBg,border:`1px solid ${tk.docsBorder}`,borderRadius:16,overflow:"hidden" }}>
                {([["📸","Selfie photo","A clear photo of your face"],["🪪","Government ID","NIN, License, Passport, or Voter's Card"],["🏍️","Vehicle type","The vehicle you'll be delivering with"]] as const).map(([icon,title,desc]) => (
                  <div key={title} style={{ display:"flex",alignItems:"center",gap:14,padding:"16px 18px",borderBottom:`1px solid ${tk.cardBorder}` }}>
                    <div style={{ width:44,height:44,borderRadius:12,background:`${O}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0 }}>{icon}</div>
                    <div>
                      <div style={{ color:tk.text,fontWeight:700,fontSize:14 }}>{title}</div>
                      <div style={{ color:tk.textSub,fontSize:12,marginTop:2,fontFamily:"'DM Sans',sans-serif" }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize:11,color:tk.hintColor,fontFamily:"'DM Sans',sans-serif" }}>All documents are encrypted and only visible to our admin team.</p>
            </StepWrap>
          )}

          {/* SELFIE */}
          {STEPS[step].id==="selfie" && (
            <StepWrap title="Take a Selfie 🤳" sub="Good lighting, face clearly visible. No sunglasses or hats." theme={theme}>
              <input ref={selfieRef} type="file" accept="image/*" capture="user" style={{ display:"none" }}
                onChange={e=>e.target.files?.[0]&&handleFilePreview(e.target.files[0],"selfieUrl","selfieFile")}/>
              {form.selfieUrl ? (
                <div style={{ textAlign:"center" }}>
                  <img src={form.selfieUrl} alt="Selfie" style={{ width:150,height:150,borderRadius:"50%",objectFit:"cover",border:`3px solid ${O}`,boxShadow:`0 0 28px ${O}44` }}/>
                  <div style={{ marginTop:14 }}>
                    <button onClick={()=>setForm(f=>({...f,selfieUrl:"",selfieFile:null}))} style={{ display:"inline-flex",alignItems:"center",gap:6,padding:"10px 20px",borderRadius:10,background:tk.card,border:`1px solid ${tk.cardBorder}`,color:tk.textSub,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
                      <RiCameraLine size={14}/> Retake
                    </button>
                  </div>
                </div>
              ) : (
                <div onClick={()=>selfieRef.current?.click()} style={{ border:`2px dashed ${O}44`,borderRadius:16,padding:"50px 20px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,cursor:"pointer",textAlign:"center",transition:"all 0.2s",WebkitTapHighlightColor:"transparent" }} className="upload-zone">
                  <RiCameraLine size={44} color={O}/>
                  <div style={{ color:tk.text,fontWeight:700,fontSize:15 }}>Take Photo or Upload</div>
                  <div style={{ color:tk.textSub,fontSize:13,fontFamily:"'DM Sans',sans-serif" }}>Tap to open camera or choose from gallery</div>
                </div>
              )}
            </StepWrap>
          )}

          {/* ID TYPE */}
          {STEPS[step].id==="id_type" && (
            <StepWrap title="ID Document 🪪" sub="Select your valid government-issued ID." theme={theme}>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                <label style={{ fontSize:11,fontWeight:800,color:tk.labelColor,textTransform:"uppercase",letterSpacing:1,fontFamily:"'DM Sans',sans-serif" }}>ID Type</label>
                <CustomDropdown value={form.idType} onChange={v=>upd("idType",v)} options={ID_TYPES} placeholder="Choose ID type" icon={<RiFileTextLine size={16}/>} theme={theme}/>
              </div>
              {form.idType && (
                <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                  <label style={{ fontSize:11,fontWeight:800,color:tk.labelColor,textTransform:"uppercase",letterSpacing:1,fontFamily:"'DM Sans',sans-serif" }}>ID Number</label>
                  <div style={{ position:"relative",display:"flex",alignItems:"center" }}>
                    <RiFileTextLine size={16} style={{ position:"absolute",left:14,color:iconColor,pointerEvents:"none",zIndex:1 }}/>
                    <SInput value={form.idNumber} onChange={v=>upd("idNumber",v)} placeholder={form.idType.includes("NIN")?"12345678901":"Enter ID number"} inputMode="numeric" style={{ paddingLeft:44 }} theme={theme}/>
                  </div>
                  <p style={{ fontSize:11,color:tk.hintColor,fontFamily:"'DM Sans',sans-serif" }}>Exactly as it appears on the document</p>
                </div>
              )}
            </StepWrap>
          )}

          {/* ID IMAGE */}
          {STEPS[step].id==="id_image" && (
            <StepWrap title="Upload ID Photos 📄" sub={`Both sides of your ${form.idType||"ID"}. Well-lit and fully visible.`} theme={theme}>
              <input ref={idFrontRef} type="file" accept="image/*,application/pdf" style={{ display:"none" }}
                onChange={e=>e.target.files?.[0]&&handleFilePreview(e.target.files[0],"idFrontUrl","idFrontFile")}/>
              <input ref={idBackRef} type="file" accept="image/*,application/pdf" style={{ display:"none" }}
                onChange={e=>e.target.files?.[0]&&handleFilePreview(e.target.files[0],"idBackUrl","idBackFile")}/>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
                {[
                  { label:"Front Side", url:form.idFrontUrl, onUpload:()=>idFrontRef.current?.click(), onClear:()=>setForm(f=>({...f,idFrontUrl:"",idFrontFile:null})) },
                  { label:"Back Side",  url:form.idBackUrl,  onUpload:()=>idBackRef.current?.click(),  onClear:()=>setForm(f=>({...f,idBackUrl:"",idBackFile:null})) },
                ].map(({ label,url,onUpload,onClear }) => (
                  <div key={label}>
                    <label style={{ fontSize:11,fontWeight:800,color:tk.labelColor,textTransform:"uppercase",letterSpacing:1,fontFamily:"'DM Sans',sans-serif",display:"block",marginBottom:8 }}>{label}</label>
                    {url ? (
                      <div style={{ height:140,borderRadius:14,overflow:"hidden",position:"relative",border:`2px solid ${O}55` }}>
                        <img src={url} alt={label} style={{ width:"100%",height:"100%",objectFit:"cover" }}/>
                        <button onClick={onClear} style={{ position:"absolute",top:6,right:6,width:28,height:28,borderRadius:"50%",background:O,border:"none",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
                          <RiUploadCloud2Line size={12}/>
                        </button>
                      </div>
                    ) : (
                      <div onClick={onUpload} className="upload-zone" style={{ border:`2px dashed ${O}33`,borderRadius:14,height:140,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer",transition:"all 0.2s",padding:10,WebkitTapHighlightColor:"transparent" }}>
                        <RiUploadCloud2Line size={28} color={O}/>
                        <span style={{ fontSize:12,fontWeight:700,color:tk.textSub,fontFamily:"'DM Sans',sans-serif",textAlign:"center" }}>Upload {label.split(" ")[0]}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p style={{ fontSize:11,color:tk.hintColor,fontFamily:"'DM Sans',sans-serif" }}>JPG, PNG, or PDF — max 10MB per file</p>
            </StepWrap>
          )}

          {/* VEHICLE */}
          {STEPS[step].id==="vehicle" && (
            <StepWrap title="Your Vehicle 🚗" sub="What will you be delivering with?" theme={theme}>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
                {VEHICLES.map(v => (
                  <button key={v.value} onClick={()=>upd("vehicleType",v.value)} style={{
                    padding:"22px 16px",borderRadius:16,
                    border:`1.5px solid ${form.vehicleType===v.value ? O : tk.cardBorder}`,
                    background: form.vehicleType===v.value ? `${O}0d` : tk.card,
                    display:"flex",flexDirection:"column",alignItems:"center",gap:10,cursor:"pointer",
                    transition:"all 0.2s",position:"relative",WebkitTapHighlightColor:"transparent",
                    boxShadow: form.vehicleType===v.value ? `0 0 24px ${O}22` : "none",
                  }}>
                    <div style={{ width:52,height:52,borderRadius:14,background:form.vehicleType===v.value?`${O}22`:tk.card,display:"flex",alignItems:"center",justifyContent:"center",color:form.vehicleType===v.value?O:tk.textSub,transition:"all 0.2s" }}>
                      {v.icon}
                    </div>
                    <span style={{ fontSize:13,fontWeight:800,color:tk.text,fontFamily:"'DM Sans',sans-serif" }}>{v.label}</span>
                    {form.vehicleType===v.value && <div style={{ position:"absolute",top:8,right:8,width:20,height:20,borderRadius:"50%",background:O,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff" }}><RiCheckLine size={12}/></div>}
                  </button>
                ))}
              </div>
            </StepWrap>
          )}

          {/* REVIEW */}
          {STEPS[step].id==="review" && (
            <StepWrap title="Review & Submit ✅" sub="Confirm everything before submitting." theme={theme}>
              <div style={{ background:tk.reviewBg,border:`1px solid ${tk.reviewBorder}`,borderRadius:16,overflow:"hidden" }}>
                {([ ["Full Name",`${form.firstName} ${form.lastName}`],["Email",form.email],["Phone",`+234 ${form.phone}`],["Date of Birth",form.dob],["City",form.city],["ID Type",form.idType],["ID Number",form.idNumber],["Vehicle",form.vehicleType] ] as [string,string][]).map(([k,v]) => (
                  <div key={k} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 16px",borderBottom:`1px solid ${tk.cardBorder}`,gap:12 }}>
                    <span style={{ fontSize:11,fontWeight:700,color:tk.textSub,textTransform:"uppercase",letterSpacing:0.7,fontFamily:"'DM Sans',sans-serif",flexShrink:0 }}>{k}</span>
                    <span style={{ fontSize:13,fontWeight:600,color:tk.text,fontFamily:"'DM Sans',sans-serif",textAlign:"right",wordBreak:"break-all" }}>{v||"—"}</span>
                  </div>
                ))}
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 16px",borderBottom:`1px solid ${tk.cardBorder}`,gap:12 }}>
                  <span style={{ fontSize:11,fontWeight:700,color:tk.textSub,textTransform:"uppercase",letterSpacing:0.7,fontFamily:"'DM Sans',sans-serif",flexShrink:0 }}>Selfie</span>
                  {form.selfieUrl ? <img src={form.selfieUrl} alt="selfie" style={{ width:40,height:40,borderRadius:"50%",objectFit:"cover",border:`2px solid ${O}` }}/> : <span style={{ fontSize:13,fontWeight:600,color:"#ef4444",fontFamily:"'DM Sans',sans-serif" }}>Not uploaded</span>}
                </div>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 16px",gap:12 }}>
                  <span style={{ fontSize:11,fontWeight:700,color:tk.textSub,textTransform:"uppercase",letterSpacing:0.7,fontFamily:"'DM Sans',sans-serif",flexShrink:0 }}>ID Images</span>
                  <span style={{ fontSize:13,fontWeight:600,color:form.idFrontUrl&&form.idBackUrl?"#10B981":"#ef4444",fontFamily:"'DM Sans',sans-serif" }}>{form.idFrontUrl&&form.idBackUrl?"✓ Both uploaded":"Missing"}</span>
                </div>
              </div>
              <button onClick={()=>setStep(0)} style={{ display:"inline-flex",alignItems:"center",gap:6,padding:"10px 18px",borderRadius:12,background:tk.card,border:`1px solid ${tk.cardBorder}`,color:tk.textSub,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
                <RiArrowLeftLine size={14}/> Edit Application
              </button>
            </StepWrap>
          )}

          {/* Nav */}
          <div style={{ display:"flex",alignItems:"center",gap:12,marginTop:36,paddingTop:24,borderTop:`1px solid ${tk.sectionBorder}` }} className="sn-nav-row">
            {step>0 && (
              <button onClick={back} style={{ display:"flex",alignItems:"center",gap:6,padding:"14px 20px",borderRadius:14,background:tk.card,border:`1px solid ${tk.cardBorder}`,color:tk.textSub,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",WebkitTapHighlightColor:"transparent",whiteSpace:"nowrap" }}>
                <RiArrowLeftLine size={18}/> Back
              </button>
            )}
            <div style={{ flex:1 }}/>
            {STEPS[step].id==="review" ? (
              <button onClick={handleSubmit} disabled={loading} style={{ display:"flex",alignItems:"center",gap:8,padding:"15px 28px",borderRadius:14,background:"linear-gradient(135deg,#10B981,#059669)",border:"none",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",boxShadow:"0 6px 22px rgba(16,185,129,0.4)",fontFamily:"'Syne',sans-serif",whiteSpace:"nowrap",WebkitTapHighlightColor:"transparent" }}>
                {loading?"Submitting…":<><RiCheckLine size={18}/> Submit Application</>}
              </button>
            ) : (
              <button onClick={next} disabled={!canNext()} style={{ display:"flex",alignItems:"center",gap:8,padding:"15px 30px",borderRadius:14,background:canNext()?`linear-gradient(135deg,${O},#FF9A00)`:`${O}44`,border:"none",color:"#fff",fontSize:15,fontWeight:800,cursor:canNext()?"pointer":"not-allowed",boxShadow:canNext()?`0 6px 22px ${O}44`:"none",fontFamily:"'Syne',sans-serif",transition:"all 0.2s",whiteSpace:"nowrap",WebkitTapHighlightColor:"transparent",opacity:canNext()?1:0.5 }}>
                Continue <RiArrowRightLine size={18}/>
              </button>
            )}
          </div>

          {step===0 && (
            <p style={{ textAlign:"center",fontSize:14,color:tk.textMuted,marginTop:24,fontFamily:"'DM Sans',sans-serif" }}>
              Already a rider? <Link to="/rider/login" style={{ color:O,fontWeight:700,textDecoration:"none" }}>Sign in →</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
.splash-logo{animation:splashIn 0.8s cubic-bezier(.34,1.56,.64,1) both;filter:drop-shadow(0 0 28px ${O}99);}
.splash-tagline{font-family:'Syne',sans-serif;font-size:clamp(30px,9vw,48px);font-weight:900;letter-spacing:-1.5px;line-height:1.1;animation:fadeUp 0.7s 0.3s both;}
.splash-sub{font-family:'DM Sans',sans-serif;font-size:15px;color:rgba(255,255,255,0.5);margin-top:12px;line-height:1.6;animation:fadeUp 0.7s 0.5s both;}
.splash-cta{display:inline-flex;align-items:center;gap:10px;margin-top:32px;padding:18px 44px;border-radius:50px;background:linear-gradient(135deg,${O},#FF9A00);border:none;color:#fff;font-size:17px;font-weight:800;font-family:'Syne',sans-serif;cursor:pointer;box-shadow:0 8px 36px ${O}55;animation:fadeUp 0.6s cubic-bezier(.34,1.56,.64,1) both;-webkit-tap-highlight-color:transparent;}
.splash-cta:active{transform:scale(0.96);}
.splash-dot{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,0.3);animation:dotPulse 1.2s ease-in-out infinite;display:inline-block;}
@keyframes splashIn{from{opacity:0;transform:scale(0.6) translateY(-10px);}to{opacity:1;transform:scale(1) translateY(0);}}
@keyframes fadeUp{from{opacity:0;transform:translateY(24px);}to{opacity:1;transform:translateY(0);}}
@keyframes dotPulse{0%,100%{opacity:0.3;transform:scale(1);}50%{opacity:1;transform:scale(1.4);}}
@keyframes stepIn{from{opacity:0;transform:translateX(18px);}to{opacity:1;transform:translateX(0);}}
.upload-zone:hover{border-color:${O}88!important;background:${O}08!important;}
.upload-zone:active{transform:scale(0.98);}
@media(max-width:768px){
  .sn-left{display:none!important;}
  .sn-mobile-header{display:flex!important;}
  .sn-form-wrap{padding:88px 20px 110px!important;max-width:100%!important;}
  .sn-nav-row{position:fixed!important;bottom:0!important;left:0!important;right:0!important;margin:0!important;padding:14px 20px!important;padding-bottom:max(14px,env(safe-area-inset-bottom))!important;backdrop-filter:blur(20px)!important;-webkit-backdrop-filter:blur(20px)!important;border-top-width:1px!important;border-top-style:solid!important;z-index:99!important;}
  .sn-two-col{grid-template-columns:1fr!important;}
}
@media(max-width:380px){.sn-form-wrap{padding:88px 16px 110px!important;}}
`;