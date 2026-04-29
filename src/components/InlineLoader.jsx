import React from 'react';

// Per-section loader — sits inside a tab body while that tab's
// query is in-flight. Pairs with the lazy `enabled: activeTab === ...`
// query pattern: the tab mounts instantly with this loader, then
// swaps to real content once the data arrives. The CSS keyframes
// it depends on (`loading-bar`) live in index.html so the animation
// works from the very first render without a CSS module roundtrip.

export default function InlineLoader({ message = 'טוען...' }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        direction: 'rtl',
        fontFamily: "'Heebo', 'Assistant', sans-serif",
      }}
    >
      <img
        src="/logoR.png"
        alt=""
        aria-hidden
        style={{
          width: 50,
          filter: 'brightness(0)',
          opacity: 0.3,
          marginBottom: 12,
        }}
      />
      <div
        style={{
          width: 120,
          height: 3,
          background: '#F0E4D0',
          borderRadius: 2,
          overflow: 'hidden',
          marginBottom: 8,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '40%',
            height: '100%',
            background: '#FF6F20',
            borderRadius: 2,
            animation: 'loading-bar 1.2s ease-in-out infinite',
          }}
        />
      </div>
      <div style={{ fontSize: 13, color: '#888' }}>{message}</div>
    </div>
  );
}
