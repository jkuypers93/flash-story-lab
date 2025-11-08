# Check Clips Status Edge Function

This Supabase Edge Function checks the status of video clip generation jobs and updates the database with completed video URLs.

## Overview

This function can be called manually to check on the progress of video generation jobs. It queries the Runware API for each job ID stored in the `clips` column and updates the URLs when videos are ready.

## Use Cases

- **Manual Status Check**: Check the progress of video generation at any time
- **Re-trigger Polling**: If background polling fails, this can be called to update clip URLs
- **Debugging**: Get detailed status information about each video generation job

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
  "total_clips": 5,
  "completed": 3,
  "pending": 2,
  "failed": 0,
  "clips": {
    "job-uuid-1": "https://storage.runware.ai/video1.mp4",
    "job-uuid-2": "https://storage.runware.ai/video2.mp4",
    "job-uuid-3": "https://storage.runware.ai/video3.mp4",
    "job-uuid-4": "pending",
    "job-uuid-5": "pending"
  },
  "details": [
    {
      "jobId": "job-uuid-1",
      "status": "completed",
      "videoUrl": "https://storage.runware.ai/video1.mp4",
      "alreadyProcessed": false
    },
    ...
  ]
}
```

## How It Works

1. **Fetches Current Clips**: Gets the `clips` column from the project
2. **Checks Each Job**: For jobs that are still pending, queries Runware API for status
3. **Updates Database**: If any jobs completed, updates the clips column with video URLs
4. **Returns Summary**: Provides a summary of all jobs and their current status

## Environment Variables

- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key
- `RUNWARE_API_KEY`: Runware API key for authentication

## Usage

```typescript
const { data, error } = await supabase.functions.invoke("check-clips-status", {
  body: {
    project_id: "your-project-uuid",
  },
});

console.log(`${data.completed}/${data.total_clips} clips completed`);
```

## Status Values

- **completed**: Video is ready and URL is stored
- **pending**: Video is still being generated
- **failed**: Video generation failed
- **error**: Error occurred while checking status

## Smart Updates

The function only updates the database if there are new completions, avoiding unnecessary writes. It also skips checking jobs that already have completed URLs.

