import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

interface TranscribeRequest {
    audioUrl: string;
    projectId: string;
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { audioUrl, projectId }: TranscribeRequest = await req.json();

        if (!audioUrl || !projectId) {
            return new Response(
                JSON.stringify({ error: "audioUrl and projectId are required" }),
                {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

        if (!openaiApiKey) {
            throw new Error("OPENAI_API_KEY is not configured");
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Extract the file path from the audio URL
        const audioPath = audioUrl.split("/audio/")[1];
        if (!audioPath) {
            throw new Error("Invalid audio URL format");
        }

        console.log(`Downloading audio file from: ${audioPath}`);

        // Download the audio file from Supabase storage
        const { data: audioData, error: downloadError } = await supabase.storage
            .from("audio")
            .download(audioPath);

        if (downloadError || !audioData) {
            throw new Error(`Failed to download audio: ${downloadError?.message}`);
        }

        console.log("Audio file downloaded, preparing for transcription");

        // Convert blob to form data for OpenAI
        const formData = new FormData();
        formData.append("file", audioData, "audio.webm");
        formData.append("model", "whisper-1");
        formData.append("response_format", "text");

        console.log("Calling OpenAI Whisper API for transcription");

        // Call OpenAI Whisper API
        const transcriptionResponse = await fetch(
            "https://api.openai.com/v1/audio/transcriptions",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${openaiApiKey}`,
                },
                body: formData,
            }
        );

        if (!transcriptionResponse.ok) {
            const errorText = await transcriptionResponse.text();
            throw new Error(
                `OpenAI API error: ${transcriptionResponse.status} - ${errorText}`
            );
        }

        const transcriptionText = await transcriptionResponse.text();
        console.log("Transcription completed successfully");

        // Create a text file from the transcription
        const timestamp = new Date().getTime();
        const textFileName = `transcription-${projectId}-${timestamp}.txt`;
        const textBlob = new Blob([transcriptionText], { type: "text/plain" });

        // Upload the text file to the scripts bucket
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from("scripts")
            .upload(textFileName, textBlob, {
                contentType: "text/plain",
                upsert: false,
            });

        if (uploadError) {
            throw new Error(`Failed to upload transcription: ${uploadError.message}`);
        }

        console.log(`Transcription saved to: ${textFileName}`);

        // Get the public URL for the uploaded file
        const { data: urlData } = supabase.storage
            .from("scripts")
            .getPublicUrl(textFileName);

        const transcriptionUrl = urlData.publicUrl;

        // Update the project with the transcription URL
        const { error: updateError } = await supabase
            .from("projects")
            .update({
                transcription_url: transcriptionUrl,
            })
            .eq("id", projectId);

        if (updateError) {
            throw new Error(`Failed to update project: ${updateError.message}`);
        }

        console.log("Project updated with transcription URL");

        return new Response(
            JSON.stringify({
                success: true,
                transcriptionUrl,
                transcriptionText,
                message: "Audio transcribed successfully",
            }),
            {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    } catch (error) {
        console.error("Error in transcribe-audio function:", error);

        return new Response(
            JSON.stringify({
                error: error.message || "An error occurred during transcription",
            }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    }
});

