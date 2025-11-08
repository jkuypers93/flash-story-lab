# Video Generation Workflow

This document describes the complete pipeline for generating videos from audio and images in Flash Story Lab.

## Overview

The system transforms user input (image + audio) into a complete video project with generated clips using AI services (OpenAI for transcription/scenes and Runware for image/video generation).

## Pipeline Steps

### 1. User Input
**Component**: `CreateVideoModal.tsx`

User provides:
- An image (protagonist/subject)
- Audio recording (up to 40 seconds)
- Style selection (e.g., "Silly", "Dramatic", etc.)

### 2. Upload Assets
The modal uploads both files to Supabase Storage:
- Image → `images` bucket
- Audio → `audio` bucket

Creates a project record with URLs and style parameters.

### 3. Transcription
**Edge Function**: `transcribe-audio`

- Downloads audio from Supabase Storage
- Calls OpenAI Whisper API to transcribe
- Stores transcript in project's `transcript` column

### 4. Scene Generation
**Edge Function**: `transcript-to-scenes`

- Takes the transcript
- Uses OpenAI GPT to generate:
  - Refined script
  - Scene breakdown with detailed descriptions
- Each scene includes:
  - `first_frame`: Description for opening frame
  - `last_frame`: Description for closing frame
  - `visual_action`: What happens in the scene
  - `dialogue`: Narration text
  - `emotion`: Emotional tone
  - `duration`: Scene length in seconds
  - `camera_motion`: Camera movement
  - `setting`: Location description

Stores scenes in project's `scenes` column:
```json
{
  "1": { "scene_id": 1, "first_frame": "...", ... },
  "2": { "scene_id": 2, "first_frame": "...", ... },
  ...
}
```

### 5. Frame Generation
**Edge Function**: `generate-frames`

For each scene:
- Calls Runware API (Gemini Flash Image 2.5)
- Generates two images per scene:
  - First frame (opening shot)
  - Last frame (closing shot)
- Uploads images to Supabase Storage
- Uses 9:16 aspect ratio (576×1024)

Stores frame URLs in project's `frames` column:
```json
{
  "1": {
    "first_frame": "https://storage.supabase.co/...",
    "last_frame": "https://storage.supabase.co/..."
  },
  "2": {
    "first_frame": "https://storage.supabase.co/...",
    "last_frame": "https://storage.supabase.co/..."
  },
  ...
}
```

### 6. Video Clip Generation
**Edge Function**: `generate-clips` ⭐ NEW

For each scene:
- Reads `first_frame` and `last_frame` URLs from the `frames` column
- Calls Runware API (VEO 3.1 model) to generate video
- Uses first and last frames to create smooth transitions
- Initiates jobs asynchronously for all scenes
- Stores job IDs in project's `clips` column

Initial `clips` structure:
```json
{
  "job-uuid-1": "pending",
  "job-uuid-2": "pending",
  ...
}
```

**Background Polling**:
- Function continues polling in background
- Checks job status every 10 seconds
- Updates `clips` when videos are ready
- Max polling time: 30 minutes

Final `clips` structure:
```json
{
  "job-uuid-1": "https://storage.runware.ai/video1.mp4",
  "job-uuid-2": "https://storage.runware.ai/video2.mp4",
  ...
}
```

### 7. Manual Status Check (Optional)
**Edge Function**: `check-clips-status` ⭐ NEW

Can be called anytime to:
- Check progress of video generation
- Re-trigger updates if background polling failed
- Get detailed status of each clip

Returns summary:
```json
{
  "total_clips": 5,
  "completed": 3,
  "pending": 2,
  "failed": 0,
  "clips": { ... }
}
```

## Complete Data Flow

```
User Input (Image + Audio)
    ↓
[Upload to Storage]
    ↓
Project Record Created
    ↓
[transcribe-audio]
    ↓
project.transcript ← "..." 
    ↓
[transcript-to-scenes]
    ↓
project.scenes ← { "1": {...}, "2": {...}, ... }
    ↓
[generate-frames]
    ↓
project.frames ← { "1": {first_frame, last_frame}, ... }
    ↓
[generate-clips] ⭐ NEW
    ↓
project.clips ← { "job-1": "pending", ... }
    ↓
[Background Polling]
    ↓
project.clips ← { "job-1": "https://...", ... }
```

## Database Schema

### Projects Table
```typescript
{
  id: uuid,
  input_image_url: string,
  audio_recording_url: string,
  transcript: string,
  style_parameters: {
    style: string,
    identity_pack: object,
    environment_pack: object,
    palette_pack: object
  },
  scenes: {
    "1": Scene,
    "2": Scene,
    ...
  },
  frames: {
    "1": {first_frame: url, last_frame: url},
    "2": {first_frame: url, last_frame: url},
    ...
  },
  clips: {
    "job-id-1": url | "pending" | "failed",
    "job-id-2": url | "pending" | "failed",
    ...
  },
  created_at: timestamp,
  updated_at: timestamp
}
```

## API Configuration

### Runware Video API Parameters (VEO 3.1)
```typescript
{
  taskType: "videoInference",
  taskUUID: "unique-id",
  model: "veo-3.1",
  firstImageURL: "https://...",
  lastImageURL: "https://...",
  duration: 5, // seconds
  aspectRatio: "9:16",
  outputFormat: "MP4"
}
```

### Polling Configuration
- **Interval**: 10 seconds between status checks
- **Timeout**: 30 minutes maximum
- **Async**: Runs in background after initial response

## Environment Variables Required

```env
# Supabase
SUPABASE_URL=your-project-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# APIs
OPENAI_API_KEY=your-openai-key
RUNWARE_API_KEY=your-runware-key
```

## Error Handling

Each step includes comprehensive error handling:
- Individual failures don't crash the entire pipeline
- Failed video generations are marked as "failed" in clips
- Toast notifications keep user informed of progress
- Detailed logging for debugging

## Future Enhancements

Potential improvements:
- [ ] Video stitching to combine clips into final video
- [ ] Audio synchronization with video clips
- [ ] Progress tracking UI component
- [ ] Webhook for video completion notifications
- [ ] Retry mechanism for failed video generations
- [ ] Preview functionality for individual clips

