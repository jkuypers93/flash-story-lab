# Generate Clips Edge Function

This Supabase Edge Function generates video clips from frame pairs using the Runware SDK (Google Veo 2.1 model).

## Overview

The function takes a project ID, reads the frame data from the database, and initiates video generation for each scene using the Runware SDK. It uses the first and last frames in the `frameImages` format to create smooth video transitions between keyframes.

## Request Format

```json
{
  "project_id": "uuid-string"
}
```

## Response Format

```json
{
  "success": true,
  "project_id": "uuid-string",
  "jobs_initiated": 5,
  "jobs_failed": 0,
  "results": [
    {
      "sceneKey": "1",
      "taskUUID": "uuid-string",
      "success": true
    }
  ]
}
```

## How It Works

1. **Initializes Runware SDK**: Connects to the Runware service using the SDK
2. **Fetches Project Data**: Retrieves the project with its frames from the database
3. **Initiates Video Generation**: For each scene, calls `runware.videoInference()` to start video generation
   - Uses Google Veo 2.1 model (`google:3@3`)
   - Takes first and last frame URLs via `frameImages` array
   - 720p resolution (1280x720)
   - Duration based on scene info (default 8 seconds)
   - 24 FPS with audio generation enabled
4. **Stores Task UUIDs**: Saves the Runware task UUIDs in the `clips` column temporarily
5. **Background Polling**: Continuously polls Runware API to check task status
6. **Updates URLs**: When videos are ready, updates the `clips` column with video URLs
7. **Disconnects SDK**: Properly disconnects the Runware SDK connection

## Clips Column Structure

During processing:
```json
{
  "task-uuid-1": "pending",
  "task-uuid-2": "pending"
}
```

After completion:
```json
{
  "task-uuid-1": "https://storage.runware.ai/...",
  "task-uuid-2": "https://storage.runware.ai/..."
}
```

## Video Generation Parameters

The function uses the following parameters for video generation:

```typescript
{
  taskType: "videoInference",
  model: "google:3@3",           // Google Veo 2.1
  duration: 8,                    // seconds (configurable per scene)
  fps: 24,
  outputFormat: "mp4",
  height: 720,
  width: 1280,
  numberResults: 1,
  includeCost: true,
  outputQuality: 85,
  providerSettings: {
    google: {
      generateAudio: true,       // Enable audio generation
      enhancePrompt: true         // AI prompt enhancement
    }
  },
  frameImages: [
    { inputImage: "first_frame_url" },
    { inputImage: "last_frame_url" }
  ],
  positivePrompt: "scene_description"
}
```

## Environment Variables

- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key
- `RUNWARE_API_KEY`: Runware API key for authentication

## Polling Behavior

- **Polling Interval**: 10 seconds between checks
- **Max Polling Time**: 30 minutes
- **Background Operation**: Polling runs asynchronously after the initial response

## Usage

Call this function after the `generate-frames` function has completed and populated the `frames` column in the projects table.

```typescript
const { data, error } = await supabase.functions.invoke("generate-clips", {
  body: {
    project_id: "your-project-uuid",
  },
});
```

## Error Handling

The function handles errors gracefully:
- Individual video generation failures don't stop other videos
- Failed jobs are marked with status "failed" in the clips column
- Polling errors are logged but don't crash the entire process

