// hooks/useInputSecurity.ts
// Custom hook that provides input sanitization, attack detection,
// Firestore logging, and a warning modal trigger.
//
// Usage:
//   const { sanitize, checkAndLog, showWarning, setShowWarning } = useInputSecurity();
//
//   // Just sanitize (no async, no Firestore — use for onChange):
//   onChange={e => setValue(sanitize(e.target.value))}
//
//   // Full check before saving (async — use before Firestore writes):
//   const safe = await checkAndLog(rawValue, "reviewText", "VendorDetailPage");
//   if (!safe) return; // attack detected — modal is already shown
//   await saveToFirestore(safe);
//
//   // Render the modal when showWarning is true:
//   {showWarning && <SecurityWarningModal onDismiss={() => setShowWarning(false)} />}

import { useState, useCallback } from "react";
import { db, auth } from "../firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

// ─── ATTACK PATTERNS ──────────────────────────────────────────────────────────
const ATTACK_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "XSS_SCRIPT_TAG",     pattern: /<script[\s\S]*?>[\s\S]*?<\/script>/gi },
  { name: "XSS_ON_EVENT",       pattern: /\bon\w+\s*=\s*["']?[^"'>]*/gi },
  { name: "XSS_JAVASCRIPT_URI", pattern: /javascript\s*:/gi },
  { name: "XSS_DATA_URI",       pattern: /data\s*:\s*text\s*\/\s*html/gi },
  { name: "XSS_HTML_TAG",       pattern: /<\s*(iframe|object|embed|form|input|img|svg|math|link|style|base)[^>]*>/gi },
  { name: "SQL_INJECTION",       pattern: /('|--|;|\/\*|\*\/|xp_|exec\s|union\s+select|drop\s+table|insert\s+into|delete\s+from|update\s+\w+\s+set)/gi },
  { name: "TEMPLATE_INJECTION",  pattern: /(\{\{|\}\}|<%|%>|\$\{)/g },
  { name: "PATH_TRAVERSAL",      pattern: /(\.\.[\/\\]){2,}/g },
  { name: "COMMAND_INJECTION",   pattern: /[;&|`$](\s*(ls|cat|rm|wget|curl|bash|sh|cmd|powershell|nc|nmap))/gi },
  { name: "FIRESTORE_INJECTION", pattern: /(__[\w]+__|\\u0000|\.firestore\.googleapis\.com)/gi },
];

// ─── PURE SANITIZER (no React, no async — safe to call anywhere) ──────────────
export function sanitizeInput(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .replace(/[<>"'`]/g, c => ({ "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;", "`": "&#x60;" }[c] ?? c))
    .trim()
    .slice(0, 2000);
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────
export function useInputSecurity() {
  const [showWarning, setShowWarning] = useState(false);

  // Log attack to Firestore `securityAlerts` collection
  const logAlert = useCallback(async (
    attackTypes: string[],
    rawInput: string,
    fieldName: string,
    context: string,
  ) => {
    try {
      const user = auth.currentUser;
      await addDoc(collection(db, "securityAlerts"), {
        userId:      user?.uid       ?? "anonymous",
        userEmail:   user?.email     ?? "unknown",
        displayName: user?.displayName ?? "unknown",
        attackTypes,
        rawInput:    rawInput.slice(0, 500),
        fieldName,
        context,
        userAgent:   navigator.userAgent,
        timestamp:   serverTimestamp(),
        // Super admin can set this to "blocked" or "dismissed"
        status:      "pending",
      });
    } catch (err) {
      console.warn("[useInputSecurity] Failed to log alert:", err);
    }
  }, []);

  /**
   * sanitize — strips dangerous chars. Call inline on onChange.
   * No async, no Firestore. Fast.
   */
  const sanitize = useCallback((raw: string): string => {
    return sanitizeInput(raw);
  }, []);

  /**
   * checkAndLog — runs attack detection + logs to Firestore if attack found.
   * Call this BEFORE writing any user input to Firestore.
   *
   * Returns the sanitized string if clean, or null if an attack was detected.
   * When null is returned, the warning modal is automatically shown.
   */
  const checkAndLog = useCallback(async (
    raw: string,
    fieldName: string,
    context: string,
  ): Promise<string | null> => {
    const attackTypes: string[] = [];
    for (const { name, pattern } of ATTACK_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(raw)) attackTypes.push(name);
    }

    if (attackTypes.length > 0) {
      await logAlert(attackTypes, raw, fieldName, context);
      setShowWarning(true);
      return null; // signal to caller: stop, don't save
    }

    return sanitizeInput(raw); // safe to save
  }, [logAlert]);

  return {
    sanitize,       // (raw: string) => string  — use on onChange
    checkAndLog,    // async (raw, field, context) => string | null — use before save
    showWarning,    // boolean — render <SecurityWarningModal> when true
    setShowWarning, // (v: boolean) => void — pass to modal's onDismiss
  };
}