import { useConfig } from "~/context/config";
import {
  BasicInfoLayout,
  BasicInfoItem,
  BasicInfoItemTitle,
  BasicInfoItemContent,
} from "~/components/layout/BasicInfoLayout";
import Chip from "~/components/ui/Chip";
import { getFunctionTypeIcon } from "~/utils/icon";
import type { EvaluationConfig } from "~/utils/config/evaluations";

interface BasicInfoProps {
  eval_config: EvaluationConfig;
}

export default function BasicInfo({ eval_config }: BasicInfoProps) {
  const config = useConfig();

  const functionName = eval_config.function_name;
  const functionConfig = config.functions[functionName];
  const functionType = functionConfig?.type;
  const functionIconConfig = getFunctionTypeIcon(functionType);

  const datasetName = eval_config.dataset_name;

  return (
    <BasicInfoLayout>
      <BasicInfoItem>
        <BasicInfoItemTitle>Function</BasicInfoItemTitle>
        <BasicInfoItemContent>
          <Chip
            icon={functionIconConfig.icon}
            iconBg={functionIconConfig.iconBg}
            label={functionName}
            secondaryLabel={`· ${functionType}`}
            link={`/observability/functions/${functionName}`}
            font="mono"
          />
        </BasicInfoItemContent>
      </BasicInfoItem>

      <BasicInfoItem>
        <BasicInfoItemTitle>Dataset</BasicInfoItemTitle>
        <BasicInfoItemContent>
          <Chip
            label={datasetName}
            link={`/datasets/${datasetName}`}
            font="mono"
          />
        </BasicInfoItemContent>
      </BasicInfoItem>
    </BasicInfoLayout>
  );
}
