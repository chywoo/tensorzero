import { z } from "zod";
import path from "path";
import fs from "fs";
import { jsonModeSchema, RetryConfigSchema } from "./types";
import { type FunctionConfig } from "./function";
import { type VariantConfig } from "./variant";
import {
  LLMJudgeIncludeConfigSchema,
  ExactMatchConfigSchema,
  type EvalConfig,
  type EvaluatorConfig,
} from "./evals";
import type { MetricConfig } from "./metric";
import type { RawFunctionConfig } from "./function.server";

// User template for LLM judge
// This is problematic because we would ideally want an automated way
// to keep this in sync with tensorzero-internal/src/evals/llm_judge_user_template.minijinja
const llm_judge_user_template = `# Input

{{input}}

# Generated Output

{{generated_output}}

{%- if reference_output -%}
# Reference Output

{{reference_output}}
{%- endif -%}`;

// Output schemas for LLM judge with float output
// This is problematic because we would ideally want an automated way
// to keep this in sync with tensorzero-internal/src/evals/llm_judge_float_output_schema.json
const llm_judge_float_output_schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  required: ["thinking", "score"],
  additionalProperties: false,
  properties: {
    thinking: {
      type: "string",
      description: "The reasoning or thought process behind the judgment",
    },
    score: {
      type: "number",
      description: "The score assigned as a number",
    },
  },
};

// Output schemas for LLM judge with boolean output
// This is problematic because we would ideally want an automated way
// to keep this in sync with tensorzero-internal/src/evals/llm_judge_boolean_output_schema.json
const llm_judge_boolean_output_schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  required: ["thinking", "score"],
  additionalProperties: false,
  properties: {
    thinking: {
      type: "string",
      description: "The reasoning or thought process behind the judgment",
    },
    score: {
      type: "boolean",
      description: "The LLM judge's score as a boolean",
    },
  },
};

// User schema for LLM judge
// This is problematic because we would ideally want an automated way
// to keep this in sync with tensorzero-internal/src/evals/llm_judge_user_schema.json
const llm_judge_user_schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  required: ["input", "generated_output", "reference_output"],
  additionalProperties: false,
  properties: {
    input: {
      type: "string",
      description: "The input provided to the model",
    },
    generated_output: {
      type: "string",
      description: "The output generated by the model",
    },
    reference_output: {
      type: ["string", "null"],
      description: "The expected or reference output (optional)",
    },
  },
};

export const UninitializedLLMJudgeChatCompletionVariantConfigSchema = z.object({
  active: z.boolean().default(false),
  model: z.string(),
  system_instructions: z.string(), // Path to system instructions
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  max_tokens: z.number().int().optional(),
  presence_penalty: z.number().optional(),
  frequency_penalty: z.number().optional(),
  seed: z.number().int().optional(),
  json_mode: jsonModeSchema,
  retries: RetryConfigSchema.default({ num_retries: 0, max_delay_s: 10 }),
});

export const UnintializedLLMJudgeVariantConfigSchema = z.discriminatedUnion(
  "type",
  [
    z.object({
      type: z.literal("chat_completion"),
      ...UninitializedLLMJudgeChatCompletionVariantConfigSchema.shape,
    }),
  ],
);

export const UninitializedLLMJudgeConfigSchema = z.object({
  variants: z.record(z.string(), UnintializedLLMJudgeVariantConfigSchema),
  output_type: z.enum(["float", "boolean"]),
  optimize: z.enum(["min", "max"]),
  include: LLMJudgeIncludeConfigSchema,
  cutoff: z.number().optional(),
});

export const UninitializedEvaluatorConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("exact_match"),
    ...ExactMatchConfigSchema.shape,
  }),
  z.object({
    type: z.literal("llm_judge"),
    ...UninitializedLLMJudgeConfigSchema.shape,
  }),
]);

export const UninitializedEvalConfigSchema = z.object({
  evaluators: z.record(z.string(), UninitializedEvaluatorConfigSchema),
  dataset_name: z.string(),
  function_name: z.string(),
});

