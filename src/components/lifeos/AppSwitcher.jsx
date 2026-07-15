import React, { useContext } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Briefcase, Coins, Sprout, HeartHandshake, Clapperboard } from "lucide-react";
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
  const isContent  = path.startsWith("/content");

  const tabs = [
    { key: "pro",      label: "מקצועי", href: "/dashboard",    active: isPro,      Icon: Briefcase,     iconColor: "#7F47B5" },
    { key: "fin",      label: "פיננסי", href: "/lifeos/finance-dashboard", active: isFin,      Icon: Coins,     iconColor: "#16a34a" },
    { key: "growth",   label: "לידים",  href: "/lifeos/leads", active: isGrowth,   Icon: Sprout,    iconColor: "#FF6F20" },
    { key: "personal", label: "אישי",   href: "/personal",     active: isPersonal, Icon: HeartHandshake, iconColor: "#3B82F6" },
    { key: "content",  label: "תוכן",   href: "/content",      active: isContent,  Icon: Clapperboard, iconColor: "#B48A08" },
  ];

  return (
    <div
      dir="rtl"
      className="ag-tabrow-scroll"
      style={{
        display: "flex", gap: wide ? 5 : 6,
        // wide → less horizontal padding so the row extends closer to
        // the screen edges on the coach dashboard.
        padding: wide ? "4px 4px" : "6px 12px",
        background: "transparent",
        // The 5 tabs grow to fill the row evenly when there's room and
        // scroll horizontally (snap) when the screen is too narrow to
        // fit them all. Scrollbar hidden via .ag-tabrow-scroll.
        overflowX: "auto",
        scrollSnapType: "x proximity",
        width: "100%",
        // Never let a parent flex column (e.g. the coach Dashboard's
        // flex:1 / space-between column) VERTICALLY compress this row.
        // When a minimized timer bar grows the page-container's bottom
        // padding, the content box shrinks by 74px; without
        // flexShrink:0 the flex parent absorbs that loss by squeezing
        // this tab row, misaligning the icon-over-label tabs. Pinning
        // shrink to 0 keeps the row's height invariant to the bar.
        flexShrink: 0,
        flexWrap: "nowrap",
      }}
    >
      {tabs.map(t => {
        const { Icon } = t;
        return (
          <button
            key={t.key}
            onClick={() => navigate(t.href)}
            style={{
              // Non-wide: grow to fill, never shrink below 64px (scroll
              // on very narrow rows). Wide (coach dashboard): shrink to
              // fit so all 5 tabs always fit the row width — no
              // horizontal overflow that would clip the active (orange)
              // tab at the right edge.
              flex: wide ? "1 1 0" : "1 0 auto",
              minWidth: wide ? 0 : 64,
              scrollSnapAlign: "start",
              // Trim vertical padding in wide mode to compress the
              // dashboard's top rhythm; still a comfortable tap target.
              padding: wide ? "9px 6px" : "12px 8px",
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
              justifyContent: "center",
              gap: wide ? 4 : 3,
              lineHeight: 1,
              fontFamily: "'Rubik', system-ui, sans-serif",
            }}
          >
            <Icon size={wide ? 19 : 17} aria-hidden style={{ display: "block", color: t.active ? "#FFFFFF" : t.iconColor, pointerEvents: "none" }} />
            <span style={{ pointerEvents: "none" }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
