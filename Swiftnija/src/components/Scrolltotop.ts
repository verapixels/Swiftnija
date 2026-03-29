// components/ScrollToTop.tsx
// Resets scroll position to top on every route change.
// Place <ScrollToTop /> once inside <Router> in App.tsx (or inside App itself).

import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Reset the window scroll
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });

    // Also reset any scrollable containers that might hold position
    // (catches cases where content is inside a div with overflow:auto/scroll)
    document.querySelectorAll<HTMLElement>(
      "[style*='overflow-y'], [style*='overflow: auto'], [style*='overflow: scroll']"
    ).forEach(el => {
      el.scrollTop = 0;
    });
  }, [pathname]);

  return null;
}