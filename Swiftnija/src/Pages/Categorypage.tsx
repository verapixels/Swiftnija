// pages/CategoryPage.tsx — FULL WORKING VERSION
// Route: /category/:categoryId
// Shows ALL products in that category with:
//  • Hero banner with category info
//  • Search, filter panel (stock, rating, max price), sort dropdown, grid/list toggle
//  • Product cards open the same bottom-sheet detail view as Homepage
//  • handleAddToCart resolves vendorLat/vendorLng from Firestore

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FiArrowLeft, FiSearch, FiStar, FiBox, FiPackage,
  FiShoppingCart, FiFilter, FiX, FiChevronDown,
  FiGrid, FiList, FiClock, FiTruck, FiHeart,
  FiMinus, FiPlus, FiShield, FiMapPin, FiChevronRight,
} from "react-icons/fi";
import {
  MdRestaurant, MdLocalPharmacy, MdLocalGroceryStore,
  MdStorefront, MdDirectionsBike, MdFastfood,
} from "react-icons/md";
import { RiDrinks2Line, RiVerifiedBadgeFill } from "react-icons/ri";
import { useCart } from "../context/Cartcontext";
import { db } from "../firebase";
import {
  collection, getDocs, doc, getDoc, query, where, limit,
} from "firebase/firestore";

// ─── Types ─────────────────────────────────────────────────────────────────
type RawProduct = {
  name?: string; price?: number | string; category?: string;
  images?: string[]; image?: string; img?: string;
  description?: string; highlights?: string; careInfo?: string;
  vendorId?: string; vendorName?: string; storeName?: string; businessName?: string;
  rating?: number; inStock?: boolean; available?: boolean; stock?: number;
  shipping?: { weightKg?: number|null; sizeCategory?: string|null; lengthCm?: number|null; widthCm?: number|null; heightCm?: number|null; };
};
type Product = {
  id: string; name: string; store: string; rating: number;
  price: string; img: string|null; category: string;
  vendorId: string; vendorName?: string;
  description?: string; highlights?: string; careInfo?: string;
  stock?: number; shipping?: RawProduct["shipping"];
};
type VendorInfo = { name: string; logo?: string; verified?: boolean; rating?: number; reviewCount?: number; deliveryTime?: string; address?: string; };
type SortKey  = "default"|"price_low"|"price_high"|"rating"|"name";
type ViewMode = "grid"|"list";

// ─── Constants ──────────────────────────────────────────────────────────────
const ACCENT   = "#FF6B00";
const FALLBACK = "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&q=80";

const CAT_INFO: Record<string,{label:string;icon:React.ReactNode;banner:string;desc:string}> = {
  restaurants:  {label:"Restaurants",  icon:<MdRestaurant size={26}/>,      banner:"https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=900&q=80", desc:"Fresh meals from top restaurants near you"},
  pharmacy:     {label:"Pharmacy",     icon:<MdLocalPharmacy size={26}/>,   banner:"https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=900&q=80", desc:"Medicines, supplements & health products"},
  supermarket:  {label:"Supermarket",  icon:<MdLocalGroceryStore size={26}/>,banner:"https://images.unsplash.com/photo-1542838132-92c53300491e?w=900&q=80",desc:"Daily groceries & household essentials"},
  boutique:     {label:"Boutique",     icon:<MdStorefront size={26}/>,      banner:"https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=900&q=80", desc:"Fashion, accessories & lifestyle picks"},
  logistics:    {label:"Logistics",    icon:<MdDirectionsBike size={26}/>,  banner:"https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=900&q=80",desc:"Send & receive packages fast"},
  fastfood:     {label:"Fast Food",    icon:<MdFastfood size={26}/>,        banner:"https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=900&q=80", desc:"Quick bites delivered to your door"},
  skincare:     {label:"Skincare",     icon:<FiBox size={26}/>,             banner:"https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=900&q=80",desc:"Premium skincare & beauty products"},
  perfumes:     {label:"Perfumes",     icon:<FiBox size={26}/>,             banner:"https://images.unsplash.com/photo-1541643600914-78b084683702?w=900&q=80",desc:"Fragrances & luxury perfumes"},
  drinks:       {label:"Drinks",       icon:<RiDrinks2Line size={26}/>,     banner:"https://images.unsplash.com/photo-1544145945-f90425340c7e?w=900&q=80", desc:"Refreshing drinks, juices & beverages"},
  groceries:    {label:"Groceries",    icon:<MdLocalGroceryStore size={26}/>,banner:"https://images.unsplash.com/photo-1540420773420-3366772f4999?w=900&q=80",desc:"Fresh produce & pantry staples"},
  fashion:      {label:"Fashion",      icon:<MdStorefront size={26}/>,      banner:"https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=900&q=80", desc:"Trending fashion & apparel"},
  health:       {label:"Health",       icon:<FiHeart size={26}/>,           banner:"https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=900&q=80", desc:"Health products & wellness items"},
  beauty:       {label:"Beauty",       icon:<FiBox size={26}/>,             banner:"https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=900&q=80",desc:"Beauty products for every skin type"},
  electronics:  {label:"Electronics",  icon:<FiBox size={26}/>,             banner:"https://images.unsplash.com/photo-1498049794561-7780e7231661?w=900&q=80",desc:"Gadgets, phones & tech accessories"},
  other:        {label:"Products",     icon:<FiPackage size={26}/>,         banner:"https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&q=80",  desc:"Browse all available products"},
};