// Helper function to read system instructions from a file
async function readSystemInstructions(
  instructionsPath: string,
  basePath: string,
): Promise<string> {
  const fullPath = path.join(path.dirname(basePath), instructionsPath);
  try {
    return await fs.promises.readFile(fullPath, "utf-8");
  } catch (error) {
    throw new Error(
      `Failed to read system instructions file: ${error}, path: ${fullPath}`,
    );
  }
}

// Get LLM judge function name
function getLLMJudgeFunctionName(
  evalName: string,
  evaluatorName: string,
): string {
  return `tensorzero::llm_judge::${evalName}::${evaluatorName}`;
}

// Get evaluator metric name
function getEvaluatorMetricName(
  evalName: string,
  evaluatorName: string,
): string {
  return `tensorzero::eval_name::${evalName}::evaluator_name::${evaluatorName}`;
}

// Transform an uninitialized LLM judge variant config into a variant config
async function loadLLMJudgeVariant(
  variantConfig: z.infer<typeof UnintializedLLMJudgeVariantConfigSchema>,
  basePath: string,
  evalName: string,
  evaluatorName: string,
): Promise<VariantConfig> {
  if (variantConfig.type !== "chat_completion") {
    throw new Error(
      `Unsupported LLM judge variant type: ${variantConfig.type}`,
    );
  }

  const systemInstructions = await readSystemInstructions(
    variantConfig.system_instructions,
    basePath,
  );

  return {
    type: "chat_completion" as const,
    weight: variantConfig.active ? 1.0 : 0.0,
    model: variantConfig.model,
    system_template: {
      path: `tensorzero::llm_judge::${evalName}::${evaluatorName}::system`,
      content: systemInstructions,
    },
    user_template: {
      path: `tensorzero::llm_judge::${evalName}::${evaluatorName}::user`,
      content: llm_judge_user_template,
    },
    temperature: variantConfig.temperature,
    top_p: variantConfig.top_p,
    max_tokens: variantConfig.max_tokens,
    presence_penalty: variantConfig.presence_penalty,
    frequency_penalty: variantConfig.frequency_penalty,
    seed: variantConfig.seed,
    json_mode: variantConfig.json_mode,
    retries: variantConfig.retries,
  };
}

// Transform uninitialized LLM judge config into LLM judge config and function config
async function loadLLMJudgeEvaluator(
  config: z.infer<typeof UninitializedLLMJudgeConfigSchema>,
  basePath: string,
  evalName: string,
  evaluatorName: string,
): Promise<{
  evaluatorConfig: {
    type: "llm_judge";
    output_type: "float" | "boolean";
    include: z.infer<typeof LLMJudgeIncludeConfigSchema>;
    optimize: "min" | "max";
    cutoff?: number;
  };
  functionConfig: FunctionConfig;
}> {
  // Check for valid evaluator name
  if (evaluatorName.includes("::")) {
    throw new Error(
      `Evaluator names cannot contain "::" (referenced in [evals.${evalName}.${evaluatorName}])`,
    );
  }

  // Load all variants
  const loadedVariants: Record<string, VariantConfig> = {};
  let activeVariantCount = 0;

  for (const [name, variant] of Object.entries(config.variants)) {
    const loadedVariant = await loadLLMJudgeVariant(
      variant,
      basePath,
      evalName,
      evaluatorName,
    );
    loadedVariants[name] = loadedVariant;

    // Count active variants (weight > 0)
    if ((loadedVariant.weight ?? 0) > 0) {
      activeVariantCount++;
    }
  }

  // Validate that exactly one variant is active
  if (activeVariantCount !== 1) {
    throw new Error(
      `Evaluator \`${evaluatorName}\` in \`[evals.${evalName}]\` must have exactly 1 variant that is active. Found ${activeVariantCount} variants with nonzero weights.`,
    );
  }

  // Create output schema based on output type
  const outputSchema =
    config.output_type === "float"
      ? llm_judge_float_output_schema
      : llm_judge_boolean_output_schema;

  // Create the function config
  const functionConfig: FunctionConfig = {
    type: "json",
    variants: loadedVariants,
    output_schema: {
      path: `tensorzero::llm_judge::${evalName}::${evaluatorName}::output_schema`,
      content: outputSchema,
    },
    system_schema: undefined,
    user_schema: {
      path: `tensorzero::llm_judge::${evalName}::${evaluatorName}::user_schema`,
      content: llm_judge_user_schema,
    },
    assistant_schema: undefined,
  };

  return {
    evaluatorConfig: {
      type: "llm_judge" as const,
      output_type: config.output_type,
      include: config.include,
      optimize: config.optimize,
      cutoff: config.cutoff,
    },
    functionConfig,
  };
}

