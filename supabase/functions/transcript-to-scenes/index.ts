import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper function to extract JSON from response text
function extractJSON(text: string): any {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract from markdown code blocks
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1]);
      } catch {
        // Continue to next attempt
      }
    }

    // Try to find JSON object or array in text
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        // Continue to next attempt
      }
    }

    // If all else fails, throw original error
    throw new Error(`Failed to parse JSON from text: ${text.substring(0, 200)}...`);
  }
}

// Retry helper with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      console.log(`Attempt ${attempt + 1} failed:`, error.message);

      if (attempt < maxRetries - 1) {
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        console.log(`Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

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
  duration_sec: number;
  setting: string;
  visual_action: string;
  first_frame?: string;
  last_frame?: string;
  dialogue: string;
  emotion: string;
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

const STYLE_DEFINITIONS = {
  cinematic: {
    description: "High-realism storytelling with emotional depth, soft contrast, shallow DOF, fluid motion.",
    camera_paths: [
      { type: "dolly-in", speed: "slow" },
      { type: "slider L→R", speed: "medium" },
      { type: "handheld drift", speed: "subtle" },
      { type: "crane rise", speed: "slow" }
    ],
    lighting_hint: "directional key with soft diffusion; cinematic falloff",
    palette_hint: "filmic contrast, mild teal-orange separation"
  },
  commercial: {
    description: "Glossy, high-clarity, product-focused imagery with crisp transitions.",
    camera_paths: [
      { type: "slider R→L", speed: "medium" },
      { type: "static macro", speed: "none" },
      { type: "crane drop", speed: "slow" }
    ],
    lighting_hint: "high-key reflective lighting, minimal shadows",
    palette_hint: "neutral white balance, vivid saturation"
  },
  comedy: {
    description: "Bright, timing-driven framing; clear spatial cues; reaction emphasis.",
    camera_paths: [
      { type: "zoom-in", speed: "fast" },
      { type: "handheld micro-pan", speed: "medium" },
      { type: "static wide", speed: "none" }
    ],
    lighting_hint: "warm daylight interiors, expressive contrast",
    palette_hint: "vibrant but realistic colors"
  },
  normal: {
    description: "Neutral documentary realism; unobtrusive, steady observation.",
    camera_paths: [
      { type: "tripod static", speed: "none" },
      { type: "slow pan", speed: "slow" },
      { type: "handheld steady", speed: "medium" }
    ],
    lighting_hint: "ambient environmental light",
    palette_hint: "balanced natural color"
  }
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

    // Step 1: Generate cinematic script (PROMPT 1 — Story Bible / Script Generator)
    const scriptPrompt = `SYSTEM / POLICY
- Non-interactive; do NOT ask questions.
- Exactly five scenes × 5 seconds = 25 s total.
- Output = JSON only.

INPUTS
- Transcript or source text: ${transcript_text}
- Style: ${style}
- Identity pack: ${JSON.stringify(identity_pack)}
- Environment pack: ${JSON.stringify(environment_pack)}
- Palette pack: ${JSON.stringify(palette_pack)}

TASK
Convert text into a concise five-scene script.

OUTPUT SCHEMA
{
  "title": "...",
  "logline": "...",
  "scenes": [
    {
      "index": 1,
      "duration_sec": 5,
      "setting": "location / time / mood",
      "visual_action": "visible event",
      "dialogue": "short line or empty",
      "emotion": "dominant feeling",
      "beats": ["beat-1","beat-2"]
    }
  ]
}

RULES
- Show through action and dialogue only.
- Maintain identities and environments from packs.
- Define light direction, time of day, and ambience clearly.
- Output exactly 5 scenes, each 5 seconds.`;

    const scriptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
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

    // Step 2: Scene breakdown with camera paths (PROMPT 2 — Director & Camera Planner)
    const styleDefinition = STYLE_DEFINITIONS[style as keyof typeof STYLE_DEFINITIONS] || STYLE_DEFINITIONS.commercial;

    const sceneBreakdownPrompt = `SYSTEM / POLICY
- Non-interactive; output one JSON array.
- 5 scenes × 5 s = 25 s total.
- Maintain spatial continuity across scenes.
- Every second cut may reuse previous last frame.

INPUTS
- Style: ${style}
- CameraPaths(style): ${JSON.stringify(styleDefinition.camera_paths)}
- Identity pack: ${JSON.stringify(identity_pack)}
- Environment pack: ${JSON.stringify(environment_pack)}
- Palette pack: ${JSON.stringify(palette_pack)}
- Scenes: ${JSON.stringify(scriptOutput.scenes)}
- Seed: ${global_seed}

TASK
Turn each scene into a detailed camera plan.

OUTPUT SCHEMA
[
  {
    "scene_id": 1,
    "duration_sec": 5,
    "setting": "...",
    "visual_action": "...",
    "dialogue": "...",
    "emotion": "...",
    "camera_motion": {
      "type": "<from style library>",
      "speed": "<slow|medium|fast>",
      "start_frame": "<composition start>",
      "end_frame": "<composition end>",
      "lens_mm": <int>,
      "camera_height_m": <float>,
      "camera_heading": "<N|NE|E|SE|S|SW|W|NW>",
      "lighting": "${styleDefinition.lighting_hint}"
    },
    "continuity": {
      "reuse_last_frame_from_previous": <true|false>,
      "world_rules": "consistent actor/object side and orientation"
    }
  }
]

RULES
- Vary motion, lens, and height per scene for rhythm.
- Keep lighting and palette stable unless a scene jump occurs.
- No narration or model dialogue.
- The response MUST be a valid JSON object with a "scenes" array property`;

    // Use retry logic for scene breakdown API call
    const sceneBreakdowns = await retryWithBackoff(async (): Promise<SceneBreakdown[]> => {
      const breakdownResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are a professional film director. You must respond with valid JSON. The response must be a JSON object with a 'scenes' array property.",
            },
            {
              role: "user",
              content: sceneBreakdownPrompt,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
        }),
      });

      if (!breakdownResponse.ok) {
        const errorText = await breakdownResponse.text();
        throw new Error(`OpenAI API error (scene breakdown): ${errorText}`);
      }

      const breakdownResult = await breakdownResponse.json();
      console.log("Breakdown result:", JSON.stringify(breakdownResult, null, 2));

      const contentText = breakdownResult.choices[0].message.content;
      console.log("Raw content:", contentText);

      // Use robust JSON extraction
      const parsedContent = extractJSON(contentText);
      console.log("Parsed content:", JSON.stringify(parsedContent, null, 2));

      // Handle multiple possible formats with detailed logging
      let extractedScenes: SceneBreakdown[];

      if (Array.isArray(parsedContent)) {
        console.log("Format: Direct array");
        extractedScenes = parsedContent;
      } else if (parsedContent.scenes && Array.isArray(parsedContent.scenes)) {
        console.log("Format: Object with 'scenes' property");
        extractedScenes = parsedContent.scenes;
      } else if (parsedContent.shots && Array.isArray(parsedContent.shots)) {
        console.log("Format: Object with 'shots' property");
        extractedScenes = parsedContent.shots;
      } else if (parsedContent.scene_breakdowns && Array.isArray(parsedContent.scene_breakdowns)) {
        console.log("Format: Object with 'scene_breakdowns' property");
        extractedScenes = parsedContent.scene_breakdowns;
      } else {
        // Log the structure to help debug
        console.error("Unexpected format. Keys found:", Object.keys(parsedContent));
        console.error("Content structure:", JSON.stringify(parsedContent, null, 2));
        throw new Error(`Unexpected scene breakdown format. Expected object with 'scenes' array, got: ${JSON.stringify(parsedContent).substring(0, 300)}`);
      }

      // Validate we got scenes
      if (!extractedScenes || extractedScenes.length === 0) {
        throw new Error("No scenes found in the response");
      }

      console.log(`Successfully extracted ${extractedScenes.length} scenes`);
      return extractedScenes;
    }, 3, 1000);

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
