// Node.js built-ins
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { createReadStream } from "fs";

// External dependencies
import OpenAI from "openai";

import type { SFTFormValues } from "~/routes/optimization/fine-tuning/types";
import {
  getCuratedInferences,
  type ContentBlockOutput,
  type InputMessageContent,
  type JsonInferenceOutput,
  type ParsedInferenceRow,
  type Role,
} from "../clickhouse";
import { get_template_env, type ChatCompletionConfig } from "../config/variant";
import { getConfig } from "../config/index.server";
import type { JsExposedEnv } from "../minijinja/pkg/minijinja_bindings";
import { splitValidationData } from "./common";
import { render_message } from "./rendering";
import { SFTJob } from "./common";

export const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class OpenAISFTJob extends SFTJob {
  constructor(
    public jobId: string,
    public status: string,
    public fineTunedModel?: string,
  ) {
    super();
  }

  static async fromFormData(data: SFTFormValues): Promise<OpenAISFTJob> {
    const config = await getConfig();
    // TODO: throw if this isn't a chat completion
    const currentVariant = config.functions[data.function].variants[
      data.variant
    ] as ChatCompletionConfig;
    const curatedInferences = await getCuratedInferences(
      data.function,
      config.functions[data.function],
      data.metric,
      config.metrics[data.metric],
      data.maxSamples,
    );
    if (!curatedInferences || curatedInferences.length === 0) {
      throw new Error("No curated inferences found");
    }
    const templateEnv = await get_template_env(currentVariant);
    const job = await start_sft_openai(
      data.model.name,
      curatedInferences,
      data.validationSplitPercent,
      templateEnv,
    );
    return job;
  }

  result(): string | undefined {
    return this.fineTunedModel;
  }

  async poll(): Promise<OpenAISFTJob> {
    if (!this.jobId) {
      throw new Error("Job ID is required to poll OpenAI SFT");
    }
    const job = await client.fineTuning.jobs.retrieve(this.jobId);
    return new OpenAISFTJob(
      job.id,
      job.status,
      job.fine_tuned_model ?? undefined,
    );
  }
}

export async function start_sft_openai(
  modelName: string,
  inferences: ParsedInferenceRow[],
  validationSplitPercent: number,
  templateEnv: JsExposedEnv,
) {
  const { trainInferences, valInferences } = splitValidationData(
    inferences,
    validationSplitPercent,
  );
  const trainMessages = trainInferences.map((inference) =>
    tensorzero_inference_to_openai_messages(inference, templateEnv),
  );
  const valMessages = valInferences.map((inference) =>
    tensorzero_inference_to_openai_messages(inference, templateEnv),
  );
  const [file_id, val_file_id] = await Promise.all([
    upload_examples_to_openai(trainMessages),
    upload_examples_to_openai(valMessages),
  ]);
  const job_id = await create_openai_fine_tuning_job(
    modelName,
    file_id,
    val_file_id ?? undefined,
  );
  return new OpenAISFTJob(job_id, "created", undefined);
}

// TODO(Viraj): write unit tests here
function tensorzero_inference_to_openai_messages(
  sample: ParsedInferenceRow,
  env: JsExposedEnv,
) {
  const system = sample.input.system;
  const messages: OpenAIMessage[] = [];
  if (env.has_template("system")) {
    const rendered_system = env.render("system", system);
    messages.push({
      role: "system",
      content: rendered_system,
    });
  } else if (system) {
    if (typeof system !== "string") {
      throw new Error(
        "System message must be a string when not using templates",
      );
    }
    messages.push({
      role: "system",
      content: system,
    });
  }
  for (const message of sample.input.messages) {
    for (const content of message.content) {
      const rendered_message = content_block_to_openai_message(
        content,
        message.role,
        env,
      );
      messages.push(rendered_message);
    }
  }
  const isChatInference = Array.isArray(sample.output);
  if (isChatInference) {
    const output = sample.output as ContentBlockOutput[];
    if (output.length !== 1) {
      throw new Error("Chat inference must have exactly one message");
    }
    if (output[0].type !== "text") {
      throw new Error("Chat inference must have a text message as output");
    }
    messages.push({ role: "assistant", content: output[0].text });
  } else if ("raw" in sample.output) {
    // Must be a JSON inference if it has "raw"
    const output = sample.output as JsonInferenceOutput;
    messages.push({ role: "assistant", content: output.raw });
  } else {
    throw new Error("Invalid inference type");
  }
  return messages;
}

// TODO(Viraj): write unit tests here
function content_block_to_openai_message(
  content: InputMessageContent,
  role: Role,
  env: JsExposedEnv,
): OpenAIMessage {
  switch (content.type) {
    case "text":
      return {
        role: role as OpenAIRole,
        content: render_message(env, role, content),
      };
    case "tool_call":
      return {
        role: "assistant" as OpenAIRole,
        tool_calls: [
          {
            id: content.id,
            type: "function",
            function: { name: content.name, arguments: content.arguments },
          },
        ],
      };
    case "tool_result":
      return {
        role: "tool" as OpenAIRole,
        tool_call_id: content.id,
        content: content.result,
      };
  }
}

type OpenAIRole = "system" | "user" | "assistant" | "tool";

type OpenAIMessage = {
  role: OpenAIRole;
  content?: string;
  tool_calls?: {
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
};

async function upload_examples_to_openai(samples: OpenAIMessage[][]) {
  // Convert samples to JSONL format
  let tempFile: string | null = null;
  try {
    const jsonl = samples
      .map((messages) => JSON.stringify({ messages }))
      .join("\n");

    // Write to temporary file
    tempFile = path.join(os.tmpdir(), `temp_training_data_${Date.now()}.jsonl`);
    await fs.writeFile(tempFile, jsonl);

    const file = await client.files.create({
      file: createReadStream(tempFile),
      purpose: "fine-tune",
    });
    return file.id;
  } finally {
    // Clean up temp file
    if (tempFile) {
      try {
        await fs.unlink(tempFile);
      } catch (err) {
        console.error(`Error deleting temp file ${tempFile}: ${err}`);
      }
    }
  }
}

async function create_openai_fine_tuning_job(
  model: string,
  train_file_id: string,
  val_file_id?: string,
) {
  const params: OpenAI.FineTuning.JobCreateParams = {
    model,
    training_file: train_file_id,
    hyperparameters: {
      n_epochs: 1,
    },
  };

  if (val_file_id) {
    params.validation_file = val_file_id;
  }

  try {
    const job = await client.fineTuning.jobs.create(params);
    return job.id;
  } catch (error) {
    console.error("Error creating fine-tuning job:", error);
    throw error;
  }
}