const SORT_LABELS: Record<SortKey,string> = {
  default:"Default", price_low:"Price: Low → High",
  price_high:"Price: High → Low", rating:"Top Rated", name:"A → Z",
};

const SIZE_LBL: Record<string,string> = {small:"Small pkg",medium:"Medium pkg",large:"Large pkg",extra_large:"Extra large"};

// ─── Helpers ────────────────────────────────────────────────────────────────
function normCat(r:string):string{
  if(!r)return"other"; const s=r.toLowerCase().trim();
  const m:[string,string][]=[["restaurant","restaurants"],["fast food","fastfood"],["fastfood","fastfood"],["burger","fastfood"],["pharmacy","pharmacy"],["drug","pharmacy"],["medicine","pharmacy"],["health","health"],["supplement","health"],["supermarket","supermarket"],["grocery","groceries"],["groceries","groceries"],["boutique","boutique"],["fashion","fashion"],["clothing","fashion"],["logistics","logistics"],["skincare","skincare"],["beauty","beauty"],["perfume","perfumes"],["drink","drinks"],["beverage","drinks"],["electronics","electronics"],["food","restaurants"]];
  for(const[k,v]of m)if(s.includes(k))return v;
  const CAT_KEYS=Object.keys(CAT_INFO);
  return CAT_KEYS.includes(s)?s:"other";
}
function fmtP(p:number|string):string{ const n=typeof p==="number"?p:parseFloat(String(p).replace(/[^0-9.]/g,"")); return isNaN(n)?String(p):n.toLocaleString("en-NG"); }
function rawN(s:string):number{ return parseFloat(s.replace(/[₦,\s]/g,""))||0; }
function bestImg(r:RawProduct):string|null{ return[r.images?.[0],r.image,r.img].find(u=>u&&!u.includes("supabase.co"))??null; }

