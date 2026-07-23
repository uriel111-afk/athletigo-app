import React from 'react';
import { versionLabel } from '@/lib/appVersion';

// Small grey build stamp: 'גרסה a1b2c3 · 23.07 14:05'.
export default function VersionStamp({ style = {} }) {
  return (
    <div
      dir="rtl"
      style={{
        fontSize: 11, color: '#9ca3af', textAlign: 'center',
        letterSpacing: 0.2, fontFamily: "'Rubik', system-ui, sans-serif",
        ...style,
      }}
    >
      {versionLabel()}
    </div>
  );
}
