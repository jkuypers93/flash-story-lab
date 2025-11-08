# Fix: Generate-Clips Not Being Triggered

## Problem Summary

Sometimes `generate-clips` wasn't being triggered even though `generate-frames` appeared successful. This was caused by several issues in the error handling and validation flow.

## Root Causes Identified

### 1. **Silent Partial Failures in generate-frames**
- The `generate-frames` function would return `success: true` even when some frame generation jobs failed
- Only logged warnings instead of returning error status
- Frontend would proceed to `waitForFrames` which would timeout waiting for frames that never arrived

### 2. **Inadequate Response Validation in Frontend**
- Only checked for network/HTTP errors (`framesError`)
- Did not validate the `success` field in the response body
- Silent failures in frame generation would pass through undetected

### 3. **Insufficient Timeout for Frame Polling**
- Default timeout was 60 seconds (30 attempts × 2s)
- Not enough time for projects with many scenes or slow Runware API
- Led to premature timeouts and failure to trigger `generate-clips`

### 4. **Poor Error Diagnostics**
- Minimal logging during polling made debugging difficult
- No details about which frames were missing or incomplete
- Generic timeout messages didn't help identify root cause

## Fixes Applied

### Fix 1: Strict Error Handling in generate-frames ✅

**File:** `supabase/functions/generate-frames/index.ts`

- Now returns HTTP 400 with `success: false` when ANY frame generation job fails
- Provides detailed error information including:
  - Total jobs vs completed vs failed counts
  - List of failed jobs with scene IDs and error messages
- No longer allows partial failures to be treated as success

```typescript
if (failedJobs.length > 0) {
  return new Response(
    JSON.stringify({
      success: false,
      error: `Failed to generate ${failedJobs.length} of ${jobs.length} frames`,
      // ... detailed stats and failed job info
    }),
    { status: 400 }
  );
}
```

### Fix 2: Response Body Validation in Frontend ✅

**File:** `src/components/CreateVideoModal.tsx`

- Added validation of the `success` field in response body
- Extracts and logs detailed error information from failed jobs
- Prevents proceeding to `waitForFrames` when frame generation fails

```typescript
if (!framesData || framesData.success === false) {
  const errorMsg = framesData?.error || "Unknown error during frame generation";
  const failedJobs = framesData?.failed_jobs || [];
  
  console.error("Frame generation failed:", errorMsg);
  if (failedJobs.length > 0) {
    console.error("Failed jobs:", failedJobs);
  }
  
  throw new Error(`Frame generation failed: ${errorMsg}`);
}
```

### Fix 3: Extended Timeout and Better Error Messages ✅

**File:** `src/components/CreateVideoModal.tsx`

- Increased timeout from 60s to 180s (60 attempts × 3s)
- More time for large projects and slow API responses
- Improved timeout error messages with diagnostic suggestions:
  1. Frame generation taking longer than expected
  2. Some frame generation jobs may have failed
  3. Potential database update issues

```typescript
async function waitForFrames(
  projectId: string,
  maxAttempts: number = 60,  // was 30
  intervalMs: number = 3000   // was 2000
): Promise<boolean>
```

### Fix 4: Enhanced Polling Diagnostics ✅

**File:** `src/components/CreateVideoModal.tsx`

- Detailed logging of incomplete frames during polling
- Shows which specific scenes are missing frames
- For long-running polls (>10 attempts), logs frame data for debugging
- Distinguishes between:
  - No frames at all
  - Partial frames (some scenes missing)
  - Incomplete frames (missing first_frame or last_frame)

```typescript
console.log(`Some frames are incomplete (${incompleteFrames.length}): ${incompleteFrames.join(", ")}`);

// After 10 attempts, show detailed frame data
if (attempt > 10) {
  incompleteFrames.forEach((key) => {
    const frameData = project.frames[key];
    console.log(`  Scene ${key}:`, {
      hasFirstFrame: !!(frameData?.first_frame),
      hasLastFrame: !!(frameData?.last_frame),
    });
  });
}
```

## Expected Behavior After Fixes

### Success Path:
1. ✅ `generate-frames` completes all frame jobs successfully
2. ✅ Returns `success: true` with frame data
3. ✅ Frontend validates response and proceeds
4. ✅ `waitForFrames` polls with 3-minute timeout
5. ✅ All frames confirmed in database
6. ✅ `generate-clips` is triggered

### Failure Path (Now Properly Handled):
1. ❌ Some frame generation jobs fail in `generate-frames`
2. ❌ Returns `success: false` with detailed error info (HTTP 400)
3. ❌ Frontend catches the failure immediately
4. ❌ Shows user-friendly error message with details
5. ❌ Process stops, does NOT proceed to `generate-clips`
6. ✅ User sees clear error message and can retry

### Timeout Path (Improved Diagnostics):
1. ✅ `generate-frames` returns success
2. ✅ Frontend starts polling for frames
3. ⏱️ Frames take longer than 3 minutes (rare)
4. ❌ Timeout with detailed diagnostic messages in console
5. ❌ User sees error explaining possible causes
6. ❌ Developer can debug using detailed console logs

## Testing Recommendations

1. **Normal Flow Test**: Create video with 3-5 scenes, verify all steps complete
2. **Large Project Test**: Create video with 10+ scenes, verify extended timeout works
3. **Simulated Failure Test**: (If possible) Force a frame generation failure, verify proper error handling
4. **Network Slow Test**: Test with throttled network to verify polling behavior

## Benefits

- ✅ **No more silent failures** - All frame generation failures are caught and reported
- ✅ **Better user experience** - Clear error messages instead of generic timeouts
- ✅ **Easier debugging** - Detailed console logs show exactly what's failing
- ✅ **More reliable** - Extended timeout handles slow API responses
- ✅ **Prevents wasted API calls** - Doesn't call `generate-clips` when frames aren't ready

## Files Modified

1. `supabase/functions/generate-frames/index.ts` - Strict error handling
2. `src/components/CreateVideoModal.tsx` - Response validation, extended timeout, better diagnostics

