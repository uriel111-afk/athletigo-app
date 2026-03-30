import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Edit2, User, Mail, Phone, MapPin, Briefcase, Shield, CheckCircle } from "lucide-react";
import ProtectedCoachPage from "../components/ProtectedCoachPage";
import { toast } from "sonner";

export default function CoachProfile() {
  const [user, setUser] = useState(null);
  const [showEdit, setShowEdit] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    bio: "",
    certifications: ""
  });

  const queryClient = useQueryClient();

  const { data: currentUser, refetch } = useQuery({
    queryKey: ['current-user-coach-profile'],
    queryFn: () => base44.auth.me(),
    refetchInterval: 3000,
    refetchIntervalInBackground: true
  });

  useEffect(() => {
    if (currentUser) {
      setUser(currentUser);
      setFormData({
        full_name: currentUser.full_name || "",
        email: currentUser.email || "",
        phone: currentUser.phone || "",
        address: currentUser.address || "",
        city: currentUser.city || "",
        bio: currentUser.bio || "",
        certifications: currentUser.certifications || ""
      });
    }
  }, [currentUser]);

  const updateUserMutation = useMutation({
    mutationFn: (data) => base44.auth.updateMe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-user-coach-profile'] });
      refetch();
      setShowEdit(false);
      toast.success("✅ הפרופיל עודכן בהצלחה");
    },
  });

  const enableCoachModeMutation = useMutation({
    mutationFn: () => base44.auth.updateMe({ isCoach: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-user-coach-profile'] });
      refetch();
      toast.success("✅ מצב מאמן הופעל! טוען מחדש...");
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    },
    onError: () => {
      toast.error("❌ שגיאה בהפעלת מצב מאמן");
    }
  });

  const handleSave = async () => {
    await updateUserMutation.mutateAsync({
      phone: formData.phone,
      address: formData.address,
      city: formData.city,
      bio: formData.bio,
      certifications: formData.certifications
    });
  };

  const handleEnableCoachMode = async () => {
    if (confirm("האם להפעיל מצב מאמן? תקבל גישה לדשבורד ולכל התכונות של מאמן.")) {
      await enableCoachModeMutation.mutateAsync();
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFFFF' }}>
        <div className="athletigo-spinner mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-y-auto" style={{ backgroundColor: '#FFFFFF', WebkitOverflowScrolling: 'touch' }}>
        <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
          {/* Header */}
          <div className="mb-6 md:mb-10">
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-black mb-2 md:mb-4" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif', letterSpacing: '-0.02em' }}>
              הפרופיל שלי
            </h1>
            <p className="text-lg md:text-2xl mb-2 md:mb-4 font-medium" style={{ color: '#7D7D7D' }}>
              פרטי המאמן וניהול חשבון
            </p>
            <div className="w-20 md:w-24 h-1 rounded-full" style={{ backgroundColor: '#FF6F20' }} />
          </div>

          {/* Coach Mode Status */}
          <div className="mb-6 md:mb-8 p-4 md:p-6 rounded-xl md:rounded-2xl" style={{ 
            backgroundColor: user.isCoach ? '#E8F5E9' : '#FFF8F3',
            border: `2px solid ${user.isCoach ? '#4CAF50' : '#FF6F20'}`
          }}>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Shield className="w-6 h-6 md:w-8 md:h-8" style={{ color: user.isCoach ? '#4CAF50' : '#FF6F20' }} />
                <div>
                  <h3 className="text-base md:text-xl font-black" style={{ color: '#000000' }}>
                    {user.isCoach ? '✅ מצב מאמן פעיל' : '⚠️ מצב מאמן לא פעיל'}
                  </h3>
                  <p className="text-xs md:text-sm" style={{ color: '#7D7D7D' }}>
                    {user.isCoach 
                      ? 'יש לך גישה מלאה לכל התכונות של מאמן'
                      : 'הפעל מצב מאמן כדי לקבל גישה לדשבורד ולכל התכונות'
                    }
                  </p>
                </div>
              </div>
              {!user.isCoach && (
                <Button
                  onClick={handleEnableCoachMode}
                  disabled={enableCoachModeMutation.isPending}
                  className="rounded-xl px-4 md:px-6 py-2 md:py-3 font-bold text-white text-sm md:text-base w-full md:w-auto"
                  style={{ backgroundColor: '#FF6F20' }}
                >
                  {enableCoachModeMutation.isPending ? 'מפעיל...' : 'הפעל מצב מאמן'}
                </Button>
              )}
              {user.isCoach && (
                <CheckCircle className="w-6 h-6 md:w-8 md:h-8" style={{ color: '#4CAF50' }} />
              )}
            </div>
          </div>

          {/* Profile Photo */}
          <div className="mb-6 md:mb-10 text-center">
            <div
              className="w-24 h-24 md:w-32 md:h-32 mx-auto rounded-full flex items-center justify-center font-bold text-4xl md:text-5xl mb-3 md:mb-4"
              style={{ 
                backgroundColor: '#FFF8F3', 
                color: '#FF6F20',
                boxShadow: '0 4px 12px rgba(255, 111, 32, 0.15)'
              }}
            >
              {user.full_name?.[0] || 'M'}
            </div>
            
            <h2 className="text-2xl md:text-4xl font-black mb-2 md:mb-3" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
              {user.full_name}
            </h2>
            
            <p className="athletigo-badge athletigo-badge-primary inline-flex text-xs md:text-sm">
              מאמן AthletiGo
            </p>
          </div>

          {/* Personal Info */}
          <div className="mb-6 md:mb-8 athletigo-section">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-0 mb-4 md:mb-6">
              <h2 className="text-2xl md:text-3xl font-black mb-0" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
                מידע אישי
              </h2>
              <Button
                onClick={() => setShowEdit(true)}
                className="athletigo-button-primary rounded-xl px-4 py-2 font-bold w-full md:w-auto text-sm md:text-base"
              >
                <Edit2 className="w-3 h-3 md:w-4 md:h-4 ml-2" />
                ערוך פרטים
              </Button>
            </div>

            <div className="athletigo-card">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="flex items-start gap-3">
                  <Mail className="w-4 h-4 md:w-5 md:h-5 mt-1" style={{ color: '#FF6F20' }} />
                  <div className="flex-1 min-w-0">
                    <p className="athletigo-stat-label mb-1 text-xs">אימייל</p>
                    <p className="font-medium text-sm md:text-base break-all" style={{ color: '#000000' }}>{user.email || '-'}</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <Phone className="w-4 h-4 md:w-5 md:h-5 mt-1" style={{ color: '#FF6F20' }} />
                  <div>
                    <p className="athletigo-stat-label mb-1 text-xs">טלפון</p>
                    <p className="font-medium text-sm md:text-base" style={{ color: '#000000' }}>{user.phone || '-'}</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 md:w-5 md:h-5 mt-1" style={{ color: '#FF6F20' }} />
                  <div>
                    <p className="athletigo-stat-label mb-1 text-xs">כתובת</p>
                    <p className="font-medium text-sm md:text-base" style={{ color: '#000000' }}>{user.address || '-'}</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 md:w-5 md:h-5 mt-1" style={{ color: '#FF6F20' }} />
                  <div>
                    <p className="athletigo-stat-label mb-1 text-xs">עיר</p>
                    <p className="font-medium text-sm md:text-base" style={{ color: '#000000' }}>{user.city || '-'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bio */}
          {user.bio && (
            <div className="mb-6 md:mb-8 athletigo-section">
              <h2 className="text-2xl md:text-3xl font-black mb-4 md:mb-6" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
                אודותיי
              </h2>
              <div className="athletigo-card">
                <p className="leading-relaxed text-sm md:text-base" style={{ color: '#000000' }}>{user.bio}</p>
              </div>
            </div>
          )}

          {/* Certifications */}
          {user.certifications && (
            <div className="mb-6 md:mb-8 athletigo-section">
              <h2 className="text-2xl md:text-3xl font-black mb-4 md:mb-6" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
                הסמכות ותעודות
              </h2>
              <div className="athletigo-card">
                <div className="flex items-start gap-3">
                  <Briefcase className="w-4 h-4 md:w-5 md:h-5 mt-1" style={{ color: '#FF6F20' }} />
                  <p className="leading-relaxed text-sm md:text-base" style={{ color: '#000000' }}>{user.certifications}</p>
                </div>
              </div>
            </div>
          )}

          {/* Edit Dialog */}
          <Dialog open={showEdit} onOpenChange={setShowEdit}>
            <DialogContent className="w-[95vw] md:w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFFFFF' }}>
              <DialogHeader>
                <DialogTitle className="text-xl md:text-3xl font-black" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
                  ערוך פרופיל
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 md:space-y-6">
                <div>
                  <Label className="text-sm md:text-base font-bold mb-2 md:mb-3 block" style={{ color: '#000000' }}>טלפון</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="050-1234567"
                    className="rounded-xl text-sm md:text-base"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  <div>
                    <Label className="text-sm md:text-base font-bold mb-2 md:mb-3 block" style={{ color: '#000000' }}>כתובת</Label>
                    <Input
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="רחוב ומספר"
                      className="rounded-xl text-sm md:text-base"
                    />
                  </div>
                  <div>
                    <Label className="text-sm md:text-base font-bold mb-2 md:mb-3 block" style={{ color: '#000000' }}>עיר</Label>
                    <Input
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      placeholder="שם העיר"
                      className="rounded-xl text-sm md:text-base"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-sm md:text-base font-bold mb-2 md:mb-3 block" style={{ color: '#000000' }}>אודותיי</Label>
                  <Textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    placeholder="ספר קצת על עצמך..."
                    className="rounded-xl min-h-[80px] md:min-h-[100px] text-sm md:text-base"
                  />
                </div>

                <div>
                  <Label className="text-sm md:text-base font-bold mb-2 md:mb-3 block" style={{ color: '#000000' }}>הסמכות ותעודות</Label>
                  <Textarea
                    value={formData.certifications}
                    onChange={(e) => setFormData({ ...formData, certifications: e.target.value })}
                    placeholder="הסמכות מקצועיות..."
                    className="rounded-xl min-h-[80px] md:min-h-[100px] text-sm md:text-base"
                  />
                </div>

                <Button
                  onClick={handleSave}
                  className="athletigo-button-primary w-full py-4 md:py-6 font-bold text-white text-base md:text-lg"
                >
                  שמור שינויים
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
  );
}