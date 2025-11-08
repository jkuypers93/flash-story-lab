# Generate Frames Edge Function

This Supabase Edge Function generates first and last frame images for each scene using the Runware API (Gemini Flash Image 2.5).

## Setup

1. Set your Runware API key as a secret in Supabase:

```bash
supabase secrets set RUNWARE_API_KEY=your-runware-api-key
```

2. Deploy the function:

```bash
supabase functions deploy generate-frames
```

## Usage

Send a POST request to the function with the following JSON body:

```json
{
  "project_id": "uuid-of-your-project"
}
```

The function will:
1. Fetch the project and extract the `scenes` object
2. For each scene, generate two images (first_frame and last_frame) using the frame descriptions
3. Upload the generated images to the `images` storage bucket
4. Update the project record with the `frames` object containing public URLs

## Response

Success response:

```json
{
  "success": true,
  "project_id": "uuid",
  "frames": {
    "1": {
      "first_frame": "https://your-project.supabase.co/storage/v1/object/public/images/...",
      "last_frame": "https://your-project.supabase.co/storage/v1/object/public/images/..."
    },
    "2": {
      "first_frame": "https://your-project.supabase.co/storage/v1/object/public/images/...",
      "last_frame": "https://your-project.supabase.co/storage/v1/object/public/images/..."
    }
  }
}
```

Error response:

```json
{
  "success": false,
  "error": "Error message"
}
```

## Requirements

- Runware API key with access to Gemini Flash Image 2.5
- Supabase project with `images` storage bucket configured
- `projects` table with `scenes` and `frames` columns
- The `scenes` column should contain a JSON object with scene data including `first_frame` and `last_frame` descriptions

## Scene Format

The function expects the `scenes` column to have the following structure:

```json
{
  "1": {
    "scene_id": 1,
    "first_frame": "Description of the first frame...",
    "last_frame": "Description of the last frame...",
    "setting": "...",
    "dialogue": "...",
    "emotion": "...",
    "duration": "5s",
    "camera_motion": "...",
    "visual_action": "...",
    "continuity": {
      "reuse_last_frame_from_previous": false
    }
  },
  "2": { ... }
}
```

