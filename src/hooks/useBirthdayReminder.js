import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

// Once per day per coach, scan trainees for birthdays falling
// today or tomorrow and create a `birthday` notification. The
// per-day localStorage gate prevents repeat scans on every nav,
// and the per-trainee DB pre-check prevents duplicates if the
// gate is bypassed (e.g. user clears storage, multiple devices).
const STORAGE_KEY = 'athletigo_birthday_check';

export function useBirthdayReminder(coachId) {
  useEffect(() => {
    if (!coachId) return;

    const today = new Date().toISOString().split('T')[0];
    const lastCheck = localStorage.getItem(STORAGE_KEY);
    if (lastCheck === today) return;

    const checkBirthdays = async () => {
      try {
        const { data: trainees, error } = await supabase
          .from('users')
          .select('id, full_name, birth_date')
          .eq('coach_id', coachId)
          .eq('role', 'trainee')
          .not('birth_date', 'is', null);

        if (error) { console.warn('[BirthdayReminder] fetch failed:', error); return; }
        if (!trainees?.length) {
          localStorage.setItem(STORAGE_KEY, today);
          return;
        }

        const now = new Date();
        const todayMonth = now.getMonth();
        const todayDay = now.getDate();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowMonth = tomorrow.getMonth();
        const tomorrowDay = tomorrow.getDate();

        for (const trainee of trainees) {
          const bday = new Date(trainee.birth_date);
          if (Number.isNaN(bday.getTime())) continue;
          const bMonth = bday.getMonth();
          const bDay = bday.getDate();

          // Age the trainee will turn on this birthday.
          const turningAge = now.getFullYear() - bday.getFullYear();

          if (bMonth === todayMonth && bDay === todayDay) {
            await createBirthdayNotification(coachId, trainee, turningAge, 'today');
          } else if (bMonth === tomorrowMonth && bDay === tomorrowDay) {
            await createBirthdayNotification(coachId, trainee, turningAge, 'tomorrow');
          }
        }

        localStorage.setItem(STORAGE_KEY, today);
      } catch (err) {
        console.error('[BirthdayReminder] error:', err);
      }
    };

    checkBirthdays();
  }, [coachId]);
}

async function createBirthdayNotification(coachId, trainee, age, when) {
  const today = new Date().toISOString().split('T')[0];

  // Don't duplicate today's birthday notification for this trainee.
  const { data: existing } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', coachId)
    .eq('trainee_id', trainee.id)
    .eq('type', 'birthday')
    .gte('created_at', today + 'T00:00:00')
    .lte('created_at', today + 'T23:59:59')
    .limit(1);

  if (existing && existing.length > 0) return;

  const message = when === 'today'
    ? `🎂 היום יום הולדת ${age} ל${trainee.full_name}! אל תשכח לברך 🎉`
    : `🎂 מחר יום הולדת ${age} ל${trainee.full_name}! הכן ברכה 🎉`;

  await supabase.from('notifications').insert({
    user_id: coachId,
    trainee_id: trainee.id,
    type: 'birthday',
    message,
    is_read: false,
  });
}
