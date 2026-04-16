export const EXERCISE_LIBRARY = [
  // קפיצה בחבל
  { id: 'e1', name: 'קפיצות בסיסיות', category: 'קפיצה בחבל', defaultParams: { sets: 3, reps: 30, rest_time: 60 } },
  { id: 'e2', name: 'דאבל אנדרס', category: 'קפיצה בחבל', defaultParams: { sets: 3, reps: 10, rest_time: 90 } },
  { id: 'e3', name: 'קרוסאובר', category: 'קפיצה בחבל', defaultParams: { sets: 3, reps: 10, rest_time: 60 } },
  { id: 'e4', name: 'החלפת רגליים', category: 'קפיצה בחבל', defaultParams: { sets: 3, reps: 20, rest_time: 60 } },
  { id: 'e5', name: 'הרמת ברכיים', category: 'קפיצה בחבל', defaultParams: { sets: 3, reps: 20, rest_time: 60 } },
  // כוח עליון
  { id: 'e10', name: 'שכיבות סמיכה', category: 'כוח עליון', defaultParams: { sets: 3, reps: 12, rest_time: 60 } },
  { id: 'e11', name: 'מתח רחב', category: 'כוח עליון', defaultParams: { sets: 3, reps: 8, rest_time: 90 } },
  { id: 'e12', name: 'דיפס', category: 'כוח עליון', defaultParams: { sets: 3, reps: 10, rest_time: 60 } },
  { id: 'e13', name: 'שורות', category: 'כוח עליון', defaultParams: { sets: 3, reps: 10, rest_time: 60 } },
  { id: 'e14', name: 'לחיצת כתפיים', category: 'כוח עליון', defaultParams: { sets: 3, reps: 10, rest_time: 60 } },
  // כוח תחתון
  { id: 'e20', name: 'סקוואט', category: 'כוח תחתון', defaultParams: { sets: 4, reps: 12, rest_time: 60 } },
  { id: 'e21', name: 'לאנג\'', category: 'כוח תחתון', defaultParams: { sets: 3, reps: 10, rest_time: 60 } },
  { id: 'e22', name: 'דד ליפט', category: 'כוח תחתון', defaultParams: { sets: 3, reps: 8, rest_time: 90 } },
  { id: 'e23', name: 'סטפ אפ', category: 'כוח תחתון', defaultParams: { sets: 3, reps: 10, rest_time: 60 } },
  // ליבה
  { id: 'e30', name: 'פלאנק', category: 'ליבה', defaultParams: { sets: 3, work_time: 45, rest_time: 45 } },
  { id: 'e31', name: 'בטן מתקפל', category: 'ליבה', defaultParams: { sets: 3, reps: 20, rest_time: 45 } },
  { id: 'e32', name: 'רוסיאן טוויסט', category: 'ליבה', defaultParams: { sets: 3, reps: 20, rest_time: 45 } },
  // גמישות
  { id: 'e40', name: 'מתיחת ירך', category: 'גמישות', defaultParams: { sets: 1, work_time: 30, rest_time: 10 } },
  { id: 'e41', name: 'מתיחת כתף', category: 'גמישות', defaultParams: { sets: 1, work_time: 30, rest_time: 10 } },
  { id: 'e42', name: 'מתיחת גב', category: 'גמישות', defaultParams: { sets: 1, work_time: 30, rest_time: 10 } },
  // טבעות
  { id: 'e50', name: 'RTO הולדינג', category: 'טבעות', defaultParams: { sets: 3, work_time: 20, rest_time: 60 } },
  { id: 'e51', name: 'מסלול טבעות', category: 'טבעות', defaultParams: { sets: 3, reps: 8, rest_time: 90 } },
  { id: 'e52', name: 'דיפס בטבעות', category: 'טבעות', defaultParams: { sets: 3, reps: 8, rest_time: 90 } },
  // קרדיו
  { id: 'e60', name: 'ריצה', category: 'קרדיו', defaultParams: { work_time: 600, rest_time: 0 } },
  { id: 'e61', name: 'ברפי', category: 'קרדיו', defaultParams: { sets: 3, reps: 10, rest_time: 60 } },
  { id: 'e62', name: 'ג\'מפינג ג\'ק', category: 'קרדיו', defaultParams: { sets: 3, reps: 30, rest_time: 30 } },
];

export const EXERCISE_CATEGORIES = [...new Set(EXERCISE_LIBRARY.map(e => e.category))];

export function searchExercises(query) {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  return EXERCISE_LIBRARY.filter(e => e.name.includes(q) || e.category.includes(q)).slice(0, 10);
}
