-- Create projects table
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_image_url TEXT,
  audio_recording_url TEXT,
  models_used JSONB,
  script TEXT,
  scenes JSONB,
  frames JSONB,
  video_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS but make it public
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Create public access policies for projects table
CREATE POLICY "Public read access" ON public.projects FOR SELECT USING (true);
CREATE POLICY "Public insert access" ON public.projects FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update access" ON public.projects FOR UPDATE USING (true);
CREATE POLICY "Public delete access" ON public.projects FOR DELETE USING (true);

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('images', 'images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('audio', 'audio', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('scripts', 'scripts', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('video', 'video', true);

-- Create public storage policies for images bucket
CREATE POLICY "Public read access for images" ON storage.objects FOR SELECT USING (bucket_id = 'images');
CREATE POLICY "Public insert access for images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'images');
CREATE POLICY "Public update access for images" ON storage.objects FOR UPDATE USING (bucket_id = 'images');
CREATE POLICY "Public delete access for images" ON storage.objects FOR DELETE USING (bucket_id = 'images');

-- Create public storage policies for audio bucket
CREATE POLICY "Public read access for audio" ON storage.objects FOR SELECT USING (bucket_id = 'audio');
CREATE POLICY "Public insert access for audio" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'audio');
CREATE POLICY "Public update access for audio" ON storage.objects FOR UPDATE USING (bucket_id = 'audio');
CREATE POLICY "Public delete access for audio" ON storage.objects FOR DELETE USING (bucket_id = 'audio');

-- Create public storage policies for scripts bucket
CREATE POLICY "Public read access for scripts" ON storage.objects FOR SELECT USING (bucket_id = 'scripts');
CREATE POLICY "Public insert access for scripts" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'scripts');
CREATE POLICY "Public update access for scripts" ON storage.objects FOR UPDATE USING (bucket_id = 'scripts');
CREATE POLICY "Public delete access for scripts" ON storage.objects FOR DELETE USING (bucket_id = 'scripts');

-- Create public storage policies for video bucket
CREATE POLICY "Public read access for video" ON storage.objects FOR SELECT USING (bucket_id = 'video');
CREATE POLICY "Public insert access for video" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'video');
CREATE POLICY "Public update access for video" ON storage.objects FOR UPDATE USING (bucket_id = 'video');
CREATE POLICY "Public delete access for video" ON storage.objects FOR DELETE USING (bucket_id = 'video');