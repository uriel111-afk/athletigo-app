import React, { useState, useEffect } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

export default function TimeInput({ value, onChange, className = "" }) {
  const [minutes, setMinutes] = useState("00");
  const [seconds, setSeconds] = useState("00");

  useEffect(() => {
    if (value && typeof value === 'string' && value.includes(':')) {
      const [m, s] = value.split(':');
      setMinutes(m || "00");
      setSeconds(s || "00");
    } else {
      setMinutes("00");
      setSeconds("00");
    }
  }, [value]);

  const handleChange = (type, val) => {
    // Allow only numbers, max 2 chars
    const cleanVal = val.replace(/\D/g, '').slice(0, 2);
    
    let newM = minutes;
    let newS = seconds;

    if (type === 'minutes') {
        newM = cleanVal;
        setMinutes(cleanVal); 
    } else {
        newS = cleanVal;
        setSeconds(cleanVal);
    }
    
    // Propagate to parent immediately
    onChange(`${newM}:${newS}`);
  };

  const handleBlur = (type) => {
      let m = minutes;
      let s = seconds;
      
      if (type === 'minutes') {
          m = m.padStart(2, '0');
      } else {
          s = s.padStart(2, '0');
          if (parseInt(s) > 59) s = "59";
      }
      
      onChange(`${m}:${s}`); 
  };

  const inc = (val, max) => {
    const n = parseInt(val || "0", 10);
    return (n >= max ? 0 : n + 1).toString().padStart(2, "0");
  };
  
  const dec = (val, max) => {
    const n = parseInt(val || "0", 10);
    return (n <= 0 ? max : n - 1).toString().padStart(2, "0");
  };

  const handleBtnClick = (type, direction) => {
      let m = minutes;
      let s = seconds;
      
      if (type === 'minutes') {
          m = direction === 'up' ? inc(minutes, 99) : dec(minutes, 99);
      } else {
          s = direction === 'up' ? inc(seconds, 59) : dec(seconds, 59);
      }
      
      onChange(`${m}:${s}`);
  };

  const TimeUnit = ({ val, type, label }) => (
    <div className="flex flex-col items-center">
      <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{label}</span>
      <div className="flex flex-col items-center bg-white border border-gray-200 rounded-lg w-12 shadow-sm focus-within:ring-2 focus-within:ring-[#FF6F20] focus-within:border-[#FF6F20] transition-all">
        <button 
          type="button"
          onClick={() => handleBtnClick(type, 'up')}
          className="w-full flex justify-center text-gray-300 hover:text-[#FF6F20] active:bg-orange-50 rounded-t-lg p-0.5 transition-colors focus:outline-none"
          tabIndex={-1}
        >
          <ChevronUp size={14} strokeWidth={3} />
        </button>
        
        <input
            type="text"
            inputMode="numeric"
            value={val}
            onChange={(e) => handleChange(type, e.target.value)}
            onBlur={() => handleBlur(type)}
            onFocus={(e) => e.target.select()}
            className="w-full text-center text-sm font-black text-gray-900 font-mono py-0.5 leading-none border-none bg-transparent p-0 focus:ring-0 focus:outline-none"
        />
        
        <button 
          type="button"
          onClick={() => handleBtnClick(type, 'down')} 
          className="w-full flex justify-center text-gray-300 hover:text-[#FF6F20] active:bg-orange-50 rounded-b-lg p-0.5 transition-colors focus:outline-none"
          tabIndex={-1}
        >
          <ChevronDown size={14} strokeWidth={3} />
        </button>
      </div>
    </div>
  );

  return (
    <div className={`flex items-end justify-center gap-1.5 ${className}`} dir="ltr">
      <TimeUnit 
        val={minutes} 
        type="minutes"
        label="דקות" 
      />
      
      <div className="flex flex-col justify-end h-14 pb-3">
        <span className="text-gray-300 text-lg font-black leading-none">:</span>
      </div>

      <TimeUnit 
        val={seconds} 
        type="seconds"
        label="שניות" 
      />
    </div>
  );
}