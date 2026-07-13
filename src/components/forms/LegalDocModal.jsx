import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { getLegalDoc } from '@/content/legal';

// Scrollable reader for a legal document (privacy / terms / photo /
// health). Portal overlay so it sits above onboarding + dialogs.
// Title, comfortable scroll, close button, last-updated at the bottom.
export default function LegalDocModal({ docKey, open, onClose }) {
  if (!open) return null;
  if (typeof document === 'undefined' || !document.body) return null;
  const doc = getLegalDoc(docKey);
  if (!doc) return null;

  const node = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 12000,
        background: 'rgba(15,23,42,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
        style={{
          width: '100%', maxWidth: 560, maxHeight: '88vh',
          background: '#FFFFFF', borderRadius: 18, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.22)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid var(--ag-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: '#FFFFFF',
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ag-text)' }}>{doc.title}</div>
          <button type="button" onClick={onClose} aria-label="סגור"
            style={{ width: 34, height: 34, borderRadius: 999, border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ padding: '16px 18px', overflowY: 'auto', flex: 1, lineHeight: 1.75 }}>
          {doc.isPlaceholder && doc.intro && (
            <div style={{
              background: '#FFF7ED', border: '1px solid #FED7AA', color: '#9A3412',
              borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 16,
            }}>
              {doc.intro}
            </div>
          )}
          {(doc.sections || []).map((s, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              {s.heading && (
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ag-text)', marginBottom: 6 }}>{s.heading}</div>
              )}
              <div style={{ fontSize: 14, color: '#374151', whiteSpace: 'pre-wrap' }}>{s.body}</div>
            </div>
          ))}
        </div>

        {/* Footer — last updated + version */}
        <div style={{
          padding: '10px 18px', borderTop: '1px solid var(--ag-border)',
          fontSize: 12, color: 'var(--ag-text-soft)', textAlign: 'center', background: '#FAFAFA',
        }}>
          עודכן לאחרונה: {doc.lastUpdated} · גרסה {doc.version}
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
