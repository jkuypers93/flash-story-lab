# Video Generation Polling Architecture

## Important Discovery

The Runware SDK's `videoInference()` method **DOES automatically poll** internally! 🎉

With the current timeout settings (`timeoutDuration: 120000` = 2 minutes), the SDK waits and polls internally. If the video completes within the timeout, it returns the full response with:
- `status: "success"`
- `videoURL: "https://vm.runware.ai/video/..."`
- `taskUUID` for later reference

If the video takes longer than the timeout, it would return just the `taskUUID` with pending status.

## Problem

Since video generation can take 5-30+ minutes but Supabase Edge Functions have a ~150 second timeout limit, we need a hybrid approach:
1. Let the SDK poll for 2 minutes (captures fast completions)
2. If still pending, have frontend poll for slower generations

## Solution: Frontend Polling

### Architecture Overview

```
User triggers video creation
        ↓
Frontend: CreateVideoModal.tsx
        ↓
Backend: generate-clips (initiates jobs, returns UUIDs)
        ↓
Frontend: Polls check-clips-status every 15 seconds
        ↓
Backend: check-clips-status (checks Runware API status)
        ↓
Frontend: Updates UI with progress
        ↓
Complete: Shows success message when all done
```

### Implementation Details

#### 1. Backend: `generate-clips` Edge Function

**What it does:**
- Initializes Runware SDK with 2-minute timeout
- Calls `runware.videoInference()` for each scene
- SDK polls internally for up to 2 minutes
- If video completes quickly (< 2 min), stores video URL directly
- If video takes longer, stores task UUID as "pending"
- Updates database with URLs or "pending" status
- Returns detailed status to frontend

**Response format:**
```json
{
  "success": true,
  "project_id": "uuid",
  "total_clips": 5,
  "completed": 3,
  "pending": 2,
  "failed": 0,
  "all_complete": false,
  "clips": {
    "task-uuid-1": "https://vm.runware.ai/video1.mp4",
    "task-uuid-2": "https://vm.runware.ai/video2.mp4",
    "task-uuid-3": "https://vm.runware.ai/video3.mp4",
    "task-uuid-4": "pending",
    "task-uuid-5": "pending"
  },
  "results": [...]
}
```

#### 2. Backend: `check-clips-status` Edge Function

**What it does:**
- Takes a `project_id`
- Reads task UUIDs from database
- Calls Runware API's `getTaskStatus` for each task
- Updates database with video URLs when complete
- Returns current status

**Response format:**
```json
{
  "success": true,
  "project_id": "uuid",
  "total_clips": 5,
  "completed": 2,
  "pending": 3,
  "failed": 0,
  "clips": {
    "task-uuid-1": "https://storage.runware.ai/...",
    "task-uuid-2": "pending",
    ...
  }
}
```

#### 3. Frontend: `CreateVideoModal.tsx`

**Polling mechanism:**
- `startPollingClipStatus()` function handles polling
- Polls every 15 seconds (configurable)
- Calls `check-clips-status` edge function
- Updates UI with progress via toast notifications
- Stops automatically when all clips are done
- Cleans up on component unmount

**User experience:**

**Scenario A: All videos complete quickly (< 2 min each)**
1. User creates video, waits ~30 seconds to 2 minutes
2. Modal closes, shows "Video Generation Complete!" toast
3. All clips ready immediately, no polling needed!

**Scenario B: Some videos take longer**
1. User creates video, waits up to 2 minutes
2. Modal closes, shows "3 of 5 clips completed immediately. Generating remaining 2 clips..."
3. Frontend polls every 15 seconds
4. Shows progress: "4 of 5 clips completed"
5. When all done, shows "Video Generation Complete!" toast

**Navigation:**
- User can navigate away - polling continues in background
- If user closes app, polling stops (resume by refreshing projects list)

## Database Schema

The `projects.clips` column structure:

**During generation:**
```json
{
  "task-uuid-1": "pending",
  "task-uuid-2": "pending"
}
```

**After completion:**
```json
{
  "task-uuid-1": "https://storage.runware.ai/video1.mp4",
  "task-uuid-2": "https://storage.runware.ai/video2.mp4"
}
```

**With failures:**
```json
{
  "task-uuid-1": "https://storage.runware.ai/video1.mp4",
  "task-uuid-2": "failed"
}
```

## Benefits of This Architecture

✅ **Fast completions are instant:** Videos that complete in < 2 min return immediately  
✅ **No unnecessary polling:** Only polls if videos actually take longer  
✅ **No timeouts:** Frontend can poll indefinitely for slow generations  
✅ **Secure:** API keys stay on backend  
✅ **Real-time progress:** User sees updates immediately for fast videos, every 15s for slow ones  
✅ **Resilient:** Can recover from network issues  
✅ **Clean separation:** Backend handles API, frontend handles UX  
✅ **Scalable:** Works regardless of video generation duration

## Performance Characteristics

**Google Veo 2.1 model (`google:3@3`):**
- **Short videos (4 seconds, 720p):** Often complete within 30-120 seconds ✅ Caught by SDK polling
- **Longer videos or complex prompts:** May take 5-30+ minutes → Requires frontend polling  

## Future Enhancements

- Add a dedicated "Projects" page showing real-time status for all projects
- Add WebSocket support for instant updates (instead of polling)
- Store video generation progress in database for persistence across sessions
- Add retry logic for failed video generations

