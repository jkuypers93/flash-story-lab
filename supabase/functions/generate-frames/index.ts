import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Scene {
    scene_id: number;
    first_frame: string;
    last_frame: string;
    setting: string;
    visual_action: string;
    dialogue: string;
    emotion: string;
    duration: string;
    camera_motion: string;
    continuity: {
        reuse_last_frame_from_previous: boolean;
    };
}

interface FrameUrls {
    first_frame: string;
    last_frame: string;
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { project_id } = await req.json();

        if (!project_id) {
            throw new Error("project_id is required");
        }

        // Initialize Supabase client
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // Fetch project data
        const { data: project, error: fetchError } = await supabaseClient
            .from("projects")
            .select("*")
            .eq("id", project_id)
            .single();

        console.log("Project data:", project);

        if (fetchError || !project) {
            throw new Error(`Failed to fetch project: ${fetchError?.message}`);
        }

        const { scenes, style_parameters } = project;

        if (!scenes) {
            throw new Error("scenes are missing from project");
        }

        console.log("Scenes:", scenes);

        const frames: Record<string, FrameUrls> = {};

        // Iterate through each scene
        for (const [sceneKey, scene] of Object.entries(scenes)) {
            const sceneData = scene as Scene;
            console.log(`Processing scene ${sceneKey}...`);

            const firstFrameUrl = await generateAndUploadFrame(
                supabaseClient,
                project_id,
                sceneKey,
                "first",
                sceneData.first_frame,
                style_parameters
            );

            const lastFrameUrl = await generateAndUploadFrame(
                supabaseClient,
                project_id,
                sceneKey,
                "last",
                sceneData.last_frame,
                style_parameters
            );

            frames[sceneKey] = {
                first_frame: firstFrameUrl,
                last_frame: lastFrameUrl,
            };

            console.log(`Scene ${sceneKey} frames generated:`, frames[sceneKey]);
        }

        // Update project with frames
        const { error: updateError } = await supabaseClient
            .from("projects")
            .update({
                frames: frames,
                updated_at: new Date().toISOString(),
            })
            .eq("id", project_id);

        if (updateError) {
            throw new Error(`Failed to update project: ${updateError.message}`);
        }

        console.log("Successfully generated all frames");

        return new Response(
            JSON.stringify({
                success: true,
                project_id,
                frames,
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            }
        );
    } catch (error) {
        console.error("Error:", error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error.message,
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
            }
        );
    }
});

async function generateAndUploadFrame(
    supabaseClient: any,
    projectId: string,
    sceneKey: string,
    frameType: "first" | "last",
    frameDescription: string,
    styleParameters: any
): Promise<string> {
    console.log(`Generating ${frameType} frame for scene ${sceneKey}...`);

    // Generate image using Runware API
    const imageData = await generateImageWithRunware(frameDescription, styleParameters);

    // Create filename
    const filename = `${projectId}/scene-${sceneKey}-${frameType}-${Date.now()}.png`;

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabaseClient
        .storage
        .from("images")
        .upload(filename, imageData, {
            contentType: "image/png",
            cacheControl: "3600",
        });

    if (uploadError) {
        throw new Error(`Failed to upload ${frameType} frame for scene ${sceneKey}: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabaseClient
        .storage
        .from("images")
        .getPublicUrl(filename);

    console.log(`${frameType} frame uploaded:`, publicUrl);

    return publicUrl;
}

async function generateImageWithRunware(
    prompt: string,
    styleParameters: any
): Promise<Uint8Array> {
    console.log("Generating image with prompt:", prompt);

    const runwareApiKey = Deno.env.get("RUNWARE_API_KEY");
    if (!runwareApiKey) {
        throw new Error("RUNWARE_API_KEY environment variable is not set");
    }

    // Call Runware API to generate image using Gemini Flash Image 2.5
    const response = await fetch("https://api.runware.ai/v1", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${runwareApiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify([
            {
                taskType: "imageInference",
                taskUUID: crypto.randomUUID(),
                model: "gemini-flash-image-2.5",
                positivePrompt: prompt,
                width: 576,  // 9:16 aspect ratio
                height: 1024,
                numberResults: 1,
                outputType: "base64",
                outputFormat: "PNG",
            },
        ]),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Runware API error: ${errorText}`);
    }

    const result = await response.json();
    console.log("Runware API response:", result);

    // Extract base64 image from response
    if (!result || !result[0] || !result[0].imageBase64) {
        throw new Error(`Invalid response from Runware API: ${JSON.stringify(result)}`);
    }

    const base64Image = result[0].imageBase64;

    // Convert base64 to Uint8Array
    const binaryString = atob(base64Image);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes;
}

