import { useState, useEffect, useRef } from "react";
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

/**
 * Poll the database to wait for frames to be fully stored
 * @param projectId - The project ID to check
 * @param maxAttempts - Maximum number of polling attempts (default: 60)
 * @param intervalMs - Milliseconds between polling attempts (default: 3000)
 * @returns true if frames are ready, false if timeout
 */
async function waitForFrames(
  projectId: string,
  maxAttempts: number = 60,
  intervalMs: number = 3000
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`Checking for frames (attempt ${attempt}/${maxAttempts})...`);

    const { data: project, error } = await supabase
      .from("projects")
      .select("frames, scenes")
      .eq("id", projectId)
      .single();

    if (error) {
      console.error("Error fetching project:", error);
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      continue;
    }

    // Check if frames exist and are not null
    if (project.frames && typeof project.frames === "object") {
      const frameKeys = Object.keys(project.frames);
      const sceneKeys = project.scenes ? Object.keys(project.scenes) : [];

      console.log(`Found ${frameKeys.length} frame entries, expected ${sceneKeys.length} scenes`);

      // Verify we have frames for all scenes
      if (frameKeys.length === sceneKeys.length && frameKeys.length > 0) {
        // Check that each frame entry has both first_frame and last_frame
        const incompleteFrames: string[] = [];
        const allFramesComplete = frameKeys.every((key) => {
          const frameData = project.frames[key];
          const isComplete = (
            frameData &&
            typeof frameData === "object" &&
            "first_frame" in frameData &&
            "last_frame" in frameData &&
            frameData.first_frame &&
            frameData.last_frame
          );

          if (!isComplete) {
            incompleteFrames.push(key);
          }

          return isComplete;
        });

        if (allFramesComplete) {
          console.log("✓ All frames are ready!");
          return true;
        } else {
          console.log(`Some frames are incomplete (${incompleteFrames.length}): ${incompleteFrames.join(", ")}`);

          // If we've been polling for a while and frames are still incomplete, log more details
          if (attempt > 10) {
            incompleteFrames.forEach((key) => {
              const frameData = project.frames[key];
              console.log(`  Scene ${key}:`, {
                hasFirstFrame: !!(frameData?.first_frame),
                hasLastFrame: !!(frameData?.last_frame),
                frameData: frameData ? JSON.stringify(frameData).substring(0, 100) : "null",
              });
            });
          }
        }
      } else if (frameKeys.length > 0 && frameKeys.length < sceneKeys.length) {
        console.log(`Partial frames detected: ${frameKeys.length}/${sceneKeys.length} scenes have frames`);
        console.log(`  Complete: ${frameKeys.join(", ")}`);
        const missing = sceneKeys.filter(k => !frameKeys.includes(k));
        console.log(`  Missing: ${missing.join(", ")}`);
      }
    } else {
      console.log("Frames field is null or empty, continuing to poll...");
    }

    // Wait before next attempt
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  console.error(`Timeout: Frames were not ready after ${maxAttempts} attempts (${(maxAttempts * intervalMs) / 1000}s total)`);
  console.error("This could indicate:");
  console.error("  1. Frame generation is taking longer than expected");
  console.error("  2. Some frame generation jobs failed");
  console.error("  3. Database update issues");
  return false;
}

/**
 * Poll check-clips-status to monitor video generation progress
 * @param projectId - The project ID to poll
 * @param onProgress - Callback with progress updates
 * @param intervalMs - Milliseconds between polls (default: 15000 = 15 seconds)
 * @returns Cleanup function to stop polling
 */
function startPollingClipStatus(
  projectId: string,
  onProgress: (completed: number, total: number, allDone: boolean) => void,
  intervalMs: number = 15000
): () => void {
  let active = true;

  const poll = async () => {
    if (!active) return;

    try {
      const { data, error } = await supabase.functions.invoke(
        "check-clips-status",
        {
          body: { project_id: projectId },
        }
      );

      if (error) {
        console.error("Error checking clip status:", error);
        return;
      }

      if (data && data.success) {
        const completed = data.completed || 0;
        const total = data.total_clips || 0;
        const pending = data.pending || 0;
        const allDone = pending === 0;

        console.log(`Video generation progress: ${completed}/${total} completed`);
        onProgress(completed, total, allDone);

        // Continue polling if not all done
        if (!allDone && active) {
          setTimeout(poll, intervalMs);
        }
      }
    } catch (error) {
      console.error("Error in polling:", error);
      if (active) {
        setTimeout(poll, intervalMs);
      }
    }
  };

  // Start first poll immediately
  poll();

  // Return cleanup function
  return () => {
    active = false;
  };
}

export const CreateVideoModal = ({ open, onOpenChange }: CreateVideoModalProps) => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [style, setStyle] = useState<string>("Silly");
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();
  const pollingCleanupRef = useRef<(() => void) | null>(null);

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

      // Check response body for success field
      if (!framesData || framesData.success === false) {
        const errorMsg = framesData?.error || "Unknown error during frame generation";
        const failedJobs = framesData?.failed_jobs || [];

        console.error("Frame generation failed:", errorMsg);
        if (failedJobs.length > 0) {
          console.error("Failed jobs:", failedJobs);
        }

        throw new Error(`Frame generation failed: ${errorMsg}`);
      }

      console.log("Frames generated:", framesData);

      // 6.5. Wait for frames to be stored in database
      toast({
        title: "Processing",
        description: "Verifying frames are ready...",
      });

      // Poll the database to ensure frames are fully stored
      const framesReady = await waitForFrames(project.id);

      if (!framesReady) {
        throw new Error(
          "Timeout waiting for frames to be stored in database. " +
          "This may indicate that some frame generation jobs failed or are taking too long. " +
          "Check the console logs for more details."
        );
      }

      console.log("✓ All frames confirmed in database");

      toast({
        title: "Processing",
        description: "Generating video clips from frames...",
      });

      // 7. Call the generate-clips edge function
      const { data: clipsData, error: clipsError } = await supabase.functions.invoke(
        "generate-clips",
        {
          body: {
            project_id: project.id,
          },
        }
      );

      if (clipsError) {
        throw new Error(`Clip generation failed: ${clipsError.message}`);
      }

      console.log("Project created:", project);
      console.log("Clips initiated:", clipsData);

      const totalClips = clipsData?.total_clips || 0;
      const completedImmediately = clipsData?.completed || 0;
      const pending = clipsData?.pending || 0;
      const allComplete = clipsData?.all_complete || false;

      // Stop any existing polling
      if (pollingCleanupRef.current) {
        pollingCleanupRef.current();
      }

      if (allComplete) {
        // All videos completed immediately!
        toast({
          title: "Video Generation Complete!",
          description: `All ${totalClips} clips have been generated successfully.`,
        });
      } else {
        // Some videos are still pending
        toast({
          title: "Video Generation In Progress",
          description: `${completedImmediately} of ${totalClips} clips completed immediately. Generating remaining ${pending} clips...`,
        });

        // Start polling for remaining clips
        pollingCleanupRef.current = startPollingClipStatus(
          project.id,
          (completed, total, allDone) => {
            if (allDone) {
              toast({
                title: "Video Generation Complete!",
                description: `All ${total} clips have been generated successfully.`,
              });

              // Clean up polling
              if (pollingCleanupRef.current) {
                pollingCleanupRef.current();
                pollingCleanupRef.current = null;
              }
            } else {
              toast({
                title: "Generating Videos...",
                description: `${completed} of ${total} clips completed`,
              });
            }
          }
        );
      }

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

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingCleanupRef.current) {
        pollingCleanupRef.current();
      }
    };
  }, []);

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
