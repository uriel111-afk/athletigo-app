# 📊 AthletiGo Financial System - Complete Documentation

## 🎯 Overview
The FinancialOverview page is now a **READ-ONLY** dashboard that automatically syncs with the system's single source of truth: the `ClientService` entity.

---

## 📋 Single Source of Truth

### **Primary Table: `ClientService`**
All financial data flows through this entity. Every package, payment, and service record lives here.

#### Key Fields:
- `trainee_id` + `trainee_name` - Who the service belongs to
- `service_type` - Type of service (אימונים אישיים, פעילות קבוצתית, ליווי אונליין)
- `package_name` - Name of the package
- `price` - Package price in ₪
- `start_date` + `end_date` - Service period
- `total_sessions` + `used_sessions` - For session-based services
- `status` - פעיל, הסתיים, מושהה, פג תוקף
- `payment_status` - שולם, ממתין לתשלום, תשלום חלקי
- `payment_date` - When payment was received
- `created_by_coach` - Which coach created the service

---

## 🔄 Data Flow Architecture

### When a Coach Creates/Edits a Package:

**Location**: `components/ServiceManagement` or `components/UnifiedClientCard`

```
Coach adds package → ClientService.create() → Invalidates queries → FinancialOverview updates
```

**What happens:**
1. Coach fills service form (type, package name, price, dates, payment status)
2. `ServiceManagement` component calls `createServiceMutation`
3. New `ClientService` record is created with all financial data
4. All queries invalidated: `['all-services-financial']`, `['all-services']`, `['services']`
5. FinancialOverview automatically refetches and recalculates totals

### When Payment Status Changes:

**Location**: `components/ServiceManagement` (Edit service dialog)

```
Coach updates payment status → ClientService.update() → Queries refresh → FinancialOverview shows new totals
```

**What happens:**
1. Coach clicks "Edit" on a service
2. Changes `payment_status` from "ממתין לתשלום" to "שולם"
3. Sets `payment_date` to current date
4. `updateServiceMutation` saves changes
5. All financial queries invalidated
6. FinancialOverview recalculates:
   - Total Revenue (all "שולם" services)
   - Monthly Revenue (filtered by payment_date)
   - Pending Revenue (all "ממתין לתשלום")
   - Active Paying Clients count

---

## 🎛️ FinancialOverview Filters

### Built-in Filters:
1. **Trainee Filter** - Show data for specific trainee or all trainees
2. **Date Range** - Filter by payment date or start date
3. **Service Type** - אימונים אישיים, פעילות קבוצתית, ליווי אונליין
4. **Payment Status** - שולם, ממתין לתשלום, תשלום חלקי
5. **Search** - Search by trainee name or package name
6. **Sort** - By date, price, or service type (ascending/descending)

### URL Parameter Support:
- `?traineeId=xxx` - Opens FinancialOverview filtered to specific trainee
- Used when clicking "סיכום כספי" from `UnifiedClientCard`

---

## 📊 Calculated Metrics

### Total Revenue
```javascript
services
  .filter(s => s.payment_status === 'שולם' && s.price)
  .reduce((sum, s) => sum + s.price, 0)
```

### Monthly Revenue
```javascript
services
  .filter(s => {
    if (s.payment_status !== 'שולם' || !s.payment_date) return false;
    const paymentDate = new Date(s.payment_date);
    return paymentDate >= startOfMonth(currentMonth) && 
           paymentDate <= endOfMonth(currentMonth);
  })
  .reduce((sum, s) => sum + (s.price || 0), 0)
```

### Active Paying Clients
```javascript
new Set(
  services
    .filter(s => s.status === 'פעיל' && s.payment_status === 'שולם')
    .map(s => s.trainee_id)
).size
```

### Pending Revenue
```javascript
services
  .filter(s => s.payment_status === 'ממתין לתשלום' && s.price)
  .reduce((sum, s) => sum + s.price, 0)
```

### Service Type Breakdown
```javascript
services
  .filter(s => s.payment_status === 'שולם' && s.price)
  .forEach(s => {
    serviceTypeBreakdown[s.service_type] += s.price;
  })
```

---

## ✅ Testing Scenarios

### **Test 1: Add New Package**
1. Go to `AllUsers` page
2. Click on a trainee card
3. Navigate to "Services" tab
4. Click "הוסף" button
5. Fill in:
   - Service type: אימונים אישיים
   - Package name: חבילת 12 אימונים
   - Price: 1200
   - Start date: today
   - Total sessions: 12
   - Payment status: שולם
   - Payment date: today
6. Click "הוסף שירות"
7. ✅ **Expected**: FinancialOverview automatically updates:
   - Total Revenue increases by ₪1200
   - Monthly Revenue increases by ₪1200
   - Active Paying Clients increases by 1 (if new client)
   - Service appears in detailed payments table

