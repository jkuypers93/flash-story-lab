# Testing Guide for Video Clip Generation

## Prerequisites

1. Ensure you have a project with completed frames in the database
2. Set up environment variables in Supabase dashboard
3. Deploy the edge functions

## Deploy Edge Functions

```bash
# Deploy generate-clips function
supabase functions deploy generate-clips

# Deploy check-clips-status function  
supabase functions deploy check-clips-status
```

## Set Environment Variables

In your Supabase dashboard, set these secrets:
```bash
supabase secrets set RUNWARE_API_KEY=your_runware_api_key_here
```

## Test with curl

### 1. Test generate-clips

```bash
curl -i --location --request POST 'https://your-project.supabase.co/functions/v1/generate-clips' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"project_id": "your-project-uuid"}'
```

Expected response:
```json
{
  "success": true,
  "project_id": "uuid",
  "jobs_initiated": 5,
  "jobs_failed": 0,
  "results": [...]
}
```

### 2. Check clip status

Wait a few seconds, then check status:

```bash
curl -i --location --request POST 'https://your-project.supabase.co/functions/v1/check-clips-status' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"project_id": "your-project-uuid"}'
```

Expected response:
```json
{
  "success": true,
  "project_id": "uuid",
  "total_clips": 5,
  "completed": 2,
  "pending": 3,
  "failed": 0,
  "clips": {...}
}
```

## Test from Frontend

```typescript
// In your React component
const handleGenerateClips = async (projectId: string) => {
  // Generate clips
  const { data, error } = await supabase.functions.invoke("generate-clips", {
    body: { project_id: projectId },
  });

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log(`${data.jobs_initiated} clips initiated`);

  // Check status periodically
  const checkInterval = setInterval(async () => {
    const { data: status } = await supabase.functions.invoke("check-clips-status", {
      body: { project_id: projectId },
    });

    console.log(`Progress: ${status.completed}/${status.total_clips}`);

    if (status.completed === status.total_clips) {
      clearInterval(checkInterval);
      console.log("All clips ready!", status.clips);
    }
  }, 10000); // Check every 10 seconds
};
```

## Verify in Database

Query your project to see the clips:

```sql
SELECT id, clips FROM projects WHERE id = 'your-project-uuid';
```

## Important Notes

### Runware API Format

⚠️ **IMPORTANT**: The VEO 3.1 API format used in this implementation is based on common video API patterns. You may need to adjust the API call in `generate-clips/index.ts` based on actual Runware documentation.

Specifically, verify these parameters:
- `model`: "veo-3.1" (check correct model identifier)
- `firstImageURL` / `lastImageURL` (check correct parameter names)
- `aspectRatio`: "9:16" (check format: string vs dimensions)
- `duration`: number (check if in seconds vs milliseconds)
- Response format for job IDs and video URLs

### Check Runware Documentation

Before running in production, consult Runware's official documentation for:
1. Correct VEO 3.1 model identifier
2. Supported parameters and formats
3. Job status checking endpoint
4. Rate limits and quotas
5. Video output URL format

### Adjust if Needed

If the API format is different, update these functions:
- `initiateVideoGeneration()` in `generate-clips/index.ts`
- `checkJobStatus()` in both `generate-clips/index.ts` and `check-clips-status/index.ts`

## Monitoring

### Check Logs

```bash
# View logs for generate-clips
supabase functions logs generate-clips

# View logs for check-clips-status
supabase functions logs check-clips-status
```

### Common Issues

1. **"RUNWARE_API_KEY not set"**
   - Set the secret in Supabase dashboard
   - Redeploy the function

2. **"frames are missing from project"**
   - Ensure `generate-frames` completed successfully
   - Check project.frames in database

3. **Videos stuck in "pending"**
   - Check Runware API status page
   - Call `check-clips-status` manually
   - Review function logs for errors

4. **API format errors**
   - Review Runware documentation
   - Update API call format in code
   - Test with Runware's API playground first

## Performance

- Video generation typically takes 2-10 minutes per clip
- Multiple clips are processed in parallel by Runware
- Background polling runs for max 30 minutes
- Can handle up to 10 scenes/clips per project comfortably

## Cost Estimation

Runware VEO 3.1 pricing (check current rates):
- Estimated: $0.10-0.50 per video clip
- 5 scenes = ~$0.50-2.50 per project
- Plus storage costs for MP4 files

Always verify current Runware pricing before deploying to production.

