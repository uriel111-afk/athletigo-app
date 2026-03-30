import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Edit2, User as UserIcon, Target, Heart, Package, Save, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function CoachProfileManager({ trainee, services, onUpdate }) {
  const [showEditAll, setShowEditAll] = useState(false);
  const [showCoachNotes, setShowCoachNotes] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [profileForm, setProfileForm] = useState({
    full_name: "",
    phone: "",
    address: "",
    city: "",
    birth_date: "",
    age: "",
    gender: "",
    height_cm: "",
    main_goal: "",
    current_status: "",
    future_vision: "",
    health_declaration_accepted: false,
    health_issues: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    coach_internal_notes: "",
    profile_image: ""
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    if (trainee) {
      setProfileForm({
        full_name: trainee.full_name || "",
        phone: trainee.phone || "",
        address: trainee.address || "",
        city: trainee.city || "",
        birth_date: trainee.birth_date ? new Date(trainee.birth_date).toISOString().split('T')[0] : "",
        age: trainee.age?.toString() || "",
        gender: trainee.gender || "",
        height_cm: trainee.height_cm?.toString() || "",
        main_goal: trainee.main_goal || "",
        current_status: trainee.current_status || "",
        future_vision: trainee.future_vision || "",
        health_declaration_accepted: trainee.health_declaration_accepted || false,
        health_issues: trainee.health_issues || "",
        emergency_contact_name: trainee.emergency_contact_name || "",
        emergency_contact_phone: trainee.emergency_contact_phone || "",
        coach_internal_notes: trainee.coach_internal_notes || "",
        profile_image: trainee.profile_image || ""
      });
    }
  }, [trainee]);

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }) => {
      const updatedUser = await base44.entities.User.update(userId, data);
      
      // Update name in related entities if name changed
      if (data.full_name && data.full_name !== trainee.full_name) {
        const newName = data.full_name;
        
        // Update WorkoutLog
        const workoutLogs = await base44.entities.WorkoutLog.filter({ trainee_id: userId });
        for (const log of workoutLogs) {
          await base44.entities.WorkoutLog.update(log.id, { trainee_name: newName });
        }
        
        // Update ClientService
        const clientServices = await base44.entities.ClientService.filter({ trainee_id: userId });
        for (const service of clientServices) {
          await base44.entities.ClientService.update(service.id, { trainee_name: newName });
        }
        
        // Update Goals
        const goals = await base44.entities.Goal.filter({ trainee_id: userId });
        for (const goal of goals) {
          await base44.entities.Goal.update(goal.id, { trainee_name: newName });
        }
        
        // Update Measurements
        const measurements = await base44.entities.Measurement.filter({ trainee_id: userId });
        for (const measurement of measurements) {
          await base44.entities.Measurement.update(measurement.id, { trainee_name: newName });
        }
        
        // Update ResultsLog
        const resultsLogs = await base44.entities.ResultsLog.filter({ trainee_id: userId });
        for (const result of resultsLogs) {
          await base44.entities.ResultsLog.update(result.id, { trainee_name: newName });
        }
        
        // Update Reflections
        const reflections = await base44.entities.Reflection.filter({ trainee_id: userId });
        for (const reflection of reflections) {
          await base44.entities.Reflection.update(reflection.id, { trainee_name: newName });
        }
        
        // Update TrainingPlan
        const plans = await base44.entities.TrainingPlan.filter({ assigned_to: userId });
        for (const plan of plans) {
          await base44.entities.TrainingPlan.update(plan.id, { assigned_to_name: newName });
        }
        
        // Update Session participants
        const allSessions = await base44.entities.Session.list();
        for (const session of allSessions) {
          if (session.participants?.some(p => p.trainee_id === userId)) {
            const updatedParticipants = session.participants.map(p => 
              p.trainee_id === userId ? { ...p, trainee_name: newName } : p
            );
            await base44.entities.Session.update(session.id, { participants: updatedParticipants });
          }
        }
      }
      
      return updatedUser;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['users-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['current-user-profile'] });
      queryClient.invalidateQueries({ queryKey: ['all-services'] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['all-goals'] });
      queryClient.invalidateQueries({ queryKey: ['all-measurements'] });
      queryClient.invalidateQueries({ queryKey: ['all-results'] });
      queryClient.invalidateQueries({ queryKey: ['all-training-plans'] });
      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['all-sessions-clients'] });
      if (onUpdate) onUpdate();
      toast.success("✅ הפרטים עודכנו בהצלחה בכל המערכת");
    },
    onError: (error) => {
      console.error("[CoachProfileManager] Update error:", error);
      toast.error("❌ שגיאה בעדכון הפרטים");
    }
  });

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("נא להעלות קובץ תמונה בלבד");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("גודל התמונה חייב להיות עד 5MB");
      return;
    }

    setUploadingImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      setProfileForm(prevForm => ({ ...prevForm, profile_image: file_url }));
      await base44.entities.User.update(trainee.id, { profile_image: file_url });
      
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['users-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['current-user-profile'] });
      
      toast.success("✅ תמונת הפרופיל עודכנה");
    } catch (error) {
      console.error("[CoachProfileManager] Image upload error:", error);
      toast.error("❌ שגיאה בהעלאת התמונה");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveAll = async () => {
    let ageToSave = profileForm.age ? parseInt(profileForm.age) : null;
    if (profileForm.birth_date) {
      try {
        const birthDate = new Date(profileForm.birth_date);
        const today = new Date();
        ageToSave = Math.floor((today - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
      } catch (error) {
        console.error("Error calculating age:", error);
      }
    }

    await updateUserMutation.mutateAsync({
      userId: trainee.id,
      data: {
        full_name: profileForm.full_name,
        phone: profileForm.phone,
        address: profileForm.address,
        city: profileForm.city,
        birth_date: profileForm.birth_date || null,
        age: ageToSave,
        gender: profileForm.gender || null,
        height_cm: profileForm.height_cm ? parseFloat(profileForm.height_cm) : null,
        main_goal: profileForm.main_goal,
        current_status: profileForm.current_status,
        future_vision: profileForm.future_vision,
        health_declaration_accepted: profileForm.health_declaration_accepted,
        health_issues: profileForm.health_issues,
        emergency_contact_name: profileForm.emergency_contact_name,
        emergency_contact_phone: profileForm.emergency_contact_phone
      }
    });
    setShowEditAll(false);
  };

  const handleSaveCoachNotes = async () => {
    await updateUserMutation.mutateAsync({
      userId: trainee.id,
      data: {
        coach_internal_notes: profileForm.coach_internal_notes
      }
    });
    setShowCoachNotes(false);
  };

  const getDaysRemaining = (endDate) => {
    if (!endDate) return null;
    const today = new Date();
    const end = new Date(endDate);
    const diffTime = end - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const SERVICE_ICONS = {
    "אימונים אישיים": "🧍‍♂️",
    "פעילות קבוצתית": "👥",
    "ליווי אונליין": "💻"
  };

  const activeServices = services?.filter(s => s.status === 'פעיל') || [];

  return (
    <div className="space-y-6">
      {/* SECTION A - Personal Info */}
      <div className="p-6 rounded-xl" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-3">
            <UserIcon className="w-6 h-6" style={{ color: '#FF6F20' }} />
            <h3 className="text-xl font-bold" style={{ color: '#000000' }}>
              מידע אישי
            </h3>
          </div>
          <Button
            onClick={() => setShowEditAll(true)}
            className="rounded-xl px-4 py-2 font-bold text-white"
            style={{ backgroundColor: '#FF6F20' }}
          >
            <Edit2 className="w-4 h-4 ml-2" />
            ערוך פרופיל
          </Button>
        </div>

        <div className="flex items-start gap-6 mb-6">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center font-bold text-3xl"
            style={{ backgroundColor: '#FFF8F3', color: '#FF6F20' }}
          >
            {profileForm.profile_image || trainee.profile_image ? (
                <img 
                  src={profileForm.profile_image || trainee.profile_image} 
                  alt={trainee.full_name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                trainee.full_name?.[0] || 'U'
              )}
          </div>
          <div className="flex-1">
            <p className="text-2xl font-bold mb-2" style={{ color: '#000000' }}>
              {trainee.full_name}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div>
                <p style={{ color: '#7D7D7D' }}>גיל:</p>
                <p className="font-bold" style={{ color: '#000000' }}>{trainee.age || '-'}</p>
              </div>
              <div>
                <p style={{ color: '#7D7D7D' }}>מין:</p>
                <p className="font-bold" style={{ color: '#000000' }}>{trainee.gender || '-'}</p>
              </div>
              <div>
                <p style={{ color: '#7D7D7D' }}>גובה:</p>
                <p className="font-bold" style={{ color: '#000000' }}>
                  {trainee.height_cm ? `${trainee.height_cm} ס״מ` : '-'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl" style={{ backgroundColor: '#FAFAFA' }}>
            <p className="text-sm mb-1" style={{ color: '#7D7D7D' }}>טלפון</p>
            <p className="font-bold" style={{ color: '#000000' }}>{trainee.phone || '-'}</p>
          </div>
          <div className="p-4 rounded-xl" style={{ backgroundColor: '#FAFAFA' }}>
            <p className="text-sm mb-1" style={{ color: '#7D7D7D' }}>אימייל</p>
            <p className="font-bold" style={{ color: '#000000' }}>{trainee.email || '-'}</p>
          </div>
          <div className="p-4 rounded-xl" style={{ backgroundColor: '#FAFAFA' }}>
            <p className="text-sm mb-1" style={{ color: '#7D7D7D' }}>כתובת</p>
            <p className="font-bold" style={{ color: '#000000' }}>{trainee.address || '-'}</p>
          </div>
          <div className="p-4 rounded-xl" style={{ backgroundColor: '#FAFAFA' }}>
            <p className="text-sm mb-1" style={{ color: '#7D7D7D' }}>עיר</p>
            <p className="font-bold" style={{ color: '#000000' }}>{trainee.city || '-'}</p>
          </div>
        </div>
      </div>

      {/* SECTION B - Training Goals */}
      <div className="p-6 rounded-xl" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
        <div className="flex items-center gap-3 mb-6">
          <Target className="w-6 h-6" style={{ color: '#FF6F20' }} />
          <h3 className="text-xl font-bold" style={{ color: '#000000' }}>
            מטרות ותמונת עתיד
          </h3>
        </div>

        <div className="space-y-4">
          <div className="p-4 rounded-xl" style={{ backgroundColor: '#FFF8F3', border: '1px solid #FF6F20' }}>
            <p className="text-sm font-bold mb-2" style={{ color: '#FF6F20' }}>
              המטרה המרכזית באתלטיגו
            </p>
            <p className="text-base leading-relaxed" style={{ color: '#000000' }}>
              {trainee.main_goal || 'לא הוגדרה מטרה'}
            </p>
          </div>

          <div className="p-4 rounded-xl" style={{ backgroundColor: '#FAFAFA' }}>
            <p className="text-sm font-bold mb-2" style={{ color: '#7D7D7D' }}>
              נקודת המוצא
            </p>
            <p className="text-base leading-relaxed" style={{ color: '#000000' }}>
              {trainee.current_status || 'לא הוגדר'}
            </p>
          </div>

          <div className="p-4 rounded-xl" style={{ backgroundColor: '#FAFAFA' }}>
            <p className="text-sm font-bold mb-2" style={{ color: '#7D7D7D' }}>
              תמונת עתיד (3-6 חודשים)
            </p>
            <p className="text-base leading-relaxed" style={{ color: '#000000' }}>
              {trainee.future_vision || 'לא הוגדר'}
            </p>
          </div>
        </div>
      </div>

      {/* SECTION C - Health */}
      <div className="p-6 rounded-xl" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
        <div className="flex items-center gap-3 mb-6">
          <Heart className="w-6 h-6" style={{ color: '#FF6F20' }} />
          <h3 className="text-xl font-bold" style={{ color: '#000000' }}>
            הצהרת בריאות
          </h3>
        </div>

        <div className="space-y-4">
          <div className="p-4 rounded-xl flex items-start gap-3" style={{ backgroundColor: trainee.health_declaration_accepted ? '#F0F9F0' : '#FAFAFA' }}>
            <div
              className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: trainee.health_declaration_accepted ? '#4CAF50' : '#E0E0E0', color: 'white' }}
            >
              {trainee.health_declaration_accepted && '✓'}
            </div>
            <p className="text-sm leading-relaxed" style={{ color: '#000000' }}>
              הצהיר/ה כי הוא/היא בריא/ה ויכול/ה להשתתף בפעילות גופנית
            </p>
          </div>

          {trainee.health_issues && (
            <div className="p-4 rounded-xl" style={{ backgroundColor: '#FAFAFA' }}>
              <p className="text-sm font-bold mb-2" style={{ color: '#7D7D7D' }}>
                מצב רפואי
              </p>
              <p className="text-base leading-relaxed" style={{ color: '#000000' }}>
                {trainee.health_issues}
              </p>
            </div>
          )}

          {(trainee.emergency_contact_name || trainee.emergency_contact_phone) && (
            <div className="p-4 rounded-xl" style={{ backgroundColor: '#FAFAFA' }}>
              <p className="text-sm font-bold mb-2" style={{ color: '#7D7D7D' }}>
                איש קשר לשעת חירום
              </p>
              <div className="space-y-1">
                {trainee.emergency_contact_name && (
                  <p className="text-sm" style={{ color: '#000000' }}>
                    <span className="font-bold">שם:</span> {trainee.emergency_contact_name}
                  </p>
                )}
                {trainee.emergency_contact_phone && (
                  <p className="text-sm" style={{ color: '#000000' }}>
                    <span className="font-bold">טלפון:</span> {trainee.emergency_contact_phone}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SECTION D - Services (View Only) */}
      <div className="p-6 rounded-xl" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
        <div className="flex items-center gap-3 mb-6">
          <Package className="w-6 h-6" style={{ color: '#FF6F20' }} />
          <h3 className="text-xl font-bold" style={{ color: '#000000' }}>
            מסלולים פעילים
          </h3>
        </div>

        {activeServices.length === 0 ? (
          <div className="p-8 text-center">
            <Package className="w-12 h-12 mx-auto mb-3" style={{ color: '#E0E0E0' }} />
            <p className="text-lg" style={{ color: '#7D7D7D' }}>
              אין מסלולים פעילים
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeServices.map((service) => {
              const remaining = service.total_sessions ? service.total_sessions - (service.used_sessions || 0) : null;
              const daysRemaining = getDaysRemaining(service.end_date);

              return (
                <div key={service.id} className="p-4 rounded-xl" style={{ backgroundColor: '#FAFAFA', border: '1px solid #E0E0E0' }}>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{SERVICE_ICONS[service.service_type]}</span>
                    <div className="flex-1">
                      <p className="font-bold" style={{ color: '#000000' }}>
                        {service.service_type}
                      </p>
                      {service.package_name && (
                        <p className="text-sm" style={{ color: '#7D7D7D' }}>
                          {service.package_name}
                        </p>
                      )}
                    </div>
                  </div>

                  {service.service_type === 'אימונים אישיים' && service.total_sessions && (
                    <p className="text-sm" style={{ color: '#FF6F20' }}>
                      נותרו: <span className="font-bold">{remaining}</span> מתוך {service.total_sessions} אימונים
                    </p>
                  )}

                  {(service.service_type === 'פעילות קבוצתית' || service.service_type === 'ליווי אונליין') && service.end_date && (
                    <p className="text-sm" style={{ color: daysRemaining && daysRemaining <= 3 ? '#f44336' : '#4CAF50' }}>
                      בתוקף עד: <span className="font-bold">{service.end_date}</span>
                      {daysRemaining !== null && ` (${daysRemaining > 0 ? `${daysRemaining} ימים` : 'פג תוקף'})`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Coach Internal Notes */}
      <div className="p-6 rounded-xl" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-xl font-bold" style={{ color: '#FF6F20' }}>
            📝 הערות פנימיות למאמן
          </h3>
          <Button
            onClick={() => setShowCoachNotes(true)}
            size="sm"
            className="rounded-xl px-4 py-2 font-bold text-white"
            style={{ backgroundColor: '#FF6F20' }}
          >
            <Edit2 className="w-4 h-4 ml-2" />
            ערוך
          </Button>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: '#000000' }}>
          {trainee.coach_internal_notes || 'אין הערות'}
        </p>
        <p className="text-xs mt-2" style={{ color: '#7D7D7D' }}>
          * הערות אלו אינן גלויות למתאמן
        </p>
      </div>

      {/* Edit All Dialog */}
      <Dialog open={showEditAll} onOpenChange={setShowEditAll}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFFFFF' }}>
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold" style={{ color: '#000000' }}>
              ערוך פרופיל מתאמן
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Profile Image Upload */}
            <div className="p-6 rounded-xl" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
              <Label className="text-base font-bold mb-4 block" style={{ color: '#000000' }}>
                📸 תמונת פרופיל
              </Label>
              <div className="flex items-center gap-6">
                <div 
                  className="w-24 h-24 rounded-full flex items-center justify-center font-bold text-4xl border-4"
                  style={{ 
                    backgroundColor: '#FFFFFF',
                    color: '#FF6F20',
                    borderColor: '#FF6F20'
                  }}
                >
                  {profileForm.profile_image ? (
                    <img 
                      src={profileForm.profile_image} 
                      alt={trainee.full_name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    trainee.full_name?.[0] || 'U'
                  )}
                </div>
                <div className="flex-1">
                  <input
                    type="file"
                    id="coach-profile-image-upload"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <label htmlFor="coach-profile-image-upload">
                    <Button
                      type="button"
                      onClick={() => document.getElementById('coach-profile-image-upload').click()}
                      disabled={uploadingImage}
                      className="rounded-xl px-6 py-3 font-bold text-white"
                      style={{ backgroundColor: '#FF6F20' }}
                      asChild
                    >
                      <span>
                        {uploadingImage ? (
                          <>
                            <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                            מעלה תמונה...
                          </>
                        ) : (
                          <>
                            <Camera className="w-5 h-5 ml-2" />
                            העלה תמונת פרופיל
                          </>
                        )}
                      </span>
                    </Button>
                  </label>
                  <p className="text-xs mt-2" style={{ color: '#7D7D7D' }}>
                    גודל מקסימלי: 5MB | פורמטים: JPG, PNG, GIF
                  </p>
                </div>
              </div>
            </div>

            {/* Personal Info */}
            <div>
              <h4 className="text-lg font-bold mb-4" style={{ color: '#FF6F20' }}>פרטים אישיים</h4>
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>שם מלא *</Label>
                  <Input
                    value={profileForm.full_name}
                    onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                    placeholder="שם מלא"
                    className="rounded-xl"
                    style={{ border: '1px solid #E0E0E0' }}
                  />
                </div>
                
                <div>
                  <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>תאריך לידה</Label>
                  <Input
                    type="date"
                    value={profileForm.birth_date}
                    onChange={(e) => {
                      const newBirthDate = e.target.value;
                      let newAge = "";
                      if (newBirthDate) {
                        try {
                          const birthDate = new Date(newBirthDate);
                          const today = new Date();
                          newAge = Math.floor((today - birthDate) / (365.25 * 24 * 60 * 60 * 1000)).toString();
                        } catch (error) {
                          console.error("Error calculating age:", error);
                        }
                      }
                      setProfileForm({ ...profileForm, birth_date: newBirthDate, age: newAge });
                    }}
                    max={new Date().toISOString().split('T')[0]}
                    className="rounded-xl"
                    style={{ border: '1px solid #E0E0E0' }}
                  />
                  <p className="text-xs mt-1" style={{ color: '#7D7D7D' }}>
                    הגיל יחושב אוטומטית
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>גיל</Label>
                    <Input
                      value={profileForm.age}
                      disabled
                      placeholder="מחושב אוטומטית"
                      className="rounded-xl"
                      style={{ border: '1px solid #E0E0E0', backgroundColor: '#F7F7F7' }}
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>מין</Label>
                    <Select value={profileForm.gender} onValueChange={(value) => 
                      setProfileForm({ ...profileForm, gender: value })
                    }>
                      <SelectTrigger className="rounded-xl" style={{ border: '1px solid #E0E0E0' }}>
                        <SelectValue placeholder="בחר..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="זכר">זכר</SelectItem>
                        <SelectItem value="נקבה">נקבה</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>גובה (ס״מ)</Label>
                  <Input
                    type="number"
                    value={profileForm.height_cm}
                    onChange={(e) => setProfileForm({ ...profileForm, height_cm: e.target.value })}
                    className="rounded-xl"
                    style={{ border: '1px solid #E0E0E0' }}
                  />
                </div>

                <div>
                  <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>טלפון</Label>
                  <Input
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    className="rounded-xl"
                    style={{ border: '1px solid #E0E0E0' }}
                  />
                </div>

                <div>
                  <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>כתובת</Label>
                  <Input
                    value={profileForm.address}
                    onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                    className="rounded-xl"
                    style={{ border: '1px solid #E0E0E0' }}
                  />
                </div>

                <div>
                  <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>עיר</Label>
                  <Input
                    value={profileForm.city}
                    onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                    className="rounded-xl"
                    style={{ border: '1px solid #E0E0E0' }}
                  />
                </div>
              </div>
            </div>

            {/* Training Goals */}
            <div>
              <h4 className="text-lg font-bold mb-4" style={{ color: '#FF6F20' }}>מטרות ותמונת עתיד</h4>
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                    המטרה המרכזית
                  </Label>
                  <Textarea
                    value={profileForm.main_goal}
                    onChange={(e) => setProfileForm({ ...profileForm, main_goal: e.target.value })}
                    className="rounded-xl min-h-[80px]"
                    style={{ border: '1px solid #E0E0E0' }}
                  />
                </div>

                <div>
                  <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                    נקודת המוצא
                  </Label>
                  <Textarea
                    value={profileForm.current_status}
                    onChange={(e) => setProfileForm({ ...profileForm, current_status: e.target.value })}
                    className="rounded-xl min-h-[80px]"
                    style={{ border: '1px solid #E0E0E0' }}
                  />
                </div>

                <div>
                  <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                    תמונת עתיד
                  </Label>
                  <Textarea
                    value={profileForm.future_vision}
                    onChange={(e) => setProfileForm({ ...profileForm, future_vision: e.target.value })}
                    className="rounded-xl min-h-[80px]"
                    style={{ border: '1px solid #E0E0E0' }}
                  />
                </div>
              </div>
            </div>

            {/* Health */}
            <div>
              <h4 className="text-lg font-bold mb-4" style={{ color: '#FF6F20' }}>בריאות</h4>
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                    מצב רפואי
                  </Label>
                  <Textarea
                    value={profileForm.health_issues}
                    onChange={(e) => setProfileForm({ ...profileForm, health_issues: e.target.value })}
                    className="rounded-xl min-h-[80px]"
                    style={{ border: '1px solid #E0E0E0' }}
                  />
                </div>

                <div>
                  <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                    שם איש קשר לחירום
                  </Label>
                  <Input
                    value={profileForm.emergency_contact_name}
                    onChange={(e) => setProfileForm({ ...profileForm, emergency_contact_name: e.target.value })}
                    className="rounded-xl"
                    style={{ border: '1px solid #E0E0E0' }}
                  />
                </div>

                <div>
                  <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                    טלפון איש קשר לחירום
                  </Label>
                  <Input
                    value={profileForm.emergency_contact_phone}
                    onChange={(e) => setProfileForm({ ...profileForm, emergency_contact_phone: e.target.value })}
                    className="rounded-xl"
                    style={{ border: '1px solid #E0E0E0' }}
                  />
                </div>
              </div>
            </div>

            <Button
              onClick={handleSaveAll}
              disabled={updateUserMutation.isPending || !profileForm.full_name}
              className="w-full rounded-xl py-6 font-bold text-white text-lg"
              style={{ backgroundColor: '#FF6F20' }}
            >
              {updateUserMutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                  שומר ומעדכן את כל המערכת...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 ml-2" />
                  שמור את כל השינויים
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Coach Notes Dialog */}
      <Dialog open={showCoachNotes} onOpenChange={setShowCoachNotes}>
        <DialogContent className="max-w-2xl" style={{ backgroundColor: '#FFFFFF' }}>
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold" style={{ color: '#000000' }}>
              הערות פנימיות למאמן
            </DialogTitle>
          </DialogHeader>

          <div className="mb-4 p-4 rounded-xl" style={{ backgroundColor: '#FFF3E0', border: '1px solid #FF6F20' }}>
            <p className="text-sm" style={{ color: '#000000' }}>
              📝 הערות אלו אינן גלויות למתאמן ומיועדות לשימושך האישי
            </p>
          </div>

          <div>
            <Textarea
              value={profileForm.coach_internal_notes}
              onChange={(e) => setProfileForm({ ...profileForm, coach_internal_notes: e.target.value })}
              placeholder="הערות, תובנות, תצפיות..."
              className="rounded-xl min-h-[200px]"
              style={{ border: '1px solid #E0E0E0' }}
            />
          </div>

          <Button
            onClick={handleSaveCoachNotes}
            disabled={updateUserMutation.isPending}
            className="w-full rounded-xl py-6 font-bold text-white text-lg"
            style={{ backgroundColor: '#FF6F20' }}
          >
            {updateUserMutation.isPending ? (
              <>
                <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                שומר...
              </>
            ) : (
              'שמור הערות'
            )}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}