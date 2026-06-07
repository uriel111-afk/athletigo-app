// Single source of truth for birth-date / age display.
//
// Two functions, both null-safe:
//   • calculateAge(birthDate)
//       Integer years from a birth_date (ISO string or Date). Returns
//       null when the input is empty / unparseable / produces an
//       implausible age (>=150). Used for both display and the live
//       "(גיל: X)" hint next to the date input in edit mode.
//
//   • formatBirthWithAge(user)
//       Composes a single string from `user.birth_date` + the
//       calculated age, falling back to `user.age` when birth_date
//       is missing. Output formats:
//         "15/03/1990 (36)"   — both fields available
//         "גיל 36"            — birth_date missing, only `age` set
//         ""                   — neither field set

export const calculateAge = (birthDate) => {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 && age < 150 ? age : null;
};

// Days from today to the trainee's next birthday. Year is ignored —
// only month + day matter — so a birthday tomorrow always returns 1
// regardless of the trainee's age. Returns:
//   0    on the actual birthday
//   1-N  upcoming birthday this calendar year (or rolled into next)
//   null when birth_date is missing / unparseable
// Callers use this for the AllUsers coach-side pill (0-7 days) and
// the trainee's own greeting banner (=== 0).
export const daysUntilBirthday = (birthDate) => {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Build "next birthday" in the current year using the birth day +
  // month. If it's already past today, roll it to next year. Both
  // points are calendar-day boundaries so the diff lands on whole
  // days without DST drift surprises.
  let next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
  next.setHours(0, 0, 0, 0);
  if (next < today) {
    next = new Date(today.getFullYear() + 1, b.getMonth(), b.getDate());
    next.setHours(0, 0, 0, 0);
  }
  const diffMs = next.getTime() - today.getTime();
  return Math.round(diffMs / 86_400_000);
};

export const formatBirthWithAge = (user) => {
  if (!user) return '';

  const ageFromDate = calculateAge(user.birth_date);
  // age column is integer-typed in some installs and text-typed in
  // older ones — normalize before fallback.
  const fallbackAge = ageFromDate ?? (
    user.age != null && user.age !== '' ? Number(user.age) : null
  );
  const ageOk = Number.isFinite(fallbackAge) && fallbackAge >= 0 && fallbackAge < 150;

  let datePart = '';
  if (user.birth_date) {
    const d = new Date(user.birth_date);
    if (!Number.isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yy = d.getFullYear();
      datePart = `${dd}/${mm}/${yy}`;
    }
  }

  if (datePart && ageOk) return `${datePart} (${fallbackAge})`;
  if (datePart)         return datePart;
  if (ageOk)            return `גיל ${fallbackAge}`;
  return '';
};
