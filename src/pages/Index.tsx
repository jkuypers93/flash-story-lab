import { useState } from "react";
import { Plus, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateVideoModal } from "@/components/CreateVideoModal";
import { ProjectsList } from "@/components/ProjectsList";

const Index = () => {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Video className="w-6 h-6 text-primary-foreground" />
              </div>
              <h1 className="text-2xl font-semibold text-foreground">Video Creator</h1>
            </div>
            <Button 
              onClick={() => setModalOpen(true)}
              className="bg-primary hover:bg-primary/90"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Video
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto text-center space-y-6 mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-4">
            <Video className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-4xl font-bold text-foreground">
            Create Amazing Videos
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Transform your images and audio into stunning videos with just a few clicks. 
            Choose your style and let creativity flow.
          </p>
          <Button 
            size="lg"
            onClick={() => setModalOpen(true)}
            className="bg-primary hover:bg-primary/90 mt-4"
          >
            <Plus className="w-5 h-5 mr-2" />
            Get Started
          </Button>
        </div>

        <div className="max-w-6xl mx-auto">
          <h3 className="text-2xl font-semibold mb-4">Your Projects</h3>
          <ProjectsList />
        </div>
      </main>

      <CreateVideoModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
};

export default Index;