### **Test 2: Update Payment Status**
1. Go to trainee's service tab
2. Click "Edit" on existing service
3. Change `payment_status` from "ממתין לתשלום" to "שולם"
4. Set payment date to today
5. Click "עדכן שירות"
6. ✅ **Expected**: FinancialOverview updates:
   - Pending Revenue decreases by package price
   - Total Revenue increases by package price
   - Monthly Revenue increases (if in current month)
   - Payment appears as "✓ שולם" in table

### **Test 3: Trainee-Specific View**
1. Open `AllUsers` page
2. Click on a trainee
3. Click "סיכום כספי" button (opens with `?traineeId=xxx`)
4. ✅ **Expected**: FinancialOverview shows:
   - Header displays "מתאמן: [name]"
   - Only services for that trainee
   - Totals calculated from filtered data
   - Cannot see other trainees' data

### **Test 4: Date Range Filter**
1. Open FinancialOverview (main menu)
2. Set "מתאריך" to 01/01/2025
3. Set "עד תאריך" to 31/01/2025
4. ✅ **Expected**:
   - Only services with payment_date or start_date in January 2025
   - Totals recalculated for filtered range
   - Chart shows only filtered data

### **Test 5: Cancel/Expire Package**
1. Edit a service
2. Change `status` from "פעיל" to "הסתיים" or "פג תוקף"
3. Save
4. ✅ **Expected**:
   - Service no longer counted in "Active Paying Clients"
   - Still counted in total revenue (if paid)
   - Appears in table with updated status

---

## 🔗 Relations & Data Integrity

### Trainee ↔ Package
- **Field**: `ClientService.trainee_id` → `User.id`
- **Display**: `ClientService.trainee_name` (denormalized for performance)
- **Why**: Fast lookups, no joins needed, atomic updates

### Coach ↔ Package
- **Field**: `ClientService.created_by_coach` → `User.id`
- **Purpose**: Track which coach sold the package
- **Future**: Multi-coach support

### Session Usage Tracking
- **Field**: `ClientService.used_sessions`
- **Updated when**: Coach clicks "+ הוסף אימון שנוצל" in ServiceManagement
- **Effect**: Progress bar updates, remaining sessions decrease

---

## 🚫 What NOT to Do

❌ **DO NOT** manually edit data in FinancialOverview
❌ **DO NOT** create duplicate payment tracking systems
❌ **DO NOT** store financial data in User entity
❌ **DO NOT** create separate "Payment" or "Transaction" entities

✅ **ALWAYS** use `ClientService` for all financial operations
✅ **ALWAYS** use ServiceManagement component to add/edit packages
✅ **ALWAYS** let FinancialOverview auto-calculate totals

---

## 🔧 Query Keys for Invalidation

When you modify financial data, invalidate these:
```javascript
queryClient.invalidateQueries({ queryKey: ['all-services-financial'] });
queryClient.invalidateQueries({ queryKey: ['all-services'] });
queryClient.invalidateQueries({ queryKey: ['services'] });
queryClient.invalidateQueries({ queryKey: ['my-services'] });
```

FinancialOverview will automatically refetch and update.

---

## 📱 Auto-Refresh Behavior

- **Refetch Interval**: 30 seconds
- **Refetch in Background**: Yes
- **On Focus**: Yes
- **On Reconnect**: Yes

This ensures real-time sync even with multiple coaches working simultaneously.

---

## 🎨 UI Features

### Summary Cards (Top Row)
1. סה״כ הכנסות - All paid services
2. הכנסות החודש - Current month paid services
3. לקוחות משלמים - Unique active + paid clients
4. הכנסות ממתינות - Pending payments

### Charts & Breakdown
- Bar chart showing revenue by service type
- Percentage breakdown for each service type
- Top performing service highlight
- Average package price calculation

### Detailed Table
- Sortable by date/price/type
- Filterable by all dimensions
- Shows trainee, service type, package name, price, date, status
- Running total at bottom

---

## 🔄 Real-Time Sync Guarantee

Every action that modifies `ClientService` triggers:
1. Query invalidation
2. Automatic refetch
3. UI update with new calculations
4. No manual refresh needed

**Actions that trigger sync:**
- ✅ Create service (ServiceManagement or UnifiedClientCard)
- ✅ Update service (edit payment status, price, dates)
- ✅ Delete service
- ✅ Mark session as used (used_sessions++)
- ✅ Change service status (פעיל → הסתיים)

---

## 🎯 Summary

**FinancialOverview is now:**
- ✅ Read-only summary view
- ✅ Single source of truth (ClientService)
- ✅ Auto-synced in real-time
- ✅ Filterable by trainee, date, type, status
- ✅ Supports global view + trainee-specific view
- ✅ No duplicate data sources
- ✅ All calculations derived from ClientService
- ✅ Fully reliable and always accurate

**To verify sync is working:**
1. Open FinancialOverview in one tab
2. Open AllUsers → Client → Services in another tab
3. Add/edit a package
4. Watch FinancialOverview update within 1-2 seconds

Done! 🎉