// ─── Product Detail Sheet ────────────────────────────────────────────────────
function DetailSheet({product,onClose,onAdd,dark}:{product:Product|null;onClose:()=>void;onAdd:(p:Product,qty:number)=>void;dark:boolean;}){
  const navigate=useNavigate();
  const [qty,setQty]=useState(1);
  const [liked,setLiked]=useState(false);
  const [vendor,setVendor]=useState<VendorInfo|null>(null);
  const [full,setFull]=useState<Product|null>(null);
  const [busy,setBusy]=useState(false);
  const [imgErr,setImgErr]=useState(false);
  const [open,setOpen]=useState(false);

  const S=dark
    ?{bg:"#13131a",brd:"#1e1e2c",txt:"#eeeef8",sub:"#66668a",card:"#0f0f16"}
    :{bg:"#ffffff",brd:"#e0e0ee",txt:"#111118",sub:"#7777a2",card:"#f4f4fc"};

  useEffect(()=>{
    if(!product){setOpen(false);return;}
    setQty(1);setImgErr(false);setVendor(null);setFull(null);
    requestAnimationFrame(()=>setOpen(true));
    (async()=>{
      setBusy(true);
      try{
        const ps=await getDoc(doc(db,"products",product.id));
        if(ps.exists()){
          const d=ps.data() as RawProduct;
          setFull({...product,description:d.description||product.description||"",highlights:d.highlights||product.highlights||"",careInfo:d.careInfo||product.careInfo||"",stock:d.stock??product.stock,shipping:d.shipping??product.shipping});
        }else setFull(product);
        let v:VendorInfo|null=null;
        if(product.vendorId){
          const vs=await getDoc(doc(db,"vendors",product.vendorId));
          if(vs.exists()){const d=vs.data();v={name:d.businessName||d.storeName||product.store,logo:d.logo||d.coverImage,verified:d.verified,rating:d.rating,reviewCount:d.reviewCount,deliveryTime:d.deliveryTime||"15–35 mins",address:d.address||d.city};}
        }
        if(!v&&product.vendorName){
          for(const f of["businessName","storeName"]){
            const s=await getDocs(query(collection(db,"vendors"),where(f,"==",product.vendorName),limit(1)));
            if(!s.empty){const d=s.docs[0].data();v={name:d.businessName||d.storeName||product.store,logo:d.logo||d.coverImage,verified:d.verified,rating:d.rating,reviewCount:d.reviewCount,deliveryTime:d.deliveryTime||"15–35 mins",address:d.address||d.city};break;}
          }
        }
        setVendor(v);
      }finally{setBusy(false);}
    })();
  },[product?.id]);

  const close=()=>{setOpen(false);setTimeout(onClose,300);};
  if(!product)return null;
  const dp=full??product;
  const price=rawN(dp.price);
  const inStock=dp.stock===undefined||dp.stock===null||dp.stock>0;
  const dots=dp.highlights?dp.highlights.split("\n").map(l=>l.replace(/^[•\-*]\s*/,"").trim()).filter(Boolean):[];

  return(
    <>
      <div onClick={close} style={{position:"fixed",inset:0,zIndex:6000,background:"rgba(0,0,0,.65)",backdropFilter:"blur(6px)",animation:"cp-bk .25s ease"}}/>
      <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:6001,maxHeight:"93vh",overflowY:"auto",scrollbarWidth:"none",borderRadius:"26px 26px 0 0",background:S.bg,animation:open?"cp-up .35s cubic-bezier(.32,1,.4,1)":"cp-dn .3s ease forwards",willChange:"transform"}}>
        <div style={{width:38,height:4,borderRadius:4,background:S.brd,margin:"10px auto 0"}}/>
        <div style={{position:"relative",height:240,overflow:"hidden"}}>
          <img src={imgErr?FALLBACK:(dp.img||FALLBACK)} alt={dp.name} onError={()=>setImgErr(true)} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,.65) 0%,transparent 55%)"}}/>
          <div style={{position:"absolute",top:14,right:14,display:"flex",gap:8}}>
            <button onClick={()=>setLiked(v=>!v)} style={{width:36,height:36,borderRadius:"50%",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"white",background:liked?"rgba(239,68,68,.85)":"rgba(0,0,0,.48)",backdropFilter:"blur(8px)"}}><FiHeart size={14} fill={liked?"white":"none"}/></button>
            <button onClick={close} style={{width:36,height:36,borderRadius:"50%",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"white",background:"rgba(0,0,0,.48)",backdropFilter:"blur(8px)"}}><FiX size={14}/></button>
          </div>
          <div style={{position:"absolute",bottom:14,left:14,display:"flex",gap:8,flexWrap:"wrap"}}>
            <span style={{background:inStock?"rgba(16,185,129,.85)":"rgba(239,68,68,.85)",color:"white",fontSize:11,fontWeight:800,padding:"4px 11px",borderRadius:20,backdropFilter:"blur(8px)",display:"flex",alignItems:"center",gap:5}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:"white",display:"inline-block"}}/>
              {inStock?(dp.stock!=null&&dp.stock<=10?`Only ${dp.stock} left`:"In Stock"):"Out of Stock"}
            </span>
            <span style={{background:"rgba(0,0,0,.52)",color:"white",fontSize:11,fontWeight:800,padding:"4px 11px",borderRadius:20,backdropFilter:"blur(8px)",display:"flex",alignItems:"center",gap:4}}>
              <FiStar size={10} fill={ACCENT} color={ACCENT}/> {dp.rating.toFixed(1)}
            </span>
          </div>
        </div>
        <div style={{padding:"20px 20px 0"}}>
          <div style={{display:"flex",gap:12,justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
            <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:900,lineHeight:1.2,flex:1,color:S.txt,margin:0}}>{dp.name}</h2>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:26,fontWeight:900,color:ACCENT,flexShrink:0}}>₦{price.toLocaleString()}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:2}}>{[1,2,3,4,5].map(s=><FiStar key={s} size={12} color={ACCENT} fill={s<=Math.round(dp.rating)?ACCENT:"none"}/>)}</div>
            <span style={{fontSize:12,fontWeight:600,color:S.sub}}>{dp.rating.toFixed(1)} · {dp.category}</span>
          </div>
          {busy?<div style={{height:12,borderRadius:5,background:S.brd,marginBottom:12,opacity:.5}}/>:dp.description?(
            <><p style={{fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:".8px",color:S.sub,marginBottom:8,display:"flex",alignItems:"center",gap:5}}><FiBox size={10}/> About</p>
            <p style={{fontSize:14,lineHeight:1.75,fontWeight:500,color:S.txt,marginBottom:16}}>{dp.description}</p></>
          ):null}
          {dots.length>0&&(<>
            <p style={{fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:".8px",color:S.sub,marginBottom:10}}>✦ Highlights</p>
            <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:16}}>
              {dots.map((h,i)=><div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,fontSize:13,fontWeight:600,color:S.txt}}><div style={{width:6,height:6,borderRadius:"50%",background:ACCENT,flexShrink:0,marginTop:5}}/>{h}</div>)}
            </div>
          </>)}
          {dp.careInfo&&<div style={{background:"rgba(255,107,0,.07)",border:"1px solid rgba(255,107,0,.18)",borderRadius:13,padding:"11px 14px",marginBottom:16,fontSize:12,fontWeight:600,color:S.sub,lineHeight:1.6}}>📋 {dp.careInfo}</div>}
          <p style={{fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:".8px",color:S.sub,marginBottom:10,display:"flex",alignItems:"center",gap:5}}><FiTruck size={11}/> Delivery & Package</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            {[
              {icon:<FiClock size={10}/>,label:"Delivery",val:vendor?.deliveryTime||"15–35 mins"},
              {icon:<FiPackage size={10}/>,label:"Package",val:dp.shipping?.sizeCategory?SIZE_LBL[dp.shipping.sizeCategory]||dp.shipping.sizeCategory:"Standard"},
              ...(dp.shipping?.weightKg?[{icon:<span style={{fontSize:10}}>⚖️</span>,label:"Weight",val:`${dp.shipping.weightKg} kg`}]:[]),
            ].map((t,i)=>(
              <div key={i} style={{padding:13,borderRadius:14,border:`1.5px solid ${S.brd}`,background:S.card}}>
                <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:".5px",color:S.sub,marginBottom:5}}>{t.icon} {t.label}</div>
                <div style={{fontSize:13,fontWeight:700,color:S.txt}}>{t.val}</div>
              </div>
            ))}
          </div>
          {(vendor||dp.store)&&(
            <>
              <p style={{fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:".8px",color:S.sub,marginBottom:10,display:"flex",alignItems:"center",gap:5}}><MdStorefront size={12}/> Sold by</p>
              <div onClick={()=>{if(dp.vendorId){close();navigate(`/store/${dp.vendorId}`);}}} style={{display:"flex",alignItems:"center",gap:13,padding:"13px 15px",borderRadius:16,border:`1.5px solid ${S.brd}`,background:S.card,cursor:dp.vendorId?"pointer":"default",marginBottom:8}}>
                <div style={{width:46,height:46,borderRadius:13,overflow:"hidden",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:900,color:"white",background:`linear-gradient(135deg,${ACCENT},#FF8C00)`}}>
                  {vendor?.logo?<img src={vendor.logo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : (vendor?.name||dp.store)[0].toUpperCase()}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <span style={{fontFamily:"'Syne',sans-serif",fontSize:14,fontWeight:800,color:S.txt}}>{vendor?.name||dp.store}</span>
                    {vendor?.verified&&<RiVerifiedBadgeFill size={12} color="#3b82f6"/>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginTop:3}}>
                    {vendor?.rating&&<span style={{fontSize:11,fontWeight:700,color:S.sub,display:"flex",alignItems:"center",gap:3}}><FiStar size={9} fill={ACCENT} color={ACCENT}/>{vendor.rating.toFixed(1)}{vendor.reviewCount?` (${vendor.reviewCount})`:""}</span>}
                    {vendor?.address&&<span style={{fontSize:11,fontWeight:600,color:S.sub,display:"flex",alignItems:"center",gap:3}}><FiMapPin size={9} color={ACCENT}/>{vendor.address}</span>}
                  </div>
                </div>
                {dp.vendorId&&<FiChevronRight size={13} color={S.sub}/>}
              </div>
            </>
          )}
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5,padding:"10px 0 4px",fontSize:11,fontWeight:600,color:S.sub}}><FiShield size={10} color={ACCENT}/> Secured checkout · Fast delivery</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",margin:"15px 0 10px"}}>
            <span style={{fontSize:13,fontWeight:700,color:S.txt}}>Quantity</span>
            <div style={{display:"flex",alignItems:"center",gap:4,background:"rgba(255,107,0,.1)",borderRadius:13,padding:4,border:"1.5px solid rgba(255,107,0,.2)"}}>
              <button disabled={qty<=1} onClick={()=>setQty(v=>Math.max(1,v-1))} style={{width:34,height:34,borderRadius:9,border:"none",background:"transparent",color:ACCENT,cursor:qty<=1?"not-allowed":"pointer",opacity:qty<=1?.35:1,display:"flex",alignItems:"center",justifyContent:"center"}}><FiMinus size={12}/></button>
              <span style={{fontFamily:"'Syne',sans-serif",fontSize:16,fontWeight:900,color:ACCENT,minWidth:30,textAlign:"center"}}>{qty}</span>
              <button disabled={dp.stock!=null&&qty>=dp.stock} onClick={()=>setQty(v=>v+1)} style={{width:34,height:34,borderRadius:9,border:"none",background:"transparent",color:ACCENT,cursor:(dp.stock!=null&&qty>=dp.stock)?"not-allowed":"pointer",opacity:(dp.stock!=null&&qty>=dp.stock)?.35:1,display:"flex",alignItems:"center",justifyContent:"center"}}><FiPlus size={12}/></button>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <span style={{fontSize:12,fontWeight:700,color:S.sub}}>{qty>1?`${qty} × ₦${price.toLocaleString()}`:"Total"}</span>
            <span style={{fontFamily:"'Syne',sans-serif",fontSize:18,fontWeight:900,color:ACCENT}}>₦{(price*qty).toLocaleString()}</span>
          </div>
        </div>
        <div style={{padding:"0 20px 34px",background:S.bg}}>
          <button disabled={!inStock} onClick={()=>{onAdd(dp,qty);close();}} style={{width:"100%",padding:16,borderRadius:17,border:"none",cursor:inStock?"pointer":"not-allowed",background:inStock?`linear-gradient(135deg,${ACCENT},#FF8C00)`:"#444",color:"white",fontFamily:"'Syne',sans-serif",fontSize:15,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:inStock?"0 8px 28px rgba(255,107,0,.35)":"none"}}>
            <FiShoppingCart size={16}/>{inStock?`Add ${qty>1?qty+" to":"to"} Cart`:"Out of Stock"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Product Card — Grid ─────────────────────────────────────────────────────
function GridCard({p,onBuy,onOpen}:{p:Product;onBuy:(p:Product)=>void;onOpen:(p:Product)=>void;}){
  return(
    <div className="cp-gc" onClick={()=>onOpen(p)}>
      <div className="cp-gi">
        {p.img?<img src={p.img} alt={p.name} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{(e.currentTarget as HTMLImageElement).src=FALLBACK;}}/>:<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%"}}><FiBox size={22} color="#444"/></div>}
        {p.stock!=null&&p.stock<=5&&p.stock>0&&<div className="cp-lowstock">Only {p.stock} left</div>}
        {p.stock===0&&<div className="cp-soldout">Sold Out</div>}
      </div>
      <div className="cp-gb">
        <div className="cp-gn">{p.name}</div>
        <div className="cp-gs">{p.store}</div>
        <div style={{display:"flex",alignItems:"center",gap:3,fontSize:10,color:ACCENT,fontWeight:700,marginBottom:5}}>
          <FiStar size={9} fill={ACCENT} color={ACCENT}/>{p.rating.toFixed(1)}
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:"auto"}}>
          <span style={{color:ACCENT,fontWeight:900,fontSize:13,fontFamily:"'Syne',sans-serif"}}>₦{p.price}</span>
          <button className="cp-buy" onClick={e=>{e.stopPropagation();onBuy(p);}}>Buy</button>
        </div>
      </div>
    </div>
  );
}

