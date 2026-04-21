import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function PersonalRecordViewer({ record, onClose }) {
  if (!record) return null;
  const dateStr = record.date ? new Date(record.date).toLocaleDateString('he-IL') : '—';
  const role = record.created_by_role === 'coach' ? 'המאמן' : 'המתאמן';

  return (
    <Dialog open={!!record} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm" style={{ background: '#FFF9F0', border: '2px solid #FF6F20', borderRadius: 14 }}>
        <DialogHeader>
          <DialogTitle style={{ color: '#FF6F20', fontWeight: 700, fontSize: 18 }}>
            🏆 {record.name}
          </DialogTitle>
        </DialogHeader>

        <div dir="rtl" style={{ background: '#FFFFFF', border: '1px solid #FFE5D0', borderRadius: 10, padding: 14 }}>
          <Row label="ערך">
            <strong style={{ color: '#FF6F20', fontSize: 20 }}>
              {record.value} {record.unit ?? ''}
            </strong>
          </Row>
          <Row label="תאריך">{dateStr}</Row>
          <Row label="סוג">{record.record_type || 'שיא אישי'}</Row>
          {record.notes && <Row label="הערות">{record.notes}</Row>}
          <Row label="נוצר על ידי">{role}</Row>
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: 12, width: '100%', padding: 12,
            background: '#FF6F20', color: '#FFFFFF',
            border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer',
          }}
        >
          סגור
        </button>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #FFE5D0', fontSize: 14, color: '#1a1a1a' }}>
      <span style={{ color: '#6b7280', minWidth: 80 }}>{label}:</span>
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  );
}

export default PersonalRecordViewer;
