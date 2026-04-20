# AthletiGo Enum Layers

6 enum layers, all defined in `src/lib/enums.js`.
Never hardcode status/type values — always import from enums.

## 1. Package status (`client_services.status`)
| Key | Hebrew | Color |
|-----|--------|-------|
| active | פעיל | #16a34a |
| unpaid | לא שולם | #dc2626 |
| paused | מושהה | #eab308 |
| frozen | מוקפא | #0ea5e9 |
| expired | פג תוקף | #6b7280 |
| cancelled | בוטל | #6b7280 |
| completed | הסתיים | #6b7280 |

## 2. Service type (`client_services.service_type`)
| Key | Hebrew | Icon |
|-----|--------|------|
| personal | אישי | 👤 |
| online | אונליין | 💻 |
| group | קבוצתי | 👥 |

## 3. Client status (derived for AllUsers filter)
all, active, inactive, casual

## 4. Session status (`sessions.status`)
scheduled, confirmed, completed, cancelled, pending

## 5. Attendance status (`sessions.participants[].attendance_status`)
present (הגיע), late (איחר), absent (לא הגיע), cancelled (בוטל), pending (ממתין)

## 6. Account status (`users.account_status`)
active, inactive, casual

## Legacy mapping
Hebrew values in DB are mapped to English via `normalizeStatus()`.
Run migration SQL to normalize existing rows.