// ─── Product Card — List ─────────────────────────────────────────────────────
function ListCard({p,onBuy,onOpen}:{p:Product;onBuy:(p:Product)=>void;onOpen:(p:Product)=>void;}){
  const inStock=p.stock===undefined||p.stock===null||p.stock>0;
  return(
    <div className="cp-lc" onClick={()=>onOpen(p)}>
      <div className="cp-li">
        {p.img?<img src={p.img} alt={p.name} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{(e.currentTarget as HTMLImageElement).src=FALLBACK;}}/>:<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%"}}><FiBox size={18} color="#444"/></div>}
      </div>
      <div className="cp-lb">
        <div style={{fontWeight:800,fontSize:14,color:"var(--cpt)",marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
        <div style={{fontSize:11,color:"var(--cpd)",marginBottom:4}}>{p.store}</div>
        {p.description&&<div style={{fontSize:11,color:"var(--cps)",lineHeight:1.5,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden",marginBottom:6}}>{p.description}</div>}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:"auto"}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:3,marginBottom:2}}><FiStar size={9} fill={ACCENT} color={ACCENT}/><span style={{fontSize:10,fontWeight:700,color:ACCENT}}>{p.rating.toFixed(1)}</span></div>
            <span style={{fontFamily:"'Syne',sans-serif",fontSize:17,fontWeight:900,color:ACCENT}}>₦{p.price}</span>
          </div>
          <button className="cp-buy" disabled={!inStock} onClick={e=>{e.stopPropagation();if(inStock)onBuy(p);}} style={{opacity:inStock?1:.4}}>
            {inStock?"Buy":"Sold Out"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function SkGrd(){
  return(
    <div className="cp-gc" style={{cursor:"default"}}>
      <div className="cp-gi cpsk" style={{animationDelay:`${Math.random()*.4}s`}}/>
      <div className="cp-gb" style={{gap:7}}>
        <div className="cpsk" style={{height:10,borderRadius:5,width:"72%"}}/>
        <div className="cpsk" style={{height:9,borderRadius:5,width:"55%"}}/>
        <div className="cpsk" style={{height:10,borderRadius:5,width:"48%"}}/>
      </div>
    </div>
  );
}

// ─── CATEGORY PAGE ───────────────────────────────────────────────────────────
export default function CategoryPage(){
  const {categoryId="other"}=useParams<{categoryId:string}>();
  const navigate=useNavigate();
  const {addToCart,cartCount}=useCart();
  const [dark]=useState(()=>{try{return localStorage.getItem("theme")!=="light";}catch{return true;}});

  const C=dark
    ?{bg:"#0a0a0d",surf:"#111115",card:"#16161b",brd:"#1e1e26",txt:"#e8e8f0",sub:"#8888a0",dim:"#44445a",inp:"#1a1a22",inpbd:"#252530"}
    :{bg:"#f0f0f5",surf:"#ffffff",card:"#ffffff",brd:"#e0e0e8",txt:"#111118",sub:"#555570",dim:"#aaaabc",inp:"#f5f5fa",inpbd:"#dddde8"};

  const info=CAT_INFO[categoryId]||CAT_INFO.other;

  const [prods,setProds]       =useState<Product[]>([]);
  const [loading,setLoading]   =useState(true);
  const [search,setSearch]     =useState("");
  const [sort,setSort]         =useState<SortKey>("default");
  const [showSort,setShowSort] =useState(false);
  const [showFilt,setShowFilt] =useState(false);
  const [view,setView]         =useState<ViewMode>("grid");
  const [sheet,setSheet]       =useState<Product|null>(null);
  const [maxP,setMaxP]         =useState(0);
  const [fMaxP,setFMaxP]       =useState(0);
  const [fStock,setFStock]     =useState(false);
  const [fRating,setFRating]   =useState(0);

  // Load products for this category
  useEffect(()=>{
    (async()=>{
      setLoading(true);
      try{
        const snap=await getDocs(collection(db,"products"));
        const out:Product[]=[];
        snap.forEach(d=>{
          const r=d.data() as RawProduct;
          if(r.inStock===false||r.available===false)return;
          if(normCat(r.category||"other")!==categoryId)return;
          out.push({
            id:d.id,name:r.name||"Product",
            store:r.storeName||r.businessName||r.vendorName||"Store",
            vendorName:r.businessName||r.storeName||r.vendorName,
            rating:typeof r.rating==="number"?r.rating:+(4+Math.random()).toFixed(1),
            price:fmtP(r.price??0),img:bestImg(r),
            category:normCat(r.category||"other"),vendorId:r.vendorId||"",
            description:r.description||"",highlights:r.highlights||"",careInfo:r.careInfo||"",
            stock:r.stock,shipping:r.shipping,
          });
        });
        setProds(out);
        if(out.length>0){
          const mx=Math.max(...out.map(p=>rawN(p.price)));
          setMaxP(mx);setFMaxP(mx);
        }
      }finally{setLoading(false);}
    })();
  },[categoryId]);

  const addProd=useCallback(async(p:Product,qty=1)=>{
    let vLat:number|undefined,vLng:number|undefined;
    if(p.vendorId){
      try{const s=await getDoc(doc(db,"vendors",p.vendorId));if(s.exists()){const d=s.data();vLat=typeof d.lat==="number"?d.lat:undefined;vLng=typeof d.lng==="number"?d.lng:undefined;}}catch{}
    }
    if((!vLat||!vLng)&&p.vendorName){
      try{
        for(const f of["businessName","storeName","displayName"]){
          const s=await getDocs(query(collection(db,"vendors"),where(f,"==",p.vendorName),limit(1)));
          if(!s.empty){const d=s.docs[0].data();vLat=typeof d.lat==="number"?d.lat:undefined;vLng=typeof d.lng==="number"?d.lng:undefined;break;}
        }
      }catch{}
    }
    for(let i=0;i<qty;i++) addToCart({name:p.name,price:`₦${p.price}`,img:p.img??FALLBACK,vendorName:p.vendorName,vendorId:p.vendorId||undefined,vendorLat:vLat,vendorLng:vLng});
  },[addToCart]);

  // Filter + sort
  const display=prods
    .filter(p=>{
      if(search&&!p.name.toLowerCase().includes(search.toLowerCase())&&!p.store.toLowerCase().includes(search.toLowerCase()))return false;
      if(fStock&&p.stock===0)return false;
      if(fRating>0&&p.rating<fRating)return false;
      if(fMaxP>0&&rawN(p.price)>fMaxP)return false;
      return true;
    })
    .sort((a,b)=>{
      if(sort==="price_low")return rawN(a.price)-rawN(b.price);
      if(sort==="price_high")return rawN(b.price)-rawN(a.price);
      if(sort==="rating")return b.rating-a.rating;
      if(sort==="name")return a.name.localeCompare(b.name);
      return 0;
    });

  const activeFilt=(fStock?1:0)+(fRating>0?1:0)+(fMaxP>0&&fMaxP<maxP?1:0);
  const clearAll=()=>{setSearch("");setFStock(false);setFRating(0);setFMaxP(maxP);};

  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Nunito',sans-serif",color:C.txt}}>

      {/* Sheet */}
      <DetailSheet product={sheet} onClose={()=>setSheet(null)} onAdd={addProd} dark={dark}/>

      {/* Sort panel */}
      {showSort&&(
        <div onClick={()=>setShowSort(false)} style={{position:"fixed",inset:0,zIndex:400,background:"rgba(0,0,0,.4)",backdropFilter:"blur(3px)"}}>
          <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:0,right:0,bottom:0,width:270,background:C.surf,borderLeft:`1.5px solid ${C.brd}`,zIndex:401,padding:24,display:"flex",flexDirection:"column",gap:8,overflowY:"auto"}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:18,fontWeight:900,color:C.txt,marginBottom:14}}>Sort by</div>
            {(Object.keys(SORT_LABELS) as SortKey[]).map(k=>(
              <button key={k} onClick={()=>{setSort(k);setShowSort(false);}}
                style={{width:"100%",padding:"12px 15px",borderRadius:12,border:`1.5px solid ${sort===k?ACCENT:C.brd}`,background:sort===k?"rgba(255,107,0,.08)":"transparent",color:sort===k?ACCENT:C.txt,fontSize:13,fontWeight:700,cursor:"pointer",textAlign:"left",fontFamily:"inherit",transition:"all .15s"}}>
                {SORT_LABELS[k]}{sort===k&&<span style={{float:"right"}}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter panel */}
      {showFilt&&(
        <div onClick={()=>setShowFilt(false)} style={{position:"fixed",inset:0,zIndex:400,background:"rgba(0,0,0,.5)",backdropFilter:"blur(4px)"}}>
          <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:0,right:0,bottom:0,width:"min(340px,90vw)",background:C.surf,borderLeft:`1.5px solid ${C.brd}`,zIndex:401,padding:24,display:"flex",flexDirection:"column",gap:20,overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:18,fontWeight:900,color:C.txt}}>Filters</div>
              <button onClick={()=>setShowFilt(false)} style={{width:34,height:34,borderRadius:9,border:`1px solid ${C.brd}`,background:C.inp,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:C.sub}}><FiX size={14}/></button>
            </div>

            {/* In stock */}
            <div>
              <div style={{fontSize:10,fontWeight:800,color:C.sub,textTransform:"uppercase",letterSpacing:".8px",marginBottom:12}}>Availability</div>
              <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
                <div onClick={()=>setFStock(v=>!v)} style={{width:42,height:24,borderRadius:12,background:fStock?ACCENT:C.brd,position:"relative",cursor:"pointer",transition:"background .2s",flexShrink:0}}>
                  <div style={{position:"absolute",top:3,left:fStock?21:3,width:18,height:18,borderRadius:"50%",background:"white",transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.3)"}}/>
                </div>
                <span style={{fontSize:13,fontWeight:600,color:C.txt}}>In stock only</span>
              </label>
            </div>

            {/* Min rating */}
            <div>
              <div style={{fontSize:10,fontWeight:800,color:C.sub,textTransform:"uppercase",letterSpacing:".8px",marginBottom:12}}>Minimum Rating</div>
              <div style={{display:"flex",gap:8}}>
                {[0,3,3.5,4,4.5].map(r=>(
                  <button key={r} onClick={()=>setFRating(r)}
                    style={{flex:1,padding:"7px 4px",borderRadius:9,border:`1.5px solid ${fRating===r?ACCENT:C.brd}`,background:fRating===r?"rgba(255,107,0,.1)":"transparent",color:fRating===r?ACCENT:C.sub,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                    {r===0?"Any":`${r}+`}
                  </button>
                ))}
              </div>
            </div>

            {/* Max price */}
            {maxP>0&&(
              <div>
                <div style={{fontSize:10,fontWeight:800,color:C.sub,textTransform:"uppercase",letterSpacing:".8px",marginBottom:8,display:"flex",justifyContent:"space-between"}}>
                  <span>Max Price</span><span style={{color:ACCENT,fontWeight:900}}>₦{fMaxP.toLocaleString()}</span>
                </div>
                <input type="range" min={0} max={maxP} step={500} value={fMaxP} onChange={e=>setFMaxP(Number(e.target.value))} style={{width:"100%",accentColor:ACCENT}}/>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.dim,marginTop:4}}>
                  <span>₦0</span><span>₦{maxP.toLocaleString()}</span>
                </div>
              </div>
            )}

            <div style={{marginTop:"auto",display:"flex",gap:10}}>
              <button onClick={()=>{setFStock(false);setFRating(0);setFMaxP(maxP);}} style={{flex:1,padding:"12px",borderRadius:12,border:`1.5px solid ${C.brd}`,background:"transparent",color:C.sub,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Reset</button>
              <button onClick={()=>setShowFilt(false)} style={{flex:2,padding:"12px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${ACCENT},#FF8C00)`,color:"white",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Banner ── */}
      <div style={{position:"relative",height:195,overflow:"hidden"}}>
        <img src={info.banner} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
        <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,rgba(0,0,0,.25) 0%,rgba(0,0,0,.72) 100%)"}}/>
        {/* back */}
        <button onClick={()=>navigate(-1)} style={{position:"absolute",top:16,left:16,width:38,height:38,borderRadius:"50%",background:"rgba(0,0,0,.5)",backdropFilter:"blur(8px)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"white"}}>
          <FiArrowLeft size={17}/>
        </button>
        {/* cart */}
        <button onClick={()=>navigate("/cart")} style={{position:"absolute",top:16,right:16,width:38,height:38,borderRadius:"50%",background:"rgba(0,0,0,.5)",backdropFilter:"blur(8px)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"white"}}>
          <FiShoppingCart size={16}/>
          {cartCount>0&&<span style={{position:"absolute",top:-3,right:-3,minWidth:14,height:14,background:ACCENT,color:"white",borderRadius:7,fontSize:8,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 2px"}}>{cartCount}</span>}
        </button>
        {/* title */}
        <div style={{position:"absolute",bottom:18,left:18,display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:46,height:46,borderRadius:13,background:`linear-gradient(135deg,${ACCENT},#FF8C00)`,display:"flex",alignItems:"center",justifyContent:"center",color:"white",flexShrink:0}}>
            {info.icon}
          </div>
          <div>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:24,fontWeight:900,color:"white",lineHeight:1.1}}>{info.label}</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.72)",fontWeight:600,marginTop:2}}>{info.desc}</div>
          </div>
        </div>
      </div>

      {/* ── Sticky toolbar ── */}
      <div style={{background:C.surf,borderBottom:`1px solid ${C.brd}`,padding:"11px 16px",display:"flex",gap:9,alignItems:"center",position:"sticky",top:0,zIndex:100}}>
        {/* search */}
        <div style={{flex:1,display:"flex",alignItems:"center",gap:8,background:C.inp,border:`1.5px solid ${C.inpbd}`,borderRadius:11,padding:"9px 12px"}}>
          <FiSearch size={13} color={C.dim}/>
          <input placeholder={`Search ${info.label.toLowerCase()}…`} value={search} onChange={e=>setSearch(e.target.value)}
            style={{flex:1,background:"transparent",border:"none",outline:"none",color:C.txt,fontSize:13,fontWeight:600,fontFamily:"'Nunito',sans-serif"}}/>
          {search&&<button onClick={()=>setSearch("")} style={{background:"none",border:"none",cursor:"pointer",color:C.dim,display:"flex"}}><FiX size={11}/></button>}
        </div>
        {/* filter */}
        <button onClick={()=>setShowFilt(true)} style={{position:"relative",width:38,height:38,borderRadius:10,background:activeFilt>0?"rgba(255,107,0,.12)":C.inp,border:`1.5px solid ${activeFilt>0?ACCENT:C.inpbd}`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:activeFilt>0?ACCENT:C.sub}}>
          <FiFilter size={14}/>
          {activeFilt>0&&<span style={{position:"absolute",top:-4,right:-4,width:14,height:14,background:ACCENT,color:"white",borderRadius:"50%",fontSize:8,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{activeFilt}</span>}
        </button>
        {/* sort */}
        <button onClick={()=>setShowSort(true)} style={{display:"flex",alignItems:"center",gap:5,height:38,padding:"0 11px",borderRadius:10,background:sort!=="default"?"rgba(255,107,0,.12)":C.inp,border:`1.5px solid ${sort!=="default"?ACCENT:C.inpbd}`,cursor:"pointer",color:sort!=="default"?ACCENT:C.sub,fontSize:12,fontWeight:700,fontFamily:"'Nunito',sans-serif",whiteSpace:"nowrap"}}>
          <FiChevronDown size={13}/>{sort!=="default"?SORT_LABELS[sort].split(":")[0]:"Sort"}
        </button>
        {/* view toggle */}
        <div style={{display:"flex",background:C.inp,border:`1.5px solid ${C.inpbd}`,borderRadius:10,overflow:"hidden"}}>
          {(["grid","list"] as ViewMode[]).map((m,i)=>(
            <button key={m} onClick={()=>setView(m)}
              style={{width:34,height:36,border:"none",background:view===m?ACCENT:"transparent",color:view===m?"white":C.sub,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s"}}>
              {m==="grid"?<FiGrid size={13}/>:<FiList size={13}/>}
            </button>
          ))}
        </div>
      </div>

      {/* Result count */}
      <div style={{padding:"10px 16px 0",fontSize:12,fontWeight:700,color:C.sub,display:"flex",alignItems:"center",gap:8}}>
        {loading?"Loading…":`${display.length} product${display.length!==1?"s":""} found`}
        {(search||activeFilt>0)&&!loading&&(
          <button onClick={clearAll} style={{color:ACCENT,background:"none",border:"none",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>Clear all ×</button>
        )}
      </div>

      {/* ── Products ── */}
      <div style={{padding:"12px 16px 100px"}}>
        {loading?(
          <div className={view==="grid"?"cp-grid":"cp-lgrid"}>
            {[1,2,3,4,5,6].map(i=>view==="grid"?<SkGrd key={i}/>:(
              <div key={i} className="cp-lc" style={{cursor:"default"}}>
                <div className="cp-li cpsk"/>
                <div className="cp-lb" style={{gap:7}}>
                  <div className="cpsk" style={{height:12,borderRadius:5,width:"70%"}}/><div className="cpsk" style={{height:9,borderRadius:5,width:"50%"}}/>
                </div>
              </div>
            ))}
          </div>
        ):display.length===0?(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"80px 20px",gap:16,textAlign:"center"}}>
            <div style={{width:80,height:80,borderRadius:24,background:"rgba(255,107,0,.08)",border:"2px dashed rgba(255,107,0,.3)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <FiPackage size={32} color={ACCENT}/>
            </div>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,color:C.txt}}>No products found</div>
            <p style={{color:C.sub,fontSize:14,maxWidth:260}}>
              {search?`No results for "${search}"`:"Nothing in this category yet. Check back soon!"}
            </p>
            {(search||activeFilt>0)&&(
              <button onClick={clearAll} style={{padding:"10px 24px",borderRadius:12,background:`linear-gradient(135deg,${ACCENT},#FF8C00)`,border:"none",color:"white",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>
                Clear filters
              </button>
            )}
          </div>
        ):(
          <div className={view==="grid"?"cp-grid":"cp-lgrid"}>
            {display.map((p,i)=>view==="grid"
              ?<GridCard key={p.id||i} p={p} onBuy={p=>addProd(p)} onOpen={p=>setSheet(p)}/>
              :<ListCard key={p.id||i} p={p} onBuy={p=>addProd(p)} onOpen={p=>setSheet(p)}/>
            )}
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Syne:wght@700;800;900&display=swap');
        :root{--cpt:${C.txt};--cps:${C.sub};--cpd:${C.dim};--cpb:${C.brd};--cpc:${C.card};}

        .cp-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
        @media(min-width:480px){.cp-grid{grid-template-columns:repeat(3,1fr);}}
        @media(min-width:768px){.cp-grid{grid-template-columns:repeat(4,1fr);gap:16px;}}
        @media(min-width:1024px){.cp-grid{grid-template-columns:repeat(5,1fr);}}

        .cp-lgrid{display:flex;flex-direction:column;gap:10px;}

        .cp-gc{background:var(--cpc);border:1.5px solid var(--cpb);border-radius:17px;overflow:hidden;cursor:pointer;transition:border-color .2s,transform .18s,box-shadow .2s;display:flex;flex-direction:column;}
        .cp-gc:hover{border-color:rgba(255,107,0,.5);transform:translateY(-3px);box-shadow:0 10px 26px rgba(255,107,0,.13);}
        .cp-gi{height:145px;overflow:hidden;background:var(--cpb);position:relative;flex-shrink:0;}
        @media(min-width:768px){.cp-gi{height:170px;}}
        .cp-lowstock{position:absolute;bottom:8px;left:8px;background:rgba(245,158,11,.9);color:white;font-size:9px;font-weight:800;padding:3px 8px;border-radius:8px;}
        .cp-soldout{position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:800;letter-spacing:.5px;}
        .cp-gb{padding:11px;display:flex;flex-direction:column;gap:4px;flex:1;}
        .cp-gn{color:var(--cpt);font-weight:800;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .cp-gs{color:var(--cpd);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

        .cp-lc{display:flex;gap:13px;background:var(--cpc);border:1.5px solid var(--cpb);border-radius:17px;overflow:hidden;cursor:pointer;transition:border-color .2s,transform .15s;}
        .cp-lc:hover{border-color:rgba(255,107,0,.4);transform:translateY(-1px);}
        .cp-li{width:100px;min-height:100px;flex-shrink:0;overflow:hidden;background:var(--cpb);}
        .cp-lb{flex:1;padding:12px 13px 12px 0;display:flex;flex-direction:column;min-width:0;}

        .cp-buy{padding:6px 12px;border-radius:9px;background:#FF6B00;border:none;color:white;font-family:'Nunito',sans-serif;font-size:11px;font-weight:800;cursor:pointer;transition:transform .15s,box-shadow .15s;flex-shrink:0;}
        .cp-buy:hover{box-shadow:0 4px 12px rgba(255,107,0,.4);transform:scale(1.06);}
        .cp-buy:active{transform:scale(.9);}
        .cp-buy:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none;}

        .cpsk{background:linear-gradient(90deg,var(--cpc) 25%,var(--cpb) 50%,var(--cpc) 75%);background-size:200% 100%;animation:cpshim 1.4s infinite;}
        @keyframes cpshim{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @keyframes cp-bk{from{opacity:0}to{opacity:1}}
        @keyframes cp-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes cp-dn{from{transform:translateY(0)}to{transform:translateY(100%)}}
      `}</style>
    </div>
  );
}