export function DraftBanner({ onContinue, onDiscard }) {
  return (
    <div style={{
      background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 8,
      padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', direction: 'rtl',
    }}>
      <span style={{ color: '#92400E', fontWeight: 500, fontSize: 14 }}>
        מצאתי טיוטה. להמשיך?
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onContinue} style={{
          padding: '6px 14px', background: '#FF6F20', color: 'white',
          border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13,
        }}>המשך</button>
        <button onClick={onDiscard} style={{
          padding: '6px 14px', background: 'transparent', color: '#92400E',
          border: '1px solid #F59E0B', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13,
        }}>התחל מחדש</button>
      </div>
    </div>
  );
}
