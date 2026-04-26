import React, { useState, useEffect, useRef, useMemo } from "react";

// Client onboarding status — drives the badge color, the
// change-status dialog, and the permissions/package side-effects
// when the coach flips a trainee between states. Keys must match
// the values written into users.client_status by AddTraineeDialog
// and PackageFormDialog (see commit c2939ba for the casual pipeline).
const CLIENT_STATUS_OPTIONS = [
  { key: 'casual',    label: 'מזדמן',  badgeBg: '#FFF3E5', badgeFg: '#92400E', borderColor: '#FCD9B6', icon: '⏳',
    description: 'גישה מוגבלת, בלי קיזוז חבילות. מתאים למתאמן שעדיין לא רכש חבילה.' },
  { key: 'active',    label: 'פעיל',   badgeBg: '#E8F5E9', badgeFg: '#15803D', borderColor: '#BBE5C0', icon: '✓',
    description: 'גישה מלאה לכל התכנים, קיזוז חבילות פעיל.' },
  { key: 'suspended', label: 'מושהה',  badgeBg: '#F3F4F6', badgeFg: '#4B5563', borderColor: '#D1D5DB', icon: '⏸',
    description: 'הקפאת חבילה, אין גישה לתכנים. ניתן להחזיר לפעיל בכל שלב.' },
  { key: 'former',    label: 'לשעבר',  badgeBg: '#FEE2E2', badgeFg: '#B91C1C', borderColor: '#FCA5A5', icon: '×',
    description: 'ארכיון. המתאמן לא יוצג ברשימה הראשית כברירת מחדל.' },
];

const STATUS_BY_KEY = Object.fromEntries(
  CLIENT_STATUS_OPTIONS.map((s) => [s.key, s])
);

// Permissions per status — active is fully open, casual keeps only
// messaging, suspended/former lock everything down.
const PERMS_BY_STATUS = {
  active:    { view_baseline: true,  view_training_plan: true,  view_progress: true,  view_documents: true,  edit_metrics: true,  send_videos: true,  send_messages: true,  view_plan: true,  view_records: true },
  casual:    { view_baseline: false, view_training_plan: false, view_progress: false, view_documents: false, edit_metrics: false, send_videos: false, send_messages: true,  view_plan: false, view_records: false },
  suspended: { view_baseline: false, view_training_plan: false, view_progress: false, view_documents: false, edit_metrics: false, send_videos: false, send_messages: false, view_plan: false, view_records: false },
  former:    { view_baseline: false, view_training_plan: false, view_progress: false, view_documents: false, edit_metrics: false, send_videos: false, send_messages: false, view_plan: false, view_records: false },
};

import { useFormDraft } from "@/hooks/useFormDraft";
import { useKeepScreenAwake } from "@/hooks/useKeepScreenAwake";
import { DraftBanner } from "@/components/DraftBanner";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Edit2, User, Mail, Phone, MapPin, Heart, Award, TrendingUp, Package, Plus, Loader2, Camera, Target, CheckCircle, Calendar, Shield, Trash2, FileText, MessageSquare, Activity, ChevronDown, ChevronUp, ChevronLeft, Folder, FolderOpen, DollarSign, Lock, LogOut, Zap, Eye, Clock, Bell } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { QUERY_KEYS, invalidateDashboard } from "@/components/utils/queryKeys";
import { syncPackageStatus } from "@/lib/packageStatus";
import PhysicalMetricsManager from "../components/PhysicalMetricsManager";
import MessageCenter from "../components/MessageCenter";
import GoalFormDialog from "../components/forms/GoalFormDialog";
import ResultFormDialog from "../components/forms/ResultFormDialog";
import VisionFormDialog from "../components/forms/VisionFormDialog";
import { Checkbox } from "@/components/ui/checkbox";
import ErrorBoundary from "@/components/ErrorBoundary";
import PageLoader from "@/components/PageLoader";
import DocumentSigningTab from "@/components/DocumentSigningTab";
import { TraineeDocumentUpload } from "@/components/profile/TraineeDocumentUpload";
import DocumentPickerDialog from "@/components/forms/DocumentPickerDialog";
import TraineeNotificationsTab from "@/components/profile/TraineeNotificationsTab";
import { openBaselineDialog } from "@/components/forms/BaselineFormDialog";
import SessionFormDialog from "@/components/forms/SessionFormDialog";
import { notifySessionScheduled } from "@/functions/notificationTriggers";
import MiniTimerBar from "@/components/MiniTimerBar";
import BaselineDetailView from "@/components/BaselineDetailView";
import { notifySessionApproved, notifySessionRejected, notifySessionCompleted, notifyPlanCreated } from "@/functions/notificationTriggers";
import PlanFormDialog from "@/components/training/PlanFormDialog";
import ProgressTab from "@/components/profile/ProgressTab";
import { FOCUS_LABELS } from "@/lib/sectionTypes";
import { useTraineePermissions } from "@/hooks/useTraineePermissions";

const PAYMENT_METHODS = [
  { value: 'cash',        label: 'מזומן',          icon: '💵' },
  { value: 'bank',        label: 'העברה בנקאית',   icon: '🏦' },
  { value: 'transfer',    label: 'העברה',           icon: '🏦' },
  { value: 'credit',      label: 'כרטיס אשראי',    icon: '💳' },
  { value: 'standing_order', label: 'הוראת קבע',   icon: '🔄' },
  { value: 'bit',         label: 'ביט',             icon: '📱' },
  { value: 'paybox',      label: 'פייבוקס',         icon: '📲' },
  { value: 'apple_pay',   label: 'Apple Pay',       icon: '🍎' },
  { value: 'google_pay',  label: 'Google Pay',      icon: '🔵' },
  { value: 'paypal',      label: 'PayPal',          icon: '🅿️' },
  { value: 'other',       label: 'אחר',             icon: '💬' },
];

const getPaymentLabel = (val) => {
  const pm = PAYMENT_METHODS.find(p => p.value === val);
  return pm ? `${pm.icon} ${pm.label}` : val || '';
};

const MOTIVATION = [
  'כל חזרה היא הצעד הבא לשליטה',
  'הגוף שלך הוא הכלי, התנועה היא השפה',
  'משמעת היא חופש',
  'אין קיצורי דרך, יש רק הדרך',
  'כשהגוף אומר לעצור, הראש מחליט להמשיך',
  'כל אימון הוא השקעה בעצמך',
  'הכוח האמיתי מתחיל כשהרצון נגמר',
  'תנועה היא חיים',
  'השיפור מגיע מהעקביות, לא מהשלמות',
  'אתה מסוגל ליותר ממה שאתה חושב',
  'הדרך לפסגה מתחילה בצעד אחד',
  'כל יום הוא הזדמנות חדשה להיות חזק יותר',
  'אל תשווה את עצמך לאחרים, רק לעצמך של אתמול',
  'הכאב הוא זמני, הגאווה היא לנצח',
  'אין אימון גרוע, יש רק אימון שלא עשית',
  'הגוף משיג את מה שהמוח מאמין',
  'השקט שאחרי אימון קשה — זה השלום האמיתי',
  'בנה את הגוף שלך כמו שבונים בניין — קומה אחרי קומה',
  'כל טיפת זיעה מקרבת אותך למטרה',
  'תהליך ההתקדמות הוא לא ישר, אבל הוא תמיד קדימה',
  'הכוח לא בא מהיכולת, הוא בא מהרצון',
  'שלוט בתנועה, תשלוט בחיים',
  'אל תפחד מאימון קשה, תפחד מלהישאר באותו מקום',
  'ההצלחה שלך נמדדת בעקביות, לא במזל',
  'תרגל כאילו אתה מתמודד, התמודד כאילו אתה מתרגל',
  'כושר זה לא יעד, זה דרך חיים',
  'גם כשלא בא לך — זה הרגע הכי חשוב לבוא',
  'הגוף שלך יודע להודות לך על כל אימון',
  'מי שממשיך גם כשקשה — הוא זה שמנצח',
  'היום אתה יותר חזק מאתמול, ומחר תהיה חזק מהיום',
];

