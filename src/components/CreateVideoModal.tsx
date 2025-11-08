import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "./ImageUpload";
import { AudioRecorder } from "./AudioRecorder";
import { StyleSelector } from "./StyleSelector";

interface CreateVideoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateVideoModal = ({ open, onOpenChange }: CreateVideoModalProps) => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [style, setStyle] = useState<string>("normal");

  const handleCreate = () => {
    console.log("Creating video with:", { imageFile, audioBlob, style });
    // Handle video creation logic here
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">Create Video</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Upload Image</label>
            <ImageUpload onImageSelect={setImageFile} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Record Audio</label>
            <AudioRecorder onAudioCapture={setAudioBlob} maxDuration={40} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Style</label>
            <StyleSelector value={style} onValueChange={setStyle} />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreate}
              disabled={!imageFile || !audioBlob}
              className="bg-primary hover:bg-primary/90"
            >
              Create Video
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
