import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { User, Users, Laptop, Plus, Edit2, Trash2, Calendar, DollarSign, Package, AlertCircle, Gift } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const SERVICE_ICONS = {
  "אימונים אישיים": User,
  "פעילות קבוצתית": Users,
  "ליווי אונליין": Laptop
};

export default function ServiceManagement({ trainee, services, coach }) {
  const [showAddService, setShowAddService] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [serviceForm, setServiceForm] = useState({
    service_type: "personal",
    group_name: "",
    billing_model: "punch_card",
    sessions_per_week: "",
    package_name: "",
    base_price: "",
    discount_type: "none",
    discount_value: 0,
    final_price: "",
    price: "",
    payment_method: "credit",
    start_date: new Date().toISOString().split('T')[0],
    end_date: "",
    next_billing_date: "",
    total_sessions: "",
    payment_status: "שולם",
    payment_date: new Date().toISOString().split('T')[0],
    status: "active",
    notes: "",
    notes_internal: ""
  });

  const queryClient = useQueryClient();

  // Helper function to clean data before sending
  const prepareServiceData = (formData) => {
    const data = { ...formData };
    
    // Convert empty strings to null
    Object.keys(data).forEach(key => {
      if (data[key] === "") {
        data[key] = null;
      }
    });
    
    // Parse numbers
    if (data.total_sessions) {
      const parsed = parseInt(data.total_sessions, 10);
      data.total_sessions = isNaN(parsed) ? null : parsed;
    }
    
    if (data.sessions_per_week) {
        const parsed = parseInt(data.sessions_per_week, 10);
        data.sessions_per_week = isNaN(parsed) ? null : parsed;
    }

    if (data.base_price) data.base_price = parseFloat(data.base_price) || 0;
    if (data.discount_value) data.discount_value = parseFloat(data.discount_value) || 0;
    
    if (data.final_price) {
      const parsed = parseFloat(data.final_price);
      data.final_price = isNaN(parsed) ? null : parsed;
      data.price = data.final_price; // Sync legacy field
    } else if (data.price) {
        data.final_price = parseFloat(data.price) || 0;
    }
    
    // Handle payment_date logic
    if (data.payment_status !== 'שולם') {
      data.payment_date = null;
    }
    
    return data;
  };

  const createServiceMutation = useMutation({
    mutationFn: async (serviceData) => {
      const cleanData = prepareServiceData(serviceData);
      const finalData = {
        ...cleanData,
        trainee_id: trainee.id,
        trainee_name: trainee.full_name,
        coach_id: coach?.id || null,
        created_by: coach?.id || null,
        used_sessions: 0
      };
      console.log('[ServiceManagement] Creating service with data:', finalData);
      return await base44.entities.ClientService.create(finalData);
    },
    onSuccess: async () => {
      // Invalidate all service-related queries
      queryClient.invalidateQueries({ queryKey: ['all-services'] });
      queryClient.invalidateQueries({ queryKey: ['services'] }); // kept for backward compatibility
      queryClient.invalidateQueries({ queryKey: ['all-services-list'] }); // The canonical key
      queryClient.invalidateQueries({ queryKey: ['trainees'] });
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      
      // Update trainee if needed
      if (trainee.status !== 'active') {
        try {
          await base44.entities.User.update(trainee.id, {
            status: "active",
          });
        } catch (error) {
          console.error("[ServiceManagement] Error updating trainee:", error);
        }
      }
      
      setShowAddService(false);
      setServiceForm({
        service_type: "אימונים אישיים",
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
      toast.success("החבילה נוספה בהצלחה");
    },
    onError: (error) => {
      console.error("[ServiceManagement] Create service error details:", {
        message: error.message,
        status: error.status,
        statusText: error.statusText,
        body: error.body,
        error: error
      });
      toast.error("שגיאה ביצירת החבילה");
    }
  });

  const updateServiceMutation = useMutation({
    mutationFn: ({ id, data }) => {
      const cleanData = prepareServiceData(data);
      return base44.entities.ClientService.update(id, cleanData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-services'] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['all-services-list'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      
      setEditingService(null);
      setShowAddService(false);
      setServiceForm({
        service_type: "אימונים אישיים",
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
      toast.success("החבילה עודכנה בהצלחה");
    },
    onError: (error) => {
      console.error("[ServiceManagement] Update service error:", error);
      toast.error("שגיאה בעדכון החבילה");
    }
  });

  const deleteServiceMutation = useMutation({
    mutationFn: (id) => base44.entities.ClientService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-services'] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['all-services-list'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success("החבילה נמחקה");
    },
    onError: (error) => {
      console.error("[ServiceManagement] Delete service error:", error);
      toast.error("שגיאה במחיקת החבילה");
    }
  });

  const trackSessionUsageMutation = useMutation({
    mutationFn: ({ id, used_sessions }) => 
      base44.entities.ClientService.update(id, { used_sessions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-services'] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['all-services-list'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success("מונה הסשנים עודכן");
    },
    onError: (error) => {
      console.error("[ServiceManagement] Track session usage error:", error);
      toast.error("שגיאה בעדכון מונה הסשנים");
    }
  });

  const resetForm = () => {
    setServiceForm({
        service_type: "personal",
        group_name: "",
        billing_model: "punch_card",
        sessions_per_week: "",
        package_name: "",
        base_price: "",
        discount_type: "none",
        discount_value: 0,
        final_price: "",
        price: "",
        payment_method: "credit",
        start_date: new Date().toISOString().split('T')[0],
        end_date: "",
        next_billing_date: "",
        total_sessions: "",
        payment_status: "שולם",
        payment_date: new Date().toISOString().split('T')[0],
        status: "active",
        notes: "",
        notes_internal: ""
    });
  };

  const handleCreateService = async () => {
    if (!serviceForm.service_type || !serviceForm.start_date) {
      toast.error("נא למלא סוג שירות ותאריך התחלה.");
      return;
    }
    if (!serviceForm.package_name || !serviceForm.price) {
      toast.error("נא למלא שם חבילה ומחיר.");
      return;
    }

    await createServiceMutation.mutateAsync(serviceForm);
  };

  const handleUpdateService = async () => {
    if (!editingService) return;
    if (!serviceForm.service_type || !serviceForm.start_date) {
      toast.error("נא למלא סוג שירות ותאריך התחלה.");
      return;
    }

    await updateServiceMutation.mutateAsync({ 
      id: editingService.id, 
      data: serviceForm 
    });
  };

  const handleDeleteService = async (serviceId) => {
    if (!confirm('למחוק חבילה זו?')) return;
    await deleteServiceMutation.mutateAsync(serviceId);
  };

  const handleEditService = (service) => {
    setEditingService(service);
    setShowAddService(true);
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
      price: service.price || "",
      payment_method: service.payment_method || "credit",
      start_date: service.start_date ? service.start_date.split('T')[0] : "",
      end_date: service.end_date ? service.end_date.split('T')[0] : "",
      next_billing_date: service.next_billing_date ? service.next_billing_date.split('T')[0] : "",
      total_sessions: service.total_sessions?.toString() || "",
      payment_status: service.payment_status || "שולם",
      payment_date: service.payment_date ? service.payment_date.split('T')[0] : new Date().toISOString().split('T')[0],
      status: service.status || "active",
      notes: service.notes || "",
      notes_internal: service.notes_internal || ""
    });
  };

  const getDaysRemaining = (endDate) => {
    if (!endDate) return null;
    try {
      const today = new Date();
      const end = new Date(endDate);
      today.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      const diffTime = end.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    } catch (error) {
      console.error("[ServiceManagement] Error calculating days remaining:", error);
      return null;
    }
  };

  const shouldShowDiscount = (service) => {
    // Only show if end_date exists, discount hasn't been offered, and it's 0-3 days left
    if (!service.end_date || service.discount_offered) return false;
    const daysRemaining = getDaysRemaining(service.end_date);
    return daysRemaining !== null && daysRemaining <= 3 && daysRemaining >= 0;
  };

  return (
    <div className="p-4 rounded-xl neumorphic">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-lg" style={{ color: '#333' }}>מסלולים וחבילות</h3>
        <Button
          onClick={() => setShowAddService(true)}
          className="rounded-xl px-4 py-2 font-bold"
          style={{
            backgroundColor: '#FF6F20',
            color: 'white',
            boxShadow: '4px 4px 8px #bebebe, -4px -4px 8px #ffffff'
          }}
        >
          <Plus className="w-4 h-4 ml-2" />
          הוסף חבילה
        </Button>
      </div>

      {services.length === 0 ? (
        <div className="p-8 text-center" style={{ color: '#666' }}>
          <p>אין חבילות פעילות</p>
        </div>
      ) : (
        <div className="space-y-4">
          {services.map((service) => {
            const Icon = SERVICE_ICONS[service.service_type] || User;
            const remaining = service.total_sessions ? service.total_sessions - (service.used_sessions || 0) : null;
            const daysRemaining = getDaysRemaining(service.end_date);
            const showDiscount = shouldShowDiscount(service);

            return (
              <div key={service.id} className="p-4 rounded-xl neumorphic-pressed">
                {/* Discount Banner */}
                {showDiscount && (
                  <div className="mb-3 p-3 rounded-lg" style={{ backgroundColor: '#FFF3E0', border: '2px solid #FF6F20' }}>
                    <div className="flex items-center gap-2">
                      <Gift className="w-5 h-5" style={{ color: '#FF6F20' }} />
                      <p className="text-sm font-bold" style={{ color: '#FF6F20' }}>
                        ⚠ החבילה מסתיימת בעוד {daysRemaining} ימים - הצעת 10% הנחה לחידוש!
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center neumorphic"
                         style={{ backgroundColor: '#e0e0e0' }}>
                      <Icon className="w-6 h-6" style={{ color: '#FF6F20' }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-bold" style={{ color: '#333' }}>{service.service_type}</p>
                        <span className="px-2 py-1 rounded text-xs font-medium" style={{
                          backgroundColor: service.status === 'פעיל' ? '#4CAF50' : '#999',
                          color: 'white'
                        }}>
                          {service.status}
                        </span>
                      </div>
                      {service.package_name && (
                        <p className="text-sm mb-1" style={{ color: '#666' }}>{service.package_name}</p>
                      )}
                      <p className="text-xs" style={{ color: '#999' }}>
                        {service.start_date} {service.end_date && `- ${service.end_date}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleEditService(service)}
                      className="rounded-lg p-2"
                      style={{ backgroundColor: '#2196F3', color: 'white' }}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleDeleteService(service.id)}
                      className="rounded-lg p-2"
                      style={{ backgroundColor: '#f44336', color: 'white' }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Personal Training Details */}
                {service.service_type === 'אימונים אישיים' && service.total_sessions && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 rounded-lg text-center" style={{ backgroundColor: '#e0e0e0' }}>
                        <p className="text-xs mb-1" style={{ color: '#666' }}>נרכשו</p>
                        <p className="text-xl font-bold" style={{ color: '#333' }}>{service.total_sessions}</p>
                      </div>
                      <div className="p-3 rounded-lg text-center" style={{ backgroundColor: '#e0e0e0' }}>
                        <p className="text-xs mb-1" style={{ color: '#666' }}>נוצלו</p>
                        <p className="text-xl font-bold" style={{ color: '#FF6F20' }}>{service.used_sessions || 0}</p>
                      </div>
                      <div className="p-3 rounded-lg text-center" style={{ backgroundColor: '#e0e0e0' }}>
                        <p className="text-xs mb-1" style={{ color: '#666' }}>יתרה</p>
                        <p className="text-xl font-bold" style={{ color: '#4CAF50' }}>{remaining}</p>
                      </div>
                    </div>

                    <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: '#e0e0e0' }}>
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${((service.used_sessions || 0) / service.total_sessions) * 100}%`,
                          backgroundColor: '#FF6F20'
                        }}
                      />
                    </div>

                    <Button
                      onClick={() => trackSessionUsageMutation.mutate({
                        id: service.id, 
                        used_sessions: (service.used_sessions || 0) + 1
                      })}
                      disabled={remaining <= 0}
                      className="w-full rounded-xl py-3 font-bold"
                      style={{
                        backgroundColor: remaining > 0 ? '#FF6F20' : '#999',
                        color: 'white'
                      }}
                    >
                      + הוסף אימון שנוצל
                    </Button>
                  </div>
                )}

                {/* Time-Based Details */}
                {(service.service_type === 'פעילות קבוצתית' || service.service_type === 'ליווי אונליין') && service.end_date && (
                  <div className="space-y-3">
                    <div className="p-4 rounded-lg text-center" style={{ backgroundColor: '#e0e0e0' }}>
                      <p className="text-sm mb-1" style={{ color: '#666' }}>מנוי בתוקף עד</p>
                      <p className="text-xl font-bold" style={{ color: '#333' }}>{service.end_date}</p>
                      {daysRemaining !== null && (
                        <p className="text-sm mt-2" style={{ 
                          color: daysRemaining <= 3 && daysRemaining >= 0 ? '#f44336' : '#4CAF50'
                        }}>
                          {daysRemaining > 0 ? `נותרו ${daysRemaining} ימים` : 'פג תוקף'}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {service.notes && (
                  <div className="mt-3 p-3 rounded-lg" style={{ backgroundColor: '#e0e0e0' }}>
                    <p className="text-xs mb-1 font-bold" style={{ color: '#666' }}>הערות:</p>
                    <p className="text-sm" style={{ color: '#333' }}>{service.notes}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showAddService || !!editingService} onOpenChange={(open) => {
        if (!open) {
          setShowAddService(false);
          setEditingService(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl" style={{ backgroundColor: '#e0e0e0' }}>
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold" style={{ color: '#333' }}>
              {editingService ? 'ערוך חבילה' : 'הוסף חבילה חדשה'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">סוג השירות *</Label>
              <Select value={serviceForm.service_type} onValueChange={(value) => 
                setServiceForm({ ...serviceForm, service_type: value })
              }>
                <SelectTrigger className="rounded-xl neumorphic-pressed border-0" 
                             style={{ backgroundColor: '#e0e0e0' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="אימונים אישיים">🧍‍♂️ אימונים אישיים</SelectItem>
                  <SelectItem value="פעילות קבוצתית">👥 פעילות קבוצתית</SelectItem>
                  <SelectItem value="ליווי אונליין">💻 ליווי אונליין</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">שם החבילה *</Label>
              <Input
                value={serviceForm.package_name}
                onChange={(e) => setServiceForm({ ...serviceForm, package_name: e.target.value })}
                placeholder='לדוגמה: "12 אימונים אישיים", "מנוי חודשי"'
                className="rounded-xl neumorphic-pressed border-0"
                style={{ backgroundColor: '#e0e0e0' }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">תאריך התחלה *</Label>
                <Input
                  type="date"
                  value={serviceForm.start_date}
                  onChange={(e) => setServiceForm({ ...serviceForm, start_date: e.target.value })}
                  className="rounded-xl neumorphic-pressed border-0"
                  style={{ backgroundColor: '#e0e0e0' }}
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">תאריך סיום</Label>
                <Input
                  type="date"
                  value={serviceForm.end_date}
                  onChange={(e) => setServiceForm({ ...serviceForm, end_date: e.target.value })}
                  className="rounded-xl neumorphic-pressed border-0"
                  style={{ backgroundColor: '#e0e0e0' }}
                />
              </div>
            </div>

            {serviceForm.service_type === 'אימונים אישיים' && (
              <div>
                <Label className="text-sm font-medium mb-2 block">כמות אימונים בחבילה</Label>
                <Input
                  type="number"
                  value={serviceForm.total_sessions}
                  onChange={(e) => setServiceForm({ ...serviceForm, total_sessions: e.target.value })}
                  placeholder="לדוגמה: 12"
                  className="rounded-xl neumorphic-pressed border-0"
                  style={{ backgroundColor: '#e0e0e0' }}
                />
              </div>
            )}

            <div>
              <Label className="text-sm font-medium mb-2 block">מחיר (₪) *</Label>
              <Input
                type="number"
                value={serviceForm.price}
                onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })}
                placeholder="לדוגמה: 1200"
                className="rounded-xl neumorphic-pressed border-0"
                style={{ backgroundColor: '#e0e0e0' }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">סטטוס תשלום</Label>
                <Select value={serviceForm.payment_status} onValueChange={(value) => 
                  setServiceForm({ ...serviceForm, payment_status: value })
                }>
                  <SelectTrigger className="rounded-xl neumorphic-pressed border-0" 
                               style={{ backgroundColor: '#e0e0e0' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="שולם">שולם</SelectItem>
                    <SelectItem value="טרם שולם">טרם שולם</SelectItem>
                    <SelectItem value="חלקי">חלקי</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {serviceForm.payment_status === 'שולם' && (
                <div>
                  <Label className="text-sm font-medium mb-2 block">תאריך תשלום</Label>
                  <Input
                    type="date"
                    value={serviceForm.payment_date}
                    onChange={(e) => setServiceForm({ ...serviceForm, payment_date: e.target.value })}
                    className="rounded-xl neumorphic-pressed border-0"
                    style={{ backgroundColor: '#e0e0e0' }}
                  />
                </div>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">סטטוס</Label>
              <Select value={serviceForm.status} onValueChange={(value) => 
                setServiceForm({ ...serviceForm, status: value })
              }>
                <SelectTrigger className="rounded-xl neumorphic-pressed border-0" 
                             style={{ backgroundColor: '#e0e0e0' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="פעיל">פעיל</SelectItem>
                  <SelectItem value="מושהה">מושהה</SelectItem>
                  <SelectItem value="הסתיים">הסתיים</SelectItem>
                  <SelectItem value="פג תוקף">פג תוקף</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">הערות</Label>
              <Textarea
                value={serviceForm.notes}
                onChange={(e) => setServiceForm({ ...serviceForm, notes: e.target.value })}
                placeholder="הערות נוספות..."
                className="rounded-xl neumorphic-pressed border-0 min-h-[80px]"
                style={{ backgroundColor: '#e0e0e0' }}
              />
            </div>

            <Button
              onClick={editingService ? handleUpdateService : handleCreateService}
              disabled={
                !serviceForm.service_type || 
                !serviceForm.start_date ||
                (serviceForm.service_type === 'אימונים אישיים' && !serviceForm.total_sessions) ||
                !serviceForm.package_name ||
                !serviceForm.price
              }
              className="w-full rounded-xl py-6 font-bold"
              style={{
                backgroundColor: '#FF6F20',
                color: 'white',
                boxShadow: '4px 4px 8px #bebebe, -4px -4px 8px #ffffff'
              }}
            >
              {editingService ? 'עדכן חבילה' : 'הוסף חבילה'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}