const AchievementItem = ({ result, relatedGoal, onEdit, onDelete }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm transition-all hover:shadow-md">
      {/* Collapsed Header - Click to toggle */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="p-4 flex items-center justify-between cursor-pointer bg-white hover:bg-gray-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-bold text-base text-gray-900 truncate">{result.title}</h4>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {format(new Date(result.date), 'dd/MM/yy')}
            </span>
            {result.record_value && (
              <span className="font-bold text-[#FF6F20] bg-orange-50 px-2 py-0.5 rounded-full text-[10px] md:text-xs">
                {result.record_value} {result.record_unit}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
           {isOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </div>
      </div>

      {/* Expanded Content */}
      {isOpen && (
        <div className="px-4 pb-4 pt-0 bg-gray-50 border-t border-gray-100">
           <div className="pt-3 space-y-3">
              {/* Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                 {result.skill_or_exercise && (
                    <div>
                      <span className="text-gray-500 text-xs block mb-0.5">תרגיל / מיומנות</span>
                      <span className="font-medium text-gray-800">{result.skill_or_exercise}</span>
                    </div>
                 )}
                 {result.context && (
                    <div>
                      <span className="text-gray-500 text-xs block mb-0.5">הקשר</span>
                      <span className="font-medium text-gray-800">{result.context}</span>
                    </div>
                 )}
                 {result.effort_level && (
                    <div>
                      <span className="text-gray-500 text-xs block mb-0.5">רמת מאמץ</span>
                      <span className="font-medium text-gray-800">{result.effort_level}/10</span>
                    </div>
                 )}
                 {result.assistance && (
                    <div>
                      <span className="text-gray-500 text-xs block mb-0.5">עזרה / ציוד</span>
                      <span className="font-medium text-gray-800">{result.assistance}</span>
                    </div>
                 )}
              </div>

              {/* Description / Notes */}
              {result.description && (
                <div className="bg-white p-3 rounded-lg border border-gray-200">
                  <span className="text-gray-500 text-xs block mb-1">הערות / תיאור</span>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{result.description}</p>
                </div>
              )}

              {/* Related Goal */}
              {relatedGoal && (
                <div className="flex items-center gap-2 mt-2">
                   <span className="text-xs font-bold px-2 py-1 rounded-full bg-[#E8F5E9] text-[#2E7D32] border border-[#C8E6C9] flex items-center gap-1">
                      <Target className="w-3 h-3" />
                      יעד מקושר: {relatedGoal.goal_name}
                   </span>
                </div>
              )}

              {/* Actions Toolbar - Moved to bottom of expanded view for mobile access */}
              <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-gray-200">
                <Button onClick={(e) => { e.stopPropagation(); onEdit(result); }} size="sm" variant="ghost" className="h-8 px-3 text-[#FF6F20] hover:bg-orange-50 rounded-lg flex items-center gap-1 text-xs">
                  <Edit2 className="w-3 h-3" /> ערוך
                </Button>
                <Button onClick={(e) => { e.stopPropagation(); if (window.confirm(`למחוק "${result.title}"?`)) onDelete(result.id); }} size="sm" variant="ghost" className="h-8 px-3 text-red-500 hover:bg-red-50 rounded-lg flex items-center gap-1 text-xs">
                  <Trash2 className="w-3 h-3" /> מחק
                </Button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const BaselineCard = ({ result, onEdit, onDelete }) => {
  // Parse description: "147 קפיצות, ממוצע 49, 3 סיבובים × 30 שניות"
  const desc = result.description || '';
  const technique = result.title?.replace('Baseline - ', '') || 'Basic';
  const techColors = { Basic: '#FF6F20', 'Foot Switch': '#2196F3', 'High Knees': '#4CAF50' };
  const color = techColors[technique] || '#FF6F20';

  return (
    <div className="rounded-xl bg-white border-2 shadow-sm overflow-hidden" style={{ borderColor: color + '40' }}>
      {/* Orange header strip */}
      <div className="flex items-center gap-2 px-3 py-1.5" style={{ backgroundColor: color + '10' }}>
        <Activity className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-[11px] font-black tracking-wider" style={{ color }}>BASELINE</span>
      </div>
      <div className="p-3">
        <div className="flex justify-between items-start mb-2">
          <div className="text-right">
            <h4 className="font-bold text-base text-gray-900">{technique}</h4>
            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
              <Calendar className="w-3 h-3" />
              {format(new Date(result.date), 'dd/MM/yy')}
            </p>
          </div>
          <div className="text-left flex-shrink-0">
            <span className="text-2xl font-black" style={{ color }}>{result.record_value}</span>
            <span className="text-xs font-bold text-gray-400 block">JPS</span>
          </div>
        </div>
        {desc && <p className="text-xs text-gray-500 text-right mb-2">{desc}</p>}
        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
          <button onClick={() => onEdit(result)} className="text-xs font-bold text-[#FF6F20] hover:underline flex items-center gap-1">
            <Eye className="w-3 h-3" />צפייה בפרטים
          </button>
          <Button onClick={(e) => { e.stopPropagation(); if (window.confirm(`למחוק "${result.title}"?`)) onDelete(result.id); }}
            size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-600 hover:bg-red-50 text-xs">
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
};

const MiniSparkline = ({ data, color = '#FF6F20' }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80, h = 32;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg width={w} height={h} style={{ flexShrink: 0 }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const AchievementGroup = ({ type, results, goals, onEdit, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const count = results.length;
  const isBaseline = type === 'בייסליין';

  // Build sparkline data from record values
  const sparkData = results
    .filter(r => r.record_value || r.baseline_score)
    .map(r => parseFloat(r.record_value || r.baseline_score) || 0)
    .reverse(); // oldest first for left→right trend

  return (
    <div className="mb-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
       {/* Group Header */}
       <button
         onClick={() => setIsExpanded(!isExpanded)}
         className="w-full flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl shadow-sm hover:bg-gray-50 transition-all group"
       >
         <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isExpanded ? (isBaseline ? 'bg-orange-100 text-[#FF6F20]' : 'bg-orange-100 text-[#FF6F20]') : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'}`}>
               {isBaseline ? <Zap className="w-5 h-5" /> : (isExpanded ? <FolderOpen className="w-5 h-5" /> : <Folder className="w-5 h-5" />)}
            </div>
            <div className="text-right">
               <h3 className="font-bold text-sm md:text-base text-gray-900">{type || 'כללי / אחר'}</h3>
               <p className="text-xs text-gray-500">{count} {isBaseline ? 'מדידות' : 'הישגים'}</p>
            </div>
         </div>
         <div className="flex items-center gap-3">
            <MiniSparkline data={sparkData} />
            <div className="text-gray-400 group-hover:text-gray-600">
              {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
         </div>
       </button>

       {/* Group Content */}
       {isExpanded && (
         <div className="mt-3 space-y-2 px-1 md:px-2">
            {results.map(result => (
              result.category === 'baseline' ? (
                <BaselineCard key={result.id} result={result} onEdit={onEdit} onDelete={onDelete} />
              ) : (
                <AchievementItem
                  key={result.id}
                  result={result}
                  relatedGoal={goals.find(g => g.id === result.related_goal_id)}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              )
            ))}
         </div>
       )}
    </div>
  );
};

function PackageLinkedSessions({ pkg, allSessions, isCoach, typeColor, onUseSession, onRefundSession }) {
  const [expanded, setExpanded] = useState(false);
  const linked = useMemo(() => {
    if (!pkg?.id || !Array.isArray(allSessions)) return [];
    return allSessions
      .filter(s => s.service_id === pkg.id && s.was_deducted === true)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [pkg?.id, allSessions]);

  const sessionTypeLabel = (t) => {
    if (!t) return '';
    if (t.includes('אישי') || t === 'personal') return 'אישי';
    if (t.includes('קבוצ') || t === 'group') return 'קבוצתי';
    if (t.includes('אונליין') || t === 'online') return 'אונליין';
    return t;
  };

  return (
    <div className="px-4 pb-3" onClick={(e) => e.stopPropagation()}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          marginTop: 8, padding: '8px 12px', background: '#FFFFFF',
          border: '1px solid #FFE5D0', borderRadius: 8, cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        <span style={{ color: '#1a1a1a', fontWeight: 600, fontSize: 13 }}>
          מפגשים מקושרים ({linked.length})
        </span>
        <span style={{ color: '#FF6F20', fontSize: 14 }}>{expanded ? '▼' : '▸'}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 8 }}>
          {linked.length === 0 ? (
            <div style={{ padding: 12, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
              אין מפגשים מקושרים עדיין
            </div>
          ) : (
            linked.map((s) => {
              const dateStr = s.date ? format(new Date(s.date), 'dd/MM/yy') : '—';
              const timeStr = (s.time || s.start_time || '').slice(0, 5);
              return (
                <div
                  key={s.id}
                  style={{
                    padding: '8px 12px', background: '#FFF9F0', borderRight: `3px solid ${typeColor || '#FF6F20'}`,
                    borderRadius: 6, marginTop: 6, display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', fontSize: 13, color: '#1a1a1a', flexWrap: 'wrap', gap: 6,
                  }}
                >
                  <div>
                    <strong>{dateStr}</strong>
                    {timeStr && <> · {timeStr}</>}
                    {s.session_type && <> · {sessionTypeLabel(s.session_type)}</>}
                  </div>
                  <span style={{
                    background: '#16a34a', color: '#FFFFFF', padding: '2px 8px',
                    borderRadius: 4, fontSize: 11, fontWeight: 600,
                  }}>
                    ✓ הושלם
                  </span>
                </div>
              );
            })
          )}

          {isCoach && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8, paddingTop: 10, borderTop: '1px solid #FFE5D0' }}>
              <button
                onClick={onUseSession}
                style={{
                  flex: 1, padding: '8px 12px', background: '#FFFFFF', color: '#FF6F20',
                  border: '1px solid #FF6F20', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >− הורד יתרה</button>
              <button
                onClick={onRefundSession}
                style={{
                  flex: 1, padding: '8px 12px', background: '#FFFFFF', color: '#FF6F20',
                  border: '1px solid #FF6F20', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >+ החזר יתרה</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TraineeProfile() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'personal';
  });
  const [showEdit, setShowEdit] = useState(false);
  const [showHealthUpdate, setShowHealthUpdate] = useState(false);
  const [showVisionDialog, setShowVisionDialog] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [showAddResult, setShowAddResult] = useState(false);
  const [editingResult, setEditingResult] = useState(null);
  // BaselineFormDialog mounts globally in App.jsx — opened via
  // openBaselineDialog({ traineeId, traineeName }).
  const [showBaselineDetail, setShowBaselineDetail] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  // Coach-only: reset trainee password via Edge Function
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetPwInput, setResetPwInput] = useState('');
  const [resetPwGenerated, setResetPwGenerated] = useState('');
  const [resetPwSaving, setResetPwSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPass: "", newPass: "", confirm: "" });
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [showAddService, setShowAddService] = useState(false);
  const [editingService, setEditingService] = useState(null);
  // Schedules a future session — mirrors the Dashboard's "קבע מפגש"
  // flow (uses SessionFormDialog + status 'ממתין לאישור' + notify).
  const [showAddSession, setShowAddSession] = useState(false);
  const [savingNewSession, setSavingNewSession] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [showEditSession, setShowEditSession] = useState(false);
  const [editingUsage, setEditingUsage] = useState(null); // service ID being edited
  const [usageValue, setUsageValue] = useState("");
  const [deductDialog, setDeductDialog] = useState(null);
  const [selectedPackageHistory, setSelectedPackageHistory] = useState(null);
  const [packageSessions, setPackageSessions] = useState([]);
  const [packageSessionsLoading, setPackageSessionsLoading] = useState(false);
  // Manual session→package linking inside the package history dialog
  const [showLinkSession, setShowLinkSession] = useState(false);
  const [unlinkedSessions, setUnlinkedSessions] = useState([]);
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [showDocPicker, setShowDocPicker] = useState(false);

  const [serviceForm, setServiceForm] = useState({
    service_type: "personal", // personal | group | online
    group_name: "",
    billing_model: "punch_card", // subscription | punch_card | single
    sessions_per_week: "",
    package_name: "",
    base_price: "",
    discount_type: "none",
    discount_value: 0,
    final_price: "",
    payment_method: "credit",
    start_date: new Date().toISOString().split('T')[0],
    end_date: "",
    next_billing_date: "",
    total_sessions: "",
    payment_status: "שולם",
    payment_note: "",
    notes_internal: "",
    status: "active"
  });

  const [formData, setFormData] = useState({
    full_name: "", email: "", phone: "", birth_date: "", age: "", gender: "",
    address: "", city: "", main_goal: "", current_status: "", future_vision: "",
    health_issues: "", medical_history: "", emergency_contact_name: "",
    emergency_contact_phone: "", profile_image: "", sport_background: "",
    fitness_level: "", training_goals: "", training_frequency: "",
    preferred_training_style: "", notes: "", coach_notes: "", bio: "",
    status: "",
  });

  // healthForm is provided by useFormDraft below (after effectiveUser is defined)

  const [goalForm, setGoalForm] = useState({
    goal_name: "",
    description: "",
    target_value: "",
    current_value: "",
    unit: "",
    target_date: "",
    status: "בתהליך"
  });

  const [resultForm, setResultForm] = useState({
    date: new Date().toISOString().split('T')[0],
    title: "",
    description: "",
    related_goal_id: ""
  });

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userIdParam = searchParams.get("userId");

  // Status-change dialog. Coach taps the badge → menu opens →
  // picks a target status → confirm dialog with description →
  // confirm runs the update side-effects (perms + package
  // freeze/unfreeze) and closes.
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState(null);
  const [statusSaving, setStatusSaving] = useState(false);

  const { data: currentUser, refetch, isLoading: currentUserLoading, isError: currentUserError } = useQuery({
    queryKey: ['current-user-trainee-profile'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch (error) {
        console.error('[TraineeProfile] Error fetching current user:', error);
        throw error;
      }
    },
    staleTime: 60000,
    retry: false
  });

  const isCoach = currentUser?.is_coach === true || currentUser?.role === 'coach' || currentUser?.role === 'admin';

  const { data: targetUser, isLoading: targetUserLoading, isError: targetUserError } = useQuery({
    queryKey: ['target-user-profile', userIdParam],
    queryFn: async () => {
      try {
        if (!userIdParam) return null;
        const res = await base44.entities.User.filter({ id: userIdParam });
        return res?.[0] || null;
      } catch (error) {
        console.error('[TraineeProfile] Error fetching target user:', error);
        throw error;
      }
    },
    enabled: !!userIdParam && !!isCoach,
    staleTime: 60000,
    retry: false
  });

  const effectiveUser = (userIdParam && isCoach) ? targetUser : currentUser;
  const profileLoading = currentUserLoading || targetUserLoading;
  const profileError = currentUserError || targetUserError;
  const noUserFound = !profileLoading && !effectiveUser;

  // Sync server user to local state — but NEVER while edit dialog is open (would reset form fields)
  const effectiveUserId = effectiveUser?.id;
  const editDraftKey = effectiveUserId ? `athletigo_draft_TraineeDetailsEdit_${effectiveUserId}` : null;

  // Restore draft when edit dialog opens — overlays any saved draft over the
  // server-synced defaults so users never lose unsaved edits, even if the
  // dialog was closed seconds after typing.
  useEffect(() => {
    if (!showEdit || !editDraftKey) return;
    try {
      const raw = localStorage.getItem(editDraftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?._draftData && typeof parsed._draftData === 'object') {
        setFormData(prev => ({ ...prev, ...parsed._draftData }));
      }
    } catch {}
  }, [showEdit, editDraftKey]);

  // Instant draft save — every formData change writes immediately, no debounce.
  useEffect(() => {
    if (!showEdit || !editDraftKey) return;
    try {
      localStorage.setItem(editDraftKey, JSON.stringify({ _draftData: formData, _savedAt: new Date().toISOString() }));
    } catch {}
  }, [formData, showEdit, editDraftKey]);
  useEffect(() => {
    if (effectiveUser && !showEdit) {
      setUser(effectiveUser);
      setFormData({
        full_name: effectiveUser.full_name || "",
        email: effectiveUser.email || "",
        phone: effectiveUser.phone || "",
        birth_date: effectiveUser.birth_date ? format(new Date(effectiveUser.birth_date), 'yyyy-MM-dd') : "",
        age: effectiveUser.age || "",
        gender: effectiveUser.gender || "",
        address: effectiveUser.address || "",
        city: effectiveUser.city || "",
        main_goal: effectiveUser.main_goal || "",
        current_status: effectiveUser.current_status || "",
        future_vision: effectiveUser.future_vision || "",
        health_issues: effectiveUser.health_issues || "",
        medical_history: effectiveUser.medical_history || "",
        emergency_contact_name: effectiveUser.emergency_contact_name || "",
        emergency_contact_phone: effectiveUser.emergency_contact_phone || "",
        profile_image: effectiveUser.profile_image || "",
        sport_background: effectiveUser.sport_background || "",
        fitness_level: effectiveUser.fitness_level || "",
        training_goals: effectiveUser.training_goals || "",
        training_frequency: effectiveUser.training_frequency || "",
        preferred_training_style: effectiveUser.preferred_training_style || "",
        notes: effectiveUser.notes || "",
        coach_notes: effectiveUser.coach_notes || "",
        bio: effectiveUser.bio || "",
        status: effectiveUser.status || "",
      });

      // Health form is initialized via useFormDraft below — handled on dialog open
    }
  }, [effectiveUserId, showEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Health declaration form — drafted + auto-saved while dialog is open
  const healthInitial = useMemo(() => {
    const eu = effectiveUser;
    const hasLimits = !!(eu?.health_issues && eu.health_issues.length > 0 && eu.health_issues !== "אין");
    return {
      has_limitations: hasLimits,
      health_issues: eu?.health_issues || "",
      approved: eu?.health_declaration_accepted || false,
    };
  }, [effectiveUser?.id, effectiveUser?.health_issues, effectiveUser?.health_declaration_accepted]);

  const {
    data: healthForm, setData: setHealthForm,
    hasDraft: hasHealthDraft, keepDraft: keepHealthDraft,
    discardDraft: discardHealthDraft, clearDraft: clearHealthDraft,
  } = useFormDraft('HealthDeclaration', effectiveUser?.id, showHealthUpdate, healthInitial);

  useKeepScreenAwake(showHealthUpdate);

  // Realtime — package balance updates instantly when deduction happens
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`profile-packages-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_services', filter: `trainee_id=eq.${user.id}` },
        () => { queryClient.refetchQueries({ queryKey: ['trainee-services'] }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `trainee_id=eq.${user.id}` },
        () => { queryClient.refetchQueries({ queryKey: ['trainee-sessions'] }); })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user?.id, queryClient]);

  const { data: goals = [], isLoading: goalsLoading } = useQuery({
    queryKey: ['trainee-goals', user?.id],
    queryFn: () => base44.entities.Goal.filter({ trainee_id: user.id }, '-created_at').catch(() => []),
    enabled: !!user?.id,
    staleTime: 60000,
  });

  const { data: measurements = [], isLoading: measurementsLoading } = useQuery({
    queryKey: ['my-measurements', user?.id],
    queryFn: () => base44.entities.Measurement.filter({ trainee_id: user.id }, '-date').catch(() => []),
    enabled: !!user?.id,
    staleTime: 60000,
  });

  const { data: results = [], isLoading: resultsLoading } = useQuery({
    queryKey: ['my-results', user?.id],
    queryFn: () => base44.entities.ResultsLog.filter({ trainee_id: user.id }, '-date').catch(() => []),
    enabled: !!user?.id,
    staleTime: 60000,
  });

  const { data: services = [], isLoading: servicesLoading } = useQuery({
    queryKey: ['trainee-services', user?.id],
    queryFn: async () => {
      const filter = { trainee_id: user.id };
      if (currentUser?.id) filter.coach_id = currentUser.id;
      return await base44.entities.ClientService.filter(filter, '-created_at').catch(() => []);
    },
    enabled: !!user?.id,
    staleTime: 0,
  });

  // Attendance is tracked via sessions.status in this codebase; the
  // legacy attendance_log table is unused here. The previous query
  // 400'd because the column case mismatched (snake_case vs camelCase)
  // and the result was never consumed anyway.
  const attendanceLoading = false;

  const { data: trainingPlans = [], isLoading: plansLoading } = useQuery({
    queryKey: ['training-plans', user?.id],
    queryFn: async () => {
      const [assigned, created] = await Promise.all([
        base44.entities.TrainingPlan.filter({ assigned_to: user.id }, '-created_at').catch(() => []),
        base44.entities.TrainingPlan.filter({ created_by: user.id }, '-created_at').catch(() => [])
      ]);
      const combined = [...(assigned || []), ...(created || [])];
      const uniquePlans = Array.from(new Map(combined.map(item => [item.id, item])).values());
      return uniquePlans.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
    },
    enabled: !!user?.id,
    staleTime: 60000,
  });

  const { data: workoutHistory = [], isLoading: workoutLoading } = useQuery({
    queryKey: ['trainee-workout-history', user?.id],
    queryFn: () => base44.entities.WorkoutHistory.filter({ user_id: user.id }, '-date').catch(() => []),
    enabled: !!user?.id,
    staleTime: 60000,
  });

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ['trainee-sessions', user?.id],
    queryFn: async () => {
      // Sessions can be linked to a trainee in three ways across the
      // legacy + current schemas:
      //   (1) direct: sessions.trainee_id = the trainee's user id
      //   (2) JSONB:  sessions.participants array contains {trainee_id}
      //   (3) coach-scan fallback: pull all of THIS coach's sessions
      //       (limit 1000) and match client-side — catches rows that
      //       the participants @> [...] containment query doesn't
      //       handle (extra fields, name-only entries, etc).
      // Each branch is independent + logged so we can see exactly
      // why a row didn't surface. Dedup by id; sort by date desc.
      console.log('[TraineeProfile] sessions query — trainee:', user.id);
      const byId = new Map();

      // (1) Direct column
      try {
        const direct = await base44.entities.Session.filter(
          { trainee_id: user.id }, '-date'
        );
        console.log('[TraineeProfile] sessions via trainee_id:', direct?.length || 0);
        (direct || []).forEach((s) => byId.set(s.id, s));
      } catch (e) {
        console.warn('[TraineeProfile] sessions by trainee_id failed:', e?.message);
      }

      // (2) participants[] JSONB containment
      try {
        const { data: viaParticipants, error: pErr } = await supabase
          .from('sessions')
          .select('*')
          .contains('participants', [{ trainee_id: user.id }])
          .order('date', { ascending: false });
        if (pErr) console.warn('[TraineeProfile] participants query error:', pErr.message);
        console.log('[TraineeProfile] sessions via participants:', viaParticipants?.length || 0);
        (viaParticipants || []).forEach((s) => byId.set(s.id, s));
      } catch (e) {
        console.warn('[TraineeProfile] sessions by participants failed:', e?.message);
      }

      // (3) Coach-scan fallback — only fires when the first two
      //     branches returned nothing. Pulls every session this coach
      //     owns (bounded at 1000) and filters client-side against
      //     every shape we know about (direct id, participants
      //     {trainee_id}, participants {id}, name match, etc).
      if (byId.size === 0 && currentUser?.id) {
        try {
          const { data: byCoach } = await supabase
            .from('sessions')
            .select('*')
            .eq('coach_id', currentUser.id)
            .order('date', { ascending: false })
            .limit(1000);
          console.log('[TraineeProfile] coach total sessions scanned:', byCoach?.length || 0);
          const matches = (byCoach || []).filter((s) =>
            s.trainee_id === user.id ||
            (Array.isArray(s.participants) && s.participants.some((p) =>
              (typeof p === 'string' && p === user.id) ||
              (typeof p === 'object' && p && (
                p.trainee_id === user.id ||
                p.id === user.id ||
                p.user_id === user.id ||
                (user.full_name && p.trainee_name === user.full_name) ||
                (user.full_name && p.full_name === user.full_name)
              ))
            ))
          );
          console.log('[TraineeProfile] coach scan matched:', matches.length);
          matches.forEach((s) => byId.set(s.id, s));
        } catch (e) {
          console.warn('[TraineeProfile] coach-scan fallback failed:', e?.message);
        }
      }

      const result = Array.from(byId.values()).sort(
        (a, b) => new Date(b.date || 0) - new Date(a.date || 0)
      );
      console.log('[TraineeProfile] sessions FINAL count:', result.length);
      return result;
    },
    enabled: !!user?.id,
    staleTime: 60000,
  });

  // Optimized: Removed global exercise fetch
  const getPlanProgress = (plan) => {
      return { 
        total: plan.exercises_count || 0, 
        completed: Math.round((plan.progress_percentage / 100) * (plan.exercises_count || 0)) || 0, 
        percent: plan.progress_percentage || 0 
      };
  };

  const { data: baselines = [], isLoading: baselinesLoading } = useQuery({
    queryKey: ['baselines', user?.id],
    queryFn: () => base44.entities.Baseline.filter({ trainee_id: user.id }, '-date').catch(() => []),
    enabled: !!user?.id,
    staleTime: 60000,
  });

  const { data: coach, isLoading: coachLoading } = useQuery({
    queryKey: ['trainee-coach', user?.id],
    queryFn: async () => {
      const users = await base44.entities.User.list('-created_at', 1000);
      return users.find(u => u.is_coach === true || u.role === 'coach') || null;
    },
    enabled: !!user?.id,
    staleTime: 60000,
  });

  // Trainee-permission hook must live UP HERE — above the loading
  // gate's early return — otherwise the first render skips it and
  // the second render adds it back, triggering React #310 ("rendered
  // more hooks than during the previous render").
  const { perms: traineePerms } = useTraineePermissions(effectiveUser?.id);

  // Tab-permission map. Tabs absent from this map have no perm gate.
  // Used by the auto-fallback effect below — kept as a const-per-render
  // (cheap object literal) instead of a useMemo since the keys are
  // static.
  const TAB_PERM_MAP = {
    plans:        'view_plan',
    metrics:      'edit_metrics',
    achievements: 'view_progress',
    baselines:    'view_baseline',
    goals:        'view_progress',
    documents:    'view_documents',
    messages:     'send_messages',
  };

  // If the trainee was on a tab the coach just turned off, fall back
  // to 'personal' (always allowed). Hoisted above the loading gate
  // so the hook count is stable across the loading → loaded transition
  // — moving it inside would re-introduce React #310. Coaches see all
  // tabs regardless of perms, so we no-op for them.
  useEffect(() => {
    if (isCoach) return;
    const requiredPerm = TAB_PERM_MAP[activeTab];
    if (requiredPerm && !traineePerms?.[requiredPerm]) {
      setActiveTab('personal');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCoach, traineePerms, activeTab]);

  // (traineeNotifs query moved into TraineeNotificationsTab — same query key
  // 'trainee-notifications' is used there, so existing invalidations keep working.)

  const updateUserMutation = useMutation({
    mutationFn: (data) => {
      return base44.auth.updateMe(data);
    },
    onSuccess: (serverData, _variables) => {
      // Use server-returned data so local state matches what was actually saved
      setUser(prev => {
        const merged = prev ? { ...prev, ...serverData } : serverData;
        return merged;
      });
      queryClient.invalidateQueries({ queryKey: ['current-user-trainee-profile'] });
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      setShowEdit(false);
      toast.success("✅ הפרופיל עודכן");
    },
    onError: (error) => {
      console.error("[updateUserMutation] onError:", error);
      toast.error("⚠️ שגיאה בעדכון הפרופיל: " + (error.message || "נסה שוב"));
    }
  });

  const updateHealthMutation = useMutation({
    mutationFn: async (data) => {
      if (isCoach && userIdParam) {
        await base44.entities.User.update(userIdParam, data);
      } else {
        await base44.auth.updateMe(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-user-trainee-profile'] });
      queryClient.invalidateQueries({ queryKey: ['target-user-profile'] });
      clearHealthDraft();
      setShowHealthUpdate(false);
      toast.success("✅ הצהרת בריאות עודכנה");
    },
    onError: (error) => {
      console.error("Update health error:", error);
      toast.error("⚠️ שגיאה בעדכון הצהרת בריאות");
    }
  });

  const updateVisionMutation = useMutation({
    mutationFn: async (visionData) => {
      const dataToUpdate = { vision: visionData };
      if (isCoach && userIdParam) {
        await base44.entities.User.update(userIdParam, dataToUpdate);
      } else {
        // Ensure trainee cannot update coachNotesOnVision
        if (visionData.coachNotesOnVision && !isCoach) {
            delete visionData.coachNotesOnVision;
        }
        await base44.auth.updateMe(dataToUpdate);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-user-trainee-profile'] });
      queryClient.invalidateQueries({ queryKey: ['target-user-profile'] });
      setShowVisionDialog(false);
      toast.success("✅ חזון עודכן בהצלחה");
    },
    onError: (error) => {
      toast.error("❌ שגיאה בעדכון החזון: " + (error.message || "נסה שוב"));
    }
  });

  const createGoalMutation = useMutation({
    mutationFn: (data) => base44.entities.Goal.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee-goals'] });
      queryClient.invalidateQueries({ queryKey: ['my-goals'] });
      invalidateDashboard(queryClient);
      setShowAddGoal(false);
      setGoalForm({ goal_name: "", description: "", target_value: "", current_value: "", unit: "", target_date: "", status: "בתהליך" });
      toast.success("✅ יעד נוסף");
    },
    onError: (error) => {
      toast.error("❌ שגיאה בהוספת יעד: " + (error.message || "נסה שוב"));
    }
  });

  const updateGoalMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Goal.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee-goals'] });
      queryClient.invalidateQueries({ queryKey: ['my-goals'] });
      invalidateDashboard(queryClient);
      setEditingGoal(null);
      toast.success("✅ יעד עודכן");
    },
    onError: (error) => {
      toast.error("❌ שגיאה בעדכון יעד: " + (error.message || "נסה שוב"));
    }
  });

  const createServiceMutation = useMutation({
    mutationFn: (data) => base44.entities.ClientService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee-services'] });
      queryClient.invalidateQueries({ queryKey: ['all-services-list'] });
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setShowAddService(false);
      setEditingService(null);
      setServiceForm({
        service_type: "personal", group_name: "", billing_model: "punch_card",
        sessions_per_week: "", package_name: "", base_price: "",
        discount_type: "none", discount_value: 0, final_price: "",
        payment_method: "credit", start_date: new Date().toISOString().split('T')[0],
        end_date: "", next_billing_date: "", total_sessions: "",
        payment_status: "ממתין לתשלום", payment_note: "", notes_internal: "", status: "active"
      });
      toast.success("✅ חבילה נוספה בהצלחה");
    },
    onError: (error) => {
      console.error("[createServiceMutation] Error:", error);
      toast.error("❌ שגיאה בהוספת חבילה: " + (error?.message || "נסה שוב"));
    }
  });

  const updateServiceMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ClientService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee-services'] });
      queryClient.invalidateQueries({ queryKey: ['all-services-list'] });
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setShowAddService(false);
      setEditingService(null);
      setServiceForm({
        service_type: "personal", group_name: "", billing_model: "punch_card",
        sessions_per_week: "", package_name: "", base_price: "",
        discount_type: "none", discount_value: 0, final_price: "",
        payment_method: "credit", start_date: new Date().toISOString().split('T')[0],
        end_date: "", next_billing_date: "", total_sessions: "",
        payment_status: "ממתין לתשלום", payment_note: "", notes_internal: "", status: "active"
      });
      toast.success("✅ חבילה עודכנה");
    },
    onError: (error) => {
      console.error("[updateServiceMutation] Error:", error);
      toast.error("❌ שגיאה בעדכון חבילה: " + (error?.message || "נסה שוב"));
    }
  });

  const updateServiceUsageMutation = useMutation({
      mutationFn: async () => {
          if (!editingUsage) return;
          await base44.entities.ClientService.update(editingUsage, {
              used_sessions: parseInt(usageValue)
          });
          await syncPackageStatus(editingUsage);
      },
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['trainee-services'] });
          queryClient.invalidateQueries({ queryKey: ['all-services-list'] });
          queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
          invalidateDashboard(queryClient);
          setEditingUsage(null);
          setUsageValue("");
          toast.success("✅ ניצול אימונים עודכן ידנית");
      },
      onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const updateSessionStatusMutation = useMutation({
    mutationFn: async ({ session, newStatus }) => {
        // 1. Update Session participants + status
        const updatedParticipants = session.participants.map(p =>
            p.trainee_id === user.id ? { ...p, attendance_status: newStatus } : p
        );

        let sessionUpdateData = { participants: updatedParticipants };

        if (session.session_type === 'אישי') {
             sessionUpdateData.status = (newStatus === 'הגיע') ? 'התקיים' :
                                       (newStatus === 'הושלם') ? 'הושלם' :
                                       (newStatus === 'מאושר') ? 'מאושר' :
                                       (newStatus === 'ביטל' || newStatus === 'בוטל') ? 'בוטל על ידי מאמן' :
                                       (newStatus === 'נעדר' || newStatus === 'לא הגיע') ? 'לא הגיע' : 'ממתין לאישור';
        }

        // Check for status reversal — refund package if was deducted
        const oldStatus = session.participants?.find(p => p.trainee_id === user.id)?.attendance_status || session.status || 'ממתין';
        const wasDeducted = session.was_deducted === true;
        const wasCompleteOrAttended = ['הגיע', 'הושלם', 'התקיים'].includes(oldStatus);
        const isNowCompleteOrAttended = ['הגיע', 'הושלם'].includes(newStatus);

        // Reversal: was attended/completed + was deducted → now something else → refund
        if (wasCompleteOrAttended && wasDeducted && !isNowCompleteOrAttended && session.service_id) {
          try {
            const svc = services.find(s => s.id === session.service_id);
            if (svc && svc.used_sessions > 0) {
              const newUsed = Math.max(0, svc.used_sessions - 1);
              await base44.entities.ClientService.update(svc.id, {
                used_sessions: newUsed,
                status: svc.status === 'completed' ? 'active' : svc.status,
              });
              await syncPackageStatus(svc.id);
              sessionUpdateData.was_deducted = false;
              const total = svc.total_sessions || svc.sessions_count || 0;
              toast.success(`יתרה הוחזרה: ${total - newUsed} מפגשים`);
            }
          } catch {}
        }

        await base44.entities.Session.update(session.id, sessionUpdateData);

        // 2. Send notification to trainee about status change (coach only)
        if (isCoach && user?.id) {
          try {
            const sessionDate = session.date ? new Date(session.date).toLocaleDateString('he-IL') : '';
            if (newStatus === 'הגיע' || sessionUpdateData.status === 'התקיים') {
              await notifySessionCompleted({ traineeId: user.id, sessionDate, sessionType: session.session_type, coachName: currentUser?.full_name || 'המאמן' });
            } else if (newStatus === 'בוטל' || sessionUpdateData.status?.includes('בוטל')) {
              await notifySessionRejected({ traineeId: user.id, sessionId: session.id, sessionDate, coachName: currentUser?.full_name });
            } else if (sessionUpdateData.status === 'מאושר' || newStatus === 'מאושר') {
              await notifySessionApproved({ traineeId: user.id, sessionId: session.id, sessionDate, coachName: currentUser?.full_name });
            }
          } catch {}
        }

        // 3. Auto package sync for "הגיע" status (non-deduction-dialog path)
        {
            const isNowAttended = newStatus === 'הגיע';
            const wasAttended = oldStatus === 'הגיע';

            if (isNowAttended !== wasAttended) {
                const sessionTypeMap = {
                  'אישי': ['personal', 'אימונים אישיים', 'אישי'],
                  'קבוצתי': ['group', 'פעילות קבוצתית', 'קבוצתי'],
                  'אונליין': ['online', 'ליווי אונליין', 'אונליין'],
                };
                const matchTypes = sessionTypeMap[session.session_type] || sessionTypeMap['אישי'];

                const matchingPackages = services
                  .filter(s =>
                    (s.status === 'פעיל' || s.status === 'active') &&
                    (matchTypes.includes(s.service_type) || matchTypes.includes(s.package_type)) &&
                    (s.total_sessions > 0 || s.sessions_count > 0)
                  )
                  .sort((a, b) => {
                    const aEnd = a.end_date || a.expires_at || '9999-12-31';
                    const bEnd = b.end_date || b.expires_at || '9999-12-31';
                    return new Date(aEnd) - new Date(bEnd);
                  });

                const activePackage = matchingPackages[0];

                if (activePackage) {
                    const total = activePackage.total_sessions || activePackage.sessions_count || 0;
                    const change = isNowAttended ? 1 : -1;
                    const newUsedCount = Math.max(0, (activePackage.used_sessions || 0) + change);
                    const remaining = total - newUsedCount;

                    const updatePayload = { used_sessions: newUsedCount };
                    if (remaining <= 0 && isNowAttended) {
                      updatePayload.status = 'completed';
                    }

                    await base44.entities.ClientService.update(activePackage.id, updatePayload);
                    await syncPackageStatus(activePackage.id);

                    if (remaining === 1 && isNowAttended) {
                      try {
                        await base44.entities.Notification.create({
                          user_id: currentUser?.id || coach?.id,
                          type: 'renewal_alert',
                          title: 'חידוש חבילה',
                          message: `נותר אימון אחד בחבילה של ${user.full_name}. לשלוח בקשת חידוש?`,
                          is_read: false,
                          related_id: activePackage.id,
                          action_label: 'שלח בקשה',
                          data: { trainee_id: user.id, package_id: activePackage.id, trainee_name: user.full_name },
                        });
                      } catch {}
                    }
                    if (remaining <= 0 && isNowAttended) {
                      try {
                        await base44.entities.Notification.create({
                          user_id: currentUser?.id || coach?.id,
                          type: 'service_completed',
                          title: 'חבילה הסתיימה',
                          message: `חבילה "${activePackage.package_name || 'חבילה'}" של ${user.full_name} הסתיימה — 0 מפגשים נותרו`,
                          is_read: false,
                        });
                      } catch {}
                    }
                }
            }
        }
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ['trainee-sessions'] });
      queryClient.refetchQueries({ queryKey: ['trainee-services'] });
      queryClient.invalidateQueries({ queryKey: ['all-sessions-list'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SERVICES });
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      invalidateDashboard(queryClient);
      window.dispatchEvent(new CustomEvent('data-changed'));
      toast.success("✅ סטטוס עודכן וסונכרן");
    },
    onError: (error) => {
        console.error("Error updating session:", error);
        toast.error("שגיאה בעדכון סטטוס");
    }
  });

  const updateTargetUserMutation = useMutation({
    mutationFn: ({ id, data }) => {
      return base44.entities.User.update(id, data);
    },
    onSuccess: (serverData, _variables) => {
      setUser(prev => {
        const merged = prev ? { ...prev, ...serverData } : serverData;
        return merged;
      });
      queryClient.invalidateQueries({ queryKey: ['target-user-profile', userIdParam] });
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      setShowEdit(false);
      toast.success("✅ פרופיל מתאמן עודכן");
    },
    onError: (error) => {
      console.error("[updateTargetUserMutation] onError:", error);
      toast.error("⚠️ שגיאה בעדכון פרופיל מתאמן: " + (error.message || "נסה שוב"));
    }
  });

  const deleteGoalMutation = useMutation({
    mutationFn: (id) => base44.entities.Goal.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee-goals'] });
      toast.success("✅ יעד נמחק");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const createResultMutation = useMutation({
    mutationFn: (data) => base44.entities.ResultsLog.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-results'] });
      setShowAddResult(false);
      setResultForm({ date: new Date().toISOString().split('T')[0], title: "", description: "", related_goal_id: "" });
      toast.success("✅ הישג נוסף");
    },
    onError: (error) => {
      toast.error("❌ שגיאה בהוספת הישג: " + (error.message || "נסה שוב"));
    }
  });

  const updateResultMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ResultsLog.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-results'] });
      setEditingResult(null);
      toast.success("✅ הישג עודכן");
    },
    onError: (error) => {
      toast.error("❌ שגיאה בעדכון הישג: " + (error.message || "נסה שוב"));
    }
  });

  const deleteResultMutation = useMutation({
    mutationFn: (id) => base44.entities.ResultsLog.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-results'] });
      toast.success("✅ הישג נמחק");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const createPlanForTraineeMutation = useMutation({
    mutationFn: async ({ planData, selectedTrainees }) => {
      if (!currentUser?.id) throw new Error("פרטי מאמן חסרים");
      const gf = Array.isArray(planData.goal_focus) && planData.goal_focus.length > 0 ? planData.goal_focus : ["כוח"];
      // Use the viewed trainee if no trainees explicitly selected
      const targets = selectedTrainees?.length > 0 ? selectedTrainees : [effectiveUser?.id || user?.id];
      const results = [];
      for (const tid of targets) {
        const tName = tid === (effectiveUser?.id || user?.id) ? (effectiveUser?.full_name || user?.full_name) : '';
        results.push(await base44.entities.TrainingPlan.create({
          title: planData.plan_name, plan_name: planData.plan_name,
          assigned_to: tid || "", assigned_to_name: tName || "",
          created_by: currentUser.id, created_by_name: currentUser.full_name,
          goal_focus: gf, description: planData.description || "",
          start_date: new Date().toISOString().split("T")[0], status: "פעילה", is_template: false,
        }));
      }
      return results;
    },
    onSuccess: async (results) => {
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      invalidateDashboard(queryClient);
      toast.success("תוכנית נוצרה בהצלחה!");
      if (results && currentUser) {
        for (const plan of results) {
          if (plan.assigned_to) {
            try { await notifyPlanCreated({ traineeId: plan.assigned_to, traineeName: plan.assigned_to_name, planName: plan.plan_name || plan.title, coachId: currentUser.id, coachName: currentUser.full_name }); } catch {}
          }
        }
      }
      if (results?.length === 1 && results[0]?.id) {
        navigate(createPageUrl("PlanBuilder") + `?planId=${results[0].id}`);
      }
    },
    onError: (e) => {
      console.error("[TraineeProfile] Plan creation error:", e);
      toast.error("שגיאה ביצירת תוכנית: " + (e.message || "נסה שוב"));
    },
  });

  const isSavingRef = useRef(false);

  const handleSave = async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;

    let calculatedAge = formData.age;
    if (formData.birth_date) {
      try {
        const birthDate = new Date(formData.birth_date);
        const today = new Date();
        calculatedAge = Math.floor((today.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      } catch (_) {}
    }

    const dataToUpdate = {
      full_name: formData.full_name || null,
      phone: formData.phone || null,
      birth_date: formData.birth_date ? new Date(formData.birth_date).toISOString() : null,
      age: calculatedAge ? parseInt(calculatedAge) : null,
      gender: formData.gender || null,
      address: formData.address || null,
      city: formData.city || null,
      medical_history: formData.medical_history || null,
      notes: formData.notes || null,
      coach_notes: formData.coach_notes || null,
      bio: formData.bio || null,
      status: formData.status || null,
      emergency_contact_name: formData.emergency_contact_name || null,
      emergency_contact_phone: formData.emergency_contact_phone || null,
    };

    try {
      if (isCoach && userIdParam) {
        await updateTargetUserMutation.mutateAsync({ id: userIdParam, data: dataToUpdate });
      } else {
        await updateUserMutation.mutateAsync(dataToUpdate);
      }
      if (editDraftKey) { try { localStorage.removeItem(editDraftKey); } catch {} }
      setShowEdit(false);
    } catch (error) {
      console.error("[handleSave] error:", error?.message || error);
    } finally {
      isSavingRef.current = false;
    }
  };

  const handleHealthUpdate = async () => {
    if (healthForm.has_limitations && !healthForm.health_issues) {
        toast.error("נא לפרט את המגבלה הרפואית");
        return;
    }
    if (!healthForm.approved) {
        toast.error("יש לאשר את הצהרת הבריאות");
        return;
    }

    const dataToUpdate = {
        health_issues: healthForm.health_issues,
        health_declaration_accepted: true
    };

    try {
      await updateHealthMutation.mutateAsync(dataToUpdate);
    } catch (error) {
      console.error("handleHealthUpdate error:", error);
    }
  };

  const handleAddOrUpdateService = async () => {
    if (!serviceForm.service_type || !serviceForm.start_date) {
        toast.error("נא למלא סוג שירות ותאריך התחלה");
        return;
    }

    // Calculate final price logic if not manually set (optional, can rely on form state)
    // For simplicity, we trust the form state which should sync base/discount -> final

    const data = {
        service_type: serviceForm.service_type,
        group_name: serviceForm.service_type === 'group' ? serviceForm.group_name : null,
        billing_model: serviceForm.billing_model,
        sessions_per_week: serviceForm.sessions_per_week ? parseInt(serviceForm.sessions_per_week) : null,
        package_name: serviceForm.package_name || "",
        base_price: serviceForm.base_price ? parseFloat(serviceForm.base_price) : 0,
        discount_type: serviceForm.discount_type,
        discount_value: parseFloat(serviceForm.discount_value || 0),
        final_price: serviceForm.final_price ? parseFloat(serviceForm.final_price) : 0,
        // Keep 'price' for backward compatibility or dashboard logic that uses it
        price: serviceForm.final_price ? parseFloat(serviceForm.final_price) : 0, 
        payment_method: serviceForm.payment_method,
        payment_note: serviceForm.payment_note || null,
        start_date: new Date(serviceForm.start_date).toISOString(),
        end_date: serviceForm.end_date ? new Date(serviceForm.end_date).toISOString() : null,
        next_billing_date: serviceForm.next_billing_date ? new Date(serviceForm.next_billing_date).toISOString() : null,
        total_sessions: serviceForm.total_sessions ? parseInt(serviceForm.total_sessions) : null,
        payment_status: serviceForm.payment_status || 'ממתין לתשלום',
        notes_internal: serviceForm.notes_internal || "",
        status: serviceForm.status || 'active'
    };

    try {
      if (editingService) {
        await updateServiceMutation.mutateAsync({ id: editingService.id, data });
      } else {
        const traineeId = effectiveUser?.id || user?.id;
        if (!traineeId) {
          toast.error("שגיאה: לא ניתן לזהות את המתאמן");
          return;
        }
        await createServiceMutation.mutateAsync({
            ...data,
            trainee_id: traineeId,
            trainee_name: effectiveUser?.full_name || user?.full_name || "",
            coach_id: currentUser?.id || null,
            created_by: currentUser?.id || null,
            used_sessions: 0,
            sessions_remaining: data.total_sessions || null,
            status: data.status || 'active',
        });
      }
    } catch (error) {
      console.error("handleAddOrUpdateService error:", error);
      toast.error("❌ שגיאה בשמירת חבילה: " + (error?.message || "נסה שוב"));
    }
  };

  const openEditService = (service) => {
    setEditingService(service);
    setServiceForm({
      service_type: service.service_type || "personal",
      group_name: service.group_name || "",
      billing_model: service.billing_model || "punch_card",
      sessions_per_week: service.sessions_per_week || "",
      package_name: service.package_name || "",
      base_price: service.base_price || service.price || "",
      discount_type: service.discount_type || "none",
      discount_value: service.discount_value || 0,
      final_price: service.final_price || service.price || "",
      payment_method: service.payment_method || "credit",
      payment_note: service.payment_note || "",
      start_date: service.start_date ? service.start_date.split('T')[0] : "",
      end_date: service.end_date ? service.end_date.split('T')[0] : "",
      next_billing_date: service.next_billing_date ? service.next_billing_date.split('T')[0] : "",
      total_sessions: service.total_sessions || "",
      payment_status: service.payment_status || "שולם",
      notes_internal: service.notes_internal || "",
      status: service.status || "active"
    });
    setShowAddService(true);
  };

  const openPackageHistory = async (service) => {
    setSelectedPackageHistory(service);
    setPackageSessionsLoading(true);
    setPackageSessions([]);
    try {
      const sessions = await base44.entities.Session.filter({ service_id: service.id });
      setPackageSessions(sessions.sort((a, b) => new Date(b.date) - new Date(a.date)));
    } catch (err) {
      console.error("Error fetching package sessions:", err);
      setPackageSessions([]);
    }
    setPackageSessionsLoading(false);
  };

  // ── Manual link/unlink: session ↔ package ────────────────────────
  const fetchUnlinkedSessions = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, date, time, status, session_type')
        .eq('trainee_id', user.id)
        .is('service_id', null)
        .order('date', { ascending: false });
      if (error) throw error;
      setUnlinkedSessions(data || []);
    } catch (err) {
      console.error('[TraineeProfile] fetchUnlinkedSessions error:', err);
      setUnlinkedSessions([]);
    }
  };

  const refreshLinkedAfterChange = async (pkg) => {
    if (!pkg?.id) return;
    try {
      const sessions = await base44.entities.Session.filter({ service_id: pkg.id });
      const sorted = sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
      setPackageSessions(sorted);
      // Re-sync used/remaining counts on the package row from the
      // canonical truth: sessions whose service_id points at it.
      const newUsed = sorted.length;
      const total = Number(pkg.total_sessions) || 0;
      const newRemaining = Math.max(0, total - newUsed);
      await supabase
        .from('client_services')
        .update({ used_sessions: newUsed, remaining_sessions: newRemaining })
        .eq('id', pkg.id);
      queryClient.invalidateQueries({ queryKey: ['all-services-list'] });
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
    } catch (err) {
      console.error('[TraineeProfile] refreshLinkedAfterChange error:', err);
    }
  };

  const linkSessionToPackage = async (sessionId) => {
    if (!selectedPackageHistory?.id) return;
    console.log('[TraineeProfile] linking session', sessionId, '→ pkg', selectedPackageHistory.id);
    const { error } = await supabase
      .from('sessions')
      .update({ service_id: selectedPackageHistory.id })
      .eq('id', sessionId);
    if (error) { toast.error('שגיאה: ' + error.message); return; }
    toast.success('המפגש שויך לחבילה');
    await refreshLinkedAfterChange(selectedPackageHistory);
    fetchUnlinkedSessions();
  };

  const unlinkSession = async (sessionId) => {
    if (!selectedPackageHistory?.id) return;
    console.log('[TraineeProfile] unlinking session', sessionId);
    const { error } = await supabase
      .from('sessions')
      .update({ service_id: null })
      .eq('id', sessionId);
    if (error) { toast.error('שגיאה: ' + error.message); return; }
    toast.success('שיוך הוסר');
    await refreshLinkedAfterChange(selectedPackageHistory);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("נא להעלות תמונה בלבד");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("גודל מקסימלי: 5MB");
      return;
    }

    setUploadingImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData({ ...formData, profile_image: file_url });
      await base44.auth.updateMe({ profile_image: file_url });
      queryClient.invalidateQueries({ queryKey: ['current-user-trainee-profile'] });
      refetch();
      toast.success("✅ תמונה עודכנה");
    } catch (error) {
      console.error("Image upload error:", error);
      toast.error("❌ שגיאה בהעלאת תמונה");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAddGoal = async () => {
    if (!goalForm.goal_name || !goalForm.target_value) {
      toast.error("נא למלא שם יעד ויעד");
      return;
    }

    await createGoalMutation.mutateAsync({
      trainee_id: user.id,
      title: goalForm.goal_name || goalForm.title,
      description: goalForm.description || null,
      target_value: parseFloat(goalForm.target_value),
      current_value: goalForm.current_value ? parseFloat(goalForm.current_value) : null,
      target_unit: goalForm.unit || null,
      target_date: goalForm.target_date ? new Date(goalForm.target_date).toISOString() : null,
      status: goalForm.status || "בתהליך",
    });
  };

  const handleUpdateGoal = async () => {
    if (!editingGoal) return;

    const progress = goalForm.current_value && goalForm.target_value
      ? Math.min(100, Math.round((parseFloat(goalForm.current_value) / parseFloat(goalForm.target_value)) * 100))
      : 0;

    await updateGoalMutation.mutateAsync({
      id: editingGoal.id,
      data: {
        title: goalForm.goal_name || goalForm.title,
        description: goalForm.description || null,
        target_value: parseFloat(goalForm.target_value),
        current_value: goalForm.current_value ? parseFloat(goalForm.current_value) : null,
        target_unit: goalForm.unit || null,
        target_date: goalForm.target_date ? new Date(goalForm.target_date).toISOString() : null,
        status: goalForm.status
      }
    });
  };

  const handleAddResult = async () => {
    if (!resultForm.title) {
      toast.error("נא למלא כותרת");
      return;
    }

    await createResultMutation.mutateAsync({
      trainee_id: user.id,
      trainee_name: user.full_name,
      date: new Date(resultForm.date).toISOString(),
      title: resultForm.title,
      description: resultForm.description || null,
      related_goal_id: resultForm.related_goal_id || null
    });
  };

  const handleUpdateResult = async () => {
    if (!editingResult) return;

    await updateResultMutation.mutateAsync({
      id: editingResult.id,
      data: {
        date: new Date(resultForm.date).toISOString(),
        title: resultForm.title,
        description: resultForm.description || null,
        related_goal_id: resultForm.related_goal_id || null
      }
    });
  };

  // Coach-only: reset a trainee's password via the reset-password
  // Edge Function (uses service role server-side; never exposed to
  // the client). Mirrors the existing delete-trainee invocation
  // pattern used at line ~2895.
  const generateRandomPw = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let pass = '';
    for (let i = 0; i < 8; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
    setResetPwInput(pass);
  };
  const handleResetTraineePassword = async () => {
    if (!resetPwInput || resetPwInput.length < 6) {
      toast.error('סיסמה חייבת להיות לפחות 6 תווים');
      return;
    }
    if (!user?.id) { toast.error('לא נטען מתאמן'); return; }
    setResetPwSaving(true);
    try {
      const { error } = await supabase.functions.invoke('reset-password', {
        body: { userId: user.id, newPassword: resetPwInput },
      });
      if (error) throw error;
      setResetPwGenerated(resetPwInput);
      toast.success('הסיסמה אופסה בהצלחה');
    } catch (err) {
      console.error('[ResetPassword] failed:', err);
      toast.error('שגיאה: ' + (err?.message || 'נסה שוב'));
    } finally {
      setResetPwSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!passwordForm.currentPass) {
      toast.error("יש להזין את הסיסמה הנוכחית");
      return;
    }
    if (passwordForm.newPass !== passwordForm.confirm) {
      toast.error("הסיסמאות החדשות לא תואמות");
      return;
    }
    if (passwordForm.newPass.length < 6) {
      toast.error("הסיסמה חייבת להכיל לפחות 6 תווים");
      return;
    }
    setPasswordLoading(true);
    // Step 1: re-authenticate with the current password so we don't let
    // an attacker who hijacks an open session change the password.
    const emailForVerify = currentUser?.email;
    if (!emailForVerify) {
      setPasswordLoading(false);
      toast.error("שגיאה: לא נטען משתמש");
      return;
    }
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: emailForVerify,
      password: passwordForm.currentPass,
    });
    if (signInErr) {
      setPasswordLoading(false);
      toast.error("סיסמה נוכחית שגויה");
      return;
    }
    // Step 2: update to the new password
    const { error } = await supabase.auth.updateUser({ password: passwordForm.newPass });
    setPasswordLoading(false);
    if (error) {
      toast.error("שגיאה בשינוי הסיסמה: " + error.message);
    } else {
      toast.success("✅ הסיסמה שונתה בהצלחה");
      setShowPasswordChange(false);
      setPasswordForm({ currentPass: "", newPass: "", confirm: "" });
    }
  };

  const activeGoals = goals.filter(g => g.status === 'בתהליך');
  const completedGoals = goals.filter(g => g.status === 'הושג');

  // ── Manual balance handlers (auto-reactivate when refunding from a completed pkg) ──
  const adjustPackageBalance = async (pkg, direction) => {
    const total = pkg.total_sessions || pkg.sessions_count || 0;
    const currentUsed = pkg.used_sessions || 0;
    const update = {};
    let toastMsg = '';

    if (direction === 'use') {
      if (total > 0 && currentUsed >= total) {
        toast.warning('לא ניתן לחרוג מסך המפגשים');
        return;
      }
      const newUsed = currentUsed + 1;
      update.used_sessions = newUsed;
      if (total > 0) update.sessions_remaining = total - newUsed;
      // Auto-complete when reaching total
      if (total > 0 && newUsed >= total) {
        update.status = 'completed';
        toastMsg = 'יתרה הורדה — החבילה הושלמה';
      } else {
        toastMsg = `יתרה: ${total > 0 ? total - newUsed : '∞'} מפגשים`;
      }
    } else { // refund
      if (currentUsed <= 0) {
        toast.warning('אין יתרה להחזיר');
        return;
      }
      const newUsed = currentUsed - 1;
      update.used_sessions = newUsed;
      if (total > 0) update.sessions_remaining = total - newUsed;
      // Auto-reactivate completed packages
      const wasCompleted = pkg.status === 'completed' || pkg.status === 'הסתיים';
      if (wasCompleted) {
        update.status = 'פעיל';
        toastMsg = 'היתרה הוחזרה, החבילה חזרה למצב פעיל';
      } else {
        toastMsg = `יתרה: ${total > 0 ? total - newUsed : '∞'} מפגשים`;
      }
    }

    try {
      await base44.entities.ClientService.update(pkg.id, update);
      await syncPackageStatus(pkg.id);
      await queryClient.refetchQueries({ queryKey: ['trainee-services'] });
      queryClient.invalidateQueries({ queryKey: ['all-services-list'] });
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      invalidateDashboard(queryClient);
      toast.success(toastMsg);
    } catch (e) {
      toast.error('שגיאה בעדכון יתרה: ' + (e?.message || 'נסה שוב'));
    }
  };

  // Derive active vs history packages from real data, not just status string
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const activeServices = services.filter(s => {
    // Explicit non-active statuses → always history
    if (['expired', 'completed', 'cancelled', 'ended', 'הסתיים', 'פג תוקף'].includes(s.status)) return false;
    // Derive: if punch-card and all sessions used → not active
    const total = s.total_sessions || s.sessions_count || 0;
    const used = s.used_sessions || 0;
    if (total > 0 && used >= total) return false;
    // Derive: if end_date/expires_at passed → not active
    const endDate = s.end_date || s.expires_at;
    if (endDate && new Date(endDate) < today) return false;
    return true;
  });
  const historyServices = services.filter(s => !activeServices.includes(s));

  const latestMeasurement = measurements[0];

  const getWeightChange = () => {
    if (measurements.length < 2) return null;
    const latest = measurements[0]?.weight;
    const first = measurements[measurements.length - 1]?.weight;
    if (!latest || !first) return null;
    return latest - first;
  };

  const getBodyFatChange = () => {
    if (measurements.length < 2) return null;
    const latest = measurements[0]?.body_fat;
    const first = measurements[measurements.length - 1]?.body_fat;
    if (!latest || !first) return null;
    return latest - first;
  };

  const weightChange = getWeightChange();
  const bodyFatChange = getBodyFatChange();

  const weightChartData = measurements
    .slice(0, 10)
    .reverse()
    .map(m => ({
      date: format(new Date(m.date), 'dd/MM'),
      weight: m.weight || 0
    }))
    .filter(d => d.weight > 0);

  // Group results by type for Achievements tab
  const groupedResults = React.useMemo(() => {
    const groups = {};
    results.forEach(r => {
      const type = r.category === 'baseline' ? 'בייסליין' : (r.skill_or_exercise || 'אחר');
      if (!groups[type]) groups[type] = [];
      groups[type].push(r);
    });
    // Sort each group by date desc
    Object.values(groups).forEach(arr => arr.sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at)));
    return groups;
  }, [results]);

  // Calculate improvement metrics grouped by parent_plan_id
  const improvementData = React.useMemo(() => {
      const groups = {};
      const parentPlans = trainingPlans.filter(p => p.parent_plan_id || trainingPlans.some(child => child.parent_plan_id === p.id));

      parentPlans.forEach(plan => {
        const rootId = plan.parent_plan_id || plan.id;
        if (!groups[rootId]) groups[rootId] = [];

        // Calculate plan stats using pre-calculated fields
        const completionRate = plan.progress_percentage || 0;
        
        // Note: Averages would require fetching exercises, setting to 0 for summary view to avoid over-fetching
        const avgControl = 0; 
        const avgDifficulty = 0;

        groups[rootId].push({
            ...plan,
            stats: { completionRate, avgControl, avgDifficulty, date: plan.created_date }
        });
      });

      // Sort each group by date
      Object.keys(groups).forEach(key => {
        groups[key].sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
      });

      return groups;
  }, [trainingPlans]);

  if (profileError || noUserFound) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" dir="rtl" style={{ backgroundColor: '#FDF8F3' }}>
        <div className="max-w-md w-full text-center bg-white border border-gray-100 rounded-3xl p-8 shadow-sm">
          <h1 className="text-xl font-bold mb-3">שגיאה בטעינת הפרופיל</h1>
          <p className="text-sm text-gray-600 mb-6">
            {profileError ? 'אירעה שגיאה בטעינת הפרופיל. אנא רענן את הדף או חזור מאוחר יותר.' : 'לא נמצא משתמש עם הפרופיל המבוקש.'}
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <Button variant="secondary" onClick={() => window.location.reload()} className="w-full sm:w-auto">רענן</Button>
            <Button variant="ghost" onClick={() => navigate(createPageUrl("TraineeHome"))} className="w-full sm:w-auto">חזור לדף הבית</Button>
          </div>
        </div>
      </div>
    );
  }

  // Full loading gate — show branded loader until user AND ALL tab data are ready
  const coreDataLoading = profileLoading || !user || goalsLoading || measurementsLoading || resultsLoading || servicesLoading || plansLoading || sessionsLoading || attendanceLoading || workoutLoading || coachLoading || baselinesLoading;

  if (coreDataLoading) {
    return <PageLoader />;
  }

  const isUrielsAccount = user.email === 'uriel111@gmail.com';

  // Status change side-effects: update users.client_status, sync
  // trainee_permissions to the per-status preset, and freeze/
  // unfreeze packages when the trainee toggles between
  // active ↔ suspended. Best-effort on the package step (some
  // installs use Hebrew status enums; the .eq filter just won't
  // match those rows and the call no-ops).
  const handleStatusChange = async (newStatus) => {
    if (!user?.id || !newStatus || !PERMS_BY_STATUS[newStatus]) return;
    setStatusSaving(true);
    try {
      // 1. users.client_status
      const { error: userErr } = await supabase
        .from('users')
        .update({ client_status: newStatus })
        .eq('id', user.id);
      if (userErr) throw userErr;

      // 2. trainee_permissions (only when the coach actually owns
      // the relationship — coach_id is required by the table's PK).
      if (currentUser?.id) {
        try {
          await supabase.from('trainee_permissions').upsert({
            coach_id: currentUser.id,
            trainee_id: user.id,
            ...PERMS_BY_STATUS[newStatus],
          }, { onConflict: 'coach_id,trainee_id' });
        } catch (e) {
          console.warn('[StatusChange] perms upsert failed:', e?.message);
        }
      }

      // 3. Package freeze / unfreeze. Suspended freezes any active
      // package; flipping back to active thaws frozen packages so
      // session-deduction resumes where it left off.
      if (newStatus === 'suspended') {
        try {
          await supabase
            .from('client_services')
            .update({ status: 'frozen' })
            .eq('trainee_id', user.id)
            .eq('status', 'active');
        } catch (e) { console.warn('[StatusChange] freeze failed:', e?.message); }
      } else if (newStatus === 'active') {
        try {
          await supabase
            .from('client_services')
            .update({ status: 'active' })
            .eq('trainee_id', user.id)
            .eq('status', 'frozen');
        } catch (e) { console.warn('[StatusChange] thaw failed:', e?.message); }
      }

      // 4. Refetch + toast
      queryClient.invalidateQueries({ queryKey: ['user-profile', user.id] });
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-services'] });
      const opt = STATUS_BY_KEY[newStatus];
      const name = user.full_name || 'המתאמן';
      const flavorByStatus = {
        active:    `${name} הפך ללקוח פעיל ✓`,
        casual:    `${name} הועבר למזדמן`,
        suspended: `${name} מושהה — החבילה הוקפאה`,
        former:    `${name} הועבר לארכיון`,
      };
      toast.success(flavorByStatus[newStatus] || `${name} — סטטוס עודכן ל${opt?.label || newStatus}`);
      setPendingStatus(null);
      setStatusMenuOpen(false);
    } catch (err) {
      console.error('[StatusChange] failed:', err);
      toast.error('שגיאה בעדכון הסטטוס: ' + (err?.message || ''));
    } finally {
      setStatusSaving(false);
    }
  };

  // Status badge meta — derived per render from the live user row.
  const currentStatusKey = user.client_status && STATUS_BY_KEY[user.client_status]
    ? user.client_status
    : null;
  const currentStatusOpt = currentStatusKey ? STATUS_BY_KEY[currentStatusKey] : null;

  const attendedSessions = sessions.filter(s => s.participants?.some(p => p.trainee_id === user?.id && p.attendance_status === 'הגיע'));
  const attendancePct = sessions.length > 0 ? Math.round((attendedSessions.length / sessions.length) * 100) : 0;
  const activeService = activeServices[0];
  const hasRecentResult = results.length > 0 && new Date(results[0].date) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Coach-set permissions for the *viewed* trainee. Used to hide tabs
  // when the trainee is viewing their own profile. Coach always sees
  // every tab regardless of permissions — the gating happens for the
  // trainee's view only. Hook itself is called above (before the
  // coreDataLoading early return); we just consume traineePerms here.

  const ALL_TAB_ITEMS = [
    { id: 'personal',      label: 'פרטים',    emoji: '👤', icon: User,            perm: null },
    { id: 'plans',         label: 'תוכניות',  emoji: '📋', icon: Folder,          perm: 'view_plan' },
    { id: 'attendance',    label: 'מפגשים',   emoji: '📅', icon: Calendar,        perm: null },
    { id: 'metrics',       label: 'מדידות',   emoji: '📐', icon: Activity,        perm: 'edit_metrics' },
    { id: 'achievements',  label: 'שיאים',    emoji: '🏆', icon: Award,           perm: 'view_progress' },
    { id: 'baselines',     label: 'בייסליין', emoji: '⚡', icon: Zap,             perm: 'view_baseline' },
    { id: 'goals',         label: 'יעדים',    emoji: '🎯', icon: Target,          perm: 'view_progress' },
    { id: 'services',      label: 'חבילות',   emoji: '🎫', icon: Package,         perm: null },
    { id: 'documents',     label: 'מסמכים',   emoji: '📄', icon: FileText,        perm: 'view_documents' },
    { id: 'notifications', label: 'התראות',   emoji: '🔔', icon: Bell,            perm: null },
    { id: 'messages',      label: 'הערות',    emoji: '💬', icon: MessageSquare,   perm: 'send_messages' },
    { id: 'clocks',        label: 'שעונים',   emoji: '⏱', icon: Clock,           perm: null, isLink: true },
  ];

  // Coach view (looking at a trainee, or their own profile) — no
  // gating. Trainee viewing own profile — hide tabs the coach turned
  // off.
  const TAB_ITEMS = isCoach
    ? ALL_TAB_ITEMS
    : ALL_TAB_ITEMS.filter(t => !t.perm || traineePerms[t.perm]);

  // (Tab-fallback useEffect lives above the loading gate — see
  // TAB_PERM_MAP block. Hoisted to keep the hook count stable
  // across the loading → loaded transition.)

  return (
    <ErrorBoundary>
      <div className="w-full bg-[#F2F2F7]" dir="rtl" style={{ fontSize: 16, height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>

        {/* ===== ZONE 1: HEADER ===== */}
        {isCoach ? (
          /* Coach viewing trainee profile — full header */
          <div style={{ backgroundColor: '#FF6F20' }}>
            <div className="px-4 pt-3 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-white/25 border-2 border-white/50 flex items-center justify-center text-white text-lg font-black overflow-hidden flex-shrink-0">
                  {user.profile_image
                    ? <img src={user.profile_image} alt={user.full_name} className="w-full h-full object-cover" />
                    : (user.full_name?.[0]?.toUpperCase() || 'U')
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-white leading-tight truncate" style={{ fontFamily: "'Barlow Condensed', 'DM Sans', sans-serif", fontWeight: 900, fontSize: 20 }}>
                      {user.full_name}
                    </h2>
                    {/* Status badge — only renders for the four
                        canonical statuses (legacy Hebrew values are
                        skipped). Click opens the change-status menu. */}
                    {isCoach && currentStatusOpt && (
                      <button
                        type="button"
                        onClick={() => setStatusMenuOpen(true)}
                        title="לחץ לשינוי סטטוס"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 9px', borderRadius: 999,
                          background: currentStatusOpt.badgeBg,
                          color: currentStatusOpt.badgeFg,
                          border: `1px solid ${currentStatusOpt.borderColor}`,
                          fontSize: 11, fontWeight: 700,
                          cursor: 'pointer', flexShrink: 0,
                          fontFamily: "'Heebo', 'Assistant', sans-serif",
                        }}
                      >
                        <span aria-hidden>{currentStatusOpt.icon}</span>
                        {currentStatusOpt.label}
                      </button>
                    )}
                  </div>
                  <p className="text-white/70 text-[11px] mt-0.5">
                    {user.age ? user.age + ' שנים' : ''}{user.age && user.phone ? ' • ' : ''}{user.phone || ''}
                  </p>
                  <p className="text-white/50 text-[10px] mt-1 italic leading-tight">
                    {MOTIVATION[Math.floor((new Date().getFullYear() * 366 + Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000)) % MOTIVATION.length)]}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Trainee's own view — branded greeting header */
          <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #FF6F20 0%, #FF8F4C 50%, #FFA96B 100%)' }}>
            {/* Decorative circles */}
            <div className="absolute -top-8 -left-8 w-32 h-32 rounded-full opacity-10 bg-white" />
            <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full opacity-10 bg-white" />
            <div className="absolute top-4 left-1/3 w-16 h-16 rounded-full opacity-[0.06] bg-white" />

            <div className="relative px-4 pt-4 pb-4 sm:px-6 sm:pt-5 sm:pb-5">
              {/* Top row: AG logo + logout */}
              <div className="flex justify-between items-center mb-3">
                <span className="text-white/80 font-black text-xs tracking-[0.15em]" style={{ fontFamily: 'Barlow, sans-serif' }}>ATHLETIGO</span>
                <button
                  onClick={async () => { await supabase.auth.signOut(); navigate('/login'); }}
                  className="flex items-center gap-1 text-white/70 text-[11px] font-semibold bg-white/15 px-2.5 py-1 rounded-lg backdrop-blur-sm hover:bg-white/25 transition-colors"
                >
                  <LogOut className="w-3 h-3" />
                  יציאה
                </button>
              </div>

              {/* Profile row */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center text-white font-black overflow-hidden flex-shrink-0 text-lg shadow-lg shadow-black/10">
                  {user.profile_image
                    ? <img src={user.profile_image} alt={user.full_name} className="w-full h-full object-cover" />
                    : (user.full_name?.[0]?.toUpperCase() || 'U')
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white/70 text-[11px] sm:text-xs font-medium mb-0.5">
                    {(() => {
                      const h = new Date().getHours();
                      return h < 6 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 18 ? 'צהריים טובים' : h < 22 ? 'ערב טוב' : 'לילה טוב';
                    })()}
                  </p>
                  <h1 className="text-white leading-tight truncate" style={{ fontFamily: "'Barlow Condensed', 'DM Sans', sans-serif", fontWeight: 900, fontSize: 26 }}>
                    {user.full_name || 'שלום!'}
                  </h1>
                  <p className="text-white/60 text-[11px] sm:text-xs mt-1 truncate">
                    {(() => {
                      const today = new Date().toISOString().split('T')[0];
                      const todaySession = sessions.find(s =>
                        s.date?.startsWith(today) && s.participants?.some(p => p.trainee_id === user.id)
                      );
                      if (todaySession) return `יש לך אימון היום בשעה ${todaySession.time || '—'}`;
                      if (hasRecentResult) return 'כל הכבוד על השיא החדש!';
                      return 'מוכן לאימון של היום?';
                    })()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== ZONE 2: TAB GRID ===== */}
        <div className="px-3 py-2 bg-[#F2F2F7]">
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 sm:gap-2">
            {TAB_ITEMS.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => tab.isLink ? navigate(createPageUrl('Clocks')) : setActiveTab(tab.id)}
                  className={`flex flex-col items-center justify-center rounded-xl transition-all active:scale-95
                    py-2.5 sm:py-3 md:py-3.5
                    ${isActive
                      ? 'bg-[#FFF3EB] border-2 border-[#FF6F20] shadow-sm'
                      : 'bg-white border border-gray-100 hover:shadow-sm hover:border-gray-200'
                    }`}
                >
                  {/* Emoji renders in native multi-color — no color override */}
                  <span style={{ fontSize: 20, lineHeight: 1, marginBottom: 3 }}>{tab.emoji}</span>
                  <span className={`text-[10px] sm:text-xs font-bold leading-tight ${isActive ? 'text-[#FF6F20]' : 'text-gray-500'}`}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ===== ZONE 3: TAB CONTENT (scrollable) ===== */}
        <div style={{ paddingBottom: '100px', direction: 'rtl', textAlign: 'right' }} dir="rtl">
          <div className="max-w-6xl mx-auto px-4 py-4 w-full" dir="rtl" style={{ textAlign: 'right' }}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full" dir="rtl">

              {/* Personal Details Tab */}
              <TabsContent value="personal" className="space-y-4 w-full" dir="rtl">
                {/* Info Card */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
                    <h2 className="text-lg font-bold flex items-center gap-2"><User className="w-5 h-5 text-[#FF6F20]" />פרטים אישיים</h2>
                    <Button onClick={() => setShowEdit(true)} variant="ghost" className="rounded-lg px-3 py-2 font-medium text-xs min-h-[44px]" style={{ border: '1px solid #FF6F20', color: '#FF6F20' }}>
                      <Edit2 className="w-3 h-3 ml-1" />ערוך
                    </Button>
                  </div>
                  <div className="p-4 space-y-2.5">
                    {[
                      { label: 'שם מלא', value: user.full_name },
                      { label: 'טלפון', value: user.phone },
                      { label: 'אימייל', value: user.email },
                      { label: 'גיל', value: user.age ? user.age + ' שנים' : null },
                      { label: 'מין', value: user.gender },
                      { label: 'עיר', value: user.city },
                      { label: 'כתובת', value: user.address },
                      { label: 'מטרה עיקרית', value: user.main_goal },
                    ].map((item, i) => (
                      <div key={i} className="text-right text-sm py-1">
                        <span className="text-gray-500 font-medium">{item.label}: </span>
                        <span className={item.value ? 'text-gray-900' : 'text-gray-300'}>{item.value || 'לא מולא'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Health Card removed — duplicates the Health Declaration form
                    in the Documents tab. The health_issues/medical_history fields
                    remain in the DB and the edit dialog (showHealthUpdate) is still
                    available from the Documents tab's health declaration flow. */}

                {/* Emergency Contact Card */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-gray-50 bg-gray-50/30">
                    <h2 className="text-lg font-bold flex items-center gap-2"><Phone className="w-5 h-5 text-[#FF6F20]" />איש קשר לחירום</h2>
                  </div>
                  <div className="p-4 space-y-2.5">
                    {[
                      { label: 'שם', value: user.emergency_contact_name },
                      { label: 'טלפון', value: user.emergency_contact_phone },
                    ].map((item, i) => (
                      <div key={i} className="text-right text-sm py-1">
                        <span className="text-gray-500 font-medium">{item.label}: </span>
                        <span className={item.value ? 'text-gray-900' : 'text-gray-300'}>{item.value || 'לא מולא'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Password actions:
                    - Coach viewing OWN profile (no userIdParam): can change own password
                    - Coach viewing TRAINEE profile (userIdParam set): can reset trainee's password
                    - Trainee viewing OWN profile: shown a hint to contact coach */}
                {isCoach && !userIdParam && (
                  <button onClick={() => setShowPasswordChange(true)} className="w-full bg-gray-900 rounded-xl p-3 flex items-center gap-2 active:scale-[0.97] transition-transform">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0"><Lock className="w-4 h-4 text-white" /></div>
                    <div className="font-bold text-xs text-white">שינוי סיסמא</div>
                  </button>
                )}
                {isCoach && userIdParam && (
                  <button onClick={() => setShowResetPw(true)} className="w-full rounded-xl p-3 flex items-center gap-2 active:scale-[0.97] transition-transform" style={{ background: '#FFF0E4', border: '1.5px solid #FF6F20' }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#FF6F20' }}>
                      <Lock className="w-4 h-4 text-white" />
                    </div>
                    <div className="font-bold text-xs" style={{ color: '#FF6F20' }}>🔑 אפס סיסמה למתאמן</div>
                  </button>
                )}
                {!isCoach && (
                  <button onClick={() => setShowPasswordChange(true)} className="w-full bg-gray-900 rounded-xl p-3 flex items-center gap-2 active:scale-[0.97] transition-transform">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0"><Lock className="w-4 h-4 text-white" /></div>
                    <div className="font-bold text-xs text-white">שינוי סיסמא</div>
                  </button>
                )}

                {/* Delete Trainee — coach only */}
                {isCoach && userIdParam && (
                  <div className="mt-6 pt-4 border-t border-gray-100">
                    <p className="text-[10px] text-gray-400 font-medium mb-2 text-right">אזור מסוכן</p>
                    <button onClick={() => setShowDeleteConfirm(true)}
                      className="w-full rounded-xl p-3 flex items-center gap-2 active:scale-[0.97] transition-transform border border-red-300 bg-white hover:bg-red-50">
                      <Trash2 className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <span className="font-bold text-sm text-red-600">מחק מתאמן</span>
                    </button>
                  </div>
                )}
              </TabsContent>

              {/* Goals Tab */}
              <TabsContent value="goals" className="space-y-4 w-full" dir="rtl">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold flex items-center gap-2"><Target className="w-5 h-5 text-[#FF6F20]" />יעדים</h2>
                  <Button onClick={() => { setEditingGoal(null); setShowAddGoal(true); }} variant="ghost" className="rounded-lg px-3 py-2 font-medium text-xs min-h-[44px]" style={{ border: '1px solid #FF6F20', color: '#FF6F20' }}>
                    <Plus className="w-3 h-3 ml-1" />הוסף יעד
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-3 w-full">
                  {[
                    { icon: <Target className="w-5 h-5 mx-auto mb-1 text-[#FF6F20]" />, val: activeGoals.length, label: 'פעילים' },
                    { icon: <CheckCircle className="w-5 h-5 mx-auto mb-1 text-green-500" />, val: completedGoals.length, label: 'הושגו' },
                    { icon: <TrendingUp className="w-5 h-5 mx-auto mb-1 text-gray-400" />, val: goals.length, label: 'סה״כ' },
                  ].map((s, i) => (
                    <div key={i} className="p-3 rounded-lg text-center bg-white border border-gray-200">
                      {s.icon}<p className="text-xl font-bold">{s.val}</p><p className="text-xs text-gray-500">{s.label}</p>
                    </div>
                  ))}
                </div>
                {goals.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg"><Target className="w-10 h-10 mx-auto mb-3 text-gray-300" /><p className="text-gray-500">אין יעדים מוגדרים</p></div>
                ) : (
                  <div className="space-y-3">
                    {[...goals].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).map(goal => (
                      <div key={goal.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-gray-50 flex justify-between items-start bg-gray-50/30">
                          <h4 className="font-bold text-base text-gray-900">{goal.goal_name}</h4>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button onClick={() => { setEditingGoal(goal); setShowAddGoal(true); }} size="icon" variant="ghost" className="w-8 h-8 text-[#FF6F20]"><Edit2 className="w-3.5 h-3.5" /></Button>
                            <Button onClick={() => { if (window.confirm(`למחוק "${goal.goal_name}"?`)) deleteGoalMutation.mutate(goal.id); }} size="icon" variant="ghost" className="w-8 h-8 text-red-500"><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </div>
                        <div className="p-4 space-y-2">
                          {goal.description && (
                            <div className="text-right text-sm py-1">
                              <span className="text-gray-500 font-medium">תיאור: </span>
                              <span className="text-gray-900">{goal.description}</span>
                            </div>
                          )}
                          <div className="text-right text-sm py-1">
                            <span className="text-gray-500 font-medium">ערך יעד: </span>
                            <span className="text-gray-900 font-semibold">{goal.target_value} {goal.unit}</span>
                          </div>
                          <div className="text-right text-sm py-1">
                            <span className="text-gray-500 font-medium">התקדמות: </span>
                            <span className="font-bold text-[#FF6F20]">{goal.current_value || 0} / {goal.target_value} {goal.unit}</span>
                          </div>
                          <div className="py-1">
                            <div className="h-2 rounded-full bg-gray-200 overflow-hidden"><div className="h-full bg-[#FF6F20]" style={{ width: `${goal.progress_percentage || 0}%` }} /></div>
                            <p className="text-xs text-right mt-1 font-bold text-[#FF6F20]">{goal.progress_percentage || 0}%</p>
                          </div>
                          {goal.target_date && (
                            <div className="text-right text-sm py-1">
                              <span className="text-gray-500 font-medium">תאריך יעד: </span>
                              <span className="text-gray-900">{format(new Date(goal.target_date), 'dd/MM/yy', { locale: he })}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Metrics Tab */}
              <TabsContent value="metrics" className="space-y-4 w-full" dir="rtl">
                <h2 className="text-lg font-bold flex items-center gap-2"><TrendingUp className="w-5 h-5 text-[#FF6F20]" />מדדים פיזיים</h2>
                <ErrorBoundary fallback={<div className="text-center py-8 bg-gray-50 rounded-lg text-sm text-gray-500">טעינת טאב המדדים נכשלה. נסה לרענן את הדף.</div>}>
                  <PhysicalMetricsManager trainee={user} measurements={measurements} results={results} coach={isCoach ? currentUser : null} currentUser={currentUser} goals={goals} />
                </ErrorBoundary>
              </TabsContent>

              {/* Achievements Tab */}
              <TabsContent value="achievements" className="space-y-4 w-full" dir="rtl">
                <div className="flex justify-between items-center mb-3">
                  <div />
                  <Button onClick={() => openBaselineDialog({ traineeId: user.id, traineeName: user.full_name })} variant="ghost" className="rounded-lg px-3 py-2 font-medium text-xs min-h-[44px]" style={{ border: '1px solid #FF6F20', color: '#FF6F20' }}>
                    <Zap className="w-3 h-3 ml-1" />בייסליין חדש
                  </Button>
                </div>
                <ErrorBoundary fallback={<div className="text-center py-8 bg-gray-50 rounded-lg text-sm text-gray-500">טעינת טאב השיאים נכשלה. נסה לרענן את הדף.</div>}>
                  <ProgressTab traineeId={user?.id} />
                </ErrorBoundary>
              </TabsContent>

              {/* Baselines Tab */}
              <TabsContent value="baselines" className="space-y-4 w-full" dir="rtl">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold flex items-center gap-2"><Zap className="w-5 h-5 text-[#FF6F20]" />בייסליין</h2>
                  <Button onClick={() => openBaselineDialog({ traineeId: user.id, traineeName: user.full_name })} variant="ghost" className="rounded-lg px-3 py-2 font-medium text-xs min-h-[44px]" style={{ border: '1px solid #FF6F20', color: '#FF6F20' }}>
                    <Plus className="w-3 h-3 ml-1" />הוסף בייסליין
                  </Button>
                </div>
                {baselines.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg"><Zap className="w-10 h-10 mx-auto mb-3 text-gray-300" /><p className="text-gray-500">אין מדידות בייסליין עדיין</p></div>
                ) : (
                  <div className="space-y-3">
                    {[...baselines].sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date)).map(b => {
                      const techColors = { basic: '#FF6F20', foot_switch: '#2196F3', high_knees: '#4CAF50' };
                      const techLabels = { basic: 'Basic', foot_switch: 'Foot Switch', high_knees: 'High Knees' };
                      return (
                        <div key={b.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                          <div className="flex justify-between items-start">
                            <button onClick={() => setShowBaselineDetail(b.id)} className="flex-1 text-right active:scale-[0.98] transition-transform">
                              <h4 className="font-bold text-base text-gray-900">Baseline — {techLabels[b.technique] || b.technique}</h4>
                              <p className="text-xs text-gray-500 mt-0.5">{new Date(b.date).toLocaleDateString('he-IL')} • {b.rounds_count} סיבובים × {b.work_time_seconds} שניות</p>
                            </button>
                            <div className="flex items-start gap-2 flex-shrink-0">
                              <div className="text-left">
                                <span className="text-xl font-black" style={{ color: techColors[b.technique] || '#FF6F20' }}>{b.baseline_score}</span>
                                <span className="text-xs font-bold text-gray-400 block">JPS</span>
                              </div>
                              {isCoach && (
                                <Button variant="ghost" size="icon" className="w-8 h-8 text-gray-400 hover:text-[#FF6F20] hover:bg-orange-50"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const newDate = prompt('תאריך (YYYY-MM-DD):', b.date);
                                    if (newDate === null) return;
                                    const newScore = prompt('ציון JPS:', b.baseline_score);
                                    if (newScore === null) return;
                                    const newNotes = prompt('הערות:', b.notes || '');
                                    if (newNotes === null) return;
                                    try {
                                      const updates = {};
                                      if (newDate && newDate !== b.date) updates.date = newDate;
                                      if (newScore && parseFloat(newScore) !== b.baseline_score) updates.baseline_score = parseFloat(newScore);
                                      if (newNotes !== (b.notes || '')) updates.notes = newNotes || null;
                                      if (Object.keys(updates).length === 0) return;
                                      await supabase.from('baselines').update(updates).eq('id', b.id);
                                      if (updates.date) { try { await supabase.from('results_log').update({ date: updates.date }).eq('baseline_id', b.id); } catch {} }
                                      if (updates.baseline_score) { try { await supabase.from('results_log').update({ record_value: String(updates.baseline_score) }).eq('baseline_id', b.id); } catch {} }
                                      toast.success("בייסליין עודכן");
                                      queryClient.invalidateQueries({ queryKey: ['baselines'] });
                                      queryClient.invalidateQueries({ queryKey: ['my-results'] });
                                      invalidateDashboard(queryClient);
                                    } catch (err) { toast.error("שגיאה: " + (err?.message || '')); }
                                  }}>
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                              )}
                              {isCoach && (
                                <Button variant="ghost" size="icon" className="w-8 h-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!window.confirm(`למחוק את הבייסליין מתאריך ${new Date(b.date).toLocaleDateString('he-IL')}?`)) return;
                                    (async () => {
                                      try {
                                        // Delete linked results_log entry
                                        try { await supabase.from('results_log').delete().eq('baseline_id', b.id); } catch {}
                                        // Delete the baseline
                                        await base44.entities.Baseline.delete(b.id);
                                        toast.success("בייסליין נמחק");
                                        queryClient.invalidateQueries({ queryKey: ['baselines'] });
                                        queryClient.invalidateQueries({ queryKey: ['my-results'] });
                                        queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
                                        invalidateDashboard(queryClient);
                                      } catch (err) {
                                        toast.error("שגיאה במחיקה: " + (err?.message || "נסה שוב"));
                                      }
                                    })();
                                  }}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <button onClick={() => setShowBaselineDetail(b.id)} className="w-full text-right text-sm mt-2 active:opacity-70">
                            <span className="text-gray-500 font-medium">סה"כ: </span><span className="text-gray-900">{b.total_jumps} קפיצות</span>
                            <span className="text-gray-300 mx-2">|</span>
                            <span className="text-gray-500 font-medium">ממוצע: </span><span className="text-gray-900">{b.average_jumps}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* Services Tab */}
              <TabsContent value="services" className="space-y-6 w-full" dir="rtl">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold flex items-center gap-2"><Package className="w-5 h-5 text-[#FF6F20]" />שירותים וחבילות</h2>
                  {isCoach && (
                    <Button onClick={() => { setEditingService(null); setServiceForm({ service_type: "personal", group_name: "", billing_model: "punch_card", sessions_per_week: "", package_name: "", base_price: "", discount_type: "none", discount_value: 0, final_price: "", payment_method: "credit", start_date: new Date().toISOString().split('T')[0], end_date: "", next_billing_date: "", total_sessions: "", payment_status: "ממתין לתשלום", notes_internal: "", status: "active" }); setShowAddService(true); }} variant="ghost" className="rounded-lg px-3 py-2 font-medium text-xs min-h-[44px]" style={{ border: '1px solid #FF6F20', color: '#FF6F20' }}>
                      <Plus className="w-3 h-3 ml-1" />הוסף שירות
                    </Button>
                  )}
                </div>

                {/* Active Packages */}
                <div className="space-y-3">
                  {activeServices.map(service => {
                    const svcType = (service.service_type || service.package_type || 'personal').toLowerCase();
                    const isPersonal = svcType === 'personal' || svcType.includes('אישי');
                    const isGroup = svcType === 'group' || svcType.includes('קבוצ');
                    const typeLabel = isPersonal ? 'אישי' : isGroup ? 'קבוצתי' : 'אונליין';
                    const typeColor = isPersonal ? '#FF6F20' : isGroup ? '#2196F3' : '#9C27B0';
                    const total = service.total_sessions || service.sessions_count || 0;
                    const used = service.used_sessions || 0;
                    const remaining = total > 0 ? total - used : null;
                    const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
                    const priceDisplay = service.final_price || service.price || 0;
                    const endDate = service.end_date || service.expires_at;

                    return (
                      <div key={service.id} className="bg-white rounded-xl border-2 shadow-sm overflow-hidden cursor-pointer active:scale-[0.99] transition-transform" style={{ borderColor: typeColor + '40' }} onClick={() => openPackageHistory(service)}>
                        {/* Header */}
                        <div className="p-4 flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-bold text-lg text-gray-900 truncate">{service.package_name || service.group_name || 'חבילה'}</h4>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: typeColor + '15', color: typeColor }}>{typeLabel}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                              <span>{service.start_date ? format(new Date(service.start_date), 'dd/MM/yy') : '—'}</span>
                              {endDate && <><span className="text-gray-300">→</span><span>{format(new Date(endDate), 'dd/MM/yy')}</span></>}
                            </div>
                            {service.payment_method && (
                              <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-1">
                                <span>{getPaymentLabel(service.payment_method)}</span>
                                {service.payment_note && <span>— {service.payment_note}</span>}
                              </div>
                            )}
                          </div>
                          <div className="text-left flex-shrink-0 mr-3">
                            <div className="text-xl font-black" style={{ color: typeColor }}>₪{priceDisplay}</div>
                          </div>
                        </div>

                        {/* Sessions progress */}
                        {remaining !== null && total > 0 && (
                          <div className="px-4 pb-3">
                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                              <div className="flex justify-between items-center text-sm mb-2">
                                <span className="font-bold text-gray-700">מפגשים</span>
                                {editingUsage === service.id ? (
                                  <div className="flex items-center gap-2">
                                    <Input type="number" value={usageValue} onChange={e => setUsageValue(e.target.value)} className="w-16 h-8 text-center bg-white" />
                                    <span className="text-gray-500">/ {total}</span>
                                    <Button onClick={() => updateServiceUsageMutation.mutate()} size="icon" className="h-8 w-8 bg-green-500 rounded-full"><CheckCircle className="w-4 h-4" /></Button>
                                    <Button onClick={() => setEditingUsage(null)} size="icon" variant="ghost" className="h-8 w-8 text-red-500"><Trash2 className="w-4 h-4" /></Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    {isCoach && (
                                      <button onClick={(e) => { e.stopPropagation(); adjustPackageBalance(service, 'refund'); }}
                                        style={{ width:24, height:24, borderRadius:'50%', background:'#dcfce7', border:'none', color:'#16a34a', fontSize:16, cursor:'pointer', fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>−</button>
                                    )}
                                    <span className="font-bold text-lg" style={{ color: typeColor }}>{used}</span>
                                    <span className="text-gray-400 font-medium">/ {total}</span>
                                    {isCoach && (
                                      <button onClick={(e) => { e.stopPropagation(); adjustPackageBalance(service, 'use'); }}
                                        style={{ width:24, height:24, borderRadius:'50%', background:'#fee2e2', border:'none', color:'#dc2626', fontSize:16, cursor:'pointer', fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>+</button>
                                    )}
                                    {isCoach && <Button onClick={(e) => { e.stopPropagation(); setEditingUsage(service.id); setUsageValue(String(used)); }} variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-[#FF6F20]"><Edit2 className="w-3 h-3" /></Button>}
                                  </div>
                                )}
                              </div>
                              <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: typeColor }} /></div>
                            </div>
                          </div>
                        )}

                        {/* Linked sessions accordion (coach-only per spec) */}
                        {isCoach && (
                          <PackageLinkedSessions
                            pkg={service}
                            allSessions={sessions}
                            isCoach={isCoach}
                            typeColor={typeColor}
                            onUseSession={() => adjustPackageBalance(service, 'use')}
                            onRefundSession={() => adjustPackageBalance(service, 'refund')}
                          />
                        )}

                        {/* Coach-only actions */}
                        {isCoach && (
                          <div className="px-4 pb-3" onClick={e => e.stopPropagation()}>
                            {service.notes_internal && <div className="bg-yellow-50 p-2 rounded text-xs text-yellow-800 border border-yellow-100 mb-2"><span className="font-bold">הערות פנימיות:</span> {service.notes_internal}</div>}
                            <div className="pt-2 border-t border-gray-100 flex justify-between">
                              <Button variant="ghost" size="sm" className="text-xs h-9 text-red-400 hover:text-red-600 hover:bg-red-50"
                                onClick={async () => {
                                  if (!window.confirm(`למחוק את החבילה "${service.package_name || service.group_name || 'ללא שם'}"?\n\nפעולה זו תמחק את החבילה ואת כל התשלומים והתנועות הקשורים אליה לצמיתות.`)) return;
                                  try {
                                    try { await supabase.from('sessions').update({ service_id: null }).eq('service_id', service.id); } catch {}
                                    try { await supabase.from('service_transactions').delete().eq('service_id', service.id); } catch {}
                                    try { await supabase.from('service_payments').delete().eq('service_id', service.id); } catch {}
                                    await supabase.from('client_services').delete().eq('id', service.id);
                                    queryClient.invalidateQueries({ queryKey: ['trainee-services'] });
                                    queryClient.invalidateQueries({ queryKey: ['all-services-list'] });
                                    queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
                                    queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
                                    invalidateDashboard(queryClient);
                                    toast.success("החבילה נמחקה");
                                  } catch (err) {
                                    toast.error("שגיאה במחיקת חבילה: " + (err?.message || "נסה שוב"));
                                  }
                                }}>
                                <Trash2 className="w-3 h-3 ml-1" />מחק
                              </Button>
                              <Button variant="ghost" size="sm" className="text-xs h-9 text-[#FF6F20] hover:bg-orange-50" onClick={() => openEditService(service)}>
                                <Edit2 className="w-3 h-3 ml-1" />ערוך
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {activeServices.length === 0 && (
                    <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                      <Package className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                      <p className="text-gray-500">אין חבילות פעילות</p>
                      {isCoach && <Button variant="link" onClick={() => { setEditingService(null); setServiceForm({ service_type: "personal", group_name: "", billing_model: "punch_card", sessions_per_week: "", package_name: "", base_price: "", discount_type: "none", discount_value: 0, final_price: "", payment_method: "credit", start_date: new Date().toISOString().split('T')[0], end_date: "", next_billing_date: "", total_sessions: "", payment_status: "ממתין לתשלום", notes_internal: "", status: "active" }); setShowAddService(true); }} className="text-[#FF6F20]">הוסף חבילה ראשונה</Button>}
                    </div>
                  )}
                </div>

                {/* Purchase History — only completed/expired/cancelled */}
                <div className="space-y-3 pt-4">
                  <h3 className="text-base font-bold text-gray-800 border-b pb-2">היסטוריית רכישות</h3>
                  <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-200" dir="rtl">
                    <table className="w-full text-sm text-right">
                      <thead className="bg-gray-100 border-b border-gray-200"><tr><th className="px-3 py-2 text-right font-bold text-gray-600">שירות</th><th className="px-3 py-2 text-right font-bold text-gray-600">תאריך</th><th className="px-3 py-2 text-right font-bold text-gray-600">מחיר</th><th className="px-3 py-2 text-right font-bold text-gray-600">סטטוס</th>{isCoach && <th className="px-3 py-2 text-right font-bold text-gray-600 w-16">פעולות</th>}</tr></thead>
                      <tbody className="divide-y divide-gray-200">
                        {historyServices.length === 0 ? (
                          <tr><td colSpan={isCoach ? 5 : 4} className="px-4 py-4 text-center text-gray-500 italic">אין היסטוריה</td></tr>
                        ) : (
                          historyServices.map(s => {
                            const derivedStatus = (() => {
                              if (s.status === 'completed' || s.status === 'הסתיים') return 'הסתיים';
                              if (s.status === 'expired' || s.status === 'פג תוקף') return 'פג תוקף';
                              if (s.status === 'cancelled') return 'בוטל';
                              const t = s.total_sessions || s.sessions_count || 0;
                              const u = s.used_sessions || 0;
                              if (t > 0 && u >= t) return 'הסתיים';
                              const ed = s.end_date || s.expires_at;
                              if (ed && new Date(ed) < new Date()) return 'פג תוקף';
                              return s.status || '—';
                            })();
                            const statusClass = derivedStatus === 'הסתיים' ? 'bg-blue-100 text-blue-800' : derivedStatus === 'פג תוקף' ? 'bg-red-100 text-red-800' : derivedStatus === 'בוטל' ? 'bg-gray-100 text-gray-600' : 'bg-gray-100 text-gray-800';
                            return (
                              <tr key={s.id} className="bg-white">
                                <td className="px-3 py-2 text-right"><div className="font-medium">{s.package_name || s.service_type}</div></td>
                                <td className="px-3 py-2 text-right text-gray-600">{s.start_date ? format(new Date(s.start_date), 'dd/MM/yy') : '—'}</td>
                                <td className="px-3 py-2 text-right font-medium">₪{s.final_price || s.price || 0}</td>
                                <td className="px-3 py-2 text-right"><span className={`text-xs px-2 py-0.5 rounded-full ${statusClass}`}>{derivedStatus}</span></td>
                                {isCoach && (
                                  <td className="px-3 py-2 text-right">
                                    <Button onClick={() => openEditService(s)} variant="ghost" size="sm" className="h-7 px-2 text-xs text-[#FF6F20] hover:bg-orange-50">
                                      <Edit2 className="w-3 h-3 ml-1" />ערוך
                                    </Button>
                                  </td>
                                )}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>

              {/* Attendance Tab */}
              <TabsContent value="attendance" className="space-y-4 w-full" dir="rtl">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-[#FF6F20]" />
                    מפגשים
                    {/* Total / completed counter — shows the full
                        history including cancelled rows. "Completed"
                        accepts every variant we've ever written for
                        a successful session. */}
                    {sessions.length > 0 && (() => {
                      const completedCount = sessions.filter((s) => {
                        const direct = s.status;
                        const part = s.participants?.find?.((p) => p.trainee_id === user.id);
                        const att = part?.attendance_status;
                        const ok = (v) => v === 'completed' || v === 'הושלם' || v === 'הגיע' || v === 'התקיים';
                        return ok(direct) || ok(att);
                      }).length;
                      return (
                        <span className="text-xs font-semibold text-gray-500 mr-1">
                          {sessions.length} מפגשים ({completedCount} הושלמו)
                        </span>
                      );
                    })()}
                  </h2>
                  {isCoach && (
                    <Button onClick={() => setShowAddSession(true)} size="sm" className="rounded-lg px-3 py-2 font-medium text-xs min-h-[44px] text-white" style={{ background: '#FF6F20' }}>
                      <Plus className="w-3 h-3 ml-1" />הוסף מפגש
                    </Button>
                  )}
                </div>

                {/* Stats */}
                {(() => {
                  const today = new Date().toISOString().split('T')[0];
                  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
                  const thisWeek = sessions.filter(s => s.date >= weekAgo && s.date <= today);
                  const completed = sessions.filter(s => s.participants?.some(p => p.trainee_id === user.id && (p.attendance_status === 'הגיע' || p.attendance_status === 'התקיים')));
                  const upcoming = sessions.filter(s => s.date >= today);
                  return (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
                        <div className="text-xl font-black text-[#FF6F20]">{thisWeek.length}</div>
                        <div className="text-[10px] text-gray-500 font-medium">השבוע</div>
                      </div>
                      <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
                        <div className="text-xl font-black text-green-600">{completed.length}</div>
                        <div className="text-[10px] text-gray-500 font-medium">בוצעו</div>
                      </div>
                      <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
                        <div className="text-xl font-black text-blue-600">{upcoming.length}</div>
                        <div className="text-[10px] text-gray-500 font-medium">מתוכננים</div>
                      </div>
                    </div>
                  );
                })()}

                {sessions.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg"><Calendar className="w-10 h-10 mx-auto mb-3 text-gray-300" /><p className="text-gray-500">לא נמצאו מפגשים</p></div>
                ) : (
                  <div className="space-y-4">
                    {/* Upcoming */}
                    {(() => {
                      const today = new Date().toISOString().split('T')[0];
                      const upcomingSessions = [...sessions].filter(s => s.date >= today).sort((a, b) => new Date(a.date) - new Date(b.date));
                      const pastSessions = [...sessions].filter(s => s.date < today).sort((a, b) => new Date(b.date) - new Date(a.date));
                      return (<>
                        {upcomingSessions.length > 0 && (
                          <div>
                            <h3 className="text-sm font-bold text-gray-600 mb-2 flex items-center gap-1">מפגשים קרובים <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{upcomingSessions.length}</span></h3>
                            <div className="space-y-2">
                              {upcomingSessions.map(session => {
                      const participant = session.participants?.find(p => p.trainee_id === user.id);
                      const displayStatus = participant?.attendance_status || session.status || 'ממתין';
                      const typeColors = { 'אישי': { bg: '#F3E8FF', border: '#D8B4FE', text: '#7C3AED' }, 'קבוצתי': { bg: '#DBEAFE', border: '#93C5FD', text: '#2563EB' }, 'אונליין': { bg: '#D1FAE5', border: '#6EE7B7', text: '#059669' } };
                      const tc = typeColors[session.session_type] || typeColors['אישי'];
                      // Status palette covers both Hebrew (legacy +
                      // current coach UI) and English (new canonical
                      // values from the casual onboarding pipeline).
                      // 'cancelled' uses gray per the spec — soft-
                      // deleted sessions stay visible but muted.
                      const statusColors = {
                        // legacy Hebrew
                        'הגיע': 'bg-green-100 text-green-800', 'התקיים': 'bg-green-100 text-green-800',
                        'הושלם': 'bg-blue-100 text-blue-800',
                        'מאושר': 'bg-green-100 text-green-800',
                        'בוטל': 'bg-gray-200 text-gray-700', 'בוטל על ידי מאמן': 'bg-gray-200 text-gray-700',
                        'בוטל על ידי מתאמן': 'bg-gray-200 text-gray-700',
                        'לא הגיע': 'bg-red-100 text-red-700', 'ממתין': 'bg-yellow-100 text-yellow-800',
                        'ממתין לאישור': 'bg-orange-100 text-orange-800',
                        // English canonical
                        confirmed:        'bg-green-100 text-green-800',
                        completed:        'bg-blue-100 text-blue-800',
                        cancelled:        'bg-gray-200 text-gray-700',
                        pending_approval: 'bg-orange-100 text-orange-800',
                        no_show:          'bg-red-100 text-red-700',
                      };
                      return (
                        <div key={session.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4" dir="rtl">
                          <div className="flex justify-between items-start mb-2">
                            <div className="text-right flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: tc.bg, color: tc.text, border: `1px solid ${tc.border}` }}>{session.session_type}</span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusColors[displayStatus] || 'bg-gray-100 text-gray-800'}`}>{displayStatus}</span>
                              </div>
                              <h4 className="font-bold text-base text-gray-900">{format(new Date(session.date), 'EEEE, dd/MM/yy', { locale: he })}</h4>
                              <p className="text-xs text-gray-500">{session.time} • {session.location || 'לא צוין'} • {session.duration || 60} דקות</p>
                            </div>
                            {isCoach && (
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <Select value={displayStatus} onValueChange={val => {
                                  if (val === displayStatus) return;
                                  if (val === 'הושלם' || val === 'בוטל') {
                                    // Try linked package first, then any active package
                                    let pkg = null;
                                    if (session.service_id && !session.was_deducted) {
                                      pkg = services.find(s => s.id === session.service_id);
                                    }
                                    if (!pkg || ((pkg.total_sessions || 0) - (pkg.used_sessions || 0)) <= 0) {
                                      // Find any active package with remaining sessions
                                      pkg = services.find(svc => {
                                        const rem = (svc.total_sessions || svc.sessions_count || 0) - (svc.used_sessions || 0);
                                        return rem > 0 && svc.status !== 'completed' && svc.status !== 'cancelled';
                                      });
                                    }
                                    if (pkg && ((pkg.total_sessions || 0) - (pkg.used_sessions || 0)) > 0) {
                                      setDeductDialog({ type: 'deduct', session, pkg: { ...pkg, remaining_sessions: (pkg.total_sessions || 0) - (pkg.used_sessions || 0) }, targetStatus: val });
                                    } else {
                                      setDeductDialog({ type: 'no_package', session, targetStatus: val });
                                    }
                                    return;
                                  }
                                  updateSessionStatusMutation.mutate({ session, newStatus: val });
                                }}>
                                  <SelectTrigger className="h-8 text-xs w-auto min-w-[70px] border-gray-200"><SelectValue /></SelectTrigger>
                                  <SelectContent position="popper" side="top" sideOffset={4}><SelectItem value="ממתין">ממתין</SelectItem><SelectItem value="מאושר">מאושר</SelectItem><SelectItem value="הגיע">הגיע</SelectItem><SelectItem value="לא הגיע">לא הגיע</SelectItem><SelectItem value="בוטל">בוטל</SelectItem><SelectItem value="הושלם">הושלם ✓</SelectItem></SelectContent>
                                </Select>
                                <Button variant="ghost" size="icon" className="w-8 h-8 text-gray-400 hover:text-[#FF6F20]"
                                  onClick={() => { setEditingSession(session); setShowEditSession(true); }}>
                                  <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="w-8 h-8 text-gray-400 hover:text-red-500"
                                  onClick={async () => {
                                    if (!window.confirm(`לבטל את המפגש מתאריך ${format(new Date(session.date), 'dd/MM/yy')}?`)) return;
                                    try {
                                      // Restore package unit if session was attended
                                      const wasAttended = participant?.attendance_status === 'הגיע';
                                      if (wasAttended && session.service_id) {
                                        try {
                                          const svc = services.find(s => s.id === session.service_id);
                                          if (svc && svc.used_sessions > 0) {
                                            await base44.entities.ClientService.update(svc.id, { used_sessions: svc.used_sessions - 1 });
                                            await syncPackageStatus(svc.id);
                                          }
                                        } catch {}
                                      }
                                      // Soft-delete: flip status to 'cancelled' instead
                                      // of removing the row, so the attendance tab keeps
                                      // the audit trail and the trainee's session history
                                      // stays intact.
                                      await base44.entities.Session.update(session.id, {
                                        status: 'cancelled',
                                        status_updated_at: new Date().toISOString(),
                                      });
                                      queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
                                      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
                                      queryClient.invalidateQueries({ queryKey: ['trainee-services'] });
                                      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
                                      invalidateDashboard(queryClient);
                                      toast.success("המפגש בוטל");
                                    } catch (err) {
                                      toast.error("שגיאה בביטול: " + (err?.message || "נסה שוב"));
                                    }
                                  }}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                          {session.coach_notes && <p className="text-xs text-gray-500 text-right mt-1 bg-gray-50 p-2 rounded-lg">{session.coach_notes}</p>}
                        </div>
                      );
                    })}
                            </div>
                          </div>
                        )}
                        {pastSessions.length > 0 && (
                          <div>
                            <h3 className="text-sm font-bold text-gray-600 mb-2 flex items-center gap-1">היסטוריה <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{pastSessions.length}</span></h3>
                            <div className="space-y-2">
                              {pastSessions.map(session => {
                                const participant = session.participants?.find(p => p.trainee_id === user.id);
                                const displayStatus = participant?.attendance_status || session.status || 'ממתין';
                                const typeColors = { 'אישי': { bg: '#F3E8FF', border: '#D8B4FE', text: '#7C3AED' }, 'קבוצתי': { bg: '#DBEAFE', border: '#93C5FD', text: '#2563EB' }, 'אונליין': { bg: '#D1FAE5', border: '#6EE7B7', text: '#059669' } };
                                const tc = typeColors[session.session_type] || typeColors['אישי'];
                                const statusColors = { 'הגיע': 'bg-green-100 text-green-800', 'התקיים': 'bg-green-100 text-green-800', 'הושלם': 'bg-emerald-100 text-emerald-800', 'מאושר': 'bg-blue-100 text-blue-800', 'בוטל': 'bg-red-100 text-red-800', 'בוטל על ידי מאמן': 'bg-red-100 text-red-800', 'לא הגיע': 'bg-orange-100 text-orange-800', 'ממתין': 'bg-yellow-100 text-yellow-800', 'ממתין לאישור': 'bg-yellow-100 text-yellow-800' };
                                return (
                                  <div key={session.id} className="bg-gray-50 rounded-xl border border-gray-100 p-3" dir="rtl">
                                    <div className="flex justify-between items-start">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: tc.bg, color: tc.text }}>{session.session_type}</span>
                                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusColors[displayStatus] || 'bg-gray-100 text-gray-800'}`}>{displayStatus}</span>
                                        </div>
                                        <div className="text-sm font-bold text-gray-700">{format(new Date(session.date), 'dd/MM/yy', { locale: he })}</div>
                                        <div className="text-xs text-gray-400">{session.time} • {session.location || 'לא צוין'}</div>
                                      </div>
                                      {isCoach && (
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                          <Select value={displayStatus} onValueChange={val => {
                                            if (val === displayStatus) return;
                                            if (val === 'הושלם' || val === 'בוטל') {
                                              let pkg = null;
                                              if (session.service_id && !session.was_deducted) {
                                                pkg = services.find(s => s.id === session.service_id);
                                              }
                                              if (!pkg || ((pkg.total_sessions || 0) - (pkg.used_sessions || 0)) <= 0) {
                                                pkg = services.find(svc => {
                                                  const rem = (svc.total_sessions || svc.sessions_count || 0) - (svc.used_sessions || 0);
                                                  return rem > 0 && svc.status !== 'completed' && svc.status !== 'cancelled';
                                                });
                                              }
                                              if (pkg && ((pkg.total_sessions || 0) - (pkg.used_sessions || 0)) > 0) {
                                                setDeductDialog({ type: 'deduct', session, pkg: { ...pkg, remaining_sessions: (pkg.total_sessions || 0) - (pkg.used_sessions || 0) }, targetStatus: val });
                                              } else {
                                                setDeductDialog({ type: 'no_package', session, targetStatus: val });
                                              }
                                              return;
                                            }
                                            updateSessionStatusMutation.mutate({ session, newStatus: val });
                                          }}>
                                            <SelectTrigger className="h-7 text-[10px] w-auto min-w-[60px] border-gray-200"><SelectValue /></SelectTrigger>
                                            <SelectContent position="popper" side="top" sideOffset={4}><SelectItem value="ממתין">ממתין</SelectItem><SelectItem value="מאושר">מאושר</SelectItem><SelectItem value="הגיע">הגיע</SelectItem><SelectItem value="לא הגיע">לא הגיע</SelectItem><SelectItem value="בוטל">בוטל</SelectItem><SelectItem value="הושלם">הושלם ✓</SelectItem></SelectContent>
                                          </Select>
                                          <Button variant="ghost" size="icon" className="w-7 h-7 text-gray-300 hover:text-red-500 flex-shrink-0"
                                            onClick={async () => {
                                              if (!window.confirm(`לבטל את המפגש מתאריך ${format(new Date(session.date), 'dd/MM/yy')}?`)) return;
                                              try {
                                                if (participant?.attendance_status === 'הגיע' && session.service_id) {
                                                  try { const svc = services.find(s => s.id === session.service_id); if (svc?.used_sessions > 0) { await base44.entities.ClientService.update(svc.id, { used_sessions: svc.used_sessions - 1 }); await syncPackageStatus(svc.id); } } catch {}
                                                }
                                                // Soft-delete (see other delete sites in this file).
                                                await base44.entities.Session.update(session.id, {
                                                  status: 'cancelled',
                                                  status_updated_at: new Date().toISOString(),
                                                });
                                                queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
                                                queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
                                                queryClient.invalidateQueries({ queryKey: ['trainee-services'] });
                                                queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
                                                invalidateDashboard(queryClient);
                                                toast.success("המפגש בוטל");
                                              } catch (err) { toast.error("שגיאה בביטול: " + (err?.message || "נסה שוב")); }
                                            }}>
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </>);
                    })()}
                  </div>
                )}
              </TabsContent>

              {/* Plans Tab */}
              <TabsContent value="plans" className="space-y-4 w-full" dir="rtl">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold flex items-center gap-2"><FileText className="w-5 h-5 text-[#FF6F20]" />תוכניות אימון</h2>
                  {isCoach && <Button onClick={() => setShowPlanDialog(true)} variant="ghost" className="rounded-lg px-3 py-2 font-medium text-xs min-h-[44px]" style={{ border: '1px solid #FF6F20', color: '#FF6F20' }}><Plus className="w-3 h-3 ml-1" />צור תוכנית</Button>}
                </div>
                {trainingPlans.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg"><FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" /><p className="text-gray-500">אין תוכניות אימון</p></div>
                ) : (
                  <div className="space-y-4">
                    {trainingPlans.filter(p => p.created_by !== user?.id).length > 0 && (
                      <div className="p-4 rounded-xl bg-orange-50 border border-orange-100">
                        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#FF6F20]" />תוכניות מהמאמן</h3>
                        <div className="space-y-3">
                          {trainingPlans.filter(p => p.created_by !== user?.id).map(plan => {
                            const progress = getPlanProgress(plan);
                            return (
                              <div key={plan.id} onClick={() => isCoach && navigate(createPageUrl("PlanBuilder") + `?planId=${plan.id}`)} className="p-4 rounded-xl bg-white border border-gray-200 hover:shadow-md cursor-pointer" dir="rtl">
                                <div className="flex justify-between items-start mb-2">
                                  <h4 className="font-bold text-base text-right">{plan.plan_name}</h4>
                                  {isCoach && <Button onClick={e => { e.stopPropagation(); navigate(createPageUrl("PlanBuilder") + `?planId=${plan.id}`); }} size="sm" variant="outline" className="h-8 text-xs flex-shrink-0">פתח</Button>}
                                </div>
                                <div className="flex flex-wrap gap-1 mb-2">
                                  {(Array.isArray(plan.goal_focus) ? plan.goal_focus : []).map(k => (
                                    <span key={k} style={{ padding:'3px 8px', borderRadius:9999, background:'#FFF9F0', color:'#FF6F20', border:'1px solid #FFD0A0', fontSize:11, fontWeight:600 }}>
                                      {FOCUS_LABELS[k] || k}
                                    </span>
                                  ))}
                                </div>
                                <div className="flex justify-between text-xs text-gray-500 mb-2"><span>{progress.completed}/{progress.total} תרגילים</span><span>{progress.percent}%</span></div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-[#FF6F20]" style={{ width: `${progress.percent}%` }} /></div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {trainingPlans.filter(p => p.created_by === user?.id).length > 0 && (
                      <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-gray-400" />תוכניות עצמאיות</h3>
                        <div className="space-y-3">
                          {trainingPlans.filter(p => p.created_by === user?.id).map(plan => {
                            const progress = getPlanProgress(plan);
                            return (
                              <div key={plan.id} onClick={() => isCoach && navigate(createPageUrl("PlanBuilder") + `?planId=${plan.id}`)} className="p-4 rounded-xl bg-white border border-gray-200 hover:shadow-md cursor-pointer" dir="rtl">
                                <div className="flex justify-between items-start mb-2">
                                  <h4 className="font-bold text-base text-right">{plan.plan_name}</h4>
                                  {isCoach && <Button onClick={e => { e.stopPropagation(); navigate(createPageUrl("PlanBuilder") + `?planId=${plan.id}`); }} size="sm" variant="outline" className="h-8 text-xs flex-shrink-0">פתח</Button>}
                                </div>
                                <div className="flex flex-wrap gap-1 mb-2">
                                  {(Array.isArray(plan.goal_focus) ? plan.goal_focus : []).map(k => (
                                    <span key={k} style={{ padding:'3px 8px', borderRadius:9999, background:'#f5f5f5', color:'#666', border:'1px solid #ddd', fontSize:11, fontWeight:600 }}>
                                      {FOCUS_LABELS[k] || k}
                                    </span>
                                  ))}
                                </div>
                                <div className="flex justify-between text-xs text-gray-500 mb-2"><span>{progress.completed}/{progress.total} תרגילים</span><span>{progress.percent}%</span></div>
                                <div className="h-2 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-gray-500" style={{ width: `${progress.percent}%` }} /></div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {workoutHistory.length > 0 && (
                      <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500" />היסטוריית אימונים</h3>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {workoutHistory.map(entry => (
                            <div key={entry.id} className="bg-white p-3 rounded-xl border border-blue-100 flex justify-between items-center">
                              <div><h4 className="font-bold text-sm text-blue-900">{entry.planName || "אימון"}</h4><span className="text-xs text-gray-500">{new Date(entry.date).toLocaleDateString('he-IL')}</span></div>
                              <div className="text-xs"><div className="font-bold text-green-600">שליטה: {entry.mastery_avg}</div><div className="font-bold text-orange-600">קושי: {entry.difficulty_avg}</div></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* Notifications Tab */}
              <TabsContent value="notifications" className="space-y-4 w-full" dir="rtl">
                <ErrorBoundary fallback={<div className="text-center py-8 bg-gray-50 rounded-lg text-sm text-gray-500">טעינת טאב ההתראות נכשלה. נסה לרענן את הדף.</div>}>
                  <TraineeNotificationsTab traineeId={user?.id} isCoachView={isCoach} />
                </ErrorBoundary>
              </TabsContent>

              {/* Messages Tab */}
              <TabsContent value="messages" className="space-y-4 w-full" dir="rtl">
                <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><MessageSquare className="w-5 h-5 text-[#FF6F20]" />שיחה עם המאמן</h2>
                {user && coach ? (
                  <div className="rounded-xl overflow-hidden border border-gray-200 bg-white">
                    <ErrorBoundary fallback={<div className="text-center py-8 text-sm text-gray-500">טעינת ההודעות נכשלה. נסה לרענן את הדף.</div>}>
                      <MessageCenter currentUserId={user.id} currentUserName={user.full_name} otherUserId={coach.id} otherUserName={coach.full_name} relatedUserId={user.id} />
                    </ErrorBoundary>
                  </div>
                ) : (
                  <div className="text-center py-8 bg-gray-50 rounded-lg"><MessageSquare className="w-10 h-10 mx-auto mb-3 text-gray-300" /><p className="text-gray-500">לא נמצא מאמן</p></div>
                )}
              </TabsContent>

              {/* Documents Tab */}
              <TabsContent value="documents" className="w-full" dir="rtl">
                <ErrorBoundary fallback={<div className="text-center py-8 bg-gray-50 rounded-lg text-sm text-gray-500">טעינת טאב המסמכים נכשלה. נסה לרענן את הדף.</div>}>
                  {isCoach && (
                    <button
                      onClick={() => setShowDocPicker(true)}
                      style={{
                        width: '100%', padding: 14, background: '#FF6F20', color: '#FFFFFF',
                        border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15,
                        marginBottom: 16, cursor: 'pointer',
                      }}>
                      + הוסף מסמך לחתימה
                    </button>
                  )}
                  {showDocPicker && (
                    <DocumentPickerDialog
                      open={showDocPicker}
                      onClose={() => setShowDocPicker(false)}
                      traineeId={user?.id}
                      traineeName={user?.full_name}
                      coachId={currentUser?.id}
                    />
                  )}
                  <DocumentSigningTab
                    effectiveUser={effectiveUser || user}
                    isCoach={isCoach}
                    currentUserId={currentUser?.id}
                    onUserUpdate={() => {
                      queryClient.invalidateQueries({ queryKey: ['current-user-trainee-profile'] });
                      queryClient.invalidateQueries({ queryKey: ['target-user-profile', userIdParam] });
                      refetch();
                    }}
                  />
                  <TraineeDocumentUpload
                    traineeId={user?.id}
                    coachId={coach?.id}
                    currentUser={currentUser}
                  />
                </ErrorBoundary>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* ===== DIALOGS ===== */}

        {/* Edit Profile Dialog */}
        <Dialog open={showEdit} onOpenChange={setShowEdit}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle className="text-lg font-bold">ערוך פרופיל</DialogTitle></DialogHeader>
            <div className="space-y-5">
              {/* ── פרטים אישיים ── */}
              <div>
                <h3 className="text-sm font-bold text-[#FF6F20] mb-2">פרטים אישיים</h3>
                <div className="space-y-3">
                  <div><Label className="text-xs text-gray-500 mb-1 block">שם מלא</Label><Input value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} className="rounded-lg" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs text-gray-500 mb-1 block">טלפון</Label><Input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="rounded-lg" /></div>
                    <div><Label className="text-xs text-gray-500 mb-1 block">אימייל</Label><Input value={formData.email} disabled className="rounded-lg bg-gray-50 text-gray-400" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label className="text-xs text-gray-500 mb-1 block">תאריך לידה</Label><Input type="date" value={formData.birth_date} onChange={e => { const d = e.target.value; let age = ''; if (d) { const b = new Date(d); age = String(Math.floor((Date.now() - b.getTime()) / (365.25*24*60*60*1000))); } setFormData({ ...formData, birth_date: d, age }); }} max={new Date().toISOString().split('T')[0]} className="rounded-lg" /></div>
                    <div><Label className="text-xs text-gray-500 mb-1 block">גיל</Label><Input value={formData.age} disabled className="rounded-lg bg-gray-50" /></div>
                    <div><Label className="text-xs text-gray-500 mb-1 block">מגדר</Label>
                      <Select value={formData.gender} onValueChange={v => setFormData({ ...formData, gender: v })}>
                        <SelectTrigger className="rounded-lg"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent><SelectItem value="זכר">זכר</SelectItem><SelectItem value="נקבה">נקבה</SelectItem><SelectItem value="אחר">אחר</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs text-gray-500 mb-1 block">עיר</Label><Input value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} className="rounded-lg" /></div>
                    <div><Label className="text-xs text-gray-500 mb-1 block">כתובת</Label><Input value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className="rounded-lg" /></div>
                  </div>
                  <div><Label className="text-xs text-gray-500 mb-1 block">סטטוס</Label>
                    <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v })}>
                      <SelectTrigger className="rounded-lg"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent><SelectItem value="active">פעיל</SelectItem><SelectItem value="inactive">לא פעיל</SelectItem><SelectItem value="frozen">מוקפא</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* ── בריאות ── */}
              <div>
                <h3 className="text-sm font-bold text-[#FF6F20] mb-2">בריאות</h3>
                <div className="space-y-3">
                  <div><Label className="text-xs text-gray-500 mb-1 block">בעיות בריאות / פציעות</Label><Textarea value={formData.health_issues} onChange={e => setFormData({ ...formData, health_issues: e.target.value })} className="rounded-lg resize-none min-h-[60px]" /></div>
                  <div><Label className="text-xs text-gray-500 mb-1 block">היסטוריה רפואית</Label><Textarea value={formData.medical_history} onChange={e => setFormData({ ...formData, medical_history: e.target.value })} className="rounded-lg resize-none min-h-[60px]" /></div>
                </div>
              </div>

              {/* ── חירום ── */}
              <div>
                <h3 className="text-sm font-bold text-[#FF6F20] mb-2">איש קשר לחירום</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs text-gray-500 mb-1 block">שם</Label><Input value={formData.emergency_contact_name} onChange={e => setFormData({ ...formData, emergency_contact_name: e.target.value })} className="rounded-lg" /></div>
                  <div><Label className="text-xs text-gray-500 mb-1 block">טלפון</Label><Input value={formData.emergency_contact_phone} onChange={e => setFormData({ ...formData, emergency_contact_phone: e.target.value })} className="rounded-lg" /></div>
                </div>
              </div>

              {/* ── הערות ── */}
              <div>
                <h3 className="text-sm font-bold text-[#FF6F20] mb-2">הערות</h3>
                <div className="space-y-3">
                  <div><Label className="text-xs text-gray-500 mb-1 block">ביוגרפיה</Label><Textarea value={formData.bio} onChange={e => setFormData({ ...formData, bio: e.target.value })} className="rounded-lg resize-none min-h-[60px]" /></div>
                  <div><Label className="text-xs text-gray-500 mb-1 block">הערות כלליות</Label><Textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="rounded-lg resize-none min-h-[60px]" /></div>
                  {isCoach && <div><Label className="text-xs text-gray-500 mb-1 block">הערות מאמן (פנימי)</Label><Textarea value={formData.coach_notes} onChange={e => setFormData({ ...formData, coach_notes: e.target.value })} className="rounded-lg resize-none min-h-[60px] bg-yellow-50 border-yellow-200" /></div>}
                </div>
              </div>

              <Button onClick={handleSave} disabled={updateUserMutation.isPending || updateTargetUserMutation.isPending} className="w-full font-bold text-white rounded-lg min-h-[44px]" style={{ backgroundColor: '#FF6F20' }}>
                {updateUserMutation.isPending || updateTargetUserMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />שומר...</> : 'שמור שינויים'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Health Declaration Dialog */}
        <Dialog open={showHealthUpdate} onOpenChange={setShowHealthUpdate}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>עדכון הצהרת בריאות</DialogTitle></DialogHeader>
            <div className="space-y-4">
              {hasHealthDraft && (
                <DraftBanner onContinue={keepHealthDraft} onDiscard={discardHealthDraft} />
              )}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border">
                <input type="checkbox" id="hasLimits" checked={healthForm.has_limitations} onChange={e => setHealthForm({ ...healthForm, has_limitations: e.target.checked })} className="w-5 h-5" />
                <Label htmlFor="hasLimits" className="cursor-pointer">יש מגבלות בריאותיות / פציעות</Label>
              </div>
              {healthForm.has_limitations && (
                <div><Label>פירוט מגבלות</Label><Input value={healthForm.health_issues} onChange={e => setHealthForm({ ...healthForm, health_issues: e.target.value })} className="rounded-lg mt-1" style={{ fontSize: 16 }} /></div>
              )}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-50 border border-orange-200">
                <input type="checkbox" id="approved" checked={healthForm.approved} onChange={e => setHealthForm({ ...healthForm, approved: e.target.checked })} className="w-5 h-5" />
                <Label htmlFor="approved" className="cursor-pointer text-sm">אני מאשר/ת שהמידע שמסרתי נכון ומדויק</Label>
              </div>
              <Button onClick={handleHealthUpdate} disabled={updateHealthMutation.isPending} className="w-full font-bold text-white rounded-lg min-h-[44px]" style={{ backgroundColor: '#FF6F20' }}>
                {updateHealthMutation.isPending ? 'שומר...' : 'אשר והמשך'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Vision Dialog */}
        <VisionFormDialog isOpen={showVisionDialog} onClose={() => setShowVisionDialog(false)} initialData={user?.vision || {}} onSubmit={data => updateVisionMutation.mutate(data)} isCoach={isCoach} isLoading={updateVisionMutation.isPending} traineeId={user?.id} />

        {/* Goal Dialog */}
        <GoalFormDialog isOpen={showAddGoal} onClose={() => { setShowAddGoal(false); setEditingGoal(null); }} traineeId={user.id} traineeName={user.full_name} editingGoal={editingGoal} />

        {/* Result Dialog */}
        <ResultFormDialog isOpen={showAddResult} onClose={() => { setShowAddResult(false); setEditingResult(null); }} traineeId={user.id} traineeName={user.full_name} editingResult={editingResult} />

        {/* Baseline Dialogs */}
        {/* BaselineFormDialog mounted globally in App.jsx — opened
            via openBaselineDialog() in the buttons above. */}

        {/* Edit Session Dialog */}
        {showEditSession && editingSession && (
          <SessionFormDialog
            isOpen={showEditSession}
            onClose={() => { setShowEditSession(false); setEditingSession(null); }}
            onSubmit={async (data) => {
              await base44.entities.Session.update(editingSession.id, data);
              queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
              queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
              queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
              invalidateDashboard(queryClient);
              setShowEditSession(false);
              setEditingSession(null);
              toast.success("המפגש עודכן בהצלחה");
            }}
            editingSession={editingSession}
            trainees={[user]}
            isLoading={false}
          />
        )}

        {/* Schedule new session — same dialog the dashboard uses, with
            this trainee pre-selected. Saves with status 'ממתין לאישור'
            and notifies the trainee, identical to dashboard behavior. */}
        {showAddSession && (
          <SessionFormDialog
            isOpen={showAddSession}
            onClose={() => setShowAddSession(false)}
            onSubmit={async (data) => {
              setSavingNewSession(true);
              try {
                const created = await base44.entities.Session.create({
                  ...data,
                  location: data.location || "לא צוין",
                  duration: data.duration || 60,
                  coach_id: currentUser?.id,
                  status: "ממתין לאישור",
                });
                // Auto-link to the trainee's active package (if any +
                // remaining > 0). Mirrors the manual link logic below
                // so balance + used_sessions stay in sync.
                try {
                  const activePkg = (services || []).find(p =>
                    p.trainee_id === user?.id &&
                    ['active','פעיל','ליעפ'].includes((p.status || '').toLowerCase())
                  );
                  if (activePkg && created?.id) {
                    const total = Number(activePkg.total_sessions) || 0;
                    const usedNow = (typeof activePkg.remaining_sessions === 'number')
                      ? Math.max(0, total - Number(activePkg.remaining_sessions))
                      : (Number(activePkg.used_sessions) || 0);
                    if (usedNow < total) {
                      console.log('[TraineeProfile] auto-link new session', created.id, '→ pkg', activePkg.id);
                      await supabase.from('sessions').update({ service_id: activePkg.id }).eq('id', created.id);
                      const newUsed = usedNow + 1;
                      const newRemaining = Math.max(0, total - newUsed);
                      await supabase
                        .from('client_services')
                        .update({ used_sessions: newUsed, remaining_sessions: newRemaining })
                        .eq('id', activePkg.id);
                    }
                  }
                } catch (linkErr) {
                  console.warn('[TraineeProfile] auto-link failed:', linkErr);
                }
                queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
                queryClient.invalidateQueries({ queryKey: ['all-sessions-list'] });
                queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
                queryClient.invalidateQueries({ queryKey: ['all-services-list'] });
                invalidateDashboard(queryClient);
                if (created?.participants && currentUser) {
                  for (const p of created.participants) {
                    try {
                      await notifySessionScheduled({
                        traineeId: p.trainee_id,
                        sessionId: created.id,
                        sessionDate: created.date,
                        sessionTime: created.time,
                        sessionType: created.session_type,
                        coachName: currentUser.full_name,
                      });
                    } catch {}
                  }
                }
                toast.success("המפגש נקבע בהצלחה");
                setShowAddSession(false);
              } catch (e) {
                console.error("[TraineeProfile] add session error:", e);
                toast.error("שגיאה ביצירת מפגש: " + (e?.message || "נסה שוב"));
              } finally {
                setSavingNewSession(false);
              }
            }}
            trainees={[user]}
            isLoading={savingNewSession}
          />
        )}
        <BaselineDetailView isOpen={!!showBaselineDetail} onClose={() => setShowBaselineDetail(null)} baselineId={showBaselineDetail} />

        {/* Plan Form Dialog — pre-selects current trainee */}
        <PlanFormDialog
          isOpen={showPlanDialog}
          onClose={() => setShowPlanDialog(false)}
          onSubmit={async (data) => { await createPlanForTraineeMutation.mutateAsync(data); }}
          trainees={effectiveUser ? [effectiveUser] : user ? [user] : []}
          isLoading={createPlanForTraineeMutation.isPending}
          hideTraineeSelection
        />

        {/* Add/Edit Service Dialog */}
        <Dialog open={showAddService} onOpenChange={setShowAddService}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editingService ? 'ערוך שירות' : 'הוסף שירות'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs mb-1 block">סוג שירות</Label>
                  <Select value={serviceForm.service_type} onValueChange={v => setServiceForm({ ...serviceForm, service_type: v })}>
                    <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="personal">אישי</SelectItem><SelectItem value="group">קבוצתי</SelectItem><SelectItem value="online">אונליין</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs mb-1 block">מודל חיוב</Label>
                  <Select value={serviceForm.billing_model} onValueChange={v => setServiceForm({ ...serviceForm, billing_model: v })}>
                    <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="punch_card">כרטיסייה</SelectItem><SelectItem value="subscription">מנוי</SelectItem><SelectItem value="single">חד פעמי</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label className="text-xs mb-1 block">שם החבילה</Label><Input value={serviceForm.package_name} onChange={e => setServiceForm({ ...serviceForm, package_name: e.target.value })} className="rounded-xl" style={{ fontSize: 16 }} /></div>
              {serviceForm.billing_model === 'punch_card' && <div><Label className="text-xs mb-1 block">מספר אימונים</Label><Input type="number" value={serviceForm.total_sessions} onChange={e => setServiceForm({ ...serviceForm, total_sessions: e.target.value })} className="rounded-xl" style={{ fontSize: 16 }} /></div>}
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs mb-1 block">מחיר בסיס (₪)</Label><Input type="number" value={serviceForm.base_price} onChange={e => setServiceForm({ ...serviceForm, base_price: e.target.value, final_price: e.target.value })} className="rounded-xl" style={{ fontSize: 16 }} /></div>
                <div><Label className="text-xs mb-1 block">מחיר סופי (₪)</Label><Input type="number" value={serviceForm.final_price} onChange={e => setServiceForm({ ...serviceForm, final_price: e.target.value })} className="rounded-xl" style={{ fontSize: 16 }} /></div>
              </div>
              <div><Label className="text-xs mb-1 block">תאריך התחלה</Label><Input type="date" value={serviceForm.start_date} onChange={e => setServiceForm({ ...serviceForm, start_date: e.target.value })} className="rounded-xl" style={{ fontSize: 16 }} /></div>
              {serviceForm.billing_model === 'subscription' && <div><Label className="text-xs mb-1 block">תאריך חיוב הבא</Label><Input type="date" value={serviceForm.next_billing_date} onChange={e => setServiceForm({ ...serviceForm, next_billing_date: e.target.value })} className="rounded-xl" style={{ fontSize: 16 }} /></div>}
              <div>
                <Label className="text-xs mb-2 block">אמצעי תשלום</Label>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'6px' }}>
                  {PAYMENT_METHODS.filter(pm => pm.value !== 'transfer').map(pm => (
                    <button key={pm.value} type="button"
                      onClick={() => setServiceForm({ ...serviceForm, payment_method: pm.value })}
                      style={{
                        padding:'8px 4px', borderRadius:'10px', cursor:'pointer',
                        border: serviceForm.payment_method === pm.value ? '2px solid #FF6F20' : '1.5px solid #eee',
                        background: serviceForm.payment_method === pm.value ? '#FFF0E8' : 'white',
                        display:'flex', flexDirection:'column', alignItems:'center', gap:'3px',
                      }}>
                      <span style={{ fontSize:'18px' }}>{pm.icon}</span>
                      <span style={{ fontSize:'10px', fontWeight: serviceForm.payment_method === pm.value ? '700' : '500', color: serviceForm.payment_method === pm.value ? '#FF6F20' : '#555' }}>{pm.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1 block">הערת תשלום <span className="text-gray-400 font-normal">(אופציונלי)</span></Label>
                <Input value={serviceForm.payment_note} onChange={e => setServiceForm({ ...serviceForm, payment_note: e.target.value })} placeholder="למשל: שולם חצי, שאר בסוף החודש..." className="rounded-xl" style={{ fontSize: 15 }} />
              </div>
              <div><Label className="text-xs mb-1 block">סטטוס</Label>
                <Select value={serviceForm.status} onValueChange={v => setServiceForm({ ...serviceForm, status: v })}>
                  <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="active">פעיל</SelectItem><SelectItem value="frozen">מושהה</SelectItem><SelectItem value="completed">הסתיים</SelectItem><SelectItem value="cancelled">בוטל</SelectItem></SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddOrUpdateService} disabled={createServiceMutation.isPending || updateServiceMutation.isPending} className="w-full rounded-xl py-3 font-bold text-white min-h-[44px]" style={{ backgroundColor: '#FF6F20' }}>
                {createServiceMutation.isPending || updateServiceMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />שומר...</> : (editingService ? 'עדכן שירות' : 'הוסף שירות')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>


        {/* Password Change Dialog */}
        <Dialog open={showPasswordChange} onOpenChange={setShowPasswordChange}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>שינוי סיסמא</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label className="text-sm font-bold block mb-1">סיסמה נוכחית</Label><Input type="password" placeholder="הסיסמה הנוכחית שלך" value={passwordForm.currentPass} onChange={e => setPasswordForm({ ...passwordForm, currentPass: e.target.value })} className="rounded-lg h-11" style={{ direction: 'ltr', fontSize: 16 }} /></div>
              <div><Label className="text-sm font-bold block mb-1">סיסמה חדשה</Label><Input type="password" placeholder="לפחות 6 תווים" value={passwordForm.newPass} onChange={e => setPasswordForm({ ...passwordForm, newPass: e.target.value })} className="rounded-lg h-11" style={{ direction: 'ltr', fontSize: 16 }} /></div>
              <div><Label className="text-sm font-bold block mb-1">אישור סיסמה חדשה</Label><Input type="password" placeholder="הכנס שוב" value={passwordForm.confirm} onChange={e => setPasswordForm({ ...passwordForm, confirm: e.target.value })} className="rounded-lg h-11" style={{ direction: 'ltr', fontSize: 16 }} /></div>
              {passwordForm.newPass && passwordForm.confirm && passwordForm.newPass !== passwordForm.confirm && (
                <div style={{ fontSize: 12, color: '#dc2626' }}>הסיסמאות לא תואמות</div>
              )}
              <Button onClick={handlePasswordChange} disabled={passwordLoading || !passwordForm.currentPass || !passwordForm.newPass || passwordForm.newPass !== passwordForm.confirm || passwordForm.newPass.length < 6} className="w-full font-bold text-white rounded-lg min-h-[44px]" style={{ backgroundColor: '#FF6F20' }}>
                {passwordLoading ? 'שומר...' : '🔒 שנה סיסמה'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Coach: Reset trainee password */}
        {showResetPw && (
          <div
            // Backdrop NO-OP — close only via the "סגור" button below.
            onClick={(e) => { e.stopPropagation(); }}
            onPointerDown={(e) => { e.stopPropagation(); }}
            onTouchStart={(e) => { e.stopPropagation(); }}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 'var(--timer-bar-height, 0px)', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11000, padding: 20 }}
          >
            <div dir="rtl" style={{ background: '#FFF9F0', borderRadius: 24, padding: 24, width: '100%', maxWidth: 340, textAlign: 'right', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
              <MiniTimerBar />
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔑</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a1a' }}>איפוס סיסמה</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>ל{user?.full_name}</div>
              </div>
              {!resetPwGenerated ? (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 6 }}>סיסמה חדשה</label>
                    <input
                      type="text"
                      value={resetPwInput}
                      onChange={e => setResetPwInput(e.target.value)}
                      placeholder="לפחות 6 תווים..."
                      style={{ width: '100%', padding: 12, borderRadius: 14, border: '1.5px solid #F0E4D0', fontSize: 16, direction: 'ltr', textAlign: 'left', boxSizing: 'border-box', outline: 'none' }}
                    />
                  </div>
                  <button type="button" onClick={generateRandomPw}
                    style={{ width: '100%', padding: 8, background: 'transparent', border: 'none', color: '#FF6F20', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 12 }}>
                    🎲 ייצר סיסמה אוטומטית
                  </button>
                  <button type="button" onClick={handleResetTraineePassword}
                    disabled={!resetPwInput || resetPwInput.length < 6 || resetPwSaving}
                    style={{ width: '100%', padding: 12, borderRadius: 14, border: 'none', background: resetPwInput?.length >= 6 && !resetPwSaving ? '#FF6F20' : '#ccc', color: 'white', fontSize: 14, fontWeight: 600, cursor: resetPwInput?.length >= 6 && !resetPwSaving ? 'pointer' : 'default' }}>
                    {resetPwSaving ? '...מאפס' : '🔑 אפס סיסמה'}
                  </button>
                </>
              ) : (
                <>
                  <div style={{ background: 'white', borderRadius: 14, padding: 16, textAlign: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 600, marginBottom: 8 }}>✅ הסיסמה אופסה בהצלחה</div>
                    <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>הסיסמה החדשה:</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#1a1a1a', letterSpacing: 3, fontFamily: 'monospace', direction: 'ltr' }}>
                      {resetPwGenerated}
                    </div>
                  </div>
                  <button type="button"
                    onClick={() => { try { navigator.clipboard.writeText(resetPwGenerated); toast.success('הסיסמה הועתקה'); } catch { toast.error('לא ניתן להעתיק'); } }}
                    style={{ width: '100%', padding: 12, borderRadius: 14, border: 'none', background: '#FF6F20', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>
                    📋 העתק סיסמה
                  </button>
                  <div style={{ fontSize: 12, color: '#888', textAlign: 'center' }}>שלח את הסיסמה למתאמן בוואטסאפ או בטלפון</div>
                </>
              )}
              <button type="button"
                onClick={() => { setShowResetPw(false); setResetPwInput(''); setResetPwGenerated(''); }}
                style={{ width: '100%', padding: 8, background: 'transparent', border: 'none', color: '#888', fontSize: 13, cursor: 'pointer', marginTop: 10 }}>
                סגור
              </button>
            </div>
          </div>
        )}


        {/* Delete Trainee Confirmation Dialog */}
        <Dialog open={showDeleteConfirm} onOpenChange={(open) => { if (!deleting) setShowDeleteConfirm(open); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-red-600 flex items-center gap-2">
                <Trash2 className="w-5 h-5" />מחיקת מתאמן
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-700 text-right">
                האם אתה בטוח שברצונך למחוק את <strong>{user.full_name}</strong>?
              </p>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-right text-xs text-red-700 space-y-1">
                <p className="font-bold">פעולה זו תמחק לצמיתות את:</p>
                <ul className="list-disc list-inside space-y-0.5 mr-2">
                  <li>כל המפגשים שלו</li>
                  <li>כל התוכניות שלו</li>
                  <li>כל המדידות והשיאים</li>
                  <li>כל החבילות והתשלומים</li>
                  <li>כל המסמכים והיעדים</li>
                  <li>כל היסטוריית האימון</li>
                </ul>
                <p className="font-bold pt-1">הפעולה אינה ניתנת לביטול.</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}
                  className="flex-1 rounded-xl">ביטול</Button>
                <Button onClick={async () => {
                  const tid = userIdParam;
                  if (!tid) return;
                  setDeleting(true);
                  try {
                    // 1. Delete service transactions & payments
                    const { data: svcs } = await supabase.from('client_services').select('id').eq('trainee_id', tid);
                    if (svcs?.length) {
                      const svcIds = svcs.map(s => s.id);
                      await supabase.from('service_transactions').delete().in('service_id', svcIds);
                      await supabase.from('service_payments').delete().in('service_id', svcIds);
                    }
                    // 2. Delete direct child tables
                    await supabase.from('client_services').delete().eq('trainee_id', tid);
                    await supabase.from('measurements').delete().eq('trainee_id', tid);
                    await supabase.from('results_log').delete().eq('trainee_id', tid);
                    await supabase.from('baselines').delete().eq('trainee_id', tid);
                    await supabase.from('goals').delete().eq('trainee_id', tid);
                    await supabase.from('notifications').delete().eq('user_id', tid);
                    await supabase.from('messages').delete().eq('sender_id', tid);
                    await supabase.from('messages').delete().eq('receiver_id', tid);
                    await supabase.from('attendance_log').delete().eq('user_id', tid);
                    await supabase.from('workout_logs').delete().eq('user_id', tid);
                    await supabase.from('workout_history').delete().eq('user_id', tid);
                    await supabase.from('reflections').delete().eq('user_id', tid);
                    // 3. Delete training plans cascade
                    const { data: plans } = await supabase.from('training_plans').select('id').or(`assigned_to.eq.${tid},created_by.eq.${tid}`);
                    if (plans?.length) {
                      const planIds = plans.map(p => p.id);
                      const { data: sections } = await supabase.from('training_sections').select('id').in('plan_id', planIds);
                      if (sections?.length) await supabase.from('exercises').delete().in('section_id', sections.map(s => s.id));
                      await supabase.from('training_sections').delete().in('plan_id', planIds);
                      await supabase.from('training_plans').delete().in('id', planIds);
                    }
                    // 4. Delete sessions
                    const { data: allSessions } = await supabase.from('sessions').select('id,participants');
                    const sessionsToDelete = (allSessions || []).filter(s =>
                      s.participants?.some(p => p.trainee_id === tid)
                    );
                    if (sessionsToDelete.length) await supabase.from('sessions').delete().in('id', sessionsToDelete.map(s => s.id));
                    // 5. Delete user
                    await supabase.from('users').delete().eq('id', tid);
                    // 6. Try auth cleanup
                    try { await supabase.functions.invoke('delete-trainee', { body: { trainee_id: tid } }); } catch {}

                    toast.success(`${user.full_name} נמחק בהצלחה`);
                    setShowDeleteConfirm(false);
                    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TRAINEES });
                    queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
                    invalidateDashboard(queryClient);
                    navigate('/');
                  } catch (err) {
                    console.error("[DeleteTrainee]", err);
                    toast.error("לא הצלחנו למחוק את המתאמן. נסה שוב או פנה לתמיכה.");
                  } finally {
                    setDeleting(false);
                  }
                }} disabled={deleting}
                  className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold">
                  {deleting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />מוחק...</> : 'כן, מחק לצמיתות'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Package Session History Dialog */}
        <Dialog open={!!selectedPackageHistory} onOpenChange={(open) => { if (!open) setSelectedPackageHistory(null); }}>
          <DialogContent className="w-[95vw] max-w-lg max-h-[85vh] overflow-y-auto bg-white" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <Package className="w-5 h-5 text-[#FF6F20]" />
                {selectedPackageHistory?.package_name || 'חבילה'}
              </DialogTitle>
            </DialogHeader>

            {selectedPackageHistory && (() => {
              const pkg = selectedPackageHistory;
              const total = pkg.total_sessions || pkg.sessions_count || 0;
              const used = pkg.used_sessions || 0;
              const remaining = Math.max(0, total - used);
              const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
              const completedSessions = packageSessions.filter(s =>
                s.status === 'התקיים' || s.status === 'completed' || s.status === 'מאושר'
              );

              return (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="bg-orange-50 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-gray-700">{completedSessions.length} מפגשים קוימו</span>
                      <span className="text-sm font-bold text-gray-700">{remaining} מפגשים נותרו ביתרה</span>
                    </div>
                    <div className="h-3 bg-white rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: '#FF6F20' }} />
                    </div>
                    <div className="text-center text-xs text-gray-500 font-medium">{used} / {total} מפגשים</div>
                  </div>

                  {/* Sessions list */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-gray-700">מפגשים מקושרים</h3>
                      <button
                        onClick={() => { fetchUnlinkedSessions(); setShowLinkSession(true); }}
                        style={{
                          background: '#FF6F20', color: 'white',
                          border: 'none', borderRadius: 10,
                          padding: '6px 12px', fontSize: 11,
                          fontWeight: 600, cursor: 'pointer',
                        }}
                      >+ שייך ידנית</button>
                    </div>
                    {packageSessionsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-[#FF6F20]" />
                      </div>
                    ) : packageSessions.length === 0 ? (
                      <div className="text-center py-6 text-gray-400 text-sm">אין מפגשים מקושרים לחבילה זו</div>
                    ) : (
                      <div className="space-y-2">
                        {packageSessions.map(s => {
                          const sessionType = s.session_type === 'אישי' || s.session_type === 'personal' ? 'אישי'
                            : s.session_type === 'קבוצתי' || s.session_type === 'group' ? 'קבוצתי' : 'אונליין';
                          const isDone = s.status === 'התקיים' || s.status === 'completed';
                          const isApproved = s.status === 'מאושר';
                          return (
                            <div key={s.id} className="bg-gray-50 rounded-xl p-3 flex items-center justify-between border border-gray-100">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-gray-800">
                                    {s.date ? new Date(s.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                                  </span>
                                  {s.time && <span className="text-xs text-gray-500">{s.time}</span>}
                                </div>
                                <span className="text-[11px] text-gray-400">{sessionType}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {isDone ? (
                                  <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-green-100 text-green-700">הושלם ✓</span>
                                ) : isApproved ? (
                                  <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-700">מאושר</span>
                                ) : (
                                  <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-500">{s.status}</span>
                                )}
                                <button
                                  onClick={() => unlinkSession(s.id)}
                                  title="הסר שיוך"
                                  style={{
                                    background: 'none', border: 'none',
                                    color: '#ccc', fontSize: 16,
                                    cursor: 'pointer', padding: '0 4px',
                                  }}
                                >✕</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <Button onClick={() => setSelectedPackageHistory(null)} variant="outline" className="w-full rounded-xl min-h-[44px]">סגור</Button>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Manual link sub-dialog — pick an unlinked session for this package */}
        {showLinkSession && (
          <div onClick={() => setShowLinkSession(false)} style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 12000,
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: 20,
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: '#FFF9F0', borderRadius: 20,
              padding: 20, width: '100%', maxWidth: 360,
              direction: 'rtl', maxHeight: '85vh', overflowY: 'auto',
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>📅 שייך מפגש לחבילה</div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>מפגשים שלא משויכים לאף חבילה:</div>
              {unlinkedSessions.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#888', padding: 20, fontSize: 13 }}>כל המפגשים כבר משויכים</div>
              ) : unlinkedSessions.map(s => {
                const isDone = s.status === 'התקיים' || s.status === 'completed' || s.status === 'הושלם';
                return (
                  <div key={s.id} onClick={() => linkSessionToPackage(s.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: 10, background: 'white', borderRadius: 12,
                    marginBottom: 6, cursor: 'pointer',
                    border: '0.5px solid #F0E4D0',
                  }}>
                    <div style={{ fontSize: 14 }}>{isDone ? '✅' : '📅'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {s.date ? new Date(s.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }) : '—'}
                      </div>
                      <div style={{ fontSize: 10, color: '#888' }}>{s.status || ''} {s.time ? '· ' + s.time : ''}</div>
                    </div>
                    <div style={{ fontSize: 12, color: '#FF6F20', fontWeight: 600 }}>שייך ←</div>
                  </div>
                );
              })}
              <div onClick={() => setShowLinkSession(false)} style={{
                textAlign: 'center', padding: 10, color: '#888', fontSize: 14,
                cursor: 'pointer', marginTop: 6,
              }}>סגור</div>
            </div>
          </div>
        )}

        {/* Deduction Dialog — has package */}
        {deductDialog?.type === 'deduct' && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', direction:'rtl' }}>
            <div style={{ background:'white', borderRadius:'16px', padding:'24px', width:'100%', maxWidth:'340px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
              <div style={{fontSize:'20px',fontWeight:'900',marginBottom:'8px'}}>
                {deductDialog.targetStatus === 'בוטל' ? 'ביטול מפגש' : 'השלמת מפגש'}
              </div>
              <div style={{fontSize:'15px',color:'#555',marginBottom:'16px',lineHeight:1.6}}>
                יש חבילה פעילה עם{' '}<strong style={{color:'#FF6F20'}}>{deductDialog.pkg.remaining_sessions} מפגשים</strong>{' '}נותרים.
                <br/>האם לקזז מפגש מהחבילה?
              </div>
              <div style={{background:'#FFF0E8',borderRadius:'10px',padding:'10px 14px',marginBottom:'20px',fontSize:'14px',color:'#FF6F20',fontWeight:'700'}}>
                לאחר קיזוז: {Math.max(0, deductDialog.pkg.remaining_sessions - 1)} מפגשים
              </div>
              <div style={{display:'flex',gap:'10px'}}>
                <button onClick={async () => {
                  const st = deductDialog.targetStatus || 'הושלם';
                  setDeductDialog(null);
                  await updateSessionStatusMutation.mutateAsync({ session: deductDialog.session, newStatus: st });
                  toast.success(st === 'בוטל' ? '✓ מפגש בוטל' : '✓ מפגש הושלם');
                }}
                  style={{flex:1,height:'46px',background:'#f5f5f5',color:'#555',border:'none',borderRadius:'10px',fontSize:'15px',fontWeight:'700',cursor:'pointer'}}>ללא קיזוז</button>
                <button onClick={async () => {
                  const st = deductDialog.targetStatus || 'הושלם';
                  const svcId = deductDialog.session.service_id || deductDialog.pkg.id;
                  const svc = services.find(s => s.id === svcId);
                  setDeductDialog(null);

                  // 1. Deduct from package first
                  if (svc) {
                    const newUsed = (svc.used_sessions || 0) + 1;
                    const total = svc.total_sessions || svc.sessions_count || 0;
                    try {
                      await base44.entities.ClientService.update(svc.id, {
                        used_sessions: newUsed,
                        status: (total - newUsed) <= 0 ? 'completed' : svc.status,
                      });
                      await syncPackageStatus(svc.id);
                    } catch (e) { console.error('Deduction failed:', e); }
                  }

                  // 2. Mark session as deducted + update status
                  try { await base44.entities.Session.update(deductDialog.session.id, { was_deducted: true }); } catch {}
                  await updateSessionStatusMutation.mutateAsync({ session: deductDialog.session, newStatus: st });

                  // 3. Force re-fetch packages immediately
                  await queryClient.refetchQueries({ queryKey: ['trainee-services'] });
                  queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SERVICES });
                  invalidateDashboard(queryClient);
                  window.dispatchEvent(new CustomEvent('data-changed'));

                  const rem = Math.max(0, deductDialog.pkg.remaining_sessions - 1);
                  const label = st === 'בוטל' ? 'בוטל' : 'הושלם';
                  toast.success(rem === 0 ? `✓ ${label} | החבילה הסתיימה` : rem === 1 ? `✓ ${label} | נותר מפגש אחד` : `✓ ${label} | יתרה: ${rem} מפגשים`);
                }}
                  style={{flex:2,height:'46px',background:'#FF6F20',color:'white',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'900',cursor:'pointer'}}>קזז מהחבילה ✓</button>
              </div>
              <button onClick={() => setDeductDialog(null)} style={{width:'100%',marginTop:'10px',background:'none',border:'none',color:'#999',fontSize:'14px',cursor:'pointer',padding:'8px'}}>ביטול</button>
            </div>
          </div>
        )}

        {/* No Package Dialog */}
        {deductDialog?.type === 'no_package' && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', direction:'rtl' }}>
            <div style={{ background:'white', borderRadius:'16px', padding:'24px', width:'100%', maxWidth:'340px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
              <div style={{fontSize:'20px',fontWeight:'900',marginBottom:'8px'}}>
                {deductDialog.targetStatus === 'בוטל' ? 'ביטול מפגש' : 'אין חבילה פעילה'}
              </div>
              <div style={{fontSize:'15px',color:'#555',marginBottom:'20px',lineHeight:1.6}}>
                למתאמן אין חבילה פעילה עם יתרת מפגשים.
                <br/>{deductDialog.targetStatus === 'בוטל' ? 'האם לבטל את המפגש?' : 'האם להשלים את המפגש ללא קיזוז?'}
              </div>
              <div style={{display:'flex',gap:'10px'}}>
                <button onClick={() => setDeductDialog(null)}
                  style={{flex:1,height:'46px',background:'#f5f5f5',color:'#555',border:'none',borderRadius:'10px',fontSize:'15px',fontWeight:'700',cursor:'pointer'}}>ביטול</button>
                <button onClick={async () => {
                  const st = deductDialog.targetStatus || 'הושלם';
                  setDeductDialog(null);
                  await updateSessionStatusMutation.mutateAsync({ session: deductDialog.session, newStatus: st });
                  window.dispatchEvent(new CustomEvent('data-changed'));
                  toast.success(st === 'בוטל' ? '✓ מפגש בוטל' : '✓ מפגש הושלם');
                }}
                  style={{flex:2,height:'46px',background:'#FF6F20',color:'white',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'900',cursor:'pointer'}}>
                  {deductDialog.targetStatus === 'בוטל' ? 'בטל מפגש ✓' : 'השלם ללא קיזוז ✓'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ─── Change client status dialog ───────────────────────────
          Two stages in one mount:
          1. Menu (statusMenuOpen, no pendingStatus): pick a new
             status from the 4 options + see its description.
          2. Confirm (pendingStatus is set): explicit confirm step
             before the side-effects fire. */}
      {isCoach && (
        <Dialog
          open={statusMenuOpen}
          onOpenChange={(open) => { if (!open && !statusSaving) { setStatusMenuOpen(false); setPendingStatus(null); } }}
        >
          <DialogContent className="max-w-sm" onInteractOutside={(e) => { if (statusSaving) e.preventDefault(); }}>
            <DialogHeader>
              <DialogTitle style={{ textAlign: 'right', fontSize: 18, fontWeight: 800 }}>
                {pendingStatus ? 'אישור שינוי סטטוס' : 'שינוי סטטוס לקוח'}
              </DialogTitle>
            </DialogHeader>

            <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
              {!pendingStatus ? (
                CLIENT_STATUS_OPTIONS.map((opt) => {
                  const isCurrent = opt.key === currentStatusKey;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => { if (!isCurrent) setPendingStatus(opt.key); }}
                      disabled={isCurrent}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: 12, borderRadius: 12,
                        background: isCurrent ? '#F9FAFB' : '#FFFFFF',
                        border: `1.5px solid ${isCurrent ? '#E5E7EB' : opt.borderColor}`,
                        cursor: isCurrent ? 'not-allowed' : 'pointer',
                        opacity: isCurrent ? 0.6 : 1,
                        textAlign: 'right',
                        fontFamily: "'Heebo', 'Assistant', sans-serif",
                      }}
                    >
                      <span style={{
                        flexShrink: 0,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 28, height: 28, borderRadius: 999,
                        background: opt.badgeBg, color: opt.badgeFg,
                        fontSize: 14, fontWeight: 800,
                      }}>{opt.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1A1A', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {opt.label}
                          {isCurrent && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF' }}>(נוכחי)</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2, lineHeight: 1.4 }}>
                          {opt.description}
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <>
                  <div style={{ fontSize: 14, color: '#1A1A1A', lineHeight: 1.6, padding: '8px 0' }}>
                    לשנות את הסטטוס של <strong>{user.full_name}</strong> ל-
                    <strong style={{ color: STATUS_BY_KEY[pendingStatus]?.badgeFg }}>
                      {' '}{STATUS_BY_KEY[pendingStatus]?.label}
                    </strong>
                    ?
                  </div>
                  <div style={{
                    background: STATUS_BY_KEY[pendingStatus]?.badgeBg,
                    border: `1px solid ${STATUS_BY_KEY[pendingStatus]?.borderColor}`,
                    borderRadius: 10, padding: 10,
                    fontSize: 12, color: STATUS_BY_KEY[pendingStatus]?.badgeFg,
                    lineHeight: 1.5,
                  }}>
                    {STATUS_BY_KEY[pendingStatus]?.description}
                  </div>
                  <div style={{ display: 'flex', gap: 8, paddingTop: 6 }}>
                    <button
                      type="button"
                      onClick={() => setPendingStatus(null)}
                      disabled={statusSaving}
                      style={{
                        flex: 1, padding: '10px 14px', borderRadius: 10,
                        border: '1px solid #E5E7EB', background: '#FFFFFF',
                        color: '#374151', fontSize: 14, fontWeight: 700,
                        cursor: statusSaving ? 'wait' : 'pointer',
                      }}
                    >חזור</button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(pendingStatus)}
                      disabled={statusSaving}
                      style={{
                        flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none',
                        background: '#FF6F20', color: '#FFFFFF',
                        fontSize: 14, fontWeight: 800,
                        cursor: statusSaving ? 'wait' : 'pointer',
                        opacity: statusSaving ? 0.7 : 1,
                      }}
                    >
                      {statusSaving ? 'שומר...' : 'אשר שינוי'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </ErrorBoundary>
  );
}
