import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Runware } from "npm:@runware/sdk-js";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Scene {
    scene_id: number;
    setting: string;
    visual_action: string;
    dialogue: string;
    emotion: string;
    duration_sec: number;
    camera_motion: {
        type: string;
        speed: string;
        start_frame: string;
        end_frame: string;
        lens_mm: number;
        camera_height_m: number;
        camera_heading: string;
        lighting: string;
    };
    continuity: {
        reuse_last_frame_from_previous: boolean;
        world_rules: string;
    };
}

interface FrameUrls {
    first_frame: string;
    last_frame: string;
}

interface FrameJob {
    sceneKey: string;
    frameType: "first" | "last";
    prompt: string;
    taskUUID?: string;
    imageURL?: string;
    status: "pending" | "processing" | "completed" | "failed";
    error?: string;
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { project_id } = await req.json();
        console.log("=== Starting frame generation for project:", project_id);

        if (!project_id) {
            throw new Error("project_id is required");
        }

        // Initialize Supabase client
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );
        console.log("✓ Supabase client initialized");

        // Fetch project data
        console.log("→ Fetching project data...");
        const { data: project, error: fetchError } = await supabaseClient
            .from("projects")
            .select("*")
            .eq("id", project_id)
            .single();

        if (fetchError || !project) {
            console.error("✗ Failed to fetch project:", fetchError?.message);
            throw new Error(`Failed to fetch project: ${fetchError?.message}`);
        }

        console.log("✓ Project fetched successfully");
        console.log("  - Title:", project.title);
        console.log("  - Created:", project.created_at);

        const { scenes, style_parameters } = project;

        if (!scenes) {
            console.error("✗ No scenes found in project");
            throw new Error("scenes are missing from project");
        }

        const sceneCount = Object.keys(scenes).length;
        console.log(`✓ Found ${sceneCount} scenes to process`);
        console.log("  - Style parameters:", JSON.stringify(style_parameters, null, 2));

        // Initialize Runware SDK once
        const runwareApiKey = Deno.env.get("RUNWARE_API_KEY");
        if (!runwareApiKey) {
            throw new Error("RUNWARE_API_KEY environment variable is not set");
        }

        console.log("\n→ Initializing Runware SDK...");
        console.log("  - API key present:", !!runwareApiKey);
        console.log("  - API key length:", runwareApiKey.length);
        console.log("  - Timeout: 60000ms");

        let runware;
        try {
            runware = await Runware.initialize({
                apiKey: runwareApiKey,
                timeoutDuration: 60000,
            });
            console.log("✓ Runware SDK initialized and connected");
            console.log("  - SDK instance type:", typeof runware);
            console.log("  - Has requestImages method:", typeof runware.requestImages === 'function');
        } catch (initError) {
            console.error("✗ Failed to initialize Runware SDK");
            console.error("  - Error type:", initError?.constructor?.name);
            console.error("  - Error message:", initError?.message || String(initError));
            console.error("  - Full error:", initError);
            throw initError;
        }

        try {
            // Create all frame jobs (PROMPT 3 — Gemini Flash Image 2.5)
            const jobs: FrameJob[] = [];
            for (const [sceneKey, scene] of Object.entries(scenes)) {
                const sceneData = scene as Scene;

                // Extract palette from style_parameters
                const palette_pack = style_parameters?.palette_pack || { primary: "natural", secondary: "balanced", contrast: "medium" };

                // Build first_frame_prompt
                const firstFramePrompt = `Vertical 9:16 realistic photo. ${sceneData.setting}. Camera for ${sceneData.camera_motion.type} at ${sceneData.camera_motion.camera_height_m} m, ${sceneData.camera_motion.lens_mm} mm eq, heading ${sceneData.camera_motion.camera_heading}. Capture a single exposure at START of motion. Lighting: ${sceneData.camera_motion.lighting}. Palette: ${palette_pack.primary} / ${palette_pack.secondary} (${palette_pack.contrast} contrast). Natural surfaces; photojournalistic realism; single exposure. Show one continuous moment only. ${sceneData.camera_motion.start_frame}`;

                // Build last_frame_prompt
                const lastFramePrompt = `Vertical 9:16 realistic photo. Same setting and orientation. Camera near END of ${sceneData.camera_motion.type}; preserve side placement of subjects (if any). Subtle change in pose, light, or expression — no freeze. Consistent lighting/palette. Photojournalistic realism; single exposure. Show one continuous moment only. ${sceneData.camera_motion.end_frame}`;

                jobs.push({
                    sceneKey,
                    frameType: "first",
                    prompt: firstFramePrompt,
                    status: "pending",
                });

                jobs.push({
                    sceneKey,
                    frameType: "last",
                    prompt: lastFramePrompt,
                    status: "pending",
                });
            }

            console.log(`\n→ Submitting ${jobs.length} frame generation jobs...`);

            // Submit all jobs at once
            for (const job of jobs) {
                console.log(`  → Submitting ${job.frameType} frame for scene ${job.sceneKey}...`);
                console.log(`      Prompt preview: ${job.prompt.substring(0, 100)}...`);

                try {
                    // PROMPT 3 settings: Gemini Flash Image 2.5 (Nano Banana)
                    // Aspect ratio: 9:16 (≈ 1024×1820)
                    // Steps: 30 Guidance: 7.5
                    const requestParams = {
                        taskType: "imageInference" as const,
                        positivePrompt: job.prompt,
                        model: "google:4@1", // Gemini Flash Image 2.5 via Runware
                        width: 1024,
                        height: 1820, // 9:16 aspect ratio
                        numberResults: 1,
                        outputType: ["URL"] as const,
                        outputFormat: "PNG" as const,
                        includeCost: true,
                        steps: 30,
                        CFGScale: 7.5,
                    };

                    console.log(`      Request params:`, JSON.stringify(requestParams, null, 2));

                    const images = await runware.requestImages(requestParams);

                    console.log("      Raw response:", JSON.stringify(images, null, 2));

                    console.log(`  → Received response for ${job.frameType} frame, scene ${job.sceneKey}`);
                    console.log("      Response type:", typeof images);
                    console.log("      Is array:", Array.isArray(images));
                    console.log("      Length:", images?.length);

                    if (images && images.length > 0) {
                        const firstImage = images[0];
                        console.log("      First image keys:", Object.keys(firstImage));
                        console.log("      First image data:", JSON.stringify(firstImage, null, 2));

                        // Try different possible field names
                        const imageURL = firstImage.imageURL || firstImage.imageUrl || firstImage.url || firstImage.outputURL;

                        if (imageURL) {
                            job.imageURL = imageURL;
                            job.status = "completed";
                            console.log(`  ✓ Job completed for ${job.frameType} frame, scene ${job.sceneKey}`);
                            console.log(`      Image URL: ${job.imageURL}`);
                        } else {
                            job.status = "failed";
                            job.error = "No image URL field found in response";
                            console.error(`  ✗ Job failed for ${job.frameType} frame, scene ${job.sceneKey}`);
                            console.error(`      Reason: Response has no imageURL, imageUrl, url, or outputURL field`);
                            console.error(`      Available fields:`, Object.keys(firstImage));
                        }
                    } else {
                        job.status = "failed";
                        job.error = "Empty or invalid response from Runware SDK";
                        console.error(`  ✗ Job failed for ${job.frameType} frame, scene ${job.sceneKey}`);
                        console.error(`      Reason: Response is empty or not an array`);
                        console.error(`      Response data:`, JSON.stringify(images));
                    }
                } catch (error) {
                    job.status = "failed";

                    // Better error handling
                    const errorMessage = error?.message || error?.toString() || String(error);
                    job.error = errorMessage;

                    console.error(`  ✗ Job failed for ${job.frameType} frame, scene ${job.sceneKey}`);
                    console.error(`      Error type: ${error?.constructor?.name || typeof error}`);
                    console.error(`      Error message: ${errorMessage}`);
                    console.error(`      Full error:`, error);

                    if (error?.stack) {
                        console.error(`      Stack trace:`, error.stack);
                    }
                }
            }

            console.log("\n=== All jobs submitted and completed ===");

            // Download images and upload to Supabase storage
            const frames: Record<string, FrameUrls> = {};
            console.log("\n→ Downloading and uploading frames...");

            for (const job of jobs) {
                if (job.status === "completed" && job.imageURL) {
                    console.log(`\n  → Processing ${job.frameType} frame for scene ${job.sceneKey}...`);

                    try {
                        const frameUrl = await downloadAndUploadFrame(
                            supabaseClient,
                            project_id,
                            job.sceneKey,
                            job.frameType,
                            job.imageURL
                        );

                        // Initialize scene frames if not exists
                        if (!frames[job.sceneKey]) {
                            frames[job.sceneKey] = { first_frame: "", last_frame: "" };
                        }

                        // Update the appropriate frame
                        if (job.frameType === "first") {
                            frames[job.sceneKey].first_frame = frameUrl;
                        } else {
                            frames[job.sceneKey].last_frame = frameUrl;
                        }

                        console.log(`  ✓ Uploaded ${job.frameType} frame for scene ${job.sceneKey}`);

                        // Incrementally update the database
                        await supabaseClient
                            .from("projects")
                            .update({
                                frames: frames,
                                updated_at: new Date().toISOString(),
                            })
                            .eq("id", project_id);

                        console.log(`  ✓ Database updated with latest frames`);
                    } catch (error) {
                        console.error(`  ✗ Failed to process ${job.frameType} frame for scene ${job.sceneKey}:`, error.message);
                    }
                }
            }

            // Check for any failed jobs
            const failedJobs = jobs.filter(j => j.status === "failed");
            const completedJobs = jobs.filter(j => j.status === "completed");

            if (failedJobs.length > 0) {
                console.error(`\n✗ ${failedJobs.length} jobs failed:`);
                failedJobs.forEach(job => {
                    console.error(`  - ${job.frameType} frame for scene ${job.sceneKey}: ${job.error}`);
                });

                // If ANY jobs failed, return error response
                console.error("\n=== FRAME GENERATION FAILED ===");
                console.error(`  - Project ID: ${project_id}`);
                console.error(`  - Total jobs: ${jobs.length}`);
                console.error(`  - Completed: ${completedJobs.length}`);
                console.error(`  - Failed: ${failedJobs.length}`);

                return new Response(
                    JSON.stringify({
                        success: false,
                        error: `Failed to generate ${failedJobs.length} of ${jobs.length} frames`,
                        project_id,
                        stats: {
                            total_jobs: jobs.length,
                            completed: completedJobs.length,
                            failed: failedJobs.length,
                        },
                        failed_jobs: failedJobs.map(j => ({
                            scene: j.sceneKey,
                            frame_type: j.frameType,
                            error: j.error,
                        })),
                    }),
                    {
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                        status: 400,
                    }
                );
            }

            console.log(`\n=== All ${sceneCount} scenes processed ===`);

            const result = { frames, sceneCount };

            console.log("\n=== FRAME GENERATION COMPLETE ===");
            console.log(`  - Project ID: ${project_id}`);
            console.log(`  - Total scenes: ${result.sceneCount}`);
            console.log(`  - Total frames generated: ${result.sceneCount * 2}`);

            return new Response(
                JSON.stringify({
                    success: true,
                    project_id,
                    frames: result.frames,
                    stats: {
                        scenes_processed: result.sceneCount,
                        frames_generated: result.sceneCount * 2,
                    },
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
        console.error("\n=== ERROR OCCURRED ===");
        console.error("Error type:", error.constructor.name);
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);

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

async function downloadAndUploadFrame(
    supabaseClient: any,
    projectId: string,
    sceneKey: string,
    frameType: "first" | "last",
    imageURL: string
): Promise<string> {
    const startTime = Date.now();

    // Download the generated image
    console.log(`    → Downloading image from Runware...`);
    const downloadStartTime = Date.now();
    const imageResponse = await fetch(imageURL);

    if (!imageResponse.ok) {
        throw new Error(`Failed to download image: ${imageResponse.status} ${imageResponse.statusText}`);
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const imageData = new Uint8Array(arrayBuffer);
    const downloadTime = Date.now() - downloadStartTime;

    console.log(`    ✓ Downloaded in ${downloadTime}ms (${(imageData.length / 1024).toFixed(2)} KB)`);

    // Create filename and upload to Supabase storage
    const filename = `${projectId}/scene-${sceneKey}-${frameType}-${Date.now()}.png`;
    console.log(`    → Uploading to Supabase storage...`);
    console.log(`      - Filename: ${filename}`);

    const uploadStartTime = Date.now();
    const { data: uploadData, error: uploadError } = await supabaseClient
        .storage
        .from("images")
        .upload(filename, imageData, {
            contentType: "image/png",
            cacheControl: "3600",
        });

    if (uploadError) {
        throw new Error(`Failed to upload to storage: ${uploadError.message}`);
    }

    const uploadTime = Date.now() - uploadStartTime;
    console.log(`    ✓ Uploaded in ${uploadTime}ms`);

    // Get public URL
    const { data: { publicUrl } } = supabaseClient
        .storage
        .from("images")
        .getPublicUrl(filename);

    const totalTime = Date.now() - startTime;
    console.log(`    ✓ Total processing time: ${totalTime}ms`);
    console.log(`      - Public URL: ${publicUrl}`);

    return publicUrl;
}

