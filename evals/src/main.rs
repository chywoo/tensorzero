use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{anyhow, bail, Result};
use clap::Parser;
use evals::evaluators::evaluate_inference;
use evals::helpers::{get_tool_params_args, resolved_input_to_input};
use evals::TensorZeroClientWithSemaphore;
use tensorzero::{
    CacheParamsOptions, ClientBuilder, ClientBuilderMode, ClientInferenceParams, DynamicToolParams,
    InferenceOutput, InferenceParams, InferenceResponse,
};
use tensorzero_internal::cache::CacheEnabledMode;
use tensorzero_internal::clickhouse::ClickHouseConnectionInfo;
use tensorzero_internal::config_parser::Config;
use tensorzero_internal::endpoints::datasets::Datapoint;
use tensorzero_internal::function::FunctionConfig;
use tokio::sync::Semaphore;
use uuid::Uuid;

use tokio::task::JoinSet;
use url::Url;

use evals::dataset::query_dataset;

const CACHE_OPTIONS: CacheParamsOptions = CacheParamsOptions {
    enabled: CacheEnabledMode::On,
    max_age_s: None,
};

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    /// Path to tensorzero.toml.
    #[arg(short, long, default_value = "./config/tensorzero.toml")]
    config_file: PathBuf,

    /// URL of a running TensorZero HTTP gateway server to use for requests. This runs evals using that gateway.
    #[arg(short, long)]
    gateway_url: Option<Url>,

    /// Name of the eval to run.
    #[arg(short, long)]
    name: String,

    /// Name of the variant to run.
    #[arg(short, long)]
    variant: String,

    /// Number of concurrent requests to make.
    #[arg(short, long, default_value = "1")]
    concurrency: usize,
}

/*
Outstanding TODOs:
 - unit tests all over
 - documentation
 - concurrency
*/

#[tokio::main]
async fn main() -> Result<()> {
    let eval_run_id = Uuid::now_v7();
    let subscriber = tracing_subscriber::FmtSubscriber::new();
    tracing::subscriber::set_global_default(subscriber)
        .map_err(|e| anyhow!("Failed to initialize tracing: {}", e))?;
    let args = Args::parse();
    let semaphore = Semaphore::new(args.concurrency);
    let clickhouse_url = std::env::var("TENSORZERO_CLICKHOUSE_URL")
        .map_err(|_| anyhow!("Missing ClickHouse URL at TENSORZERO_CLICKHOUSE_URL"))?;

    let config = Config::load_and_verify_from_path(&args.config_file).await?;
    let function_config = config.get_function(&args.name)?;
    let eval_config = config
        .evals
        .get(&args.name)
        .ok_or(anyhow!("Eval not found"))?;
    #[allow(unused)]
    let tensorzero_client = match args.gateway_url {
        Some(gateway_url) => {
            ClientBuilder::new(ClientBuilderMode::HTTPGateway { url: gateway_url })
        }
        None => ClientBuilder::new(ClientBuilderMode::EmbeddedGateway {
            config_file: Some(args.config_file),
            clickhouse_url: Some(clickhouse_url.clone()),
        }),
    }
    .build()
    .await
    .map_err(|e| anyhow!("Failed to build client: {}", e))?;
    let tensorzero_client_with_semaphore = Arc::new(TensorZeroClientWithSemaphore::new(
        tensorzero_client,
        semaphore,
    ));

    let clickhouse_client = ClickHouseConnectionInfo::new(&clickhouse_url).await?;
    let mut join_set = JoinSet::new();

    let dataset = query_dataset(
        &clickhouse_client,
        &eval_config.dataset_name,
        &eval_config.function_name,
        function_config,
    )
    .await?;
    let variant = Arc::new(args.variant);
    let eval_name = Arc::new(args.name);

    // Spawn concurrent tasks for each datapoint
    for datapoint in dataset {
        let client_clone = tensorzero_client_with_semaphore.clone();
        let variant = variant.clone();
        let function_config = function_config.clone();
        let eval_config = eval_config.clone();
        let eval_name = eval_name.clone();
        let eval_run_id_clone = eval_run_id;

        join_set.spawn(async move {
            let inference_response = infer_datapoint(
                &client_clone,
                &eval_config.function_name,
                &variant,
                eval_run_id_clone,
                &datapoint,
                &function_config,
            )
            .await?;

            let eval_result = evaluate_inference(
                &inference_response,
                &datapoint,
                &eval_config,
                &eval_name,
                &client_clone,
                eval_run_id_clone,
            )
            .await?;

            Ok::<(InferenceResponse, evals::evaluators::EvalResult), anyhow::Error>((
                inference_response,
                eval_result,
            ))
        });
    }

    // Collect results
    let mut inference_responses = Vec::new();
    let mut eval_results = Vec::new();

    while let Some(result) = join_set.join_next().await {
        match result {
            Ok(Ok((inference_response, eval_result))) => {
                inference_responses.push(inference_response);
                eval_results.push(eval_result);
            }
            Ok(Err(e)) => {
                tracing::warn!("Task error: {}", e);
            }
            Err(e) => {
                tracing::warn!("Failed to join task: {}", e);
            }
        }
    }

    // TODO: what should we do with stdout here?
    Ok(())
}

async fn infer_datapoint(
    tensorzero_client: &TensorZeroClientWithSemaphore,
    function_name: &str,
    variant_name: &str,
    eval_run_id: Uuid,
    datapoint: &Datapoint,
    function_config: &FunctionConfig,
) -> Result<InferenceResponse> {
    let input = resolved_input_to_input(datapoint.input().clone()).await?;
    let dynamic_tool_params = match datapoint.tool_call_config() {
        Some(tool_params) => get_tool_params_args(tool_params, function_config).await,
        None => DynamicToolParams::default(),
    };
    let output_schema = datapoint.output_schema();
    let params = ClientInferenceParams {
        function_name: Some(function_name.to_string()),
        variant_name: Some(variant_name.to_string()),
        input,
        tags: HashMap::from([(
            "tensorzero::eval_run_id".to_string(),
            eval_run_id.to_string(),
        )]),
        dynamic_tool_params,
        output_schema: output_schema.cloned(),
        credentials: HashMap::new(),
        cache_options: CACHE_OPTIONS,
        dryrun: Some(false),
        episode_id: None,
        model_name: None,
        stream: Some(false),
        params: InferenceParams::default(),
    };
    let inference_result = tensorzero_client.inference(params).await?;
    match inference_result {
        InferenceOutput::NonStreaming(inference_response) => Ok(inference_response),
        InferenceOutput::Streaming(_inference_stream) => {
            bail!("Streaming inference should never happen in evals")
        }
    }
}
