import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Runware } from "npm:@runware/sdk-js";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FrameData {
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

        const { frames, scenes } = project;

        if (!frames) {
            throw new Error("frames are missing from project");
        }

        if (!scenes) {
            throw new Error("scenes are missing from project");
        }

        console.log("Frames:", frames);

        const runwareApiKey = Deno.env.get("RUNWARE_API_KEY");
        if (!runwareApiKey) {
            throw new Error("RUNWARE_API_KEY environment variable is not set");
        }

        console.log("\n=== Initializing Runware SDK ===");
        let runware;
        try {
            runware = await Runware.initialize({
                apiKey: runwareApiKey,
                timeoutDuration: 120000, // 2 minutes timeout for video operations
            });
            console.log("✓ Runware SDK initialized and connected");
        } catch (initError) {
            console.error("✗ Failed to initialize Runware SDK");
            console.error("  - Error:", initError?.message || String(initError));
            throw initError;
        }

        try {
            // Store clips in the format: { taskUUID: videoURL | "pending" | "failed" }
            const clips: Record<string, string> = {};

            // Initiate video generation for each scene asynchronously
            const videoPromises = Object.entries(frames).map(async ([sceneKey, frameData]) => {
                const sceneFrames = frameData as FrameData;
                const sceneInfo = scenes[sceneKey];

                console.log(`\n→ Initiating video generation for scene ${sceneKey}...`);
                console.log(`   First frame: ${sceneFrames.first_frame}`);
                console.log(`   Last frame: ${sceneFrames.last_frame}`);

                try {
                    const videoResult = await initiateVideoGeneration(
                        runware,
                        sceneFrames.first_frame,
                        sceneFrames.last_frame,
                        sceneInfo
                    );

                    // Check if video is already complete or still pending
                    if (videoResult.videoURL) {
                        clips[videoResult.taskUUID] = videoResult.videoURL;
                        console.log(`  ✓ Scene ${sceneKey} video completed immediately! URL: ${videoResult.videoURL}`);
                    } else {
                        clips[videoResult.taskUUID] = "pending";
                        console.log(`  ✓ Scene ${sceneKey} video initiated with task UUID: ${videoResult.taskUUID}`);
                    }

                    return { sceneKey, taskUUID: videoResult.taskUUID, success: true, videoURL: videoResult.videoURL };
                } catch (error) {
                    console.error(`  ✗ Failed to initiate video for scene ${sceneKey}:`, error);
                    return { sceneKey, error: error.message, success: false };
                }
            });

            // Wait for all video generation jobs to be initiated
            const results = await Promise.all(videoPromises);

            // Count how many completed immediately vs pending
            const completedCount = results.filter(r => r.success && r.videoURL).length;
            const pendingCount = results.filter(r => r.success && !r.videoURL).length;

            // Update project with clips (URLs or "pending" status)
            const { error: updateError } = await supabaseClient
                .from("projects")
                .update({
                    clips: clips,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", project_id);

            if (updateError) {
                throw new Error(`Failed to update project: ${updateError.message}`);
            }

            console.log("\n=== Video generation jobs initiated ===");
            console.log(`  - Jobs completed immediately: ${completedCount}`);
            console.log(`  - Jobs pending: ${pendingCount}`);
            console.log(`  - Jobs failed: ${results.filter(r => !r.success).length}`);

            // Note: Polling is handled by the frontend to avoid edge function timeouts
            // Frontend should call check-clips-status edge function periodically if any pending

            return new Response(
                JSON.stringify({
                    success: true,
                    project_id,
                    total_clips: results.filter(r => r.success).length,
                    completed: completedCount,
                    pending: pendingCount,
                    failed: results.filter(r => !r.success).length,
                    all_complete: pendingCount === 0 && results.filter(r => !r.success).length === 0,
                    clips: clips,
                    results,
                }),
                {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                    status: 200,
                }
            );
        } finally {
            // Always disconnect
            if (runware) {
                try {
                    console.log("\n→ Disconnecting Runware SDK...");
                    await runware.disconnect();
                    console.log("✓ Runware SDK disconnected");
                } catch (disconnectError) {
                    console.warn("⚠ Error while disconnecting Runware SDK:", disconnectError?.message || String(disconnectError));
                }
            }
        }
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

async function initiateVideoGeneration(
    runware: any,
    firstFrameUrl: string,
    lastFrameUrl: string,
    sceneInfo: any
): Promise<{ taskUUID: string; videoURL?: string; status: string }> {
    console.log("   Initiating video generation...");

    const payload = {
        taskType: "videoInference" as const,
        model: "google:3@3", // Google Veo 2.1 model
        duration: 4, //parseInt(sceneInfo?.duration) || 3, // duration in seconds
        fps: 24,
        outputFormat: "mp4" as const,
        height: 720,
        width: 1280,
        numberResults: 1,
        includeCost: true,
        outputQuality: 85,
        providerSettings: {
            google: {
                generateAudio: true,
                enhancePrompt: true,
            },
        },
        frameImages: [
            {
                inputImage: firstFrameUrl,
            },
            {
                inputImage: lastFrameUrl,
            },
        ],
        positivePrompt: sceneInfo?.description || "",
    };

    console.log("   Request payload:", JSON.stringify(payload, null, 2));

    // Note: The SDK may return immediately with just a task UUID OR wait and return the completed video
    // It depends on the video generation duration and SDK timeout settings
    const response = await runware.videoInference(payload);

    console.log("   Raw response:", JSON.stringify(response, null, 2));

    // The response should contain a taskUUID that we can use to poll for status
    if (!response || !Array.isArray(response) || response.length === 0) {
        throw new Error(`Invalid response from Runware SDK: ${JSON.stringify(response)}`);
    }

    const result = response[0];

    // Extract taskUUID from response
    const taskUUID = result.taskUUID || result.id;
    if (!taskUUID) {
        throw new Error(`No taskUUID in response: ${JSON.stringify(result)}`);
    }

    // Check if video is already complete (SDK handled polling internally)
    const videoURL = result.videoURL || result.outputURL;
    const status = result.status || "pending";

    return {
        taskUUID,
        videoURL,
        status,
    };
}

