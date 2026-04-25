import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Permissions a coach can grant a trainee. Mirrors the columns in
// the trainee_permissions table created by the
// 20260425_trainee_permissions.sql migration.
//
// Default behavior: any permission missing from the row (or if the
// row itself doesn't exist, or if the table doesn't exist yet)
// resolves to TRUE — so existing trainees keep full access until
// the coach explicitly turns something off.
export const PERM_KEYS = [
  "view_baseline",
  "view_plan",
  "view_progress",
  "view_documents",
  "edit_metrics",
  "send_videos",
  "send_messages",
  // Wave-3 additions — added by 20260425_extend_trainee_permissions.sql.
  // Default TRUE everywhere, so screens stay visible until the coach
  // explicitly turns them off.
  "view_training_plan",
  "view_records",
];

const DEFAULT_PERMS = Object.fromEntries(PERM_KEYS.map(k => [k, true]));

export function useTraineePermissions(traineeId) {
  const [perms, setPerms] = useState(DEFAULT_PERMS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!traineeId) return;
    let cancelled = false;
    (async () => {
      try {
        // RLS lets the trainee read rows where trainee_id = auth.uid().
        // If the table doesn't exist (migration not run), the catch
        // path below preserves DEFAULT_PERMS so the app stays usable.
        const { data, error } = await supabase
          .from("trainee_permissions")
          .select("*")
          .eq("trainee_id", traineeId)
          .maybeSingle();
        if (cancelled) return;
        if (error && error.code === "42P01") {
          // table doesn't exist yet — keep defaults
          console.warn("[useTraineePermissions] table missing, defaulting to allow-all");
          setPerms(DEFAULT_PERMS);
        } else if (error) {
          console.warn("[useTraineePermissions] fetch error:", error.message);
          setPerms(DEFAULT_PERMS);
        } else if (data) {
          const next = { ...DEFAULT_PERMS };
          for (const k of PERM_KEYS) {
            if (typeof data[k] === "boolean") next[k] = data[k];
          }
          setPerms(next);
        } else {
          // No row yet — coach hasn't set anything; allow everything.
          setPerms(DEFAULT_PERMS);
        }
      } catch (e) {
        console.warn("[useTraineePermissions] exception:", e);
        setPerms(DEFAULT_PERMS);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [traineeId]);

  return { perms, loaded };
}
