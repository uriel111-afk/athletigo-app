import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Users, CheckCircle, XCircle, Clock, Star, Target, Calendar, BarChart3, Loader2 } from "lucide-react";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { he } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import ProtectedCoachPage from "../components/ProtectedCoachPage";

export default function ConversionDashboard() {
  const [coach, setCoach] = useState(null);
  const [timeRange, setTimeRange] = useState("month");

  useEffect(() => {
    const loadCoach = async () => {
      try {
        const currentCoach = await base44.auth.me();
        setCoach(currentCoach);
      } catch (error) {
        console.error("[ConversionDashboard] Error loading coach:", error);
      }
    };
    loadCoach();
  }, []);

  const { data: leads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      try {
        return await base44.entities.Lead.list('-created_at');
      } catch (error) {
        console.error("[ConversionDashboard] Error loading leads:", error);
        return [];
      }
    },
    initialData: [],
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    staleTime: 20000
  });

  const { data: services = [], isLoading: servicesLoading } = useQuery({
    queryKey: ['all-services'],
    queryFn: async () => {
      try {
        return await base44.entities.ClientService.list('-created_at');
      } catch (error) {
        console.error("[ConversionDashboard] Error loading services:", error);
        return [];
      }
    },
    initialData: [],
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    staleTime: 20000
  });

  const { data: trainees = [] } = useQuery({
    queryKey: ['all-trainees'],
    queryFn: async () => {
      try {
        return await base44.entities.User.filter({ role: 'user' }, '-created_at');
      } catch (error) {
        console.error("[ConversionDashboard] Error loading trainees:", error);
        return [];
      }
    },
    initialData: [],
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    staleTime: 20000
  });

  const getFilteredLeads = () => {
    const now = new Date();
    let startDate;

    switch (timeRange) {
      case "week":
        startDate = startOfWeek(now, { locale: he });
        break;
      case "month":
        startDate = startOfMonth(now);
        break;
      case "all":
        return leads;
      default:
        startDate = startOfMonth(now);
    }

    return leads.filter(lead => {
      if (!lead.created_date) return false;
      const leadDate = new Date(lead.created_date);
      return leadDate >= startDate && leadDate <= now;
    });
  };

  const filteredLeads = getFilteredLeads();
  
  const totalLeads = filteredLeads.length;
  const newLeads = filteredLeads.filter(l => l.status === 'חדש').length;
  const inContact = filteredLeads.filter(l => l.status === 'בקשר').length;
  const converted = filteredLeads.filter(l => l.status === 'סגור עסקה' || l.converted_to_client).length;
  const notInterested = filteredLeads.filter(l => l.status === 'לא מעוניין').length;
  
  const conversionRate = totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0;
  
  const sourceData = {
    "טלפוני": filteredLeads.filter(l => l.source === 'טלפוני').length,
    "אינסטגרם": filteredLeads.filter(l => l.source === 'אינסטגרם').length,
    "אתר": filteredLeads.filter(l => l.source === 'אתר').length,
    "המלצה": filteredLeads.filter(l => l.source === 'המלצה').length,
    "אחר": filteredLeads.filter(l => l.source === 'אחר').length
  };

  const statusChartData = [
    { name: 'חדש', value: newLeads, color: '#FF6F20' },
    { name: 'בקשר', value: inContact, color: '#2196F3' },
    { name: 'הומר', value: converted, color: '#4CAF50' },
    { name: 'לא מעוניין', value: notInterested, color: '#9E9E9E' }
  ].filter(item => item.value > 0);

  const sourceChartData = Object.entries(sourceData)
    .filter(([_, value]) => value > 0)
    .map(([name, value]) => ({ name, value }));

  const serviceTypesData = {
    "אימונים אישיים": services.filter(s => s.service_type === 'אימונים אישיים').length,
    "פעילות קבוצתית": services.filter(s => s.service_type === 'פעילות קבוצתית').length,
    "ליווי אונליין": services.filter(s => s.service_type === 'ליווי אונליין').length
  };

  const serviceChartData = Object.entries(serviceTypesData)
    .filter(([_, value]) => value > 0)
    .map(([name, value]) => ({ name, value }));

  const totalRevenue = services
    .filter(s => s.payment_status === 'שולם')
    .reduce((sum, s) => sum + (s.price || 0), 0);

  const activeClients = trainees.filter(t => {
    const clientServices = services.filter(s => s.trainee_id === t.id && s.status === 'פעיל');
    return clientServices.length > 0;
  }).length;

  const casualClients = trainees.filter(t => t.client_type === 'מתאמן מזדמן').length;

  const COLORS = ['#FF6F20', '#2196F3', '#4CAF50', '#9C27B0', '#FF9800'];

  if (!coach) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFFFF' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#FF6F20' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-y-auto" style={{ backgroundColor: '#FFFFFF', WebkitOverflowScrolling: 'touch' }}>
        <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
          <div className="mb-6 md:mb-10">
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-black mb-2 md:mb-4" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
              📊 דשבורד המרות
            </h1>
            <p className="text-lg md:text-2xl mb-2 md:mb-4 font-medium" style={{ color: '#7D7D7D' }}>
              ניתוח ביצועים והמרות
            </p>
            <div className="w-20 md:w-24 h-1 rounded-full" style={{ backgroundColor: '#FF6F20' }} />
          </div>

          <div className="mb-6 flex gap-3">
            {['week', 'month', 'all'].map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className="px-4 py-2 rounded-lg font-bold transition-all"
                style={{
                  backgroundColor: timeRange === range ? '#FF6F20' : '#FAFAFA',
                  color: timeRange === range ? '#FFFFFF' : '#000000',
                  border: timeRange === range ? 'none' : '1px solid #E0E0E0'
                }}
              >
                {range === 'week' && '📅 שבוע'}
                {range === 'month' && '📆 חודש'}
                {range === 'all' && '🌍 הכל'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="p-6 rounded-xl text-center relative overflow-hidden" style={{ backgroundColor: '#FFFFFF', border: '2px solid #FF6F20' }}>
              <div className="absolute top-0 right-0 left-0 h-1" style={{ backgroundColor: '#FF6F20' }} />
              <Users className="w-8 h-8 mx-auto mb-3" style={{ color: '#FF6F20' }} />
              <p className="text-3xl font-black mb-1" style={{ color: '#FF6F20' }}>{totalLeads}</p>
              <p className="text-sm font-bold" style={{ color: '#000000' }}>סה״כ לידים</p>
            </div>

            <div className="p-6 rounded-xl text-center relative overflow-hidden" style={{ backgroundColor: '#FFFFFF', border: '2px solid #4CAF50' }}>
              <div className="absolute top-0 right-0 left-0 h-1" style={{ backgroundColor: '#4CAF50' }} />
              <CheckCircle className="w-8 h-8 mx-auto mb-3" style={{ color: '#4CAF50' }} />
              <p className="text-3xl font-black mb-1" style={{ color: '#4CAF50' }}>{converted}</p>
              <p className="text-sm font-bold" style={{ color: '#000000' }}>הומרו ללקוחות</p>
            </div>

            <div className="p-6 rounded-xl text-center relative overflow-hidden" style={{ backgroundColor: '#FFFFFF', border: '2px solid #2196F3' }}>
              <div className="absolute top-0 right-0 left-0 h-1" style={{ backgroundColor: '#2196F3' }} />
              <Target className="w-8 h-8 mx-auto mb-3" style={{ color: '#2196F3' }} />
              <p className="text-3xl font-black mb-1" style={{ color: '#2196F3' }}>{conversionRate}%</p>
              <p className="text-sm font-bold" style={{ color: '#000000' }}>שיעור המרה</p>
            </div>

            <div className="p-6 rounded-xl text-center relative overflow-hidden" style={{ backgroundColor: '#FFFFFF', border: '2px solid #9C27B0' }}>
              <div className="absolute top-0 right-0 left-0 h-1" style={{ backgroundColor: '#9C27B0' }} />
              <div className="w-8 h-8 mx-auto mb-3 flex items-center justify-center text-2xl font-black" style={{ color: '#9C27B0' }}>₪</div>
              <p className="text-3xl font-black mb-1" style={{ color: '#9C27B0' }}>₪{totalRevenue.toLocaleString()}</p>
              <p className="text-sm font-bold" style={{ color: '#000000' }}>הכנסות</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="p-6 rounded-xl" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
              <h3 className="text-xl font-bold mb-6" style={{ color: '#000000' }}>
                📊 פילוח לפי סטטוס
              </h3>
              {statusChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {statusChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center py-12" style={{ color: '#7D7D7D' }}>אין נתונים להצגה</p>
              )}
            </div>

            <div className="p-6 rounded-xl" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
              <h3 className="text-xl font-bold mb-6" style={{ color: '#000000' }}>
                🎯 מקורות הגעה
              </h3>
              {sourceChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={sourceChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
                    <XAxis dataKey="name" stroke="#7D7D7D" />
                    <YAxis stroke="#7D7D7D" />
                    <Tooltip />
                    <Bar dataKey="value" fill="#FF6F20" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center py-12" style={{ color: '#7D7D7D' }}>אין נתונים להצגה</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="p-6 rounded-xl" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
              <h3 className="text-xl font-bold mb-6" style={{ color: '#000000' }}>
                💼 סוגי שירותים
              </h3>
              {serviceChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={serviceChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {serviceChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center py-12" style={{ color: '#7D7D7D' }}>אין נתונים להצגה</p>
              )}
            </div>

            <div className="p-6 rounded-xl" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
              <h3 className="text-xl font-bold mb-6" style={{ color: '#000000' }}>
                👥 סיכום לקוחות
              </h3>
              <div className="space-y-4">
                <div className="p-4 rounded-lg" style={{ backgroundColor: '#F0F9F0', border: '2px solid #4CAF50' }}>
                  <div className="flex justify-between items-center">
                    <span className="font-bold" style={{ color: '#2E7D32' }}>לקוחות פעילים</span>
                    <span className="text-2xl font-black" style={{ color: '#4CAF50' }}>{activeClients}</span>
                  </div>
                </div>
                <div className="p-4 rounded-lg" style={{ backgroundColor: '#E3F2FD', border: '2px solid #2196F3' }}>
                  <div className="flex justify-between items-center">
                    <span className="font-bold" style={{ color: '#1565C0' }}>מתאמנים מזדמנים</span>
                    <span className="text-2xl font-black" style={{ color: '#2196F3' }}>{casualClients}</span>
                  </div>
                </div>
                <div className="p-4 rounded-lg" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
                  <div className="flex justify-between items-center">
                    <span className="font-bold" style={{ color: '#E65F1D' }}>סה״כ לקוחות</span>
                    <span className="text-2xl font-black" style={{ color: '#FF6F20' }}>{trainees.length}</span>
                  </div>
                </div>
                <div className="p-4 rounded-lg" style={{ backgroundColor: '#F3E5F5', border: '2px solid #9C27B0' }}>
                  <div className="flex justify-between items-center">
                    <span className="font-bold" style={{ color: '#6A1B9A' }}>שירותים פעילים</span>
                    <span className="text-2xl font-black" style={{ color: '#9C27B0' }}>{services.filter(s => s.status === 'פעיל').length}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-6 rounded-xl" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
              <Star className="w-8 h-8 mb-3" style={{ color: '#FF6F20' }} />
              <p className="text-2xl font-black mb-1" style={{ color: '#FF6F20' }}>{newLeads}</p>
              <p className="text-sm font-bold" style={{ color: '#000000' }}>לידים חדשים</p>
            </div>

            <div className="p-6 rounded-xl" style={{ backgroundColor: '#E3F2FD', border: '2px solid #2196F3' }}>
              <Clock className="w-8 h-8 mb-3" style={{ color: '#2196F3' }} />
              <p className="text-2xl font-black mb-1" style={{ color: '#2196F3' }}>{inContact}</p>
              <p className="text-sm font-bold" style={{ color: '#000000' }}>בקשר כעת</p>
            </div>

            <div className="p-6 rounded-xl" style={{ backgroundColor: '#F5F5F5', border: '2px solid #9E9E9E' }}>
              <XCircle className="w-8 h-8 mb-3" style={{ color: '#9E9E9E' }} />
              <p className="text-2xl font-black mb-1" style={{ color: '#9E9E9E' }}>{notInterested}</p>
              <p className="text-sm font-bold" style={{ color: '#000000' }}>לא מעוניינים</p>
            </div>
          </div>
        </div>
      </div>
  );
}