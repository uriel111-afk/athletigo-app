import React, { useContext } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Briefcase, Coins, Sprout, User } from "lucide-react";
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
    { key: "pro",      label: "מקצועי", href: "/dashboard",    active: isPro,      Icon: Briefcase },
    { key: "fin",      label: "פיננסי", href: "/lifeos",       active: isFin,      Icon: Coins     },
    { key: "growth",   label: "צמיחה",  href: "/lifeos/leads", active: isGrowth,   Icon: Sprout    },
    { key: "personal", label: "אישי",   href: "/personal",     active: isPersonal, Icon: User      },
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
      {tabs.map(t => {
        const { Icon } = t;
        return (
          <button
            key={t.key}
            onClick={() => navigate(t.href)}
            style={{
              padding: "8px 16px",
              borderRadius: 12,
              fontSize: 13, fontWeight: t.active ? 700 : 500,
              cursor: "pointer",
              background: t.active ? "#FF6F20" : "#F6EAD9",
              color: t.active ? "#FFFFFF" : "#9A6A3A",
              borderTop: "0", borderLeft: "0", borderRight: "0",
              borderBottom: t.active ? "0" : "3px solid #E0C9A8",
              outline: "none",
              boxShadow: "none",
              transition: "background 0.15s, color 0.15s",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              lineHeight: 1,
              fontFamily: "'Rubik', system-ui, sans-serif",
            }}
          >
            <Icon size={17} aria-hidden style={{ display: "block", color: t.active ? "#FFFFFF" : "#9A6A3A" }} />
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
