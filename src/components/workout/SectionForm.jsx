import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function SectionForm({ section, onChange }) {
  const [selectedCategory, setSelectedCategory] = useState(section.category || "");
  const [isCustom, setIsCustom] = useState(section.category === "מותאם אישית" || !section.category);
  const [localSection, setLocalSection] = useState(section);

  const categories = [
    { id: "חימום", label: "חימום", icon: "🔥", color: "#FF6F20" },
    { id: "תנועתיות", label: "תנועתיות", icon: "🌀", color: "#2196F3" },
    { id: "כוח", label: "כוח", icon: "💪", color: "#000000" },
    { id: "סקילס", label: "סקילס", icon: "⚡", color: "#9C27B0" },
    { id: "גמישות", label: "גמישות", icon: "🧘‍♂️", color: "#4CAF50" },
    { id: "מותאם אישית", label: "מותאם", icon: "✨", color: "#7D7D7D" }
  ];

  const handleCategorySelect = (category) => {
    setSelectedCategory(category.id);
    setIsCustom(category.id === "מותאם אישית");
    
    const updatedSection = category.id !== "מותאם אישית" ? {
      ...section,
      category: category.id,
      section_name: category.label,
      icon: category.icon,
      color_theme: category.color
    } : {
      ...section,
      category: category.id,
      section_name: section.section_name || "",
      icon: category.icon,
      color_theme: category.color
    };
    
    setLocalSection(updatedSection);
    onChange(updatedSection);
  };

  return (
    <div className="space-y-6 w-full" dir="rtl">
      {/* Category Selection */}
      <div className="w-full">
        <Label className="text-sm font-bold mb-3 block">בחר סוג סקשן *</Label>
        <div className="grid grid-cols-3 gap-2 w-full">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => handleCategorySelect(category)}
              className="p-3 rounded-xl transition-all text-center"
              style={{
                backgroundColor: selectedCategory === category.id ? category.color : '#FFFFFF',
                color: selectedCategory === category.id ? '#FFFFFF' : '#000000',
                border: selectedCategory === category.id ? 'none' : '2px solid #E0E0E0',
                boxShadow: selectedCategory === category.id ? `0 4px 12px ${category.color}33` : 'none'
              }}
            >
              <div className="text-2xl mb-1">{category.icon}</div>
              <div className="font-bold text-xs">{category.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Section Name */}
      {isCustom && (
        <div className="p-4 rounded-xl w-full" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
          <Label className="text-sm font-bold mb-2 block">שם הסקשן *</Label>
          <Input
            value={localSection.section_name || ""}
            onChange={(e) => {
              const updated = { ...localSection, section_name: e.target.value };
              setLocalSection(updated);
              onChange(updated);
            }}
            placeholder="הקלד שם..."
            className="rounded-xl py-3 text-base w-full"
          />
        </div>
      )}

      {/* Section Name Display */}
      {!isCustom && selectedCategory && (
        <div className="p-4 rounded-xl text-center w-full" style={{ backgroundColor: '#E8F5E9', border: '2px solid #4CAF50' }}>
          <div className="text-3xl mb-2">
            {categories.find(c => c.id === selectedCategory)?.icon}
          </div>
          <div className="font-bold text-lg" style={{ color: '#000000' }}>
            {localSection.section_name || categories.find(c => c.id === selectedCategory)?.label || "לא נבחר"}
          </div>
        </div>
      )}

      {/* Description */}
      <div className="w-full">
        <Label className="text-sm font-bold mb-2 block">תיאור</Label>
        <Textarea
          value={localSection.description || ""}
          onChange={(e) => {
            const updated = { ...localSection, description: e.target.value };
            setLocalSection(updated);
            onChange(updated);
          }}
          placeholder="תיאור קצר..."
          className="rounded-xl min-h-[80px] w-full"
        />
      </div>

      {/* Icon Override */}
      {isCustom && (
        <div className="w-full">
          <Label className="text-sm font-bold mb-2 block">אימוג'י</Label>
          <Input
            value={localSection.icon || ""}
            onChange={(e) => {
              const updated = { ...localSection, icon: e.target.value };
              setLocalSection(updated);
              onChange(updated);
            }}
            placeholder="💪"
            className="rounded-xl py-3 text-2xl text-center w-full"
            maxLength={2}
          />
        </div>
      )}
    </div>
  );
}