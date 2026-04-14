import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function AddCustomValueDialog({ isOpen, onClose, onSave, title, isLoading }) {
  const [value, setValue] = useState("");

  const handleSave = () => {
    if (value.trim()) {
      onSave(value.trim());
      setValue("");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-center">{title || "הוסף ערך חדש"}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <Label className="mb-2 block text-sm">שם הערך החדש</Label>
            <Input 
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="הקלד כאן..."
              className="h-10"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-start">
          <Button 
            variant="outline" 
            onClick={onClose}
            className="flex-1"
          >
            ביטול
          </Button>
          <Button 
            onClick={handleSave}
            disabled={!value.trim() || isLoading}
            className="flex-1 bg-[#FF6F20] hover:bg-[#e65b12] text-white"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "אישור"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}