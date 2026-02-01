"""
Web content extraction tool using Tavily SDK.

This module provides a tool for extracting content from web pages.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from pydantic import BaseModel, Field

from vibe.core.tools.base import (
    BaseTool,
    BaseToolConfig,
    BaseToolState,
    InvokeContext,
    ToolStreamEvent,
)


class WebExtractToolConfig(BaseToolConfig):
    """Configuration for web extraction tool.
    
    IMPORTANT: The api_key is set via environment variable (TAVILY_API_KEY) and should not be
    modified by the LLM. Only change other parameters if you encounter errors or failures.
    
    Default values:
    - extract_depth: "basic" (default, use "advanced" for more thorough extraction)
    - format: "markdown" (default, use "text" for plain text)
    - timeout: None (default, uses Tavily's default timeout)
    - chunks_per_source: 3 (default, good balance between detail and length)
    """
    
    api_key: str | None = Field(default=None, description="Tavily API key (set via TAVILY_API_KEY environment variable)")
    extract_depth: str = Field(default="basic", description="Extraction depth: 'basic' (default) or 'advanced'")
    format: str = Field(default="markdown", description="Format: 'markdown' (default) or 'text'")
    timeout: float | None = Field(default=None, description="Timeout in seconds (default: None)")
    chunks_per_source: int = Field(default=3, description="Chunks per source (1-5, default: 3)")


class WebExtractArgs(BaseModel):
    """Arguments for web extraction.
    
    Use only the 'urls' parameter for most extractions. Only modify other parameters if you
    need specific formatting or filtering. Default values are optimized for general use.
    
    Default values:
    - include_images: False (default, enable only if you need images)
    - include_favicon: False (default, enable only if you need favicon URLs)
    - query: None (default, use only for reranking content chunks)
    """
    
    urls: str | list[str] = Field(..., description="URL or list of URLs to extract content from")
    include_images: bool = Field(default=False, description="Include images in results (default: False)")
    include_favicon: bool = Field(default=False, description="Include favicon URLs (default: False)")
    query: str | None = Field(default=None, description="Query for reranking content chunks (default: None)")


class WebExtractResult(BaseModel):
    """Result of web extraction."""
    
    results: list[dict[str, Any]]
    failed_results: list[dict[str, Any]]
    response_time: float
    request_id: str


class WebExtractState(BaseToolState):
    """State for web extraction tool."""
    
    last_urls: list[str] | None = None
    last_success_count: int = 0
    last_failure_count: int = 0
    total_requests: int = 0


class WebExtract(BaseTool[WebExtractArgs, WebExtractResult, WebExtractToolConfig, WebExtractState]):
    """
    Extract content from web pages using Tavily API.
    
    Extract and parse content from one or more web pages. Returns cleaned
    HTML content, images, and metadata for each successfully extracted page.
    """
    
    config: WebExtractToolConfig
    state: WebExtractState = Field(default_factory=WebExtractState)
    
    async def run(
        self, args: WebExtractArgs, ctx: InvokeContext | None = None
    ) -> AsyncGenerator[ToolStreamEvent | WebExtractResult, None]:
        """Run the web extraction tool."""
        from os import getenv
        from tavily import TavilyClient
        
        # Get API key from config or environment variable
        api_key = self.config.api_key if self.config.api_key else getenv("TAVILY_API_KEY")
        if not api_key:
            raise ValueError("Tavily API key not provided. Set TAVILY_API_KEY environment variable or provide api_key in config.")
        
        # Normalize URLs to list
        urls = args.urls if isinstance(args.urls, list) else [args.urls]
        
        # Create Tavily client
        client = TavilyClient(api_key=api_key)
        
        # Prepare extract parameters
        extract_params = {
            "urls": urls,
            "extract_depth": self.config.extract_depth,
            "format": self.config.format,
            "timeout": self.config.timeout,
            "chunks_per_source": self.config.chunks_per_source,
        }
        
        # Add optional parameters
        if args.include_images:
            extract_params["include_images"] = args.include_images
        if args.include_favicon:
            extract_params["include_favicon"] = args.include_favicon
        if args.query:
            extract_params["query"] = args.query
        
        # Execute extraction
        response = client.extract(**extract_params)
        
        # Update state
        self.state.last_urls = urls
        self.state.last_success_count = len(response["results"])
        self.state.last_failure_count = len(response["failed_results"])
        self.state.total_requests += 1
        
        # Return result
        result = WebExtractResult(
            results=response["results"],
            failed_results=response["failed_results"],
            response_time=response["response_time"],
            request_id=response["request_id"],
        )
        yield result
