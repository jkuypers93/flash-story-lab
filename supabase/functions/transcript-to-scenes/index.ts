import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ScriptScene {
  index: number;
  setting: string;
  visual_action: string;
  dialogue: string;
  emotion: string;
  beats: string[];
}

interface ScriptOutput {
  title: string;
  logline: string;
  scenes: ScriptScene[];
}

interface SceneBreakdown {
  scene_id: number;
  duration: string;
  setting: string;
  visual_action: string;
  dialogue: string;
  emotion: string;
  camera_motion: string;
  continuity: {
    reuse_last_frame_from_previous: boolean;
  };
}

const CAMERA_MOTIONS = {
  silly: ["whip_pan", "dutch_angle_zoom", "chaotic_handheld", "snap_zoom", "spinning_dolly"],
  commercial: ["smooth_dolly", "crane_up", "steadicam_glide", "slow_zoom", "arc_shot"],
  dramatic: ["slow_push_in", "tracking_shot", "pull_back_reveal", "static_close_up", "low_angle_tilt"],
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
      .select("*")
      .eq("id", project_id)
      .single();

    console.log("Project data:", project);

    if (fetchError || !project) {
      throw new Error(`Failed to fetch project: ${fetchError?.message}`);
    }

    const { transcription_url, style_parameters } = project;

    console.log("Style parameters:", style_parameters);
    console.log("Transcription URL:", transcription_url);

    if (!transcription_url) {
      throw new Error("transcription_url is missing from project");
    }

    // Extract bucket and file path from the full public URL
    // URL format: https://{project}.supabase.co/storage/v1/object/public/{bucket}/{file_path}
    const urlParts = transcription_url.split("/public/");
    if (urlParts.length !== 2) {
      throw new Error("Invalid transcription_url format");
    }

    const pathParts = urlParts[1].split("/");
    const bucket = pathParts[0]; // e.g., "scripts"
    const filePath = pathParts.slice(1).join("/"); // e.g., "transcription-xxx.txt"

    // Fetch transcription text from storage
    const { data: transcriptData, error: downloadError } = await supabaseClient
      .storage
      .from(bucket)
      .download(filePath);


    if (downloadError) {
      throw new Error(`Failed to download transcription: ${downloadError.message}`);
    }

    const transcript_text = await transcriptData.text();

    console.log("Transcript text:", transcript_text);

    // Extract style parameters
    const style = style_parameters?.style || "commercial";
    const identity_pack = style_parameters?.identity_pack || {};
    const environment_pack = style_parameters?.environment_pack || {};
    const palette_pack = style_parameters?.palette_pack || {};

    // Generate global seed
    const global_seed = Math.floor(Math.random() * 1000000);

    console.log("Step 1: Generating cinematic script from transcript...");

    // Step 1: Generate cinematic script
    const scriptPrompt = `Role: Film scriptwriter
Task: Turn the transcript into a 30–50s cinematic script with explicit dialogue and stage directions. Keep realism; no humor unless present in the story. Output up to 5 scenes, up to 7s each, 9:16 framing.

Inputs:
- Style: ${style}
- Transcript: ${transcript_text}
- Identity pack: ${JSON.stringify(identity_pack)}
- Environment pack: ${JSON.stringify(environment_pack)}
- Palette pack: ${JSON.stringify(palette_pack)}

Output JSON (respond with ONLY valid JSON, no markdown or explanations):
{
  "title": "...",
  "logline": "...",
  "scenes": [
    {
      "index": 1,
      "setting": "location/time/mood",
      "visual_action": "what we see",
      "dialogue": "spoken line(s)",
      "emotion": "dominant feeling",
      "beats": ["beat-1","beat-2"]
    }
  ]
}

Constraints:
- Natural language, concrete nouns, film verbs.
- Keep names, wardrobe, and lighting consistent with identity/environment packs.
- Prepare for 24 fps, 5 s per scene.
- Output exactly 5 scenes.`;

    const scriptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: "You are a professional film scriptwriter. Respond only with valid JSON.",
          },
          {
            role: "user",
            content: scriptPrompt,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!scriptResponse.ok) {
      const errorText = await scriptResponse.text();
      throw new Error(`OpenAI API error (script generation): ${errorText}`);
    }

    const scriptResult = await scriptResponse.json();
    const scriptOutput: ScriptOutput = JSON.parse(scriptResult.choices[0].message.content);

    console.log("Step 2: Breaking down script into shot plans...");

    // Step 2: Scene breakdown with camera paths
    const cameraPaths = CAMERA_MOTIONS[style as keyof typeof CAMERA_MOTIONS] || CAMERA_MOTIONS.commercial;

    const sceneBreakdownPrompt = `Role: Director
Task: Convert script scenes to shot plans with deterministic camera motion per style. For each scene, describe the first and last frames of the scene in great detail.

Inputs:
- Style: ${style}
- Available Camera Paths: ${JSON.stringify(cameraPaths)}
- Project seed: ${global_seed}
- Identity pack: ${JSON.stringify(identity_pack)}
- Environment pack: ${JSON.stringify(environment_pack)}
- Palette pack: ${JSON.stringify(palette_pack)}
- Base scenes: ${JSON.stringify(scriptOutput.scenes)}

Output JSON (respond with ONLY valid JSON array, no markdown or explanations):
[
  {
    "scene_id": 1,
    "duration": "5s",
    "setting": "...",
    "visual_action": "...",
    "first_frame": "...",
    "last_frame": "...",
    "dialogue": "...",
    "emotion": "...",
    "camera_motion": "one of the available camera paths",
    "continuity": {
      "reuse_last_frame_from_previous": false
    }
  }
]

Rules:
- Every 2nd scene (scene_id 2, 4): set continuity.reuse_last_frame_from_previous = true
- Maintain same actor and wardrobe throughout
- Include vertical composition hints in visual_action
- Use only camera motions from the available camera paths list
- Output exactly 5 scenes matching the input scenes`;

    const breakdownResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: "You are a professional film director. Respond only with valid JSON.",
          },
          {
            role: "user",
            content: sceneBreakdownPrompt,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!breakdownResponse.ok) {
      const errorText = await breakdownResponse.text();
      throw new Error(`OpenAI API error (scene breakdown): ${errorText}`);
    }

    const breakdownResult = await breakdownResponse.json();
    console.log("Breakdown result:", breakdownResult);
    const parsedContent = JSON.parse(breakdownResult.choices[0].message.content);

    // Handle both array format and object with shots property
    let sceneBreakdowns: SceneBreakdown[];
    if (Array.isArray(parsedContent)) {
      sceneBreakdowns = parsedContent;
    } else if (parsedContent.shots && Array.isArray(parsedContent.shots)) {
      sceneBreakdowns = parsedContent.shots;
    } else {
      throw new Error(`Unexpected scene breakdown format: ${JSON.stringify(parsedContent)}`);
    }

    console.log("Scene breakdowns:", sceneBreakdowns);

    console.log("Step 3: Updating database with script and scenes...");

    // Update project with script and scenes
    const { error: updateError } = await supabaseClient
      .from("projects")
      .update({
        script: scriptOutput,
        scenes: sceneBreakdowns.reduce((acc, scene) => {
          acc[scene.scene_id] = scene;
          return acc;
        }, {} as Record<number, SceneBreakdown>),
        updated_at: new Date().toISOString(),
      })
      .eq("id", project_id);

    if (updateError) {
      throw new Error(`Failed to update project: ${updateError.message}`);
    }

    console.log("Successfully generated script and scenes");

    return new Response(
      JSON.stringify({
        success: true,
        project_id,
        script: scriptOutput,
        scenes: sceneBreakdowns,
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
