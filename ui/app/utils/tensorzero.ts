/*
TensorZero Client (for internal use only for now)
*/

import { z } from "zod";
import { contentBlockOutputSchema } from "./clickhouse/common";

/**
 * JSON types.
 */
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JSONValue }
  | JSONValue[];
export const JSONValueSchema: z.ZodType = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.record(JSONValueSchema),
    z.array(JSONValueSchema),
  ]),
);

/**
 * Roles for input messages.
 */
export const RoleSchema = z.enum(["system", "user", "assistant", "tool"]);
export type Role = z.infer<typeof RoleSchema>;

/**
 * A tool call request.
 */
export const ToolCallSchema = z.object({
  name: z.string(),
  /** The arguments as a JSON string. */
  arguments: z.string(),
  id: z.string(),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

/**
 * A tool call result.
 */
export const ToolResultSchema = z.object({
  name: z.string(),
  result: z.string(),
  id: z.string(),
});
export type ToolResult = z.infer<typeof ToolResultSchema>;

/**
 * An input message's content may be structured.
 */
export const TextContentSchema = z.object({
  type: z.literal("text"),
  value: JSONValueSchema,
});

export const TextArgumentsContentSchema = z.object({
  type: z.literal("text"),
  arguments: JSONValueSchema,
});

export const RawTextContentSchema = z.object({
  type: z.literal("raw_text"),
  value: z.string(),
});

export const ToolCallContentSchema = z.object({
  type: z.literal("tool_call"),
  ...ToolCallSchema.shape,
});

export const ToolResultContentSchema = z.object({
  type: z.literal("tool_result"),
  ...ToolResultSchema.shape,
});

export const InputMessageContentSchema = z.union([
  TextContentSchema,
  TextArgumentsContentSchema,
  RawTextContentSchema,
  ToolCallContentSchema,
  ToolResultContentSchema,
]);

export type InputMessageContent = z.infer<typeof InputMessageContentSchema>;

/**
 * An input message sent by the client.
 */
export const InputMessageSchema = z.object({
  role: RoleSchema,
  content: z.array(InputMessageContentSchema),
});
export type InputMessage = z.infer<typeof InputMessageSchema>;

/**
 * The inference input object.
 */
export const InputSchema = z.object({
  system: JSONValueSchema.optional(),
  messages: z.array(InputMessageSchema),
});
export type Input = z.infer<typeof InputSchema>;

/**
 * A Tool that the LLM may call.
 */
export const ToolSchema = z.object({
  description: z.string(),
  parameters: JSONValueSchema,
  name: z.string(),
  strict: z.boolean().optional(),
});
export type Tool = z.infer<typeof ToolSchema>;

/**
 * Tool choice, which controls how tools are selected.
 * This mirrors the Rust enum:
 * - "none": no tool should be used
 * - "auto": let the model decide
 * - "required": the model must call a tool
 * - { specific: "tool_name" }: force a specific tool
 */
export const ToolChoiceSchema = z.union([
  z.enum(["none", "auto", "required"]),
  z.object({ specific: z.string() }),
]);
export type ToolChoice = z.infer<typeof ToolChoiceSchema>;

/**
 * Inference parameters allow runtime overrides for a given variant.
 */
export const InferenceParamsSchema = z.record(z.record(JSONValueSchema));
export type InferenceParams = z.infer<typeof InferenceParamsSchema>;

/**
 * The request type for inference. These fields correspond roughly
 * to the Rust `Params` struct.
 *
 * Exactly one of `function_name` or `model_name` should be provided.
 */
export const InferenceRequestSchema = z.object({
  function_name: z.string().optional(),
  model_name: z.string().optional(),
  episode_id: z.string().optional(),
  input: InputSchema,
  stream: z.boolean().optional(),
  params: InferenceParamsSchema.optional(),
  variant_name: z.string().optional(),
  dryrun: z.boolean().optional(),
  tags: z.record(z.string()).optional(),
  allowed_tools: z.array(z.string()).optional(),
  additional_tools: z.array(ToolSchema).optional(),
  tool_choice: ToolChoiceSchema.optional(),
  parallel_tool_calls: z.boolean().optional(),
  output_schema: JSONValueSchema.optional(),
  credentials: z.record(z.string()).optional(),
});
export type InferenceRequest = z.infer<typeof InferenceRequestSchema>;

/**
 * Inference responses vary based on the function type.
 */
export const ChatInferenceResponseSchema = z.object({
  inference_id: z.string(),
  episode_id: z.string(),
  variant_name: z.string(),
  content: z.array(contentBlockOutputSchema),
  usage: z
    .object({
      input_tokens: z.number(),
      output_tokens: z.number(),
    })
    .optional(),
});
export type ChatInferenceResponse = z.infer<typeof ChatInferenceResponseSchema>;

export const JSONInferenceResponseSchema = z.object({
  inference_id: z.string(),
  episode_id: z.string(),
  variant_name: z.string(),
  output: z.object({
    raw: z.string(),
    parsed: JSONValueSchema.nullable(),
  }),
  usage: z
    .object({
      input_tokens: z.number(),
      output_tokens: z.number(),
    })
    .optional(),
});
export type JSONInferenceResponse = z.infer<typeof JSONInferenceResponseSchema>;

/**
 * The overall inference response is a union of chat and JSON responses.
 */
export const InferenceResponseSchema = z.union([
  ChatInferenceResponseSchema,
  JSONInferenceResponseSchema,
]);
export type InferenceResponse = z.infer<typeof InferenceResponseSchema>;

/**
 * Feedback requests attach a metric value to a given inference or episode.
 */
export const FeedbackRequestSchema = z.object({
  dryrun: z.boolean().optional(),
  episode_id: z.string().optional(),
  inference_id: z.string().optional(),
  metric_name: z.string(),
  tags: z.record(z.string()).optional(),
  value: JSONValueSchema,
});
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;

export const FeedbackResponseSchema = z.object({
  feedback_id: z.string(),
});
export type FeedbackResponse = z.infer<typeof FeedbackResponseSchema>;

/**
 * Schema for tool parameters in a datapoint
 */
export const ToolParamsSchema = z.record(JSONValueSchema);
export type ToolParams = z.infer<typeof ToolParamsSchema>;

/**
 * Base schema for datapoints with common fields
 */
const BaseDatapointSchema = z.object({
  function_name: z.string(),
  input: InputSchema,
  output: JSONValueSchema,
  tags: z.record(z.string()).optional(),
  auxiliary: z.string().optional(),
});

/**
 * Schema for chat inference datapoints
 */
export const ChatInferenceDatapointSchema = BaseDatapointSchema.extend({
  tool_params: ToolParamsSchema.optional(),
});
export type ChatInferenceDatapoint = z.infer<
  typeof ChatInferenceDatapointSchema
>;

/**
 * Schema for JSON inference datapoints
 */
export const JsonInferenceDatapointSchema = BaseDatapointSchema.extend({
  output_schema: JSONValueSchema,
});
export type JsonInferenceDatapoint = z.infer<
  typeof JsonInferenceDatapointSchema
>;

/**
 * Combined schema for any type of datapoint
 */
export const DatapointSchema = z.union([
  ChatInferenceDatapointSchema,
  JsonInferenceDatapointSchema,
]);
export type Datapoint = z.infer<typeof DatapointSchema>;

/**
 * Schema for datapoint response
 */
export const DatapointResponseSchema = z.object({
  id: z.string(),
});
export type DatapointResponse = z.infer<typeof DatapointResponseSchema>;

/**
 * A client for calling the TensorZero Gateway inference and feedback endpoints.
 */
export class TensorZeroClient {
  private baseUrl: string;

  /**
   * @param baseUrl - The base URL of the TensorZero Gateway (e.g. "http://localhost:3000")
   */
  constructor(baseUrl: string) {
    // Remove any trailing slash for consistency.
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  // Overloads for inference:
  async inference(
    request: InferenceRequest & { stream?: false | undefined },
  ): Promise<InferenceResponse>;
  inference(
    request: InferenceRequest & { stream: true },
  ): Promise<AsyncGenerator<InferenceResponse, void, unknown>>;
  async inference(
    request: InferenceRequest,
  ): Promise<
    InferenceResponse | AsyncGenerator<InferenceResponse, void, unknown>
  > {
    const url = `${this.baseUrl}/inference`;
    if (request.stream) {
      // Return an async generator that yields each SSE event as an InferenceResponse.
      return this.inferenceStream(request);
    } else {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        throw new Error(
          `Inference request failed with status ${response.status}`,
        );
      }
      return (await response.json()) as InferenceResponse;
    }
  }

  /**
   * Returns an async generator that yields inference responses as they arrive via SSE.
   *
   * Note: The TensorZero gateway streams responses as Server-Sent Events (SSE). This simple parser
   * splits events by a double newline. Adjust if the event format changes.
   */
  private async *inferenceStream(
    request: InferenceRequest,
  ): AsyncGenerator<InferenceResponse, void, unknown> {
    const url = `${this.baseUrl}/inference`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok || !response.body) {
      throw new Error(
        `Streaming inference failed with status ${response.status}`,
      );
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        const lines = part.split("\n").map((line) => line.trim());
        let dataStr = "";
        for (const line of lines) {
          if (line.startsWith("data:")) {
            dataStr += line.replace(/^data:\s*/, "");
          }
        }
        if (dataStr === "[DONE]") {
          return;
        }
        if (dataStr) {
          try {
            const parsed = JSON.parse(dataStr);
            yield parsed as InferenceResponse;
          } catch (err) {
            console.error("Failed to parse SSE data:", err);
          }
        }
      }
    }
  }

  /**
   * Sends feedback for a particular inference or episode.
   * @param request - The feedback request payload.
   * @returns A promise that resolves with the feedback response.
   */
  async feedback(request: FeedbackRequest): Promise<FeedbackResponse> {
    const url = `${this.baseUrl}/feedback`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error(`Feedback request failed with status ${response.status}`);
    }
    return (await response.json()) as FeedbackResponse;
  }

  /**
   * Inserts a datapoint from an existing inference with a given ID and setting for where to get the output from.
   * @param datasetName - The name of the dataset to insert the datapoint into
   * @param inferenceId - The ID of the existing inference to use as a base
   * @param outputKind - How to handle the output field: inherit from inference, use demonstration, or none
   * @returns A promise that resolves with the created datapoint response containing the new ID
   * @throws Error if validation fails or the request fails
   */
  async createDatapoint(
    datasetName: string,
    inferenceId: string,
    outputKind: "inherit" | "demonstration" | "none" = "inherit",
  ): Promise<DatapointResponse> {
    if (!datasetName || typeof datasetName !== "string") {
      throw new Error("Dataset name must be a non-empty string");
    }

    if (!inferenceId || typeof inferenceId !== "string") {
      throw new Error("Inference ID must be a non-empty string");
    }

    const url = `${this.baseUrl}/datasets/${encodeURIComponent(datasetName)}/datapoints`;

    const request = {
      inference_id: inferenceId,
      output: outputKind,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(
        `Create datapoint request failed with status ${response.status}`,
      );
    }

    const body = await response.json();
    return DatapointResponseSchema.parse(body);
  }

  /**
   * Updates an existing datapoint in a dataset with the given ID.
   * @param datasetName - The name of the dataset containing the datapoint
   * @param datapointId - The UUID of the datapoint to update
   * @param datapoint - The datapoint data containing function_name, input, output, and optional fields
   * @returns A promise that resolves with the response containing the datapoint ID
   * @throws Error if validation fails or the request fails
   */
  async updateDatapoint(
    datasetName: string,
    datapointId: string,
    datapoint: Datapoint,
  ): Promise<DatapointResponse> {
    if (!datasetName || typeof datasetName !== "string") {
      throw new Error("Dataset name must be a non-empty string");
    }

    if (!datapointId || typeof datapointId !== "string") {
      throw new Error("Datapoint ID must be a non-empty string");
    }

    // Validate the datapoint using the Zod schema
    const validationResult = DatapointSchema.safeParse(datapoint);
    if (!validationResult.success) {
      throw new Error(`Invalid datapoint: ${validationResult.error.message}`);
    }

    const url = `${this.baseUrl}/datasets/${encodeURIComponent(datasetName)}/datapoints/${encodeURIComponent(datapointId)}`;

    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datapoint),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Update datapoint request failed with status ${response.status}: ${errorText}`,
      );
    }

    const body = await response.json();
    return DatapointResponseSchema.parse(body);
  }
}
