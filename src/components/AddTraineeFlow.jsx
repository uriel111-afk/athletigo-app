import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { User, DollarSign, Plus, X, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AddTraineeFlow({ open, onClose, coach, onSuccess, preSelectedServiceType }) {
  const [step, setStep] = useState(1);
  const [traineeType, setTraineeType] = useState(null);
  const [traineeData, setTraineeData] = useState({
    full_name: "",
    email: "",
    password: "",
    phone: "",
    age: "",
    gender: "",
    client_type: "מתאמן מזדמן",
    has_active_service: false
  });
  const [services, setServices] = useState([]);
  const [currentService, setCurrentService] = useState({
    service_type: preSelectedServiceType || "אימונים אישיים",
    package_name: "",
    price: "",
    start_date: new Date().toISOString().split('T')[0],
    end_date: "",
    total_sessions: "",
    payment_status: "שולם",
    payment_date: new Date().toISOString().split('T')[0],
    status: "פעיל",
    notes: ""
  });

  const queryClient = useQueryClient();

  const createTraineeMutation = useMutation({
    mutationFn: async ({ traineeData, services }) => {
      // OPTIMISTIC UPDATE - show immediately
      const optimisticTrainee = {
        id: 'temp-' + Date.now(),
        ...traineeData,
        role: 'trainee',
        onboarding_completed: true,
        created_date: new Date().toISOString()
      };

      // Update cache immediately
      queryClient.setQueryData(['users-trainees'], (old = []) => [optimisticTrainee, ...old]);
      queryClient.setQueryData(['all-trainees'], (old = []) => [optimisticTrainee, ...old]);

      if (services.length > 0) {
        // Optimistic services
        const optimisticServices = services.map((s, idx) => ({
          id: 'temp-service-' + Date.now() + '-' + idx,
          ...s,
          trainee_id: optimisticTrainee.id,
          trainee_name: optimisticTrainee.full_name,
          created_by_coach: coach?.id || "",
          created_date: new Date().toISOString()
        }));

        queryClient.setQueryData(['services'], (old = []) => [...optimisticServices, ...old]);
        queryClient.setQueryData(['all-services'], (old = []) => [...optimisticServices, ...old]);
        queryClient.setQueryData(['all-services-financial'], (old = []) => [...optimisticServices, ...old]);
      }

      // Actual server call — Edge Function creates auth user + profile atomically
      const { password, ...profileData } = traineeData;

      const { data: fnData, error: fnError } = await supabase.functions.invoke('create-trainee', {
        body: {
          email: traineeData.email.trim(),
          password: traineeData.password,
          full_name: traineeData.full_name,
          phone: traineeData.phone || null,
          birth_date: traineeData.birth_date || null,
          age: traineeData.age ? parseInt(traineeData.age) : null,
          join_date: traineeData.join_date || new Date().toISOString().split('T')[0],
          address: traineeData.address || null,
          coach_notes: traineeData.coach_notes || null,
          client_status: traineeData.client_status || 'לקוח פעיל',
        },
      });

      if (fnError || !fnData?.profile) {
        const msg = fnData?.error || fnError?.message || 'שגיאה ביצירת מתאמן';
        throw new Error(msg);
      }

      const trainee = fnData.profile;

      if (services.length > 0) {
        for (const service of services) {
          await base44.entities.ClientService.create({
            ...service,
            trainee_id: trainee.id,
            trainee_name: trainee.full_name,
            coach_id: coach?.id || null,
            created_by: coach?.id || null,
          });
        }

        await base44.entities.User.update(trainee.id, {
          status: "active",
        });
      }

      return trainee;
    },
    onSuccess: () => {
      // Invalidate all relevant queries for real-time refresh
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['all-services'] });
      queryClient.invalidateQueries({ queryKey: ['users-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['all-services-financial'] });
      queryClient.invalidateQueries({ queryKey: ['trainees'] });
      queryClient.invalidateQueries({ queryKey: ['trainees-list'] });
      
      toast.success(`המתאמן נוצר — אימייל: ${traineeData.email}, סיסמא: ${traineeData.password}`);
      
      // Call parent callback if provided
      if (onSuccess) {
        onSuccess();
      }
      
      handleClose();
    },
    onError: (error) => {
      console.error("[AddTraineeFlow] Error creating trainee:", error);
      
      // Rollback optimistic updates
      queryClient.invalidateQueries({ queryKey: ['users-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['all-services'] });
      
      toast.error("שגיאה ביצירת מתאמן - השינויים בוטלו");
    }
  });

  const handleClose = () => {
    setStep(1);
    setTraineeType(null);
    setTraineeData({
      full_name: "",
      email: "",
      phone: "",
      age: "",
      gender: "",
      client_type: "מתאמן מזדמן",
      has_active_service: false
    });
    setServices([]);
    setCurrentService({
      service_type: preSelectedServiceType || "אימונים אישיים",
      package_name: "",
      price: "",
      start_date: new Date().toISOString().split('T')[0],
      end_date: "",
      total_sessions: "",
      payment_status: "שולם",
      payment_date: new Date().toISOString().split('T')[0],
      status: "פעיל",
      notes: ""
    });
    onClose();
  };

  const handleAddService = () => {
    if (!currentService.package_name || !currentService.price) {
      toast.error("נא למלא שם חבילה ומחיר");
      return;
    }

    // Set payment_date to start_date if payment is "שולם"
    const serviceToAdd = {
      ...currentService,
      price: parseFloat(currentService.price),
      total_sessions: currentService.total_sessions ? parseInt(currentService.total_sessions) : null,
      payment_date: currentService.payment_status === 'שולם' ? currentService.start_date : null
    };

    setServices([...services, serviceToAdd]);

    setCurrentService({
      service_type: preSelectedServiceType || "אימונים אישיים",
      package_name: "",
      price: "",
      start_date: new Date().toISOString().split('T')[0],
      end_date: "",
      total_sessions: "",
      payment_status: "שולם",
      payment_date: new Date().toISOString().split('T')[0],
      status: "פעיל",
      notes: ""
    });

    toast.success("חבילה נוספה");
  };

  const handleRemoveService = (index) => {
    setServices(services.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!traineeData.full_name || !traineeData.phone || !traineeData.email || !traineeData.password) {
      toast.error("נא למלא שם, אימייל וסיסמה");
      return;
    }

    toast.info("מעדכן נתונים…");
    
    await createTraineeMutation.mutateAsync({
      traineeData: {
        ...traineeData,
        age: traineeData.age ? parseInt(traineeData.age) : null
      },
      services
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-3xl font-bold" style={{ color: '#000000' }}>
            ➕ הוסף מתאמן חדש
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Choose Trainee Type */}
        {step === 1 && (
          <div className="space-y-6">
            <p className="text-lg" style={{ color: '#7D7D7D' }}>
              בחר סוג מתאמן:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Casual Trainee */}
              <button
                onClick={() => {
                  setTraineeType("casual");
                  setTraineeData({ ...traineeData, client_type: "מתאמן מזדמן" });
                  setStep(2);
                }}
                className="p-8 rounded-xl text-right hover:shadow-lg transition-all"
                style={{ 
                  backgroundColor: '#FAFAFA',
                  border: traineeType === 'casual' ? '3px solid #7D7D7D' : '1px solid #E0E0E0'
                }}
              >
                <User className="w-12 h-12 mb-4" style={{ color: '#7D7D7D' }} />
                <h3 className="text-2xl font-bold mb-2" style={{ color: '#000000' }}>
                  מתאמן מזדמן
                </h3>
                <p className="text-base" style={{ color: '#7D7D7D' }}>
                  עדיין לא רכש שירות, רק רשום במערכת
                </p>
              </button>

              {/* Paying Client */}
              <button
                onClick={() => {
                  setTraineeType("paying");
                  setTraineeData({ ...traineeData, client_type: "לקוח משלם" });
                  setStep(2);
                }}
                className="p-8 rounded-xl text-right hover:shadow-lg transition-all"
                style={{ 
                  backgroundColor: '#FFF8F3',
                  border: traineeType === 'paying' ? '3px solid #FF6F20' : '2px solid #FF6F20'
                }}
              >
                <DollarSign className="w-12 h-12 mb-4" style={{ color: '#FF6F20' }} />
                <h3 className="text-2xl font-bold mb-2" style={{ color: '#FF6F20' }}>
                  לקוח שרכש שירות
                </h3>
                <p className="text-base" style={{ color: '#7D7D7D' }}>
                  הוסף לקוח עם חבילה משולמת
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Basic Info */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl flex items-center gap-3" style={{ 
              backgroundColor: traineeType === 'paying' ? '#FFF8F3' : '#FAFAFA',
              border: `2px solid ${traineeType === 'paying' ? '#FF6F20' : '#E0E0E0'}`
            }}>
              {traineeType === 'paying' ? <DollarSign className="w-6 h-6" style={{ color: '#FF6F20' }} /> : <User className="w-6 h-6" style={{ color: '#7D7D7D' }} />}
              <div>
                <p className="font-bold" style={{ color: '#000000' }}>
                  {traineeType === 'paying' ? 'לקוח משלם' : 'מתאמן מזדמן'}
                </p>
                <p className="text-sm" style={{ color: '#7D7D7D' }}>
                  {traineeType === 'paying' ? 'יתווסף עם חבילת שירות' : 'יתווסף כמתאמן בלבד'}
                </p>
              </div>
            </div>

            <div>
              <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                שם מלא *
              </Label>
              <Input
                value={traineeData.full_name}
                onChange={(e) => setTraineeData({ ...traineeData, full_name: e.target.value })}
                placeholder="שם פרטי ושם משפחה"
                className="rounded-xl"
                style={{ border: '1px solid #E0E0E0' }}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                  טלפון *
                </Label>
                <Input
                  value={traineeData.phone}
                  onChange={(e) => setTraineeData({ ...traineeData, phone: e.target.value })}
                  placeholder="050-1234567"
                  className="rounded-xl"
                  style={{ border: '1px solid #E0E0E0' }}
                />
              </div>
              <div>
                <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                  אימייל *
                </Label>
                <Input
                  type="email"
                  value={traineeData.email}
                  onChange={(e) => setTraineeData({ ...traineeData, email: e.target.value })}
                  placeholder="example@email.com"
                  className="rounded-xl"
                  style={{ border: '1px solid #E0E0E0' }}
                />
              </div>
              <div>
                <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                  סיסמה *
                </Label>
                <Input
                  type="password"
                  value={traineeData.password}
                  onChange={(e) => setTraineeData({ ...traineeData, password: e.target.value })}
                  placeholder="הזן סיסמה למתאמן"
                  className="rounded-xl"
                  style={{ border: '1px solid #E0E0E0' }}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                  גיל
                </Label>
                <Input
                  type="number"
                  value={traineeData.age}
                  onChange={(e) => setTraineeData({ ...traineeData, age: e.target.value })}
                  placeholder="25"
                  className="rounded-xl"
                  style={{ border: '1px solid #E0E0E0' }}
                />
              </div>
              <div>
                <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                  מין
                </Label>
                <Select
                  value={traineeData.gender}
                  onValueChange={(value) => setTraineeData({ ...traineeData, gender: value })}
                >
                  <SelectTrigger className="rounded-xl" style={{ border: '1px solid #E0E0E0' }}>
                    <SelectValue placeholder="בחר..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="זכר">זכר</SelectItem>
                    <SelectItem value="נקבה">נקבה</SelectItem>
                    <SelectItem value="אחר">אחר</SelectItem>
                    <SelectItem value="מעדיף לא לציין">מעדיף לא לציין</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setStep(1)}
                variant="outline"
                className="flex-1 rounded-xl py-6 font-bold"
                style={{ border: '1px solid #E0E0E0', color: '#000000' }}
              >
                חזור
              </Button>
              {traineeType === 'paying' ? (
                <Button
                  onClick={() => setStep(3)}
                  disabled={!traineeData.full_name || !traineeData.phone}
                  className="flex-1 rounded-xl py-6 font-bold text-white"
                  style={{ backgroundColor: '#FF6F20' }}
                >
                  המשך להוספת חבילות →
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={!traineeData.full_name || !traineeData.phone || createTraineeMutation.isPending}
                  className="flex-1 rounded-xl py-6 font-bold text-white"
                  style={{ backgroundColor: '#7D7D7D' }}
                >
                  {createTraineeMutation.isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                      שומר...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5 ml-2" />
                      הוסף מתאמן
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Add Services (Paying Clients Only) */}
        {step === 3 && traineeType === 'paying' && (
          <div className="space-y-6">
            <div className="p-5 rounded-xl" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
              <p className="font-bold text-lg mb-2" style={{ color: '#FF6F20' }}>
                💰 הוסף חבילות שירות
              </p>
              <p className="text-sm" style={{ color: '#7D7D7D' }}>
                ניתן להוסיף מספר חבילות ללקוח זה
              </p>
            </div>

            {/* Current Service Form */}
            <div className="space-y-4 p-6 rounded-xl" style={{ backgroundColor: '#FAFAFA' }}>
              <div>
                <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                  סוג שירות *
                </Label>
                <Select
                  value={currentService.service_type}
                  onValueChange={(value) => setCurrentService({ ...currentService, service_type: value })}
                >
                  <SelectTrigger className="rounded-xl" style={{ border: '1px solid #E0E0E0' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="אימונים אישיים">🧍‍♂️ אימונים אישיים</SelectItem>
                    <SelectItem value="פעילות קבוצתית">👥 פעילות קבוצתית</SelectItem>
                    <SelectItem value="ליווי אונליין">💻 ליווי אונליין</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                    שם חבילה *
                  </Label>
                  <Input
                    value={currentService.package_name}
                    onChange={(e) => setCurrentService({ ...currentService, package_name: e.target.value })}
                    placeholder='לדוגמה: "12 אימונים"'
                    className="rounded-xl"
                    style={{ border: '1px solid #E0E0E0' }}
                  />
                </div>
                <div>
                  <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                    מחיר (₪) *
                  </Label>
                  <Input
                    type="number"
                    value={currentService.price}
                    onChange={(e) => setCurrentService({ ...currentService, price: e.target.value })}
                    placeholder="1500"
                    className="rounded-xl"
                    style={{ border: '1px solid #E0E0E0' }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                    תאריך התחלה
                  </Label>
                  <Input
                    type="date"
                    value={currentService.start_date}
                    onChange={(e) => setCurrentService({ ...currentService, start_date: e.target.value })}
                    className="rounded-xl"
                    style={{ border: '1px solid #E0E0E0' }}
                  />
                </div>
                <div>
                  <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                    תאריך סיום
                  </Label>
                  <Input
                    type="date"
                    value={currentService.end_date}
                    onChange={(e) => setCurrentService({ ...currentService, end_date: e.target.value })}
                    className="rounded-xl"
                    style={{ border: '1px solid #E0E0E0' }}
                  />
                </div>
              </div>

              {currentService.service_type === 'אימונים אישיים' && (
                <div>
                  <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                    כמות אימונים בחבילה
                  </Label>
                  <Input
                    type="number"
                    value={currentService.total_sessions}
                    onChange={(e) => setCurrentService({ ...currentService, total_sessions: e.target.value })}
                    placeholder="12"
                    className="rounded-xl"
                    style={{ border: '1px solid #E0E0E0' }}
                  />
                </div>
              )}

              <div>
                <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                  סטטוס תשלום
                </Label>
                <Select
                  value={currentService.payment_status}
                  onValueChange={(value) => setCurrentService({ ...currentService, payment_status: value })}
                >
                  <SelectTrigger className="rounded-xl" style={{ border: '1px solid #E0E0E0' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="שולם">✓ שולם</SelectItem>
                    <SelectItem value="ממתין לתשלום">⏰ ממתין לתשלום</SelectItem>
                    <SelectItem value="תשלום חלקי">◐ תשלום חלקי</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                  הערות
                </Label>
                <Textarea
                  value={currentService.notes}
                  onChange={(e) => setCurrentService({ ...currentService, notes: e.target.value })}
                  placeholder="הערות נוספות..."
                  className="rounded-xl min-h-[80px]"
                  style={{ border: '1px solid #E0E0E0' }}
                />
              </div>

              <Button
                onClick={handleAddService}
                className="w-full rounded-xl py-4 font-bold text-white"
                style={{ backgroundColor: '#FF6F20' }}
              >
                <Plus className="w-5 h-5 ml-2" />
                הוסף חבילה זו
              </Button>
            </div>

            {/* Added Services List */}
            {services.length > 0 && (
              <div className="space-y-3">
                <p className="font-bold" style={{ color: '#000000' }}>
                  חבילות שנוספו ({services.length}):
                </p>
                {services.map((service, index) => (
                  <div key={index} className="p-4 rounded-xl flex items-center justify-between" style={{ backgroundColor: '#F0F9F0', border: '1px solid #4CAF50' }}>
                    <div className="flex-1">
                      <p className="font-bold" style={{ color: '#000000' }}>
                        {service.service_type} - {service.package_name}
                      </p>
                      <p className="text-sm" style={{ color: '#7D7D7D' }}>
                        ₪{service.price.toLocaleString()} • {service.payment_status}
                      </p>
                    </div>
                    <Button
                      onClick={() => handleRemoveService(index)}
                      size="sm"
                      className="rounded-lg p-2"
                      style={{ backgroundColor: '#f44336', color: 'white' }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                onClick={() => setStep(2)}
                variant="outline"
                className="flex-1 rounded-xl py-6 font-bold"
                style={{ border: '1px solid #E0E0E0', color: '#000000' }}
                disabled={createTraineeMutation.isPending}
              >
                חזור
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={services.length === 0 || createTraineeMutation.isPending}
                className="flex-1 rounded-xl py-6 font-bold text-white"
                style={{ backgroundColor: '#4CAF50' }}
              >
                {createTraineeMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                    שומר...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5 ml-2" />
                    הוסף לקוח עם {services.length} חבילות
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}