import React from 'react';
import { MapPin, Clock, DollarSign, FileText } from 'lucide-react';
import CardOpen from '@/components/ui/Card3Levels/CardOpen';

// Level 2 — inline expanded session view. A compressed summary
// (location, duration, price, public note) plus the "פרטים מלאים"
// CTA that escalates to SessionDetailDialog. Coach-only fields
// (coach_private_notes, payment_status framing) are not surfaced
// here — that's Level 3's job.

export default function SessionCardOpen({
  isOpen,
  session,
  onOpenDetail,
}) {
  if (!isOpen) return null;

  const location = session?.location;
  const duration = session?.duration;
  const price = Number(session?.price) || 0;
  const notes = session?.notes;

  return (
    <CardOpen
      isOpen={isOpen}
      onOpenDetail={onOpenDetail}
      detailLabel="פרטים מלאים"
    >
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        fontSize: 14, color: '#1A1A1A',
      }}>
        {location && (
          <Row icon={<MapPin size={16} color="#888" aria-hidden />}>
            {location}
          </Row>
        )}
        {duration && (
          <Row icon={<Clock size={16} color="#888" aria-hidden />}>
            {duration} דקות
          </Row>
        )}
        {price > 0 && (
          <Row icon={<DollarSign size={16} color="#888" aria-hidden />}>
            {price}₪
          </Row>
        )}
        {notes && (
          <Row icon={<FileText size={16} color="#888" aria-hidden />}>
            <span style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'inline-block',
              maxWidth: '100%',
            }}>
              {notes}
            </span>
          </Row>
        )}
        {!location && !duration && price <= 0 && !notes && (
          <div style={{ color: '#888', fontSize: 13 }}>
            אין פרטים נוספים — לחץ "פרטים מלאים" לעריכה.
          </div>
        )}
      </div>
    </CardOpen>
  );
}

function Row({ icon, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ flexShrink: 0, display: 'inline-flex' }}>{icon}</span>
      <span style={{ minWidth: 0, flex: 1 }}>{children}</span>
    </div>
  );
}
