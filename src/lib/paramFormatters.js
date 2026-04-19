export function formatParams(p) {
  if (!p || typeof p !== "object") return [];
  const pills = [];

  if (p["סטים"] && p["חזרות"]) {
    pills.push(`${p["סטים"]} × ${p["חזרות"]}`);
  } else if (p["סטים"]) {
    pills.push(`${p["סטים"]} סטים`);
  } else if (p["חזרות"]) {
    pills.push(`${p["חזרות"]} חזרות`);
  }

  const fmtTime = (s) => {
    const n = Number(s);
    if (isNaN(n) || n === 0) return null;
    if (n < 60) return `${n} שנ'`;
    const m = Math.floor(n / 60);
    const sec = n % 60;
    return sec === 0 ? `${m}:00` : `${m}:${String(sec).padStart(2, "0")}`;
  };

  const work = fmtTime(p["זמן עבודה"]);
  if (work) pills.push(`עבודה ${work}`);
  const rest = fmtTime(p["זמן מנוחה"]);
  if (rest) pills.push(`מנוחה ${rest}`);
  const hold = fmtTime(p["החזקה סטטית"]);
  if (hold) pills.push(`החזקה ${hold}`);

  if (p["משקל"] || p["משקל (ק״ג)"]) pills.push(`${p["משקל"] || p["משקל (ק״ג)"]} ק"ג`);
  if (p["RPE"] || p["RPE (קושי)"]) pills.push(`RPE ${p["RPE"] || p["RPE (קושי)"]}`);
  if (p["טמפו"]) pills.push(`טמפו ${p["טמפו"]}`);

  const equip = p["ציוד נדרש"];
  if (Array.isArray(equip) && equip.length > 0) {
    pills.push(equip.length === 1 ? equip[0] : `${equip[0]} +${equip.length - 1}`);
  } else if (typeof equip === "string" && equip) {
    pills.push(equip);
  }

  return pills;
}

// Build params object from exercise DB columns (for PlanBuilder exercises)
export function exerciseToParams(ex) {
  if (!ex) return {};
  const p = {};
  if (ex.sets) p["סטים"] = ex.sets;
  if (ex.reps) p["חזרות"] = ex.reps;
  if (ex.work_time) p["זמן עבודה"] = ex.work_time;
  if (ex.rest_time) p["זמן מנוחה"] = ex.rest_time;
  if (ex.weight) p["משקל (ק״ג)"] = ex.weight;
  if (ex.rpe) p["RPE (קושי)"] = ex.rpe;
  if (ex.tempo) p["טמפו"] = ex.tempo;
  if (ex.rest_between_sets) p["מנ׳ בין סטים"] = ex.rest_between_sets;
  if (ex.rest_between_exercises) p["מנ׳ בין תרגילים"] = ex.rest_between_exercises;
  if (ex.body_position) p["מנח גוף"] = ex.body_position;
  if (ex.equipment) p["ציוד נדרש"] = ex.equipment;
  if (ex.static_hold_time) p["החזקה סטטית"] = ex.static_hold_time;
  if (ex.description) p["דגשים"] = ex.description;
  if (ex.side) p["צד"] = ex.side;
  if (ex.range_of_motion) p["טווח תנועה"] = ex.range_of_motion;
  if (ex.grip) p["אחיזה"] = ex.grip;
  if (ex.video_url) p["וידאו"] = ex.video_url;
  return p;
}
