import React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { Activity, TrendingUp, Calendar, Timer } from "lucide-react";

export default function BaselineSection({ results }) {
  // Filter only baseline records
  const baselineResults = results
    .filter(r => r.record_type === 'baseline_jump_rope')
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (baselineResults.length === 0) return null;

  const chartData = baselineResults.map(r => ({
    date: format(new Date(r.date), 'dd/MM'),
    fullDate: format(new Date(r.date), 'dd/MM/yyyy'),
    score: r.record_value || 0,
    raw: r
  }));

  const latestTest = baselineResults[baselineResults.length - 1];
  const latestData = latestTest.baseline_data || {};

  return (
    <div className="mb-10 w-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-orange-100 rounded-lg">
            <Activity className="w-6 h-6 text-[#FF6F20]" />
        </div>
        <h2 className="text-2xl md:text-3xl font-black" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
          Baseline Jump Rope
        </h2>
      </div>

      {/* Graph */}
      <div className="athletigo-card p-6 mb-6">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[#FF6F20]" />
          גרף התקדמות (JPS)
        </h3>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
              <XAxis dataKey="date" stroke="#7D7D7D" style={{ fontSize: '12px' }} />
              <YAxis stroke="#7D7D7D" style={{ fontSize: '12px' }} domain={['auto', 'auto']} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: '8px' }}
                labelStyle={{ color: '#000000', fontWeight: 'bold' }}
                formatter={(value) => [`${value} JPS`, 'ציון כללי']}
              />
              <Line 
                type="monotone" 
                dataKey="score" 
                stroke="#FF6F20" 
                strokeWidth={3} 
                dot={{ fill: '#FF6F20', r: 6 }}
                activeDot={{ r: 8 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Latest Test Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="athletigo-card p-6 bg-[#FFF8F3] border-2 border-[#FF6F20]">
            <h3 className="text-lg font-bold mb-4 text-[#FF6F20]">תוצאה אחרונה</h3>
            <div className="flex justify-between items-end">
                <div>
                    <p className="text-sm text-gray-600 mb-1">תאריך: {format(new Date(latestTest.date), 'dd/MM/yyyy')}</p>
                    <p className="text-4xl font-black text-[#000]">{latestTest.record_value}</p>
                    <p className="text-sm font-bold text-gray-500">קפיצות לשנייה (JPS)</p>
                </div>
                <div className="text-right">
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                        <Timer className="w-4 h-4" />
                        <span>עבודה: {latestData.techniques?.basic?.workTime || "00:30"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Activity className="w-4 h-4" />
                        <span>3 סבבים לטכניקה</span>
                    </div>
                </div>
            </div>
        </div>

        {/* History List (Compact) */}
        <div className="athletigo-card p-6 max-h-[300px] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">היסטוריית מבחנים</h3>
            <div className="space-y-3">
                {baselineResults.slice().reverse().map(test => (
                    <div key={test.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="flex items-center gap-3">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <div>
                                <p className="text-sm font-bold text-gray-800">{format(new Date(test.date), 'dd/MM/yyyy')}</p>
                                <p className="text-xs text-gray-500">{test.baseline_data?.test_time || '00:00'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="text-right">
                                <p className="text-sm font-black text-[#FF6F20]">{test.record_value}</p>
                                <p className="text-[10px] text-gray-400 font-bold">JPS</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
}