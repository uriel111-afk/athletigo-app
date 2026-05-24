import React, { useState, useEffect, useCallback } from "react";
import { X, Plus, Pencil, GripVertical, Loader2 } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import VariationForm from "./VariationForm";

function intensityColor(level) {
  if (level >= 8) return "#dc2626";
  if (level >= 4) return "#FF6F20";
  return "#16a34a";
}

function intensityLabel(level) {
  if (level >= 8) return "קשה מאוד";
  if (level >= 6) return "קשה";
  if (level >= 4) return "בינוני";
  if (level >= 2) return "קל";
  return "קל מאוד";
}

function SortableVariationCard({ variation, onEdit }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: variation.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const color = intensityColor(variation.intensity_level);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: "flex",
        alignItems: "stretch",
        background: "#fff",
        border: "1.5px solid #F0E4D0",
        borderRadius: 12,
        padding: 10,
        gap: 10,
        boxShadow: isDragging ? "0 8px 20px rgba(0,0,0,0.12)" : "none",
      }}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="גרור לסידור"
        style={{
          background: "transparent",
          border: "none",
          color: "#999",
          cursor: "grab",
          touchAction: "none",
          padding: "0 4px",
          display: "flex",
          alignItems: "center",
        }}
      >
        <GripVertical size={20} />
      </button>

      <div
        style={{
          width: 52,
          minHeight: 52,
          background: "#FFF7ED",
          border: `2px solid ${color}`,
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: "Bebas Neue, Barlow Condensed, sans-serif",
            fontSize: 32,
            lineHeight: 1,
            fontWeight: 700,
            color,
          }}
        >
          {variation.intensity_level}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onEdit(variation)}
        style={{
          flex: 1,
          minWidth: 0,
          background: "transparent",
          border: "none",
          padding: 0,
          textAlign: "right",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 2,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: "#1a1a1a",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {variation.name}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color }}>
          רמה {variation.intensity_level} · {intensityLabel(variation.intensity_level)}
        </div>
        {variation.description && (
          <div
            style={{
              fontSize: 11,
              color: "#888",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {variation.description}
          </div>
        )}
      </button>

      <button
        type="button"
        onClick={() => onEdit(variation)}
        aria-label="ערוך וריאציה"
        style={{
          background: "#FFF7ED",
          border: "1.5px solid #FFD0AC",
          color: "#FF6F20",
          width: 36,
          height: 36,
          borderRadius: 10,
          alignSelf: "center",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Pencil size={16} />
      </button>
    </div>
  );
}

export default function VariationsManager({ exerciseId, exerciseName, onClose, onCountChange }) {
  const [variations, setVariations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);
  const [formState, setFormState] = useState({ open: false, variation: null });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const load = useCallback(async () => {
    if (!exerciseId) {
      setVariations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("exercise_variations")
      .select("*")
      .eq("exercise_id", exerciseId)
      .order("intensity_level", { ascending: false });
    if (error) {
      console.error("[VariationsManager] load failed", error);
      toast.error("טעינת הוריאציות נכשלה");
      setVariations([]);
    } else {
      setVariations(data || []);
      onCountChange?.((data || []).length);
    }
    setLoading(false);
  }, [exerciseId, onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = variations.findIndex((v) => v.id === active.id);
    const newIndex = variations.findIndex((v) => v.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const sortedLevels = variations.map((v) => v.intensity_level);
    const reordered = arrayMove(variations, oldIndex, newIndex);
    const updated = reordered.map((v, i) => ({ ...v, intensity_level: sortedLevels[i] }));

    setVariations(updated);
    setSavingOrder(true);

    const changes = updated.filter((v) => {
      const prev = variations.find((p) => p.id === v.id);
      return prev && prev.intensity_level !== v.intensity_level;
    });

    try {
      for (const v of changes) {
        const { error } = await supabase
          .from("exercise_variations")
          .update({
            intensity_level: v.intensity_level,
            updated_at: new Date().toISOString(),
          })
          .eq("id", v.id);
        if (error) throw error;
      }
    } catch (err) {
      console.error("[VariationsManager] reorder save failed", err);
      toast.error("שמירת הסדר נכשלה — מרענן");
      load();
    } finally {
      setSavingOrder(false);
    }
  };

  const openNew = () => setFormState({ open: true, variation: null });
  const openEdit = (variation) => setFormState({ open: true, variation });
  const closeForm = () => setFormState({ open: false, variation: null });

  const count = variations.length;

  return (
    <div
      dir="rtl"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 11050,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#FFF9F0",
          borderRadius: 16,
          width: "100%",
          maxWidth: 500,
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #FF6F20 0%, #FF8A4C 100%)",
            color: "white",
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600 }}>נהל וריאציות</div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {exerciseName || "תרגיל"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              color: "white",
              width: 32,
              height: 32,
              borderRadius: 8,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          style={{
            padding: "10px 14px",
            background: "#fff",
            borderBottom: "1px solid #F0E4D0",
            fontSize: 12,
            color: "#777",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span>
            {count > 0
              ? `סקלה של ${count} וריאציות · מהקשה ביותר לקל ביותר`
              : "עדיין אין וריאציות לתרגיל זה"}
          </span>
          {savingOrder && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#FF6F20" }}>
              <Loader2 size={14} className="animate-spin" />
              שומר...
            </span>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
          {loading ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: 40,
                color: "#888",
              }}
            >
              <Loader2 size={28} className="animate-spin" />
              <span style={{ fontSize: 12, fontWeight: 600 }}>טוען וריאציות...</span>
            </div>
          ) : variations.length === 0 ? (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                color: "#888",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              הוסף את הוריאציה הראשונה שלך לתרגיל זה
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={variations.map((v) => v.id)}
                strategy={verticalListSortingStrategy}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {variations.map((v) => (
                    <SortableVariationCard key={v.id} variation={v} onEdit={openEdit} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        <div
          style={{
            padding: 12,
            borderTop: "1px solid #F0E4D0",
            background: "#fff",
          }}
        >
          <button
            type="button"
            onClick={openNew}
            style={{
              width: "100%",
              padding: "12px 14px",
              background: "linear-gradient(135deg, #FF6F20 0%, #FF8A4C 100%)",
              border: "none",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 800,
              color: "white",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Plus size={18} />
            הוסף וריאציה חדשה
          </button>
        </div>
      </div>

      {formState.open && (
        <VariationForm
          exerciseId={exerciseId}
          exerciseName={exerciseName}
          variation={formState.variation}
          onClose={closeForm}
          onSaved={load}
        />
      )}
    </div>
  );
}