// Transform uninitialized evaluator config into evaluator config
async function loadEvaluator(
  config: z.infer<typeof UninitializedEvaluatorConfigSchema>,
  basePath: string,
  evalName: string,
  evaluatorName: string,
): Promise<{
  evaluatorConfig: EvaluatorConfig;
  functionConfig?: FunctionConfig;
  metricConfig: {
    type: "float" | "boolean";
    optimize: "min" | "max";
    level: "inference";
  };
}> {
  if (evaluatorName.includes("::")) {
    throw new Error(
      `Evaluator names cannot contain "::" (referenced in [evals.${evalName}.${evaluatorName}])`,
    );
  }

  if (config.type === "exact_match") {
    return {
      evaluatorConfig: {
        type: "exact_match",
        cutoff: config.cutoff,
      },
      metricConfig: {
        type: "boolean",
        optimize: "max",
        level: "inference",
      },
    };
  } else if (config.type === "llm_judge") {
    const { evaluatorConfig, functionConfig } = await loadLLMJudgeEvaluator(
      config,
      basePath,
      evalName,
      evaluatorName,
    );

    return {
      evaluatorConfig,
      functionConfig,
      metricConfig: {
        type: config.output_type === "float" ? "float" : "boolean",
        optimize: config.optimize,
        level: "inference",
      },
    };
  }

  throw new Error(`Unsupported evaluator type: ${(config as any).type}`);
}

// Transform the raw eval config
export const RawEvalConfigSchema = UninitializedEvalConfigSchema.transform(
  (raw) => {
    return {
      ...raw,
      load: async function (
        configPath: string,
        evalName: string,
        functions: Record<string, RawFunctionConfig>,
      ): Promise<{
        evalConfig: EvalConfig;
        functionConfigs: Record<string, FunctionConfig>;
        metricConfigs: Record<string, MetricConfig>;
      }> {
        // Check for valid eval name
        if (evalName.includes("::")) {
          throw new Error(
            `Eval names cannot contain "::" (referenced in [evals.${evalName}])`,
          );
        }

        // Check if referenced function exists
        if (!functions[raw.function_name]) {
          throw new Error(
            `Function \`${raw.function_name}\` not found (referenced in \`[evals.${evalName}]\`)`,
          );
        }

        // Load all evaluators
        const evaluators: Record<string, EvaluatorConfig> = {};
        const functionConfigs: Record<string, FunctionConfig> = {};
        const metricConfigs: Record<
          string,
          {
            type: "float" | "boolean";
            optimize: "min" | "max";
            level: "inference";
          }
        > = {};

        for (const [name, config] of Object.entries(raw.evaluators)) {
          const { evaluatorConfig, functionConfig, metricConfig } =
            await loadEvaluator(config, configPath, evalName, name);

          // Add evaluator config
          evaluators[name] = evaluatorConfig;

          // Add function config if it exists
          if (functionConfig) {
            functionConfigs[getLLMJudgeFunctionName(evalName, name)] =
              functionConfig;
          }

          // Add metric config
          metricConfigs[getEvaluatorMetricName(evalName, name)] = metricConfig;
        }

        return {
          evalConfig: {
            evaluators,
            dataset_name: raw.dataset_name,
            function_name: raw.function_name,
          },
          functionConfigs,
          metricConfigs,
        };
      },
    };
  },
);

export type RawEvalConfig = z.infer<typeof RawEvalConfigSchema>;
