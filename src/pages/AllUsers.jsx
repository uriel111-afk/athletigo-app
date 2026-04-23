import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import RenameUserDialog from "../components/forms/RenameUserDialog";
import AddTraineeDialog from "../components/forms/AddTraineeDialog";
import { toast } from "sonner";
import { useClientStats } from "../components/hooks/useClientStats";
import { useSessionStats } from "../components/hooks/useSessionStats";
import PageLoader from "../components/PageLoader";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import ProtectedCoachPage from "../components/ProtectedCoachPage";
import { normalizeStatus, isActivePackage } from "@/lib/enums";

export default function AllUsers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddTraineeOpen, setIsAddTraineeOpen] = useState(false);
  const [filterType, setFilterType] = useState(new URLSearchParams(window.location.search).get('filter') || "all"); // all, active, expiring, inactive
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [userToRename, setUserToRename] = useState(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const renameUserMutation = useMutation({
    mutationFn: async ({ id, fullName }) => {
      await base44.entities.User.update(id, { full_name: fullName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] }); // Assuming useClientStats uses this key or similar
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      toast.success("שם המשתמש עודכן בהצלחה");
      setShowRenameDialog(false);
      setUserToRename(null);
    },
    onError: (error) => {
      console.error("Failed to rename user:", error);
      toast.error("שגיאה בעדכון השם");
    }
  });

  // 1. Fetch Users & Services (Shared Hook)
  const { allTrainees, allServices, activeClientsCount, traineesLoading } = useClientStats();

  // Realtime sync — refetch when users/services change
  useEffect(() => {
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['all-services-list'] });
    };
    const ch = supabase
      .channel('allusers-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_services' }, refresh)
      .subscribe();
    window.addEventListener('data-changed', refresh);
    return () => { supabase.removeChannel(ch); window.removeEventListener('data-changed', refresh); };
  }, [queryClient]);

  // 2. Fetch Sessions (Shared Hook)
  const { sessions: allSessions } = useSessionStats();

  // ── Helpers — derive a trainee's package + session stats ───────
  const getActivePackage = (traineeId) => {
    return allServices.find(p =>
      p.trainee_id === traineeId &&
      isActivePackage(normalizeStatus(p.status))
    );
  };
  const getRemaining = (pkg) => {
    if (!pkg) return 0;
    if (pkg.remaining_sessions != null) return Number(pkg.remaining_sessions);
    if (pkg.sessions_remaining != null) return Number(pkg.sessions_remaining);
    return Math.max(0, (Number(pkg.total_sessions) || 0) - (Number(pkg.used_sessions) || 0));
  };
  const getCompletedSessions = (traineeId) => {
    return allSessions.filter(s => {
      const matches = s.trainee_id === traineeId
        || (Array.isArray(s.participants) && s.participants.some(p => p?.trainee_id === traineeId));
      if (!matches) return false;
      const n = normalizeStatus(s.status);
      return n === 'completed' || n === 'present';
    }).length;
  };

  // ── Counts for filter chips ─────────────────────────────────────
  const counts = useMemo(() => {
    let active = 0, expiring = 0, inactive = 0;
    for (const t of allTrainees) {
      const pkg = getActivePackage(t.id);
      if (!pkg) { inactive++; continue; }
      const rem = getRemaining(pkg);
      if (rem > 0 && rem <= 2) expiring++;
      else if (rem > 0) active++;
      else inactive++;
    }
    return { all: allTrainees.length, active, expiring, inactive };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTrainees, allServices]);

  // ── Filter logic ────────────────────────────────────────────────
  const filteredTrainees = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return allTrainees.filter(t => {
      if (q) {
        const hit = (t.full_name || '').toLowerCase().includes(q)
          || (t.email || '').toLowerCase().includes(q)
          || (t.phone || '').includes(searchTerm);
        if (!hit) return false;
      }
      if (filterType === 'all') return true;
      const pkg = getActivePackage(t.id);
      const rem = pkg ? getRemaining(pkg) : 0;
      if (filterType === 'active')   return !!pkg && rem > 2;
      if (filterType === 'expiring') return !!pkg && rem > 0 && rem <= 2;
      if (filterType === 'inactive') return !pkg || rem === 0;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTrainees, allServices, searchTerm, filterType]);

  return (
    <ProtectedCoachPage>
      <div style={{ minHeight: '100vh', background: '#FFF9F0', paddingBottom: 100, direction: 'rtl' }}>
        {/* A. Page header */}
        <div style={{
          padding: 16,
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a' }}>👥 מתאמנים</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              {allTrainees.length} מתאמנים · {counts.active} פעילים
            </div>
          </div>
          <button
            onClick={() => setIsAddTraineeOpen(true)}
            style={{
              background: '#FF6F20', color: 'white',
              border: 'none', borderRadius: 12,
              padding: '10px 16px', fontSize: 13,
              fontWeight: 600, cursor: 'pointer',
            }}
          >+ מתאמן חדש</button>
        </div>

        {/* B. Search */}
        <div style={{ padding: '0 16px 10px' }}>
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="🔍 חיפוש מתאמן..."
            style={{
              width: '100%', padding: '12px 16px',
              borderRadius: 14,
              border: '1.5px solid #F0E4D0',
              fontSize: 14, direction: 'rtl',
              background: 'white', outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* C. Filter chips */}
        <div style={{
          display: 'flex', gap: 6,
          padding: '0 16px 12px',
          overflowX: 'auto',
        }}>
          {[
            { id: 'all',      label: 'הכל',          count: counts.all },
            { id: 'active',   label: 'פעילים',       count: counts.active },
            { id: 'expiring', label: 'חבילה נגמרת',  count: counts.expiring },
            { id: 'inactive', label: 'לא פעילים',    count: counts.inactive },
          ].map(f => {
            const active = filterType === f.id;
            return (
              <div key={f.id} onClick={() => setFilterType(f.id)} style={{
                padding: '6px 12px', borderRadius: 20,
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0,
                background: active ? '#FF6F20' : 'white',
                color: active ? 'white' : '#888',
                border: active ? 'none' : '1px solid #F0E4D0',
              }}>{f.label} ({f.count})</div>
            );
          })}
        </div>

        {/* D. User cards or empty state */}
        {traineesLoading ? (
          <PageLoader />
        ) : filteredTrainees.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '40px 20px',
            color: '#888',
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
            <div style={{ fontSize: 14 }}>
              {searchTerm ? 'לא נמצאו תוצאות' : 'אין מתאמנים'}
            </div>
          </div>
        ) : filteredTrainees.map(t => {
          const pkg = getActivePackage(t.id);
          const remaining = pkg ? getRemaining(pkg) : 0;
          const totalSessions = getCompletedSessions(t.id);
          const isExpiring = !!pkg && remaining > 0 && remaining <= 2;
          const inactive = !pkg || remaining === 0;
          const initial = (t.full_name || '?').trim().charAt(0);

          return (
            <div
              key={t.id}
              onClick={() => navigate(createPageUrl('TraineeProfile') + `?userId=${encodeURIComponent(t.id)}`)}
              style={{
                background: 'white',
                borderRadius: 16,
                padding: 14,
                margin: '0 12px 8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                cursor: 'pointer',
                border: isExpiring ? '1.5px solid #EAB308' : '0.5px solid #F0E4D0',
              }}
            >
              {/* Top row */}
              <div style={{
                display: 'flex', alignItems: 'center',
                gap: 10, marginBottom: 10,
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 14,
                  background: '#FFF0E4',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, fontWeight: 600, color: '#FF6F20',
                  flexShrink: 0,
                }}>{initial}</div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 15, fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{t.full_name || 'מתאמן'}</div>
                  <div style={{
                    fontSize: 11, color: '#888', marginTop: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{t.phone || t.email || ''}</div>
                </div>

                <div style={{
                  padding: '3px 10px', borderRadius: 8,
                  fontSize: 10, fontWeight: 600, flexShrink: 0,
                  background: pkg ? (isExpiring ? '#FFF9E6' : '#E8F5E9') : '#F3F4F6',
                  color: pkg ? (isExpiring ? '#EAB308' : '#16a34a') : '#888',
                }}>
                  {inactive ? 'לא פעיל' : (isExpiring ? 'נגמר בקרוב' : 'פעיל')}
                </div>
              </div>

              {/* Stats row */}
              <div style={{ display: 'flex', gap: 4 }}>
                <div style={{
                  flex: 1, textAlign: 'center',
                  background: '#FFF9F0',
                  borderRadius: 10, padding: '6px 2px',
                }}>
                  <div style={{
                    fontSize: 16, fontWeight: 600,
                    color: pkg && remaining <= 2 ? '#dc2626' : '#1a1a1a',
                  }}>{pkg ? `${remaining}/${pkg.total_sessions || 0}` : '—'}</div>
                  <div style={{ fontSize: 9, color: '#888' }}>מפגשים</div>
                </div>
                <div style={{
                  flex: 1, textAlign: 'center',
                  background: '#FFF9F0',
                  borderRadius: 10, padding: '6px 2px',
                }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#16a34a' }}>{totalSessions}</div>
                  <div style={{ fontSize: 9, color: '#888' }}>הושלמו</div>
                </div>
                <div style={{
                  flex: 1, textAlign: 'center',
                  background: '#FFF9F0',
                  borderRadius: 10, padding: '6px 2px',
                }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#FF6F20' }}>—</div>
                  <div style={{ fontSize: 9, color: '#888' }}>רצף</div>
                </div>
                <div style={{
                  flex: 1.5, textAlign: 'center',
                  background: '#FFF9F0',
                  borderRadius: 10, padding: '6px 2px',
                }}>
                  <div style={{
                    fontSize: 11, fontWeight: 500, color: '#1a1a1a',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{pkg?.package_name || pkg?.service_type || '—'}</div>
                  <div style={{ fontSize: 9, color: '#888' }}>חבילה</div>
                </div>
              </div>
            </div>
          );
        })}

        <RenameUserDialog
          isOpen={showRenameDialog}
          onClose={() => {
            setShowRenameDialog(false);
            setUserToRename(null);
          }}
          onSubmit={(newName) => {
            if (userToRename) {
              renameUserMutation.mutate({ id: userToRename.id, fullName: newName });
            }
          }}
          user={userToRename}
          isLoading={renameUserMutation.isPending}
        />

        <AddTraineeDialog open={isAddTraineeOpen} onClose={() => setIsAddTraineeOpen(false)} />
      </div>
    </ProtectedCoachPage>
  );
}