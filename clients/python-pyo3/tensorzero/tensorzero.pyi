from typing import (
    Any,
    AsyncGenerator,
    Awaitable,
    Dict,
    Generator,
    List,
    Literal,
    Optional,
    Union,
    final,
)
from uuid import UUID

from tensorzero import (
    FeedbackResponse,
    InferenceChunk,
    InferenceInput,
    InferenceResponse,
)

class BaseTensorZeroGateway:
    pass

@final
class TensorZeroGateway(BaseTensorZeroGateway):
    def __init__(self, base_url: str, *, timeout: Optional[float] = None):
        """
        Initialize the TensorZero client.

        :param base_url: The base URL of the TensorZero gateway. Example: "http://localhost:3000"
        """

    @classmethod
    def build_http(
        cls,
        *,
        gateway_url: str,
        timeout: Optional[float] = None,
        verbose_errors: bool = False,
    ) -> "TensorZeroGateway":
        """
        Initialize the TensorZero client, using the HTTP gateway.
        :param gateway_url: The base URL of the TensorZero gateway. Example: "http://localhost:3000"
        :param timeout: The timeout for the HTTP client in seconds. If not provided, no timeout will be set.
        :param verbose_errors: If true, the client will increase the detail in errors (increasing the risk of leaking sensitive information).
        :return: A `TensorZeroGateway` instance configured to use the HTTP gateway.
        """

    @classmethod
    def build_embedded(
        cls,
        *,
        config_file: Optional[str] = None,
        clickhouse_url: Optional[str] = None,
        timeout: Optional[float] = None,
    ) -> "TensorZeroGateway":
        """
        Build a TensorZeroGateway instance.

        :param config_file: (Optional) The path to the TensorZero configuration file.
        :param clickhouse_url: (Optional) The URL of the ClickHouse database.
        :param timeout: The timeout for embedded gateway request processing, in seconds. If this timeout is hit, any in-progress LLM requests may be aborted. If not provided, no timeout will be set.
        """

    def inference(
        self,
        *,
        input: InferenceInput,
        function_name: Optional[str] = None,
        model_name: Optional[str] = None,
        episode_id: Optional[UUID] = None,
        stream: Optional[bool] = None,
        params: Optional[Dict[str, Any]] = None,
        variant_name: Optional[str] = None,
        dryrun: Optional[bool] = None,
        output_schema: Optional[Dict[str, Any]] = None,
        allowed_tools: Optional[List[str]] = None,
        additional_tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[
            Union[Literal["auto", "required", "off"], Dict[Literal["specific"], str]]
        ] = None,
        parallel_tool_calls: Optional[bool] = None,
        internal: Optional[bool] = None,
        tags: Optional[Dict[str, str]] = None,
        credentials: Optional[Dict[str, str]] = None,
        cache_options: Optional[Dict[str, Any]] = None,
    ) -> Union[InferenceResponse, Generator[InferenceChunk, None, None]]:
        """
        Make a POST request to the /inference endpoint.

        :param function_name: The name of the function to call
        :param input: The input to the function
                      Structure: {"system": Optional[str], "messages": List[{"role": "user" | "assistant", "content": Any}]}
                      The input will be validated server side against the input schema of the function being called.
        :param episode_id: The episode ID to use for the inference.
                           If this is the first inference in an episode, leave this field blank. The TensorZero gateway will generate and return a new episode ID.
                           Note: Only use episode IDs generated by the TensorZero gateway. Don't generate them yourself.
        :param stream: If set, the TensorZero gateway will stream partial message deltas (e.g. generated tokens) as it receives them from model providers.
        :param params: Override inference-time parameters for a particular variant type. Currently, we support:
                        {"chat_completion": {"temperature": float, "max_tokens": int, "seed": int}}
        :param variant_name: If set, pins the inference request to a particular variant.
                             Note: You should generally not do this, and instead let the TensorZero gateway assign a
                             particular variant. This field is primarily used for testing or debugging purposes.
        :param dryrun: If true, the request will be executed but won't be stored to the database.
        :param output_schema: If set, the JSON schema of a JSON function call will be validated against the given JSON Schema.
                              Overrides the output schema configured for the function.
        :param allowed_tools: If set, restricts the tools available during this inference request.
                              The list of names should be a subset of the tools configured for the function.
                              Tools provided at inference time in `additional_tools` (if any) are always available.
        :param additional_tools: A list of additional tools to use for the request. Each element should look like {"name": str, "parameters": valid JSON Schema, "description": str}
        :param tool_choice: If set, overrides the tool choice strategy for the request.
                            It should be one of: "auto", "required", "off", or {"specific": str}. The last option pins the request to a specific tool name.
        :param parallel_tool_calls: If true, the request will allow for multiple tool calls in a single inference request.
        :param tags: If set, adds tags to the inference request.
        :return: If stream is false, returns an InferenceResponse.
                 If stream is true, returns an async generator that yields InferenceChunks as they come in.
        """

    def feedback(
        self,
        *,
        metric_name: str,
        value: Any,
        inference_id: Optional[UUID] = None,
        episode_id: Optional[UUID] = None,
        dryrun: Optional[bool] = None,
        internal: Optional[bool] = None,
        tags: Optional[Dict[str, str]] = None,
    ) -> FeedbackResponse:
        """
        Make a POST request to the /feedback endpoint.

        :param metric_name: The name of the metric to provide feedback for
        :param value: The value of the feedback. It should correspond to the metric type.
        :param inference_id: The inference ID to assign the feedback to.
                             Only use inference IDs that were returned by the TensorZero gateway.
                             Note: You can assign feedback to either an episode or an inference, but not both.
        :param episode_id: The episode ID to use for the request
                           Only use episode IDs that were returned by the TensorZero gateway.
                           Note: You can assign feedback to either an episode or an inference, but not both.
        :param dryrun: If true, the feedback request will be executed but won't be stored to the database (i.e. no-op).
        :param tags: If set, adds tags to the feedback request.
        :return: {"feedback_id": str}
        """

    def close(self) -> None:
        """
        Close the connection to the TensorZero gateway.
        """

    def __enter__(self) -> "TensorZeroGateway": ...
    def __exit__(
        self,
        exc_type: Optional[type],
        exc_val: Optional[BaseException],
        exc_tb: Optional[object],
    ) -> None: ...

