import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Calendar,
  Users,
  TrendingUp,
  PieChart as PieChartIcon,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Download,
  Loader2,
  User
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { safeFetch } from "@/functions/GlobalErrorHandler";
import { useFinancialStats } from "../components/hooks/useFinancialStats";
import ProtectedCoachPage from "../components/ProtectedCoachPage";
import { Label } from "@/components/ui/label";
import { QUERY_KEYS } from "@/components/utils/queryKeys";

export default function FinancialOverview() {
  const urlParams = new URLSearchParams(window.location.search);
  const traineeIdFromUrl = urlParams.get('traineeId');

  const [searchTerm, setSearchTerm] = useState("");
  const serviceTypeFromUrl = urlParams.get('serviceType');
  const paymentStatusFromUrl = urlParams.get('paymentStatus');
  const [filterServiceType, setFilterServiceType] = useState(serviceTypeFromUrl || "all");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState(paymentStatusFromUrl || "all");
  const [filterTrainee, setFilterTrainee] = useState(traineeIdFromUrl || "all");
  const initialPeriod = urlParams.get('period');
  
  // Initialize dates if period is current_month
  const getInitialDateFrom = () => {
      if (initialPeriod === 'current_month') {
          const now = new Date();
          return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      }
      return "";
  };
  const getInitialDateTo = () => {
      if (initialPeriod === 'current_month') {
          const now = new Date();
          return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      }
      return "";
  };

  const [dateFrom, setDateFrom] = useState(getInitialDateFrom());
  const [dateTo, setDateTo] = useState(getInitialDateTo());
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");

  // 1. Get Strictly Calculated Stats from Shared Hook
  const {
    totalRevenue,
    monthlyRevenue,
    monthOverMonthChange,
    isLoading: statsLoading
  } = useFinancialStats();

  // Debug Log (Required)
  console.log("FINANCIALOVERVIEW_monthlyRevenue", monthlyRevenue);

  // 2. Fetch ALL services for the Table (List View)
  // We do this separately so we can show Pending/Partial items in the table
  const { data: allServices = [], isLoading: listLoading } = useQuery({
    queryKey: QUERY_KEYS.SERVICES,
    queryFn: async () => {
      return await safeFetch(
        base44.entities.ClientService.list('-payment_date', 2000),
        { fallback: [], context: 'Financial List' }
      );
    },
    initialData: [],
    refetchInterval: 30000
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users-financial'],
    queryFn: async () => {
      const allUsers = await safeFetch(
        base44.entities.User.list('-created_at', 2000),
        { fallback: [], context: 'Financial users' }
      );
      return allUsers.filter(u => u.role === 'user');
    },
    initialData: []
  });

  // Calculate Pending Revenue Locally for display (Visual only)
  const pendingRevenue = allServices
    .filter(s => s.payment_status === 'ממתין לתשלום' && s.price)
    .reduce((sum, s) => sum + s.price, 0);

  const activePayingClients = new Set(
    allServices
      .filter(s => s.status === 'פעיל' && s.payment_status === 'שולם')
      .map(s => s.trainee_id)
  ).size;

  // Chart Data based on actual paid services from the list
  const serviceTypeBreakdown = {
    "אימונים אישיים": 0,
    "פעילות קבוצתית": 0,
    "ליווי אונליין": 0
  };

  allServices
    .filter(s => s.payment_status === 'שולם' && s.price)
    .forEach(s => {
      if (serviceTypeBreakdown[s.service_type] !== undefined) {
        serviceTypeBreakdown[s.service_type] += s.price;
      }
    });

  const totalPaid = Object.values(serviceTypeBreakdown).reduce((sum, val) => sum + val, 0);

  const chartData = Object.entries(serviceTypeBreakdown).map(([type, revenue]) => ({
    name: type,
    revenue: revenue,
    percentage: totalPaid > 0 ? ((revenue / totalPaid) * 100).toFixed(1) : 0
  }));

  const CHART_COLORS = {
    "אימונים אישיים": "#FF6F20",
    "פעילות קבוצתית": "#7D7D7D",
    "ליווי אונליין": "#1E1E1E"
  };

  const detailedServices = useMemo(() => {
    let tempServices = allServices.filter(s => s.price);

    // Filter by trainee
    if (filterTrainee !== "all") {
      tempServices = tempServices.filter(s => s.trainee_id === filterTrainee);
    }

    // Filter by service type (supports both Hebrew values and shorthand from dashboard)
    if (filterServiceType !== "all") {
      tempServices = tempServices.filter(s => {
        const st = (s.service_type || "").toLowerCase();
        if (filterServiceType === "personal") return st.includes("אישי") || st.includes("personal");
        if (filterServiceType === "group") return st.includes("קבוצ") || st.includes("group");
        if (filterServiceType === "online") return st === "אונליין" || st.includes("online");
        return s.service_type === filterServiceType;
      });
    }

    // Filter by payment status (supports "renewals" shorthand from dashboard)
    if (filterPaymentStatus !== "all") {
      if (filterPaymentStatus === "renewals") {
        const now = new Date();
        const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        tempServices = tempServices.filter(s => {
          const endDate = s.next_billing_date || s.end_date;
          if (!endDate) return false;
          const d = new Date(endDate);
          return d >= now && d <= in30Days;
        });
      } else {
        tempServices = tempServices.filter(s => s.payment_status === filterPaymentStatus);
      }
    }

    // Filter by date range
    if (dateFrom) {
      tempServices = tempServices.filter(s => {
        const serviceDate = new Date(s.payment_date || s.start_date);
        return serviceDate >= new Date(dateFrom);
      });
    }

    if (dateTo) {
      tempServices = tempServices.filter(s => {
        const serviceDate = new Date(s.payment_date || s.start_date);
        return serviceDate <= new Date(dateTo);
      });
    }

    // Search filter
    if (searchTerm) {
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      tempServices = tempServices.filter(s =>
        s.trainee_name?.toLowerCase().includes(lowerCaseSearchTerm) ||
        s.package_name?.toLowerCase().includes(lowerCaseSearchTerm)
      );
    }

    // Sort
    tempServices.sort((a, b) => {
      let comparison = 0;
      if (sortBy === "date") {
        const dateA = new Date(a.payment_date || a.start_date || 0);
        const dateB = new Date(b.payment_date || b.start_date || 0);
        comparison = dateA.getTime() - dateB.getTime();
      } else if (sortBy === "price") {
        comparison = (a.price || 0) - (b.price || 0);
      } else if (sortBy === "type") {
        comparison = a.service_type.localeCompare(b.service_type, 'he');
      }

      return sortOrder === "desc" ? -comparison : comparison;
    });

    return tempServices;
  }, [allServices, filterServiceType, filterPaymentStatus, filterTrainee, dateFrom, dateTo, searchTerm, sortBy, sortOrder]);

  const selectedTrainee = filterTrainee !== "all" ? users.find(u => u.id === filterTrainee) : null;

  const handleExportCSV = () => {
    if (detailedServices.length === 0) {
      alert("אין נתונים לייצוא");
      return;
    }

    const headers = ["שם מתאמן", "סוג שירות", "שם חבילה", "מחיר", "תאריך תשלום", "סטטוס"];
    const csvContent = [
      headers.join(","),
      ...detailedServices.map(s => [
        s.trainee_name || "",
        s.service_type || "",
        s.package_name || "",
        s.price || 0,
        s.payment_date || s.start_date || "",
        s.payment_status || ""
      ].map(f => `"${f}"`).join(","))
    ].join("\n");

    const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `financial_report_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <ProtectedCoachPage>
      <div className="min-h-screen w-full overflow-x-hidden" style={{ backgroundColor: '#FFFFFF' }}>
        <div className="max-w-7xl mx-auto px-4 py-6 md:px-6 md:py-8 w-full">
          <div className="mb-8">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-4xl md:text-5xl font-bold mb-3" style={{ color: '#000000' }}>
                  סיכום כספי
                </h1>
                {selectedTrainee ? (
                  <p className="text-xl flex items-center gap-2" style={{ color: '#FF6F20' }}>
                    <User className="w-5 h-5" />
                    מתאמן: {selectedTrainee.full_name}
                  </p>
                ) : (
                  <p className="text-xl" style={{ color: '#7D7D7D' }}>
                    סקירת הכנסות ורווחיות מהשירותים
                  </p>
                )}
              </div>
              <Button onClick={handleExportCSV} className="gap-2" variant="outline">
                <Download className="w-4 h-4" />
                ייצוא CSV
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-8 w-full">
            <div className="p-6 rounded-xl relative overflow-hidden" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
              <div className="absolute top-0 right-0 w-full h-1" style={{ backgroundColor: '#FF6F20' }} />
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm mb-2" style={{ color: '#7D7D7D' }}>סה״כ הכנסות</p>
                  <p className="text-3xl font-bold" style={{ color: '#000000' }}>
                    {statsLoading ? <Loader2 className="animate-spin inline" /> : `₪${totalRevenue.toLocaleString()}`}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-black" style={{ backgroundColor: '#FFF8F3', color: '#FF6F20' }}>
                  ₪
                </div>
              </div>
              <p className="text-xs" style={{ color: '#7D7D7D' }}>
                מכל התשלומים שהתקבלו
              </p>
            </div>

            <div className="p-6 rounded-xl relative overflow-hidden" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
              <div className="absolute top-0 right-0 w-full h-1" style={{ backgroundColor: '#4CAF50' }} />
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm mb-2" style={{ color: '#7D7D7D' }}>הכנסות החודש</p>
                  <p className="text-3xl font-bold" style={{ color: '#000000' }}>
                    {statsLoading ? <Loader2 className="animate-spin inline" /> : `₪${monthlyRevenue.toLocaleString()}`}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#F0F9F0' }}>
                  <Calendar className="w-6 h-6" style={{ color: '#4CAF50' }} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                {monthOverMonthChange > 0 ? (
                  <>
                    <ArrowUpRight className="w-4 h-4" style={{ color: '#4CAF50' }} />
                    <p className="text-xs font-bold" style={{ color: '#4CAF50' }}>
                      +{monthOverMonthChange}% מהחודש הקודם
                    </p>
                  </>
                ) : monthOverMonthChange < 0 ? (
                  <>
                    <ArrowDownRight className="w-4 h-4" style={{ color: '#f44336' }} />
                    <p className="text-xs font-bold" style={{ color: '#f44336' }}>
                      {monthOverMonthChange}% מהחודש הקודם
                    </p>
                  </>
                ) : (
                  <p className="text-xs" style={{ color: '#7D7D7D' }}>ללא שינוי מהחודש הקודם</p>
                )}
              </div>
            </div>

            <div className="p-6 rounded-xl relative overflow-hidden" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
              <div className="absolute top-0 right-0 w-full h-1" style={{ backgroundColor: '#2196F3' }} />
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm mb-2" style={{ color: '#7D7D7D' }}>לקוחות משלמים</p>
                  <p className="text-3xl font-bold" style={{ color: '#000000' }}>
                    {activePayingClients}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#E3F2FD' }}>
                  <Users className="w-6 h-6" style={{ color: '#2196F3' }} />
                </div>
              </div>
              <p className="text-xs" style={{ color: '#7D7D7D' }}>
                לקוחות פעילים עם תשלום מלא
              </p>
            </div>

            <div className="p-6 rounded-xl relative overflow-hidden" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
              <div className="absolute top-0 right-0 w-full h-1" style={{ backgroundColor: '#FFA726' }} />
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm mb-2" style={{ color: '#7D7D7D' }}>הכנסות ממתינות</p>
                  <p className="text-3xl font-bold" style={{ color: '#000000' }}>
                    ₪{pendingRevenue.toLocaleString()}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#FFF3E0' }}>
                  <TrendingUp className="w-6 h-6" style={{ color: '#FFA726' }} />
                </div>
              </div>
              <p className="text-xs" style={{ color: '#7D7D7D' }}>
                תשלומים שממתינים לאישור
              </p>
            </div>
          </div>

          {/* ... Rest of the file (Charts and Table) ... 
              Keeping the existing table logic but using detailedServices which is derived from allServices
          */}
          
          <div className="mb-8 p-8 rounded-xl" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
            <div className="flex items-center gap-3 mb-6">
              <PieChartIcon className="w-6 h-6" style={{ color: '#FF6F20' }} />
              <h2 className="text-2xl font-bold" style={{ color: '#000000' }}>
                פילוח הכנסות לפי סוג שירות
              </h2>
            </div>

            {totalPaid === 0 ? (
              <div className="p-12 text-center">
                <p className="text-lg" style={{ color: '#7D7D7D' }}>
                  אין עדיין הכנסות לתצוגה
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
                    <XAxis
                      dataKey="name"
                      stroke="#000000"
                      style={{ fontSize: '14px', fontWeight: 'bold' }}
                    />
                    <YAxis
                      stroke="#000000"
                      style={{ fontSize: '14px' }}
                      tickFormatter={(value) => `₪${value.toLocaleString()}`}
                    />
                    <Tooltip
                      formatter={(value) => [`₪${value.toLocaleString()}`, 'הכנסות']}
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E0E0E0',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="revenue" radius={[8, 8, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[entry.name]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.entries(serviceTypeBreakdown).map(([type, revenue]) => {
                    const percentage = totalPaid > 0 ? ((revenue / totalPaid) * 100).toFixed(1) : 0;
                    return (
                      <div
                        key={type}
                        className="p-5 rounded-xl"
                        style={{
                          backgroundColor: '#FAFAFA',
                          borderRight: `4px solid ${CHART_COLORS[type]}`
                        }}
                      >
                        <p className="text-sm mb-2 font-bold" style={{ color: '#7D7D7D' }}>
                          {type}
                        </p>
                        <p className="text-2xl font-bold mb-2" style={{ color: '#000000' }}>
                          ₪{revenue.toLocaleString()}
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#E0E0E0' }}>
                            <div
                              className="h-full transition-all"
                              style={{
                                width: `${percentage}%`,
                                backgroundColor: CHART_COLORS[type]
                              }}
                            />
                          </div>
                          <span className="text-sm font-bold" style={{ color: CHART_COLORS[type] }}>
                            {percentage}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="p-4 md:p-8 rounded-xl w-full" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
            <div className="flex flex-col gap-4 mb-6 w-full">
              <h2 className="text-xl md:text-2xl font-bold" style={{ color: '#000000' }}>
                פירוט תשלומים
              </h2>

              <div className="flex flex-col gap-3 w-full">
                <div className="w-full">
                  <Input
                    type="text"
                    placeholder="חפש מתאמן או חבילה..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="rounded-xl w-full"
                    style={{ border: '1px solid #E0E0E0' }}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
                  {!traineeIdFromUrl && (
                    <Select value={filterTrainee} onValueChange={setFilterTrainee}>
                      <SelectTrigger className="rounded-xl w-full" style={{ border: '1px solid #E0E0E0' }}>
                        <SelectValue placeholder="כל המתאמנים" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">כל המתאמנים</SelectItem>
                        {users.map(user => (
                          <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <Select value={filterServiceType} onValueChange={setFilterServiceType}>
                    <SelectTrigger className="rounded-xl w-full" style={{ border: '1px solid #E0E0E0' }}>
                      <SelectValue placeholder="סנן לפי סוג" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">כל סוגי השירות</SelectItem>
                      <SelectItem value="אימונים אישיים">🧍‍♂️ אישי</SelectItem>
                      <SelectItem value="פעילות קבוצתית">👥 קבוצתי</SelectItem>
                      <SelectItem value="ליווי אונליין">💻 אונליין</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={filterPaymentStatus} onValueChange={setFilterPaymentStatus}>
                    <SelectTrigger className="rounded-xl w-full" style={{ border: '1px solid #E0E0E0' }}>
                      <SelectValue placeholder="סטטוס" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">כל הסטטוסים</SelectItem>
                      <SelectItem value="שולם">שולם</SelectItem>
                      <SelectItem value="ממתין לתשלום">ממתין</SelectItem>
                      <SelectItem value="תשלום חלקי">חלקי</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3 w-full">
                  <div>
                    <Label className="text-xs font-medium mb-1 block" style={{ color: '#7D7D7D' }}>מתאריך</Label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="rounded-xl w-full"
                      style={{ border: '1px solid #E0E0E0' }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium mb-1 block" style={{ color: '#7D7D7D' }}>עד תאריך</Label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="rounded-xl w-full"
                      style={{ border: '1px solid #E0E0E0' }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 w-full">
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="rounded-xl w-full" style={{ border: '1px solid #E0E0E0' }}>
                      <SelectValue placeholder="מיין" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">תאריך</SelectItem>
                      <SelectItem value="price">מחיר</SelectItem>
                      <SelectItem value="type">סוג</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={sortOrder} onValueChange={setSortOrder}>
                    <SelectTrigger className="rounded-xl w-full" style={{ border: '1px solid #E0E0E0' }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">גבוה לנמוך</SelectItem>
                      <SelectItem value="asc">נמוך לגבוה</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(dateFrom || dateTo || filterTrainee !== "all" || filterServiceType !== "all" || filterPaymentStatus !== "all" || searchTerm) && (
                  <Button
                    onClick={() => {
                      setDateFrom("");
                      setDateTo("");
                      setFilterTrainee(traineeIdFromUrl || "all");
                      setFilterServiceType("all");
                      setFilterPaymentStatus("all");
                      setSearchTerm("");
                    }}
                    variant="outline"
                    className="w-full rounded-xl py-2 text-sm font-medium"
                    style={{ border: '1px solid #E0E0E0', color: '#7D7D7D' }}
                  >
                    נקה פילטרים
                  </Button>
                )}
              </div>
            </div>

            {listLoading ? (
              <div className="p-12 text-center flex justify-center items-center">
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#E0E0E0' }} />
                <p className="text-lg ml-2" style={{ color: '#7D7D7D' }}>
                  טוען נתונים...
                </p>
              </div>
            ) : detailedServices.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-4xl mb-4">₪</div>
                <p className="text-lg" style={{ color: '#7D7D7D' }}>
                  אין תשלומים לתצוגה
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '2px solid #E0E0E0' }}>
                      <th className="text-right p-4 text-sm font-bold" style={{ color: '#7D7D7D' }}>שם מתאמן</th>
                      <th className="text-right p-4 text-sm font-bold" style={{ color: '#7D7D7D' }}>סוג שירות</th>
                      <th className="text-right p-4 text-sm font-bold" style={{ color: '#7D7D7D' }}>שם חבילה</th>
                      <th className="text-right p-4 text-sm font-bold" style={{ color: '#7D7D7D' }}>מחיר</th>
                      <th className="text-right p-4 text-sm font-bold" style={{ color: '#7D7D7D' }}>תאריך תשלום</th>
                      <th className="text-right p-4 text-sm font-bold" style={{ color: '#7D7D7D' }}>סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailedServices.map((service) => (
                      <tr key={service.id} style={{ borderBottom: '1px solid #E0E0E0' }}>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white"
                              style={{ backgroundColor: '#FF6F20' }}
                            >
                              {service.trainee_name?.[0] || 'U'}
                            </div>
                            <span className="font-bold" style={{ color: '#000000' }}>
                              {service.trainee_name}
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
                          <span
                            className="px-3 py-1 rounded-lg text-sm font-bold"
                            style={{
                              backgroundColor: '#FAFAFA',
                              color: CHART_COLORS[service.service_type] || '#7D7D7D'
                            }}
                          >
                            {service.service_type}
                          </span>
                        </td>
                        <td className="p-4" style={{ color: '#000000' }}>
                          {service.package_name || '-'}
                        </td>
                        <td className="p-4">
                          <span className="font-bold text-lg" style={{ color: '#000000' }}>
                            ₪{service.price?.toLocaleString() || '0'}
                          </span>
                        </td>
                        <td className="p-4" style={{ color: '#7D7D7D' }}>
                          {service.payment_date
                            ? format(new Date(service.payment_date), 'dd/MM/yyyy', { locale: he })
                            : service.start_date
                              ? format(new Date(service.start_date), 'dd/MM/yyyy', { locale: he })
                              : '-'
                          }
                        </td>
                        <td className="p-4">
                          <span
                            className="px-3 py-1 rounded-lg text-xs font-bold"
                            style={{
                              backgroundColor:
                                service.payment_status === 'שולם' ? '#E8F5E9' :
                                service.payment_status === 'ממתין לתשלום' ? '#FFF3E0' : '#EEEEEE',
                              color:
                                service.payment_status === 'שולם' ? '#2E7D32' :
                                service.payment_status === 'ממתין לתשלום' ? '#F57C00' : '#666'
                            }}
                          >
                            {service.payment_status === 'שולם' ? '✓ שולם' :
                             service.payment_status === 'ממתין לתשלום' ? '⏰ ממתין' :
                             service.payment_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {detailedServices.length > 0 && (
              <div className="mt-6 pt-6" style={{ borderTop: '2px solid #E0E0E0' }}>
                <div className="flex justify-between items-center">
                  <p className="text-lg font-bold" style={{ color: '#7D7D7D' }}>
                    סה״כ בטבלה:
                  </p>
                  <p className="text-2xl font-bold" style={{ color: '#FF6F20' }}>
                    ₪{detailedServices.reduce((sum, s) => sum + (s.price || 0), 0).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
          </div>

          {totalRevenue > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 rounded-xl" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
                <h3 className="text-lg font-bold mb-3" style={{ color: '#FF6F20' }}>
                  🏆 השירות הרווחי ביותר
                </h3>
                <p className="text-2xl font-bold mb-2" style={{ color: '#000000' }}>
                  {chartData.sort((a, b) => b.revenue - a.revenue)[0]?.name}
                </p>
                <p className="text-base" style={{ color: '#7D7D7D' }}>
                  ₪{chartData.sort((a, b) => b.revenue - a.revenue)[0]?.revenue.toLocaleString()}
                  <span className="font-bold" style={{ color: '#FF6F20' }}>
                    {' '}({chartData.sort((a, b) => b.revenue - a.revenue)[0]?.percentage}%)
                  </span>
                </p>
              </div>

              <div className="p-6 rounded-xl" style={{ backgroundColor: '#F0F9F0', border: '2px solid #4CAF50' }}>
                <h3 className="text-lg font-bold mb-3" style={{ color: '#4CAF50' }}>
                  💵 מחיר חבילה ממוצע
                </h3>
                <p className="text-2xl font-bold mb-2" style={{ color: '#000000' }}>
                  ₪{allServices.filter(s => s.price).length > 0
                    ? Math.round(allServices.filter(s => s.price).reduce((sum, s) => sum + (s.price || 0), 0) / allServices.filter(s => s.price).length).toLocaleString()
                    : 0
                  }
                </p>
                <p className="text-base" style={{ color: '#7D7D7D' }}>
                  על פני {allServices.filter(s => s.price).length} חבילות
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedCoachPage>
  );
}