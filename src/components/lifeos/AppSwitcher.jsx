import React, { useContext } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "@/lib/AuthContext";
import { COACH_USER_ID } from "@/lib/lifeos/lifeos-constants";

// Tabbed bar for switching between the three top-level apps. Only
// rendered for the coach user. Active pill = orange filled; others =
// orange-outlined transparent. Sits at top of LifeOSLayout and the
// coach Dashboard.
export default function AppSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  if (!user || user.id !== COACH_USER_ID) return null;

  const path = location.pathname || "";
  const isPersonal = path.startsWith("/personal");
  const isPro      = path === "/" || path === "/dashboard";
  const isGrowth   = path.startsWith("/lifeos/leads")
                  || path.startsWith("/lifeos/content")
                  || path.startsWith("/lifeos/community");
  const isFin      = path.startsWith("/lifeos") && !isGrowth;

  const tabs = [
    { key: "pro",      label: "מקצועי", href: "/dashboard",    active: isPro },
    { key: "fin",      label: "פיננסי", href: "/lifeos",       active: isFin },
    { key: "growth",   label: "צמיחה",  href: "/lifeos/leads", active: isGrowth },
    { key: "personal", label: "אישי",   href: "/personal",     active: isPersonal },
  ];

  return (
    <div
      dir="rtl"
      style={{
        display: "flex", gap: 6,
        padding: "6px 12px",
        background: "transparent",
      }}
    >
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => navigate(t.href)}
          style={{
            height: 36,
            padding: "0 16px",
            borderRadius: 18,
            fontSize: 12, fontWeight: 500,
            cursor: "pointer",
            background: t.active ? "#FF6F20" : "transparent",
            color: t.active ? "#FFFFFF" : "#FF6F20",
            border: t.active ? "1px solid #FF6F20" : "1px solid #FF6F20",
            transition: "background 0.15s, color 0.15s",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
