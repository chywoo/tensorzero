import { data, useFetcher, type ActionFunctionArgs } from "react-router";
import {
  ParsedDatasetRowSchema,
  type ParsedDatasetRow,
} from "~/utils/clickhouse/datasets";
import { deleteDatapoint } from "~/utils/clickhouse/datasets.server";
import { useNavigate } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();

  const rawData = {
    dataset_name: formData.get("dataset_name"),
    function_name: formData.get("function_name"),
    id: formData.get("id"),
    episode_id: formData.get("episode_id"),
    input: JSON.parse(formData.get("input") as string),
    output: formData.get("output")
      ? JSON.parse(formData.get("output") as string)
      : undefined,
    output_schema: formData.get("output_schema")
      ? JSON.parse(formData.get("output_schema") as string)
      : undefined,
    tags: JSON.parse(formData.get("tags") as string),
    auxiliary: formData.get("auxiliary"),
    is_deleted: formData.get("is_deleted") === "true",
    updated_at: formData.get("updated_at"),
  };

  const parsedFormData = ParsedDatasetRowSchema.parse(rawData);
  await deleteDatapoint(parsedFormData);
  return data({ success: true });
}

/**
 * A hook that deletes a datapoint and handles the loading state
 *
 * @param datapoint - The datapoint to delete
 * @returns An object containing:
 *  - isDeleting: Whether the delete request is in progress
 *  - isDeleted: Whether the delete was successful
 *  - error: Any error that occurred during deletion
 *  - deleteDatapoint: Function to trigger the deletion
 */
export function useDatapointDeleter() {
  const deleteFetcher = useFetcher();
  const navigate = useNavigate();

  const deleteDatapoint = async (datapoint: ParsedDatasetRow) => {
    const formData = new FormData();

    Object.entries(datapoint).forEach(([key, value]) => {
      if (value === undefined) {
        return;
      }

      if (value === null) {
        formData.append(key, "null");
        return;
      }

      if (typeof value === "object") {
        formData.append(key, JSON.stringify(value));
        return;
      }

      formData.append(key, String(value));
    });

    // Use the submit promise to handle navigation after completion
    await deleteFetcher
      .submit(formData, {
        method: "post",
        action: "/api/datasets/delete",
      })
      .then(() => {
        navigate(`/datasets/${datapoint.dataset_name}`, { replace: true });
      });
  };

  return {
    isDeleting: deleteFetcher.state === "submitting",
    isDeleted:
      deleteFetcher.state === "idle" && deleteFetcher.data?.success === true,
    error: deleteFetcher.data?.error,
    deleteDatapoint,
  };
}
