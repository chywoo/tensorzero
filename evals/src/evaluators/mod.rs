use std::collections::HashMap;
use std::sync::Arc;

use anyhow::Result;
use serde_json::Value;
use tensorzero::{FeedbackParams, InferenceResponse};
use tensorzero_internal::endpoints::datasets::Datapoint;
use tensorzero_internal::evals::{get_evaluator_metric_name, EvalConfig, EvaluatorConfig};
use tokio::task::JoinSet;

mod exact_match;
use exact_match::run_exact_match_evaluator;
mod llm_judge;
use llm_judge::run_llm_judge_evaluator;
use uuid::Uuid;

use crate::ThrottledTensorZeroClient;

pub type EvalResult = HashMap<String, Result<Option<Value>>>;

pub async fn evaluate_inference(
    inference_response: Arc<InferenceResponse>,
    datapoint: Arc<Datapoint>,
    eval_config: Arc<EvalConfig>,
    eval_name: Arc<String>,
    tensorzero_client: Arc<ThrottledTensorZeroClient>,
    eval_run_id: Uuid,
) -> Result<EvalResult> {
    let mut task_set = JoinSet::new();
    for evaluator_name in eval_config.evaluators.keys() {
        let inference_response = inference_response.clone();
        let eval_config = eval_config.clone();
        let evaluator_name = evaluator_name.clone();
        let datapoint = datapoint.clone();
        let eval_name = eval_name.clone();
        let tensorzero_client = tensorzero_client.clone();
        task_set.spawn(async move {
            run_evaluator(
                &eval_config,
                evaluator_name,
                &inference_response,
                &tensorzero_client,
                &datapoint,
                &eval_name,
                eval_run_id,
            )
            .await
        });
    }
    let mut results = EvalResult::new();
    while let Some(join_result) = task_set.join_next().await {
        let (evaluator_name, result) = join_result?;
        if let Ok(Some(value)) = &result {
            // If there is a valid result, send feedback to TensorZero
            tensorzero_client
                .feedback(FeedbackParams {
                    metric_name: get_evaluator_metric_name(&eval_name, &evaluator_name),
                    value: value.clone(),
                    inference_id: Some(inference_response.inference_id()),
                    dryrun: Some(false),
                    episode_id: None,
                    tags: HashMap::from([(
                        "tensorzero::eval_run_id".to_string(),
                        eval_run_id.to_string(),
                    )]),
                })
                .await?;
        }
        results.insert(evaluator_name, result);
    }
    Ok(results)
}

async fn run_evaluator(
    eval_config: &EvalConfig,
    evaluator_name: String,
    inference_response: &InferenceResponse,
    tensorzero_client: &ThrottledTensorZeroClient,
    datapoint: &Datapoint,
    eval_name: &str,
    eval_run_id: Uuid,
) -> (String, Result<Option<Value>>) {
    let evaluator_config = match eval_config.evaluators.get(&evaluator_name) {
        Some(evaluator_config) => evaluator_config,
        None => {
            return (
                evaluator_name.clone(),
                Err(anyhow::anyhow!("Evaluator config not found for {}. This should never happen. Please file a bug report at https://github.com/tensorzero/tensorzero/discussions/categories/bug-reports.", evaluator_name)),
            );
        }
    };
    let result = match evaluator_config {
        EvaluatorConfig::ExactMatch => run_exact_match_evaluator(inference_response, datapoint),
        EvaluatorConfig::LLMJudge(llm_judge_config) => {
            run_llm_judge_evaluator(
                inference_response,
                datapoint,
                tensorzero_client,
                llm_judge_config,
                eval_name,
                &evaluator_name,
                eval_run_id,
            )
            .await
        }
    };
    (evaluator_name.to_string(), result)
}
