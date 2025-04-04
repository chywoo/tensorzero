use std::collections::HashMap;
use std::sync::Arc;

use anyhow::Result;
use serde_json::Value;
use tensorzero::{FeedbackParams, InferenceResponse};
use tensorzero_internal::endpoints::datasets::Datapoint;
use tensorzero_internal::evaluations::{
    get_evaluator_metric_name, EvaluationConfig, EvaluatorConfig,
};

mod exact_match;
use exact_match::run_exact_match_evaluator;
pub mod llm_judge;
use futures::stream::{FuturesUnordered, StreamExt};
use llm_judge::run_llm_judge_evaluator;
use uuid::Uuid;

use crate::ThrottledTensorZeroClient;

pub type EvaluationResult = HashMap<String, Result<Option<Value>>>;

/// Evaluates the inference response for the given datapoint using all the evaluators specified in the evaluation config.
/// Returns a map from evaluator name to Result<Option<Value>>.
/// The semantics of the Result<Option<Value>> are as follows:
/// - Ok(Some(value)): The evaluator was run successfully and the result was a valid value.
/// - Ok(None): The evaluator was run successfully but the result was None (if for example the evaluator requires a reference output but none is present).
/// - Err(e): The evaluator failed to run due to some error (like the LLM Judge failed to infer).
pub(crate) async fn evaluate_inference(
    inference_response: Arc<InferenceResponse>,
    datapoint: Arc<Datapoint>,
    evaluation_config: Arc<EvaluationConfig>,
    evaluation_name: Arc<String>,
    tensorzero_client: Arc<ThrottledTensorZeroClient>,
    evaluation_run_id: Uuid,
) -> Result<EvaluationResult> {
    let EvaluationConfig::Static(static_evaluation_config) = &*evaluation_config;
    let results: EvaluationResult =
        FuturesUnordered::from_iter(static_evaluation_config.evaluators.keys().map(
            |evaluator_name| async {
                let inference_response = inference_response.clone();
                let evaluation_config = evaluation_config.clone();
                let evaluator_name = evaluator_name.clone();
                let datapoint = datapoint.clone();
                let evaluation_name = evaluation_name.clone();
                let tensorzero_client = tensorzero_client.clone();
                let evaluator_name_clone = evaluator_name.clone();
                let evaluation_result = tokio::spawn(async move {
                    let result = run_evaluator(
                        &evaluation_config,
                        evaluator_name_clone.clone(),
                        &inference_response,
                        &tensorzero_client,
                        &datapoint,
                        &evaluation_name,
                        evaluation_run_id,
                    )
                    .await;
                    if let Ok(Some(value)) = &result {
                        // If there is a valid result, send feedback to TensorZero
                        tensorzero_client
                            .feedback(FeedbackParams {
                                metric_name: get_evaluator_metric_name(
                                    &evaluation_name,
                                    &evaluator_name_clone,
                                ),
                                value: value.clone(),
                                inference_id: Some(inference_response.inference_id()),
                                dryrun: Some(false),
                                episode_id: None,
                                internal: true,
                                tags: HashMap::from([
                                    (
                                        "tensorzero::evaluation_run_id".to_string(),
                                        evaluation_run_id.to_string(),
                                    ),
                                    (
                                        "tensorzero::datapoint_id".to_string(),
                                        datapoint.id().to_string(),
                                    ),
                                    (
                                        "tensorzero::evaluation_name".to_string(),
                                        evaluation_name.to_string(),
                                    ),
                                ]),
                            })
                            .await?;
                    }
                    result
                })
                .await
                .unwrap_or_else(|e| Err(anyhow::anyhow!("Failed to join task: {e}")));
                (evaluator_name, evaluation_result)
            },
        ))
        .collect()
        .await;
    Ok(results)
}

/// Runs the evaluator specified by evaluator_name on the given inference response and datapoint.
/// Returns Result<Option<Value>>.
///
/// The semantics of the Result<Option<Value>> are as follows:
/// - Ok(Some(value)): The evaluator was run successfully and the result was a valid value.
/// - Ok(None): The evaluator was run successfully but the result was None (if for example the evaluator requires a reference output but none is present).
/// - Err(e): The evaluator failed to run due to some error (like the LLM Judge failed to infer).
///
/// NOTE: Each evaluator we implement in the match statement below should follow this contract.
async fn run_evaluator(
    evaluation_config: &EvaluationConfig,
    evaluator_name: String,
    inference_response: &InferenceResponse,
    tensorzero_client: &ThrottledTensorZeroClient,
    datapoint: &Datapoint,
    evaluation_name: &str,
    evaluation_run_id: Uuid,
) -> Result<Option<Value>> {
    let EvaluationConfig::Static(static_evaluation_config) = evaluation_config;
    let evaluator_config = match static_evaluation_config.evaluators.get(&evaluator_name) {
        Some(evaluator_config) => evaluator_config,
        None => {
            return Err(anyhow::anyhow!("Evaluator config not found for {}. This should never happen. Please file a bug report at https://github.com/tensorzero/tensorzero/discussions/categories/bug-reports.", evaluator_name));
        }
    };
    match evaluator_config {
        EvaluatorConfig::ExactMatch(_exact_match_config) => {
            run_exact_match_evaluator(inference_response, datapoint)
        }
        EvaluatorConfig::LLMJudge(llm_judge_config) => {
            run_llm_judge_evaluator(
                inference_response,
                datapoint,
                tensorzero_client,
                llm_judge_config,
                evaluation_name,
                &evaluator_name,
                evaluation_run_id,
            )
            .await
        }
    }
}
