import { z } from "zod";

/**
 * Schema representing a fully-qualified row in the Chat Inference dataset.
 */
export const ChatInferenceDatasetRowSchema = z
  .object({
    dataset_name: z.string(),
    function_name: z.string(),
    id: z.string().uuid(),
    episode_id: z.string().uuid(),
    input: z.string(),
    output: z.string().optional(),
    tool_params: z.string(),
    tags: z.record(z.string(), z.string()),
    auxiliary: z.string(),
    is_deleted: z.boolean().default(false),
    updated_at: z.string().datetime().default(new Date().toISOString()),
  })
  .strict();
export type ChatInferenceDatasetRow = z.infer<
  typeof ChatInferenceDatasetRowSchema
>;

/**
 * Schema representing a fully-qualified row in the JSON Inference dataset.
 */
export const JsonInferenceDatasetRowSchema = z
  .object({
    dataset_name: z.string(),
    function_name: z.string(),
    id: z.string().uuid(),
    episode_id: z.string().uuid(),
    input: z.string(),
    output: z.string().optional(),
    output_schema: z.string(),
    tags: z.record(z.string(), z.string()),
    auxiliary: z.string(),
    is_deleted: z.boolean().default(false),
    updated_at: z.string().datetime(),
  })
  .strict();
export type JsonInferenceDatasetRow = z.infer<
  typeof JsonInferenceDatasetRowSchema
>;

/**
 * Union schema representing a dataset row, which can be either a Chat or JSON inference row.
 */
export const DatasetRowSchema = z.union([
  ChatInferenceDatasetRowSchema,
  JsonInferenceDatasetRowSchema,
]);
export type DatasetRow = z.infer<typeof DatasetRowSchema>;

/**
 * Schema for inserts into the Chat Inference dataset.
 * Note: "is_deleted" and "created_at" are omitted since they are generated by the database.
 */
export const ChatInferenceDatasetInsertSchema =
  ChatInferenceDatasetRowSchema.omit({
    is_deleted: true,
    updated_at: true,
  });
export type ChatInferenceDatasetInsert = z.infer<
  typeof ChatInferenceDatasetInsertSchema
>;

/**
 * Schema for inserts into the JSON Inference dataset.
 * Note: "is_deleted" and "created_at" are omitted since they are generated by the database.
 */
export const JsonInferenceDatasetInsertSchema =
  JsonInferenceDatasetRowSchema.omit({
    is_deleted: true,
    updated_at: true,
  });
export type JsonInferenceDatasetInsert = z.infer<
  typeof JsonInferenceDatasetInsertSchema
>;

/**
 * Union schema representing an insert into either dataset.
 */
export const DatasetInsertSchema = z.union([
  ChatInferenceDatasetInsertSchema,
  JsonInferenceDatasetInsertSchema,
]);
export type DatasetInsert = z.infer<typeof DatasetInsertSchema>;

/**
 * Schema defining the allowed query parameters for selecting rows from the dataset.
 */
export const DatasetQueryParamsSchema = z.object({
  inferenceType: z.enum(["chat", "json"]),
  function_name: z.string().optional(),
  dataset_name: z.string().optional(),
  variant_name: z.string().optional(), // variant_name must have a corresponding function_name
  extra_where: z.string().array().default([]), // Extra WHERE clauses (e.g. filtering by episode_id)
  extra_params: z
    .record(z.string(), z.union([z.string(), z.number()]))
    .default({}), // Additional query parameters for placeholder substitution
  metric_filter: z
    .object({
      metric: z.string(),
      metric_type: z.enum(["boolean", "float"]),
      operator: z.enum([">", "<"]),
      threshold: z.number(),
      join_on: z.enum(["id", "episode_id"]),
    })
    .optional(), // Optional filter based on metric feedback
  output_source: z.enum(["none", "inference", "demonstration"]),
  limit: z.number().optional(),
  offset: z.number().optional(),
});
export type DatasetQueryParams = z.infer<typeof DatasetQueryParamsSchema>;

export const DatasetCountInfoSchema = z.object({
  dataset_name: z.string(),
  count: z.number(),
  last_updated: z.string().datetime(),
});
export type DatasetCountInfo = z.infer<typeof DatasetCountInfoSchema>;

export const DatasetDetailRowSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["chat", "json"]),
  function_name: z.string(),
  episode_id: z.string().uuid(),
  updated_at: z.string().datetime(),
});

export type DatasetDetailRow = z.infer<typeof DatasetDetailRowSchema>;
