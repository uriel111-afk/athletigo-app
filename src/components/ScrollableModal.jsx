export default function ScrollableModal({ open, onClose, title, footer, children }) {
  if (!open) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        direction: "rtl",
      }}
    >
      <div style={{
        background: "#fff",
        borderRadius: "16px 16px 0 0",
        width: "100%",
        maxWidth: 480,
        maxHeight: "90vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        {title && (
          <div style={{ flexShrink: 0, padding: "16px 16px 12px", borderBottom: "0.5px solid #f0f0f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#1a1a1a" }}>{title}</div>
              {onClose && (
                <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 26, cursor: "pointer", color: "#999", lineHeight: 1, padding: "0 4px" }}>×</button>
              )}
            </div>
          </div>
        )}

        {/* Scrollable body */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          padding: 16,
          minHeight: 0,
        }}>
          {children}
        </div>

        {/* Fixed footer */}
        {footer && (
          <div style={{
            flexShrink: 0,
            padding: "12px 16px",
            borderTop: "0.5px solid #f0f0f0",
            background: "#fff",
            paddingBottom: "max(env(safe-area-inset-bottom), 12px)",
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
