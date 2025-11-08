import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
            .select("clips")
            .eq("id", project_id)
            .single();

        if (fetchError || !project) {
            throw new Error(`Failed to fetch project: ${fetchError?.message}`);
        }

        const { clips } = project;

        if (!clips || Object.keys(clips).length === 0) {
            throw new Error("No clips found for this project");
        }

        const runwareApiKey = Deno.env.get("RUNWARE_API_KEY");
        if (!runwareApiKey) {
            throw new Error("RUNWARE_API_KEY environment variable is not set");
        }

        console.log("Checking status for clips:", clips);

        // Check status for each job
        const statusChecks = Object.entries(clips).map(async ([jobId, currentValue]) => {
            // Skip if already completed with a URL
            if (typeof currentValue === "string" &&
                (currentValue.startsWith("http") || currentValue === "failed")) {
                return {
                    jobId,
                    status: currentValue.startsWith("http") ? "completed" : "failed",
                    videoUrl: currentValue.startsWith("http") ? currentValue : null,
                    alreadyProcessed: true,
                };
            }

            try {
                const status = await checkJobStatus(runwareApiKey, jobId);
                return {
                    jobId,
                    ...status,
                    alreadyProcessed: false,
                };
            } catch (error) {
                console.error(`Error checking status for job ${jobId}:`, error);
                return {
                    jobId,
                    status: "error",
                    error: error.message,
                    alreadyProcessed: false,
                };
            }
        });

        const results = await Promise.all(statusChecks);

        // Update clips with new video URLs
        const updatedClips: Record<string, string> = {};
        let hasUpdates = false;

        for (const result of results) {
            if (result.status === "completed" && result.videoUrl) {
                updatedClips[result.jobId] = result.videoUrl;
                if (!result.alreadyProcessed) {
                    hasUpdates = true;
                }
            } else if (result.status === "failed") {
                updatedClips[result.jobId] = "failed";
                if (!result.alreadyProcessed) {
                    hasUpdates = true;
                }
            } else {
                updatedClips[result.jobId] = "pending";
            }
        }

        // Update database if there are new completions
        if (hasUpdates) {
            const { error: updateError } = await supabaseClient
                .from("projects")
                .update({
                    clips: updatedClips,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", project_id);

            if (updateError) {
                throw new Error(`Failed to update project: ${updateError.message}`);
            }

            console.log("Updated project with new video URLs");
        }

        // Count statuses
        const completedCount = results.filter(r => r.status === "completed").length;
        const pendingCount = results.filter(r => r.status === "pending").length;
        const failedCount = results.filter(r => r.status === "failed" || r.status === "error").length;

        return new Response(
            JSON.stringify({
                success: true,
                project_id,
                total_clips: results.length,
                completed: completedCount,
                pending: pendingCount,
                failed: failedCount,
                clips: updatedClips,
                details: results,
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

async function checkJobStatus(
    apiKey: string,
    taskUUID: string
): Promise<{ status: string; videoUrl?: string; error?: string }> {
    const response = await fetch("https://api.runware.ai/v1", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify([
            {
                taskType: "getTaskStatus",
                taskUUID: taskUUID,
            },
        ]),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Runware API error: ${errorText}`);
    }

    const result = await response.json();
    console.log(`Status check for ${taskUUID}:`, result);

    if (!result || !result[0]) {
        throw new Error(`Invalid response from Runware API: ${JSON.stringify(result)}`);
    }

    const taskResult = result[0];

    if (taskResult.status === "completed") {
        return {
            status: "completed",
            videoUrl: taskResult.videoURL || taskResult.outputURL,
        };
    } else if (taskResult.status === "failed" || taskResult.status === "error") {
        return {
            status: "failed",
            error: taskResult.error || "Unknown error",
        };
    } else {
        return {
            status: "pending",
        };
    }
}

