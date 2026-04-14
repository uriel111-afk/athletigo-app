import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function RenameUserDialog({ isOpen, onClose, onSubmit, user, isLoading }) {
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || "");
    }
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await onSubmit(fullName);
    } catch (error) {
      console.error("[RenameUser] Error:", error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>שינוי שם משתמש</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-right">שם מלא</Label>
            <Input
              id="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="הכנס שם מלא..."
              className="text-right"
            />
          </div>
          <DialogFooter className="flex gap-2 sm:justify-start">
            <Button type="submit" disabled={isLoading} className="bg-[#FF6F20] hover:bg-[#e65b12]">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
              שמור שינויים
            </Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              ביטול
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}