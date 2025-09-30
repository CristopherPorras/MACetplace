import { Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VoiceStatus } from '@/lib/useVoiceSession';

type VoiceButtonProps = {
  onStart: () => void;
  onStop: () => void;
  status: VoiceStatus;
};

export function VoiceButton({ onStart, onStop, status }: VoiceButtonProps) {
  const isActive = status !== 'idle';

  return (
    <Button
      onClick={isActive ? onStop : onStart}
      size="lg"
      className={`relative overflow-hidden transition-all ${
        isActive
          ? 'bg-destructive hover:bg-destructive/90'
          : 'bg-gradient-primary hover:shadow-glow'
      }`}
    >
      {isActive ? (
        <>
          <MicOff className="mr-2 h-5 w-5" />
          Stop
        </>
      ) : (
        <>
          <Mic className="mr-2 h-5 w-5" />
          Talk with AI
        </>
      )}
      {isActive && (
        <span className="absolute inset-0 animate-pulse bg-white/20" />
      )}
    </Button>
  );
}
