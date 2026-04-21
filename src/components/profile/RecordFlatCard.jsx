export function RecordFlatCard({ record, onClick }) {
  return (
    <div
      onClick={() => onClick(record)}
      style={{
        background: '#FFF9F0',
        border: '1px solid #FFE5D0',
        borderRight: '3px solid #FF6F20',
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: '#1a1a1a', fontSize: 15, marginBottom: 4 }}>
          🏆 {record.name}
        </div>
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          {new Date(record.date).toLocaleDateString('he-IL')}
          {record.notes && ` · ${record.notes}`}
        </div>
      </div>
      <div style={{ color: '#FF6F20', fontWeight: 700, fontSize: 16, flexShrink: 0, marginRight: 10 }}>
        {record.value} {record.unit ?? ''}
      </div>
    </div>
  );
}

export default RecordFlatCard;
