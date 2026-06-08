import React, { useContext } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Briefcase, Coins, Sprout, User } from "lucide-react";
import { AuthContext } from "@/lib/AuthContext";
import { COACH_USER_ID } from "@/lib/lifeos/lifeos-constants";

// Tabbed bar for switching between the three top-level apps. Only
// rendered for the coach user. Active pill = orange filled; others =
// orange-outlined transparent. Sits at top of LifeOSLayout and the
// coach Dashboard.
// `wide` — opt-in larger / edge-closer variant. Coach dashboard sets
// it true so the tabs are a bigger touch target and extend further
// toward the screen edges; other consumers (LifeOSLayout /
// PersonalLayout) keep the original compact look unchanged.
export default function AppSwitcher({ wide = false }) {
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
        display: "flex", gap: wide ? 5 : 6,
        // wide → less horizontal padding so the row extends closer to
        // the screen edges on the coach dashboard. Vertical padding
        // restored to the pre-global-font balanced value (6) so the
        // tab row breathes the way the dashboard was originally tuned.
        padding: wide ? "6px 4px" : "6px 12px",
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
              // flex:1 + minWidth:0 share the row evenly across 4 tabs.
              flex: 1, minWidth: 0,
              padding: wide ? "11px 0" : "8px 0",
              borderRadius: 12,
              fontSize: wide ? 16 : 15, fontWeight: t.active ? 700 : 500,
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
              gap: wide ? 4 : 3,
              lineHeight: 1,
              fontFamily: "'Rubik', system-ui, sans-serif",
            }}
          >
            <Icon size={wide ? 19 : 17} aria-hidden style={{ display: "block", color: t.active ? "#FFFFFF" : "#9A6A3A" }} />
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
