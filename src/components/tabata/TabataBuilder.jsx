import React, { useState, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, GripVertical, Save, Play, Clock, RotateCcw, Zap, History } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function TabataBuilder({ onStart, onSaveTemplate, initialData }) {
  const [config, setConfig] = useState({
    name: "אימון טבטה חדש",
    work_time: 20,
    rest_time: 10,
    rounds: 8,
    rest_between_rounds: 60,
    exercises: [{ id: '1', name: "", notes: "" }]
  });

  useEffect(() => {
    if (initialData) {
      setConfig({
        ...initialData,
        exercises: initialData.exercises.map((ex, i) => ({ ...ex, id: ex.id || `ex-${i}` }))
      });
    }
  }, [initialData]);

  const updateConfig = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const addExercise = () => {
    setConfig(prev => ({
      ...prev,
      exercises: [...prev.exercises, { id: `new-${Date.now()}`, name: "", notes: "" }]
    }));
  };

  const removeExercise = (index) => {
    setConfig(prev => ({
      ...prev,
      exercises: prev.exercises.filter((_, i) => i !== index)
    }));
  };

  const updateExercise = (index, field, value) => {
    const newExercises = [...config.exercises];
    newExercises[index] = { ...newExercises[index], [field]: value };
    setConfig(prev => ({ ...prev, exercises: newExercises }));
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const items = Array.from(config.exercises);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setConfig(prev => ({ ...prev, exercises: items }));
  };

  const handleStart = () => {
    // Validation
    const validExercises = config.exercises.filter(e => e.name.trim() !== "");
    if (validExercises.length === 0) {
      toast.error("יש להוסיף לפחות תרגיל אחד");
      return;
    }
    if (config.work_time <= 0) {
        toast.error("זמן עבודה חייב להיות גדול מ-0");
        return;
    }
    if (config.rounds <= 0) {
        toast.error("מספר סבבים חייב להיות גדול מ-0");
        return;
    }

    onStart({
        ...config,
        exercises: validExercises
    });
  };

  const handleSave = () => {
    if (!config.name.trim()) {
        toast.error("יש לתת שם לאימון");
        return;
    }
    const validExercises = config.exercises.filter(e => e.name.trim() !== "");
    if (validExercises.length === 0) {
        toast.error("יש להוסיף לפחות תרגיל אחד");
        return;
    }
    onSaveTemplate({
        ...config,
        exercises: validExercises
    });
  };

  return (
    <div className="space-y-6 pb-20" dir="rtl">
      {/* Settings Card */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="mb-4">
            <Label className="text-gray-500 text-xs font-bold mb-1 block">שם האימון</Label>
            <Input 
                value={config.name} 
                onChange={(e) => updateConfig('name', e.target.value)}
                className="text-lg font-bold border-gray-200 focus:border-[#FF6F20] h-12"
                placeholder="שם האימון..."
            />
        </div>

        <div className="grid grid-cols-2 gap-4">
            <div>
                <Label className="flex items-center gap-1.5 text-gray-500 text-xs font-bold mb-1.5">
                    <Zap size={14} className="text-[#FF6F20]" /> זמן עבודה (שניות)
                </Label>
                <Input 
                    type="number" 
                    value={config.work_time} 
                    onChange={(e) => updateConfig('work_time', parseInt(e.target.value) || 0)}
                    className="text-center font-bold text-lg h-12 bg-gray-50"
                />
            </div>
            <div>
                <Label className="flex items-center gap-1.5 text-gray-500 text-xs font-bold mb-1.5">
                    <Clock size={14} className="text-blue-500" /> זמן מנוחה (שניות)
                </Label>
                <Input 
                    type="number" 
                    value={config.rest_time} 
                    onChange={(e) => updateConfig('rest_time', parseInt(e.target.value) || 0)}
                    className="text-center font-bold text-lg h-12 bg-gray-50"
                />
            </div>
            <div>
                <Label className="flex items-center gap-1.5 text-gray-500 text-xs font-bold mb-1.5">
                    <RotateCcw size={14} className="text-green-500" /> מספר סבבים
                </Label>
                <Input 
                    type="number" 
                    value={config.rounds} 
                    onChange={(e) => updateConfig('rounds', parseInt(e.target.value) || 1)}
                    className="text-center font-bold text-lg h-12 bg-gray-50"
                />
            </div>
            <div>
                <Label className="flex items-center gap-1.5 text-gray-500 text-xs font-bold mb-1.5">
                    <History size={14} className="text-purple-500" /> מנוחה בין סבבים
                </Label>
                <Input 
                    type="number" 
                    value={config.rest_between_rounds} 
                    onChange={(e) => updateConfig('rest_between_rounds', parseInt(e.target.value) || 0)}
                    className="text-center font-bold text-lg h-12 bg-gray-50"
                />
            </div>
        </div>
      </div>

      {/* Exercises List */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
            <h3 className="font-bold text-lg text-gray-900">תרגילים ({config.exercises.length})</h3>
            <Button variant="ghost" size="sm" onClick={addExercise} className="text-[#FF6F20] hover:bg-orange-50 font-bold">
                <Plus size={16} className="ml-1" /> הוסף תרגיל
            </Button>
        </div>

        <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="exercises">
                {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                        {config.exercises.map((exercise, index) => (
                            <Draggable key={exercise.id} draggableId={exercise.id} index={index}>
                                {(provided) => (
                                    <div 
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex gap-3 items-start"
                                    >
                                        <div {...provided.dragHandleProps} className="mt-2 text-gray-300 cursor-move">
                                            <GripVertical size={20} />
                                        </div>
                                        <div className="flex-1 space-y-2">
                                            <Input 
                                                value={exercise.name}
                                                onChange={(e) => updateExercise(index, 'name', e.target.value)}
                                                placeholder={`תרגיל ${index + 1}`}
                                                className="font-bold border-gray-200 focus:border-[#FF6F20]"
                                            />
                                            <Input 
                                                value={exercise.notes}
                                                onChange={(e) => updateExercise(index, 'notes', e.target.value)}
                                                placeholder="הערות (אופציונלי)"
                                                className="text-xs h-8 bg-gray-50 border-transparent"
                                            />
                                        </div>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            onClick={() => removeExercise(index)}
                                            className="text-gray-300 hover:text-red-500 hover:bg-red-50 -mt-1 -ml-1"
                                        >
                                            <Trash2 size={18} />
                                        </Button>
                                    </div>
                                )}
                            </Draggable>
                        ))}
                        {provided.placeholder}
                    </div>
                )}
            </Droppable>
        </DragDropContext>
        
        {config.exercises.length === 0 && (
            <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-400">
                אין תרגילים ברשימה
                <Button variant="link" onClick={addExercise} className="text-[#FF6F20] font-bold block mx-auto">
                    הוסף תרגיל ראשון
                </Button>
            </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <Button 
            onClick={handleSave} 
            variant="outline" 
            className="flex-1 h-14 rounded-xl border-gray-200 font-bold text-gray-700"
        >
            <Save className="ml-2 w-5 h-5" /> שמור תבנית
        </Button>
        <Button 
            onClick={handleStart} 
            className="flex-[2] h-14 rounded-xl bg-[#FF6F20] hover:bg-[#E65F1D] text-white font-black text-lg shadow-lg shadow-orange-200"
        >
            <Play className="ml-2 w-6 h-6 fill-current" /> התחל אימון
        </Button>
      </div>
    </div>
  );
}