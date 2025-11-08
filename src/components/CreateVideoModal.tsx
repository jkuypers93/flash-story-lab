import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "./ImageUpload";
import { AudioRecorder } from "./AudioRecorder";
import { StyleSelector } from "./StyleSelector";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CreateVideoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateVideoModal = ({ open, onOpenChange }: CreateVideoModalProps) => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [style, setStyle] = useState<string>("Silly");
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const handleCreate = async () => {
    if (!imageFile || !audioBlob) return;

    setIsCreating(true);

    try {
      // 1. Upload image to storage
      const imageFileName = `image-${Date.now()}-${imageFile.name}`;
      const { data: imageData, error: imageError } = await supabase.storage
        .from("images")
        .upload(imageFileName, imageFile);

      if (imageError) throw new Error(`Image upload failed: ${imageError.message}`);

      const { data: imageUrlData } = supabase.storage
        .from("images")
        .getPublicUrl(imageFileName);

      const imageUrl = imageUrlData.publicUrl;

      // 2. Upload audio to storage
      const audioFileName = `audio-${Date.now()}.webm`;
      const { data: audioData, error: audioError } = await supabase.storage
        .from("audio")
        .upload(audioFileName, audioBlob);

      if (audioError) throw new Error(`Audio upload failed: ${audioError.message}`);

      const { data: audioUrlData } = supabase.storage
        .from("audio")
        .getPublicUrl(audioFileName);

      const audioUrl = audioUrlData.publicUrl;

      // 3. Create project record
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .insert({
          input_image_url: imageUrl,
          audio_recording_url: audioUrl,
          style_parameters: {
            style,
            identity_pack: {},
            environment_pack: {},
            palette_pack: {},
          },
        })
        .select()
        .single();

      if (projectError || !project) {
        throw new Error(`Failed to create project: ${projectError?.message}`);
      }

      toast({
        title: "Processing",
        description: "Transcribing audio...",
      });

      // 4. Call the transcribe-audio edge function
      const { data: transcriptionData, error: transcriptionError } = await supabase.functions.invoke(
        "transcribe-audio",
        {
          body: {
            audioUrl,
            projectId: project.id,
          },
        }
      );

      if (transcriptionError) {
        throw new Error(`Transcription failed: ${transcriptionError.message}`);
      }

      console.log("Transcription result:", transcriptionData);

      toast({
        title: "Processing",
        description: "Generating script and scenes...",
      });

      // 5. Call the transcript-to-scenes edge function
      const { data: scenesData, error: scenesError } = await supabase.functions.invoke(
        "transcript-to-scenes",
        {
          body: {
            project_id: project.id,
          },
        }
      );

      if (scenesError) {
        throw new Error(`Scene generation failed: ${scenesError.message}`);
      }

      console.log("Scenes generated:", scenesData);

      toast({
        title: "Processing",
        description: "Generating frames for each scene...",
      });

      // 6. Call the generate-frames edge function
      const { data: framesData, error: framesError } = await supabase.functions.invoke(
        "generate-frames",
        {
          body: {
            project_id: project.id,
          },
        }
      );

      if (framesError) {
        throw new Error(`Frame generation failed: ${framesError.message}`);
      }

      toast({
        title: "Success!",
        description: "Video project created with script, scenes, and frames successfully.",
      });

      console.log("Project created:", project);
      console.log("Frames generated:", framesData);

      // Reset form and close modal
      setImageFile(null);
      setAudioBlob(null);
      setStyle("Silly");
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating video:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create video project",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
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
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!imageFile || !audioBlob || isCreating}
              className="bg-primary hover:bg-primary/90"
            >
              {isCreating ? "Processing..." : "Create Video"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
