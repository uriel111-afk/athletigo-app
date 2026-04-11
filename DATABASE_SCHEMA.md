# מבנה מסד הנתונים — AthletiGo

> תיעוד עדכני ליום 2026-04-12

---

## סקירה כללית

מסד הנתונים מבוסס על **Supabase (PostgreSQL)** ומכיל **19 טבלאות** (17 פעילות + 2 לא קיימות בפועל).

המערכת תומכת בשני סוגי משתמשים:
- **מאמן (coach)** — מנהל את המערכת, רואה את כל הנתונים
- **מתאמן (trainee)** — רואה רק את הנתונים שלו

---

## רשימת הטבלאות

| # | טבלה | תיאור | רשומות | סטטוס |
|---|-------|--------|--------|--------|
| 1 | `users` | פרופילי משתמשים (מאמנים ומתאמנים) | 2 | פעילה |
| 2 | `leads` | לידים — פניות ראשוניות לפני הפיכה ללקוח | 1 | פעילה |
| 3 | `client_services` | חבילות שירות — מנויים, כרטיסיות, תשלומים | 0 | פעילה |
| 4 | `sessions` | מפגשים/אימונים מתוזמנים | 0 | פעילה |
| 5 | `training_plans` | תוכניות אימון | 3 | פעילה |
| 6 | `training_sections` | סקשנים בתוך תוכנית אימון (חימום, עיקרי וכו') | 2 | פעילה |
| 7 | `exercises` | תרגילים בתוך סקשן | 3 | פעילה |
| 8 | `notifications` | התראות למשתמשים | 1 | פעילה |
| 9 | `measurements` | מדידות גוף (משקל, אחוז שומן, היקפים) | 0 | פעילה |
| 10 | `goals` | יעדים אישיים למתאמן | 0 | פעילה |
| 11 | `results_log` | שיאים והישגים | 0 | פעילה |
| 12 | `workout_history` | היסטוריית אימונים שהושלמו | 0 | פעילה |
| 13 | `workout_logs` | יומן אימון מפורט | 0 | פעילה |
| 14 | `attendance_log` | יומן נוכחות | 0 | פעילה |
| 15 | `reflections` | רפלקציות ומשוב מתאמן | 0 | פעילה |
| 16 | `custom_parameters` | ערכים מותאמים לפרמטרי תרגיל | 0 | פעילה |
| 17 | `messages` | הודעות פנימיות | 0 | פעילה |
| 18 | `program_series` | סדרות תוכניות | 0 | פעילה |
| 19 | `training_plan_assignments` | שיוך תוכניות למתאמנים | 0 | פעילה |
| ❌ | `training_groups` | קבוצות אימון | — | **לא קיימת** |
| ❌ | `training_group_members` | חברי קבוצה | — | **לא קיימת** |

---

## מבנה כל טבלה

### 1. `users` — פרופילי משתמשים

| עמודה | סוג | תיאור |
|--------|------|--------|
| `id` | uuid PK | מזהה ייחודי |
| `created_at` | timestamp | תאריך יצירה |
| `updated_at` | timestamp | תאריך עדכון אחרון |
| `email` | text | כתובת אימייל (ייחודית) |
| `full_name` | text | שם מלא |
| `phone` | text | טלפון |
| `role` | text | תפקיד: `coach`, `trainee`, `user`, `admin` |
| `is_coach` | boolean | האם מאמן |
| `status` | text | סטטוס: `active`, `inactive` |
| `coach_id` | uuid | מזהה המאמן שמטפל במתאמן |
| `auth_user_id` | uuid | קישור ל-Supabase Auth |
| `age` | integer | גיל (מחושב מתאריך לידה) |
| `birth_date` | date | תאריך לידה |
| `gender` | text | מין |
| `city` | text | עיר מגורים |
| `address` | text | כתובת |
| `parent_name` | text | שם הורה (לקטינים) |
| `profile_image` | text | URL לתמונת פרופיל |
| `bio` | text | ביוגרפיה |
| `certifications` | text | הסמכות (למאמן) |
| `health_declaration` | text | הצהרת בריאות |
| `health_declaration_accepted` | boolean | אושרה הצהרת בריאות |
| `health_issues` | text | בעיות בריאות |
| `medical_history` | text | היסטוריה רפואית |
| `fitness_level` | text | רמת כושר |
| `sport_background` | text | רקע ספורטיבי |
| `training_goals` | text | מטרות אימון |
| `main_goal` | text | מטרה עיקרית |
| `sport_goals` | text | יעדים ספורטיביים |
| `experience_level` | text | רמת ניסיון |
| `training_frequency` | text | תדירות אימון |
| `preferred_training_style` | text | סגנון אימון מועדף |
| `preferred_location` | text | מיקום מועדף |
| `main_barrier` | text | מחסום עיקרי |
| `motivation` | text | מוטיבציה |
| `current_status` | text | מצב נוכחי |
| `future_vision` | text | חזון עתידי |
| `vision` | text | חזון (כפילות ל-future_vision) |
| `availability` | text/json | זמינות |
| `emergency_contact` | text | איש קשר לחירום (ישן) |
| `emergency_contact_name` | text | שם איש קשר לחירום |
| `emergency_contact_phone` | text | טלפון איש קשר לחירום |
| `notes` | text | הערות |
| `coach_notes` | text | הערות פנימיות מהמאמן |
| `onboarding_completed` | boolean | האם סיים חפיפה |
| `onboarding_notes` | text | הערות חפיפה |
| `coach_access_level` | text | רמת גישה של מאמן |
| `allow_trainee_plans` | boolean | האם מתאמן יכול ליצור תוכניות |
| `xp` | integer | נקודות ניסיון (גיימיפיקציה) |
| `level` | integer | רמה (גיימיפיקציה) |
| `created_date` | timestamp | כפילות ל-created_at |

### 2. `leads` — לידים

| עמודה | סוג | תיאור |
|--------|------|--------|
| `id` | uuid PK | מזהה |
| `created_at` | timestamp | נוצר |
| `updated_at` | timestamp | עודכן |
| `full_name` | text | שם מלא |
| `phone` | text | טלפון |
| `email` | text | אימייל |
| `age` | integer | גיל |
| `birth_date` | date | תאריך לידה |
| `city` | text | עיר |
| `source` | text | מקור הגעה (ברירת מחדל: "אחר") |
| `status` | text | סטטוס (ברירת מחדל: "חדש") |
| `service_interest` | text | התעניינות בשירות |
| `specific_interest` | text | עניין ספציפי |
| `sport_background` | text | רקע ספורטיבי |
| `fitness_level` | text | רמת כושר |
| `training_goals` | text | מטרות |
| `medical_history` | text | היסטוריה רפואית |
| `preferred_time` | text | זמן מועדף |
| `notes` | text | הערות |
| `coach_notes` | text | הערות מאמן |
| `parent_name` | text | שם הורה |
| `created_by` | uuid | נוצר ע"י |
| `coach_id` | uuid | שייך למאמן |
| `appointment_time` | timestamp | זמן פגישה |
| `created_date` | timestamp | כפילות ל-created_at |

### 3. `client_services` — חבילות שירות

| עמודה | סוג | תיאור |
|--------|------|--------|
| `id` | uuid PK | מזהה |
| `created_at` / `updated_at` | timestamp | תאריכים |
| `trainee_id` | uuid | מתאמן |
| `trainee_name` | text | שם מתאמן (denormalized) |
| `service_type` | text | סוג שירות |
| `status` | text | סטטוס (פעיל/לא פעיל) |
| `coach_id` | uuid | מאמן |
| `created_by` | uuid | נוצר ע"י |
| `price` | numeric | מחיר |
| `paid_amount` | numeric | סכום ששולם |
| `payment_status` | text | סטטוס תשלום |
| `payment_date` | date | תאריך תשלום |
| `start_date` / `end_date` | date | תקופת השירות |
| `total_sessions` | integer | סה"כ אימונים בחבילה |
| `used_sessions` | integer | אימונים שנוצלו |
| `sessions_remaining` | integer | אימונים שנותרו |
| `sessions_total` / `sessions_used` | integer | **כפילות** ל-total/used_sessions |
| `notes` | text | הערות |

### 4. `sessions` — מפגשים

| עמודה | סוג | תיאור |
|--------|------|--------|
| `id` | uuid PK | מזהה |
| `created_at` / `updated_at` | timestamp | תאריכים |
| `date` | date | תאריך המפגש |
| `time` | time | שעה |
| `session_type` | text | סוג (אישי, קבוצתי, אונליין) |
| `location` | text | מיקום |
| `duration` | integer | משך בדקות |
| `status` | text | סטטוס (ממתין/מאושר/התקיים/בוטל) |
| `participants` | jsonb | משתתפים (מערך אובייקטים) |
| `coach_id` | uuid | מאמן |
| `trainee_id` | uuid | מתאמן (ישן — participants מחליף) |
| `trainee_name` | text | שם מתאמן (ישן) |
| `coach_notes` / `notes` | text | הערות |
| `created_by` | uuid | נוצר ע"י |
| `price` | numeric | עלות |
| `is_paid` | boolean | שולם |
| `attendance_status` | text | נוכחות (ישן — participants מחליף) |
| `training_plan_id` | uuid | תוכנית מקושרת |

### 5. `training_plans` — תוכניות אימון

| עמודה | סוג | תיאור |
|--------|------|--------|
| `id` | uuid PK | מזהה |
| `created_at` / `updated_at` | timestamp | תאריכים |
| `title` / `plan_name` | text | **כפילות** — שם התוכנית |
| `description` | text | תיאור |
| `difficulty` | text | רמת קושי |
| `plan_type` | text | סוג |
| `is_template` | boolean | האם תבנית |
| `status` | text | סטטוס (פעילה/הושלמה) |
| `created_by` | uuid | מאמן שיצר |
| `created_by_name` | text | שם המאמן (denormalized) |
| `assigned_to` | uuid | מתאמן שמשויך |
| `assigned_to_name` | text | שם המתאמן (denormalized) |
| `goal_focus` | jsonb/text[] | מיקודי יעד |
| `start_date` | date | תאריך התחלה |
| `progress_percentage` | numeric | אחוז התקדמות |
| `exercises_count` | integer | מספר תרגילים |
| `preview_text` | text | תצוגה מקדימה |
| `series_id` | uuid | שייך לסדרה |
| `parent_plan_id` | uuid | תוכנית-אם |

### 6. `training_sections` — סקשנים

| עמודה | סוג | תיאור |
|--------|------|--------|
| `id` | uuid PK | מזהה |
| `created_at` / `updated_at` | timestamp | |
| `title` / `section_name` | text | **כפילות** — שם הסקשן |
| `description` | text | תיאור |
| `category` | text | קטגוריה (חימום, עיקרי, שחרור) |
| `training_plan_id` / `plan_id` | uuid | **כפילות** — תוכנית שייכות |
| `order` / `order_index` | integer | **כפילות** — סדר |
| `color_theme` | text | צבע |
| `icon` | text | אייקון |
| `completed` | boolean | הושלם |
| `exercises` | jsonb | תרגילים (ישן — נשמרים בטבלה נפרדת עכשיו) |
| `created_by` | uuid | נוצר ע"י |

### 7. `exercises` — תרגילים

| עמודה | סוג | תיאור |
|--------|------|--------|
| `id` | uuid PK | מזהה |
| `created_at` / `updated_at` | timestamp | |
| `name` | text NOT NULL | שם (שדה DB, חובה) |
| `exercise_name` | text | שם תרגיל (שדה ממשק) |
| `description` | text | תיאור/דגשים |
| `category` | text | קטגוריה |
| `muscle_group` | text | קבוצת שריר |
| `difficulty` | text | רמת קושי |
| `video_url` | text | קישור וידאו |
| `image_url` | text | קישור תמונה |
| `instructions` | text | הוראות |
| `tips` | text | טיפים |
| `training_plan_id` | uuid | שייך לתוכנית |
| `training_section_id` | uuid | שייך לסקשן |
| `created_by` | uuid | נוצר ע"י |
| `mode` | text | מצב (חזרות/זמן/סופרסט/טבטה/קומבו) |
| `order` | integer | סדר |
| `completed` | boolean | הושלם |
| `sets` | text | מספר סטים |
| `reps` | text | חזרות |
| `weight` | text | משקל |
| `weight_type` | text | סוג עומס |
| `rest_time` | text | זמן מנוחה |
| `work_time` | text | זמן עבודה |
| `rounds` | text | סבבים |
| `rpe` | text | דירוג מאמץ |
| `tempo` | text | טמפו |
| `tabata_data` | text/json | נתוני טבטה + תתי-תרגילים |
| `tabata_preview` | text | תקציר טבטה |
| `superset_rounds` | text | סבבי סופרסט |
| `combo_sets` | text | סטי קומבו |
| `control_rating` | numeric | דירוג שליטה |
| `difficulty_rating` | numeric | דירוג קושי |
| `actual_result` | text | תוצאה בפועל |
| `trainee_media_urls` | jsonb | קישורי מדיה מתאמן |

### 8. `notifications` — התראות

| עמודה | סוג | תיאור |
|--------|------|--------|
| `id` | uuid PK | |
| `created_at` / `updated_at` | timestamp | |
| `user_id` | uuid | נמען |
| `title` | text | כותרת |
| `message` / `body` | text | **כפילות** — גוף ההודעה |
| `type` | text | סוג התראה |
| `is_read` | boolean | נקרא |
| `requires_acknowledgment` | boolean | דורש אישור |
| `acknowledged_at` | timestamp | זמן אישור |
| `data` | jsonb | נתונים נוספים |
| `created_by` | uuid | שולח |
| `coach_id` | uuid | מאמן |

### 9-19. טבלאות נוספות

| טבלה | עמודות מרכזיות | NOT NULL |
|-------|----------------|----------|
| `measurements` | trainee_id, date, weight, height, body_fat, muscle_mass, bmi, chest, waist, hips, arm, thigh, baseline_* | — |
| `goals` | trainee_id, **title** (NOT NULL), target_value, target_date, status, category, current_value, deadline | title |
| `results_log` | trainee_id, goal_id, title, date, skill_or_exercise, record_value, record_unit, effort_level | — |
| `workout_history` | trainee_id/user_id, plan_id, plan_name, date, mastery_avg, difficulty_avg | — |
| `workout_logs` | (לא נבדק — בשימוש ב-CoachProfileManager) | — |
| `attendance_log` | (לא נבדק — בשימוש ב-Sessions) | — |
| `reflections` | trainee_id, date, content, mood, energy_level | — |
| `custom_parameters` | trainee_id, name, value, unit, category, date | — |
| `messages` | sender_id, recipient_id, content, is_read, message_type | — |
| `program_series` | title/name, trainee_id, plans, status, assigned_to | — |
| `training_plan_assignments` | trainee_id, plan_id, assigned_date, status | — |

---

## קשרים בין טבלאות

### קשרים לוגיים (לא enforced עם FK ב-DB)

```
users (מאמן)
  ├── leads.coach_id → users.id
  ├── client_services.coach_id → users.id
  ├── sessions.coach_id → users.id
  ├── training_plans.created_by → users.id
  ├── notifications.coach_id → users.id
  └── goals.coach_id → users.id

users (מתאמן)
  ├── users.coach_id → users.id (המאמן שלו)
  ├── client_services.trainee_id → users.id
  ├── sessions.participants[].trainee_id → users.id
  ├── training_plans.assigned_to → users.id
  ├── measurements.trainee_id → users.id
  ├── goals.trainee_id → users.id
  ├── results_log.trainee_id → users.id
  ├── workout_history.user_id → users.id
  ├── reflections.trainee_id → users.id
  └── notifications.user_id → users.id

training_plans
  ├── training_sections.training_plan_id → training_plans.id
  └── training_plan_assignments.plan_id → training_plans.id

training_sections
  └── exercises.training_section_id → training_sections.id

program_series
  └── training_plans.series_id → program_series.id
```

### Foreign Keys שקיימים ב-DB

> **שים לב:** ככל הנראה **אין foreign keys מוגדרים** ברמת ה-DB. כל הקשרים מנוהלים ברמת הקוד בלבד. זה אומר שאין הגנה על תקינות נתונים ברמת ה-DB — אפשר למחוק מתאמן בלי למחוק את המפגשים שלו.

---

## זרימת נתונים

### חיי ליד → מתאמן

```
1. מאמן יוצר ליד חדש
   → INSERT leads (full_name, coach_id, status='חדש')

2. מאמן משלים פרטים
   → UPDATE leads (phone, email, service_interest, ...)

3. מאמן ממיר ליד למתאמן
   → Edge Function 'create-trainee' (email, password, full_name)
   → INSERT auth.users (Supabase Auth)
   → INSERT users (role='trainee', coach_id, ...)
   → UPDATE leads (status='סגור עסקה', converted_to_client=true)
   → UPDATE sessions (migrate participant IDs)
```

### חיי תוכנית אימון

```
1. מאמן יוצר תוכנית
   → INSERT training_plans (plan_name, created_by, assigned_to, status='פעילה')

2. מאמן מוסיף סקשנים
   → INSERT training_sections (section_name, training_plan_id, order)

3. מאמן מוסיף תרגילים
   → INSERT exercises (exercise_name, training_section_id, sets, reps, ...)

4. מתאמן מבצע תרגיל
   → UPDATE exercises (completed=true, actual_result, rpe)
   → INSERT workout_history (plan_id, date, ...)
```

### חיי מפגש

```
1. מאמן או מתאמן קובעים מפגש
   → INSERT sessions (date, time, session_type, participants, status='ממתין לאישור')
   → INSERT notifications (user_id=trainee, type='session_scheduled')

2. מפגש מתקיים
   → UPDATE sessions (status='התקיים')
   → UPDATE client_services (used_sessions += 1)
   → INSERT notifications (user_id=trainee, type='session_completed')
```

---

## בעיות עקביות — שמות כפולים

| טבלה | כפילות | המלצה |
|-------|--------|--------|
| `users` | `created_at` + `created_date` | להשתמש רק ב-`created_at` |
| `users` | `vision` + `future_vision` | להשתמש רק ב-`future_vision` |
| `users` | `emergency_contact` + `emergency_contact_name` + `emergency_contact_phone` | לפצל ל-name + phone בלבד |
| `leads` | `created_at` + `created_date` | להשתמש רק ב-`created_at` |
| `training_plans` | `title` + `plan_name` | להשתמש רק ב-`plan_name` |
| `training_sections` | `title` + `section_name` | להשתמש רק ב-`section_name` |
| `training_sections` | `plan_id` + `training_plan_id` | להשתמש רק ב-`training_plan_id` |
| `training_sections` | `order` + `order_index` | להשתמש רק ב-`order` |
| `exercises` | `name` + `exercise_name` | `name` = NOT NULL (DB), `exercise_name` = UI |
| `client_services` | `total_sessions` + `sessions_total` | להשתמש רק ב-`total_sessions` |
| `client_services` | `used_sessions` + `sessions_used` | להשתמש רק ב-`used_sessions` |
| `notifications` | `message` + `body` | להשתמש רק ב-`message` |

---

## בעיות עקביות — שמות עמודות

| עמודה | טבלאות | בעיה |
|--------|--------|------|
| `trainee_id` | client_services, measurements, goals, results_log, reflections, custom_parameters, program_series, training_plan_assignments | **עקבי** |
| `user_id` | workout_history, notifications | **לא עקבי** — צריך להיות trainee_id |
| `coach_id` | users, leads, client_services, sessions, notifications, goals | **עקבי** |
| `created_by` | leads, sessions, training_plans, training_sections, exercises, measurements, goals, results_log, reflections, custom_parameters | **עקבי** |

---

## טבלאות ריקות / לא בשימוש פעיל

| טבלה | רשומות | שימוש בקוד |
|-------|--------|------------|
| `client_services` | 0 | **פעיל** — עדיין לא נוצרו שירותים |
| `sessions` | 0 | **פעיל** — עדיין לא נקבעו מפגשים |
| `measurements` | 0 | **פעיל** — טפסי מדידה קיימים |
| `goals` | 0 | **פעיל** — טפסי יעדים קיימים |
| `results_log` | 0 | **פעיל** — טפסי שיאים קיימים |
| `workout_history` | 0 | **פעיל** — נוצר אוטומטית בסיום אימון |
| `reflections` | 0 | **קיים** — בשימוש ב-CoachProfileManager |
| `custom_parameters` | 0 | **פעיל** — ערכים מותאמים בעורך תרגילים |
| `messages` | 0 | **קיים** — MessageCenter |
| `program_series` | 0 | **קיים** — סדרות תוכניות ב-MyPlan |
| `training_plan_assignments` | 0 | **קיים** — שיוך תוכניות ב-MyPlan |
| `workout_logs` | 0 | **קיים** — CoachProfileManager |
| `attendance_log` | 0 | **קיים** — Sessions |
| ❌ `training_groups` | — | מוגדר בקוד אבל **טבלה לא קיימת** |
| ❌ `training_group_members` | — | מוגדר בקוד אבל **טבלה לא קיימת** |

---

## שדות חסרים להכנה להרחבה

| טבלה | שדה חסר | הערה |
|-------|---------|------|
| `measurements` | `coach_id` | קיים — תקין |
| `results_log` | `coach_id` | **חסר** — לא ניתן לסנן לפי מאמן |
| `workout_history` | `coach_id` | **חסר** — לא ניתן לסנן לפי מאמן |
| `reflections` | `coach_id` | **חסר** — לא ניתן לסנן לפי מאמן |
| `workout_logs` | `coach_id` | **ככל הנראה חסר** |
| `attendance_log` | `coach_id` | **ככל הנראה חסר** |
| `messages` | `coach_id` | **לא רלוונטי** — הודעות בין שני צדדים |

---

## Entity Mapping — קוד → DB

| שם בקוד | טבלה ב-DB | הערה |
|----------|-----------|------|
| `User` | `users` | |
| `Lead` | `leads` | |
| `Session` | `sessions` | |
| `TrainingPlan` | `training_plans` | |
| `TrainingSection` | `training_sections` | |
| `Exercise` | `exercises` | |
| `ClientService` | `client_services` | |
| `Notification` | `notifications` | |
| `Measurement` | `measurements` | |
| `Goal` | `goals` | |
| `ResultsLog` | `results_log` | |
| `WorkoutHistory` | `workout_history` | |
| `WorkoutLog` | `workout_logs` | |
| `AttendanceLog` | `attendance_log` | |
| `Reflection` | `reflections` | |
| `Message` | `messages` | |
| `ProgramSeries` | `program_series` | |
| `TrainingPlanAssignment` | `training_plan_assignments` | |
| `Query` | `custom_parameters` | **שם מבלבל** — "Query" מייצג custom_parameters |
| `CustomParameter` | `custom_parameters` | אליאס נכון |
| `TrainingGroup` | `training_groups` | **טבלה לא קיימת** |
| `TrainingGroupMember` | `training_group_members` | **טבלה לא קיימת** |
