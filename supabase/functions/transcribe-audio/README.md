# Transcribe Audio Edge Function

This Supabase Edge Function transcribes audio files to text using OpenAI's GPT-4o Audio transcription API.

## Setup

1. Set your OpenAI API key as a secret in Supabase:

```bash
supabase secrets set OPENAI_API_KEY=your-openai-api-key
```

2. Deploy the function:

```bash
supabase functions deploy transcribe-audio
```

## Usage

Send a POST request to the function with the following JSON body:

```json
{
  "audioUrl": "https://your-project.supabase.co/storage/v1/object/public/audio/filename.webm",
  "projectId": "uuid-of-your-project"
}
```

The function will:
1. Download the audio file from the `audio` bucket
2. Send it to OpenAI's transcription API (GPT-4o Audio)
3. Save the transcription as a `.txt` file in the `scripts` bucket
4. Update the project record with the `transcription_url` and `script` text

## Response

Success response:

```json
{
  "success": true,
  "transcriptionUrl": "https://your-project.supabase.co/storage/v1/object/public/scripts/transcription-uuid-timestamp.txt",
  "transcriptionText": "The transcribed text...",
  "message": "Audio transcribed successfully"
}
```

Error response:

```json
{
  "error": "Error message"
}
```

## Requirements

- OpenAI API key with access to GPT-4o Audio transcription
- Supabase project with `audio` and `scripts` storage buckets configured
- `projects` table with `transcription_url` and `script` columns

