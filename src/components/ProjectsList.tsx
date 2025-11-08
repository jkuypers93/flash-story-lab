import { useState, useEffect, useCallback, Fragment } from "react";
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

interface FrameUrls {
  first_frame: string;
  last_frame: string;
}

interface Project {
  id: string;
  input_image_url: string | null;
  audio_recording_url: string | null;
  script: string | null;
  video_url: string | null;
  frames: Record<string, FrameUrls> | null;
  clips: Record<string, string> | null;
  created_at: string;
}

export const ProjectsList = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchProjects = useCallback(async () => {
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
  }, [toast]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

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


  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <ChevronRight className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
        <p className="text-muted-foreground">
          Create your first video to get started!
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-12"></TableHead>
            <TableHead className="font-semibold">Created</TableHead>
            <TableHead className="font-semibold">Status</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => (
            <Fragment key={project.id}>
              <TableRow className="cursor-pointer hover:bg-muted/30 transition-colors">
                <TableCell
                  onClick={() =>
                    setExpandedId(expandedId === project.id ? null : project.id)
                  }
                >
                  {expandedId === project.id ? (
                    <ChevronDown className="w-4 h-4 text-primary" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                </TableCell>
                <TableCell
                  onClick={() =>
                    setExpandedId(expandedId === project.id ? null : project.id)
                  }
                  className="font-medium"
                >
                  {new Date(project.created_at).toLocaleString()}
                </TableCell>
                <TableCell
                  onClick={() =>
                    setExpandedId(expandedId === project.id ? null : project.id)
                  }
                >
                  {project.video_url ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      Complete
                    </span>
                  ) : project.clips && Object.keys(project.clips).length > 0 ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                      Clips Ready
                    </span>
                  ) : project.frames && Object.keys(project.frames).length > 0 ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      Frames Ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Processing
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteProject(project.id)}
                    className="hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
              {expandedId === project.id && (
                <TableRow key={`${project.id}-details`}>
                  <TableCell colSpan={4} className="bg-muted/30">
                    <div className="space-y-6 p-6">
                      {project.input_image_url && (
                        <div>
                          <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">Input Image</h4>
                          <img
                            src={project.input_image_url}
                            alt="Input"
                            className="max-w-sm rounded-lg border shadow-sm hover:shadow-md transition-shadow"
                          />
                        </div>
                      )}

                      {project.audio_recording_url && (
                        <div>
                          <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">Audio Recording</h4>
                          <audio
                            controls
                            src={project.audio_recording_url}
                            className="w-full max-w-sm rounded-lg"
                          />
                        </div>
                      )}

                      {project.script && (
                        <div>
                          <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">Transcription</h4>
                          <div className="max-h-40 overflow-y-auto border rounded-lg p-4 bg-background shadow-sm">
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{project.script}</p>
                          </div>
                        </div>
                      )}

                      {project.frames && Object.keys(project.frames).length > 0 && (
                        <div>
                          <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">Generated Frames</h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {Object.entries(project.frames)
                              .sort(([a], [b]) => parseInt(a) - parseInt(b))
                              .map(([sceneId, urls]) => (
                                <div key={sceneId} className="space-y-3">
                                  <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                                    Scene {sceneId}
                                  </p>
                                  <div className="space-y-3">
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground mb-1.5">First Frame</p>
                                      <img
                                        src={urls.first_frame}
                                        alt={`Scene ${sceneId} first frame`}
                                        className="w-full aspect-[9/16] object-cover rounded-lg border shadow-sm hover:shadow-md transition-shadow"
                                      />
                                    </div>
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Last Frame</p>
                                      <img
                                        src={urls.last_frame}
                                        alt={`Scene ${sceneId} last frame`}
                                        className="w-full aspect-[9/16] object-cover rounded-lg border shadow-sm hover:shadow-md transition-shadow"
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      {project.clips && Object.keys(project.clips).length > 0 && (
                        <div>
                          <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">Generated Clips</h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {Object.entries(project.clips)
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([clipId, videoUrl], index) => (
                                <div key={clipId} className="space-y-3">
                                  <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                                    Clip {index + 1}
                                  </p>
                                  <video
                                    controls
                                    src={videoUrl}
                                    className="w-full aspect-[9/16] object-cover rounded-lg border shadow-sm hover:shadow-md transition-shadow"
                                  />
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      {project.video_url && (
                        <div>
                          <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">Generated Video</h4>
                          <video
                            controls
                            src={project.video_url}
                            className="max-w-2xl rounded-lg border shadow-md"
                          />
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
