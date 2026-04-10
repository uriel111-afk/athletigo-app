import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Send, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { notifyNewMessage } from "@/functions/notificationTriggers";
import { toast } from "sonner";

export default function MessageCenter({ currentUserId, currentUserName, otherUserId, otherUserName, relatedUserId }) {
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['messages', currentUserId, otherUserId],
    queryFn: async () => {
      try {
        const sent = await base44.entities.Message.filter({ sender_id: currentUserId, receiver_id: otherUserId });
        const received = await base44.entities.Message.filter({ sender_id: otherUserId, receiver_id: currentUserId });
        const allMessages = [...sent, ...received].sort((a, b) => 
          new Date(a.created_date) - new Date(b.created_date)
        );
        return allMessages;
      } catch (error) {
        console.error("[MessageCenter] Error loading messages:", error);
        return [];
      }
    },
    initialData: [],
    refetchInterval: 5000,
    enabled: !!currentUserId && !!otherUserId
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (messageData) => {
      const newMessage = await base44.entities.Message.create(messageData);
      
      await base44.entities.Notification.create({
        user_id: otherUserId,
        type: "message",
        title: `הודעה חדשה מ${currentUserName} 💬`,
        message: messageData.content.substring(0, 100),
        is_read: false
      });
      
      return newMessage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', currentUserId, otherUserId] });
      queryClient.invalidateQueries({ queryKey: ['notifications', otherUserId] });
      setMessageText("");
      toast.success("✅ ההודעה נשלחה");
    },
    onError: (err) => toast.error("❌ שגיאה בשליחת הודעה: " + (err?.message || "נסה שוב")),
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (messageIds) => {
      for (const id of messageIds) {
        await base44.entities.Message.update(id, { isRead: true });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', currentUserId, otherUserId] });
    },
    onError: () => {},
  });

  useEffect(() => {
    const unreadMessages = messages.filter(m => m.receiver_id === currentUserId && !m.is_read);
    if (unreadMessages.length > 0) {
      markAsReadMutation.mutate(unreadMessages.map(m => m.id));
    }
  }, [messages, currentUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!messageText.trim()) {
      toast.error("נא להקליד הודעה");
      return;
    }

    await sendMessageMutation.mutateAsync({
      sender_id: currentUserId,
      sender_name: currentUserName,
      receiver_id: otherUserId,
      receiver_name: otherUserName,
      related_user_id: relatedUserId || otherUserId,
      content: messageText,
      is_read: false
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#FF6F20' }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" dir="rtl">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: '500px' }}>
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="w-16 h-16 mx-auto mb-4" style={{ color: '#E0E0E0' }} />
            <p className="text-sm" style={{ color: '#7D7D7D' }}>אין הודעות עדיין</p>
            <p className="text-xs mt-2" style={{ color: '#7D7D7D' }}>שלח הודעה ראשונה כדי להתחיל שיחה</p>
          </div>
        ) : (
          messages.map((message) => {
            const isMe = message.sender_id === currentUserId;
            return (
              <div key={message.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="max-w-[75%] rounded-2xl px-4 py-3"
                  style={{
                    backgroundColor: isMe ? '#FF6F20' : '#FFFFFF',
                    color: isMe ? 'white' : '#000000',
                    border: isMe ? 'none' : '1px solid #E0E0E0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
                  }}
                >
                  <p className="text-sm leading-relaxed break-words">{message.content}</p>
                  <p className="text-xs mt-2 opacity-70">
                    {message.created_date && format(new Date(message.created_date), 'HH:mm', { locale: he })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t p-4" style={{ borderColor: '#E0E0E0', backgroundColor: '#FAFAFA' }}>
        <div className="flex gap-2">
          <Textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="הקלד הודעה..."
            className="flex-1 rounded-xl resize-none"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!messageText.trim() || sendMessageMutation.isPending}
            className="rounded-xl px-6"
            style={{ backgroundColor: '#FF6F20', color: 'white' }}
          >
            {sendMessageMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}