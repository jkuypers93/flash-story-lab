import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronRight, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Project {
  id: string;
  input_image_url: string | null;
  audio_recording_url: string | null;
  script: string | null;
  video_url: string | null;
  created_at: string;
}

export const ProjectsList = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error("Error fetching projects:", error);
      toast({
        title: "Error",
        description: "Failed to load projects",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteProject = async (id: string) => {
    try {
      const { error } = await supabase.from("projects").delete().eq("id", id);

      if (error) throw error;

      setProjects(projects.filter((p) => p.id !== id));
      toast({
        title: "Success",
        description: "Project deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting project:", error);
      toast({
        title: "Error",
        description: "Failed to delete project",
        variant: "destructive",
      });
    }
  };

  const getStorageUrl = (bucket: string, path: string | null) => {
    if (!path) return null;
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No projects yet. Create your first video to get started!
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12"></TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => (
            <>
              <TableRow key={project.id} className="cursor-pointer">
                <TableCell
                  onClick={() =>
                    setExpandedId(expandedId === project.id ? null : project.id)
                  }
                >
                  {expandedId === project.id ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </TableCell>
                <TableCell
                  onClick={() =>
                    setExpandedId(expandedId === project.id ? null : project.id)
                  }
                >
                  {new Date(project.created_at).toLocaleString()}
                </TableCell>
                <TableCell
                  onClick={() =>
                    setExpandedId(expandedId === project.id ? null : project.id)
                  }
                >
                  {project.video_url ? "Complete" : "Processing"}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteProject(project.id)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
              {expandedId === project.id && (
                <TableRow>
                  <TableCell colSpan={4} className="bg-muted/50">
                    <div className="space-y-4 p-4">
                      {project.input_image_url && (
                        <div>
                          <h4 className="font-medium mb-2">Input Image</h4>
                          <img
                            src={getStorageUrl("images", project.input_image_url) || ""}
                            alt="Input"
                            className="max-w-sm rounded-lg border"
                          />
                        </div>
                      )}

                      {project.audio_recording_url && (
                        <div>
                          <h4 className="font-medium mb-2">Audio Recording</h4>
                          <audio
                            controls
                            src={getStorageUrl("audio", project.audio_recording_url) || ""}
                            className="w-full max-w-sm"
                          />
                        </div>
                      )}

                      {project.script && (
                        <div>
                          <h4 className="font-medium mb-2">Transcription</h4>
                          <div className="max-h-40 overflow-y-auto border rounded-md p-3 bg-background">
                            <p className="text-sm whitespace-pre-wrap">{project.script}</p>
                          </div>
                        </div>
                      )}

                      {project.video_url && (
                        <div>
                          <h4 className="font-medium mb-2">Generated Video</h4>
                          <video
                            controls
                            src={getStorageUrl("video", project.video_url) || ""}
                            className="max-w-2xl rounded-lg border"
                          />
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
