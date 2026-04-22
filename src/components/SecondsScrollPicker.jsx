// Horizontal scroll picker for quick seconds selection.
// Sits below an existing number input — both keep working.

const DEFAULT_OPTIONS = [5, 10, 15, 20, 25, 30, 40, 45, 60, 75, 90, 120, 180, 240, 300];

export default function SecondsScrollPicker({ value, onChange, options = DEFAULT_OPTIONS }) {
  return (
    <div
      className="seconds-scroll-picker"
      style={{
        display: 'flex',
        overflowX: 'auto',
        gap: '8px',
        padding: '8px 4px',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <style>{`.seconds-scroll-picker::-webkit-scrollbar { display: none; }`}</style>
      {options.map(sec => {
        const active = value === sec;
        return (
          <button
            key={sec}
            onClick={() => onChange(sec)}
            style={{
              minWidth: '54px',
              height: '44px',
              borderRadius: '12px',
              border: active ? '2px solid #FF6F20' : '1px solid #E5E5E5',
              background: active ? '#FF6F20' : '#FFFFFF',
              color: active ? '#FFFFFF' : '#1a1a1a',
              fontSize: '16px',
              fontWeight: 600,
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'all 0.15s',
            }}
          >
            {sec}
          </button>
        );
      })}
    </div>
  );
}