@final
class AsyncTensorZeroGateway(BaseTensorZeroGateway):
    def __init__(self, base_url: str, *, timeout: Optional[float] = None):
        """
        Initialize the TensorZero client.

        :param base_url: The base URL of the TensorZero gateway. Example: "http://localhost:3000"
        """

    @classmethod
    async def build_http(
        cls,
        *,
        gateway_url: str,
        timeout: Optional[float] = None,
        verbose_errors: bool = False,
        async_setup: bool = True,
    ) -> "AsyncTensorZeroGateway":
        """
        Initialize the TensorZero client, using the HTTP gateway.
        :param gateway_url: The base URL of the TensorZero gateway. Example: "http://localhost:3000"
        :param timeout: The timeout for the HTTP client in seconds. If not provided, no timeout will be set.
        :param verbose_errors: If true, the client will increase the detail in errors (increasing the risk of leaking sensitive information).
        :param async_setup (Optional): If True, this method will return a `Future` that resolves to an `AsyncTensorZeroGateway` instance. Otherwise, it will block and return an `AsyncTensorZeroGateway` directly.
        :return: An `AsyncTensorZeroGateway` instance configured to use the HTTP gateway.
        """

    @classmethod
    async def build_embedded(
        cls,
        *,
        config_file: Optional[str] = None,
        clickhouse_url: Optional[str] = None,
        timeout: Optional[float] = None,
        async_setup: bool = True,
    ) -> "AsyncTensorZeroGateway":
        """
        Build an AsyncTensorZeroGateway instance.

        :param config_file: (Optional) The path to the TensorZero configuration file.
        :param clickhouse_url: (Optional) The URL of the ClickHouse database.
        :param timeout: The timeout for embedded gateway request processing, in seconds. If this timeout is hit, any in-progress LLM requests may be aborted. If not provided, no timeout will be set.
        :param async_setup (Optional): If True, this method will return a `Future` that resolves to an `AsyncTensorZeroGateway` instance. Otherwise, it will block and return an `AsyncTensorZeroGateway` directly.
        """

    async def inference(  # type: ignore[override]
        self,
        *,
        input: InferenceInput,
        function_name: Optional[str] = None,
        model_name: Optional[str] = None,
        episode_id: Optional[UUID] = None,
        stream: Optional[bool] = None,
        params: Optional[Dict[str, Any]] = None,
        variant_name: Optional[str] = None,
        dryrun: Optional[bool] = None,
        output_schema: Optional[Dict[str, Any]] = None,
        allowed_tools: Optional[List[str]] = None,
        additional_tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[
            Union[Literal["auto", "required", "off"], Dict[Literal["specific"], str]]
        ] = None,
        parallel_tool_calls: Optional[bool] = None,
        internal: Optional[bool] = None,
        tags: Optional[Dict[str, str]] = None,
        credentials: Optional[Dict[str, str]] = None,
        cache_options: Optional[Dict[str, Any]] = None,
    ) -> Union[InferenceResponse, AsyncGenerator[InferenceChunk, None]]:
        """
        Make a POST request to the /inference endpoint.

        :param function_name: The name of the function to call
        :param input: The input to the function
                      Structure: {"system": Optional[str], "messages": List[{"role": "user" | "assistant", "content": Any}]}
                      The input will be validated server side against the input schema of the function being called.
        :param episode_id: The episode ID to use for the inference.
                           If this is the first inference in an episode, leave this field blank. The TensorZero gateway will generate and return a new episode ID.
                           Note: Only use episode IDs generated by the TensorZero gateway. Don't generate them yourself.
        :param stream: If set, the TensorZero gateway will stream partial message deltas (e.g. generated tokens) as it receives them from model providers.
        :param params: Override inference-time parameters for a particular variant type. Currently, we support:
                        {"chat_completion": {"temperature": float, "max_tokens": int, "seed": int}}
        :param variant_name: If set, pins the inference request to a particular variant.
                             Note: You should generally not do this, and instead let the TensorZero gateway assign a
                             particular variant. This field is primarily used for testing or debugging purposes.
        :param dryrun: If true, the request will be executed but won't be stored to the database.
        :param output_schema: If set, the JSON schema of a JSON function call will be validated against the given JSON Schema.
                              Overrides the output schema configured for the function.
        :param allowed_tools: If set, restricts the tools available during this inference request.
                              The list of names should be a subset of the tools configured for the function.
                              Tools provided at inference time in `additional_tools` (if any) are always available.
        :param additional_tools: A list of additional tools to use for the request. Each element should look like {"name": str, "parameters": valid JSON Schema, "description": str}
        :param tool_choice: If set, overrides the tool choice strategy for the request.
                            It should be one of: "auto", "required", "off", or {"specific": str}. The last option pins the request to a specific tool name.
        :param parallel_tool_calls: If true, the request will allow for multiple tool calls in a single inference request.
        :param tags: If set, adds tags to the inference request.
        :return: If stream is false, returns an InferenceResponse.
                 If stream is true, returns an async generator that yields InferenceChunks as they come in.
        """

    async def feedback(  # type: ignore[override]
        self,
        *,
        metric_name: str,
        value: Any,
        inference_id: Optional[UUID] = None,
        episode_id: Optional[UUID] = None,
        dryrun: Optional[bool] = None,
        internal: Optional[bool] = None,
        tags: Optional[Dict[str, str]] = None,
    ) -> FeedbackResponse:
        """
        Make a POST request to the /feedback endpoint.

        :param metric_name: The name of the metric to provide feedback for
        :param value: The value of the feedback. It should correspond to the metric type.
        :param inference_id: The inference ID to assign the feedback to.
                             Only use inference IDs that were returned by the TensorZero gateway.
                             Note: You can assign feedback to either an episode or an inference, but not both.
        :param episode_id: The episode ID to use for the request
                           Only use episode IDs that were returned by the TensorZero gateway.
                           Note: You can assign feedback to either an episode or an inference, but not both.
        :param dryrun: If true, the feedback request will be executed but won't be stored to the database (i.e. no-op).
        :param tags: If set, adds tags to the feedback request.
        :return: {"feedback_id": str}
        """

    async def close(self) -> None:
        """
        Close the connection to the TensorZero gateway.
        """

    async def __aenter__(self) -> "AsyncTensorZeroGateway": ...
    async def __aexit__(
        self,
        exc_type: Optional[type],
        exc_val: Optional[BaseException],
        exc_tb: Optional[object],
    ) -> None: ...

# Internal helper method
def _start_http_gateway(
    *,
    config_file: Optional[str],
    clickhouse_url: Optional[str],
    async_setup: bool,
) -> Union[Any, Awaitable[Any]]: ...
@final
class LocalHttpGateway(object):
    base_url: str

    def close(self) -> None: ...

__all__ = [
    "AsyncTensorZeroGateway",
    "BaseTensorZeroGateway",
    "TensorZeroGateway",
    "LocalHttpGateway",
    "_start_http_gateway",
]
