import { useState, useRef, useEffect } from "react";
import { Mic, Square, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface AudioRecorderProps {
  onAudioCapture: (blob: Blob | null) => void;
  maxDuration: number;
}

export const AudioRecorder = ({ onAudioCapture, maxDuration }: AudioRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        onAudioCapture(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setDuration(0);

      timerRef.current = window.setInterval(() => {
        setDuration((prev) => {
          if (prev >= maxDuration) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (error) {
      toast.error("Failed to access microphone");
      console.error(error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const playAudio = () => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.play();
      setIsPlaying(true);
      audio.onended = () => setIsPlaying(false);
    }
  };

  const deleteRecording = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setDuration(0);
    onAudioCapture(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="border border-border rounded-lg p-4 bg-card">
      {!audioUrl ? (
        <div className="flex items-center gap-4">
          <Button
            onClick={isRecording ? stopRecording : startRecording}
            variant={isRecording ? "destructive" : "default"}
            className="flex-shrink-0"
          >
            {isRecording ? (
              <>
                <Square className="w-4 h-4 mr-2" />
                Stop
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 mr-2" />
                Record
              </>
            )}
          </Button>
          
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">
                {isRecording ? "Recording..." : "Ready to record"}
              </span>
              <span className="text-sm font-mono text-foreground">
                {formatTime(duration)} / {formatTime(maxDuration)}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${
                  isRecording ? "bg-primary animate-pulse" : "bg-transparent"
                }`}
                style={{ width: `${(duration / maxDuration) * 100}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Button
            onClick={playAudio}
            disabled={isPlaying}
            variant="outline"
            size="icon"
          >
            <Play className="w-4 h-4" />
          </Button>
          
          <div className="flex-1">
            <div className="text-sm text-muted-foreground mb-1">Recording complete</div>
            <div className="text-xs font-mono text-foreground">
              Duration: {formatTime(duration)}
            </div>
          </div>

          <Button
            onClick={deleteRecording}
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
};
