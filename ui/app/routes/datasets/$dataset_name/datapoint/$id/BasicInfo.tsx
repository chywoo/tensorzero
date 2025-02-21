import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Code } from "~/components/ui/code";
import { Badge } from "~/components/ui/badge";
import { Link } from "react-router";
import type { ParsedInferenceRow } from "~/utils/clickhouse/inference";
import { useConfig } from "~/context/config";
import {
  type TryWithVariantButtonProps,
  TryWithVariantButton,
} from "~/components/utils/TryWithVariantButton";
import type { DatasetRow } from "~/utils/clickhouse/datasets";
interface BasicInfoProps {
  datapoint: DatasetRow;
  tryWithVariantProps: TryWithVariantButtonProps;
}

export default function BasicInfo({
  datapoint,
  tryWithVariantProps,
}: BasicInfoProps) {
  const config = useConfig();
  const function_config = config.functions[datapoint.function_name];
  const type = function_config?.type;
  if (!type) {
    throw new Error(`Function ${datapoint.function_name} not found`);
  }
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-xl">Basic Information</CardTitle>
        <TryWithVariantButton {...tryWithVariantProps} />
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-lg font-semibold">Function</dt>
            <dd>
              <Link to={`/observability/functions/${datapoint.function_name}`}>
                <Code>{datapoint.function_name}</Code>
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-lg font-semibold">Episode ID</dt>
            <dd>
              <Link to={`/observability/episodes/${datapoint.episode_id}`}>
                <Code>{datapoint.episode_id}</Code>
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-lg font-semibold">Timestamp</dt>
            <dd>{new Date(datapoint.updated_at).toLocaleString()}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
