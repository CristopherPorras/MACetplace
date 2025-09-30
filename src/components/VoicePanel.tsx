import { X, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VoiceStatus, Message } from '@/lib/useVoiceSession';

type VoicePanelProps = {
  history: Message[];
  status: VoiceStatus;
  onClose: () => void;
  onRetry?: () => void;
};

const statusMessages = {
  idle: 'Ready to listen',
  listening: 'Listening...',
  thinking: 'Processing your question...',
  speaking: 'Speaking...',
  error: 'Something went wrong',
};

export function VoicePanel({ history, status, onClose, onRetry }: VoicePanelProps) {
  return (
    <Card className="fixed bottom-4 right-4 w-full max-w-md h-[500px] flex flex-col shadow-hover z-50 animate-in slide-in-from-bottom-4">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${
            status === 'listening' ? 'bg-primary animate-pulse' :
            status === 'thinking' || status === 'speaking' ? 'bg-accent animate-pulse' :
            status === 'error' ? 'bg-destructive' :
            'bg-muted'
          }`} />
          <h3 className="font-semibold">{statusMessages[status]}</h3>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {history.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">
                Click "Talk with AI" to start a conversation about this product.
              </p>
            </div>
          ) : (
            history.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <p className="text-sm">{message.content}</p>
                </div>
              </div>
            ))
          )}

          {status === 'thinking' && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="flex justify-center">
              <Card className="p-4 bg-destructive/10 border-destructive/20">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <p className="text-sm">Failed to process your request</p>
                </div>
                {onRetry && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRetry}
                    className="mt-2 w-full"
                  >
                    Try Again
                  </Button>
                )}
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}
