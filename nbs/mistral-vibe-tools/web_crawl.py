"""
Web crawling tool using Tavily SDK.

This module provides a tool for crawling websites and extracting content.
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


class WebCrawlToolConfig(BaseToolConfig):
    """Configuration for web crawling tool.
    
    IMPORTANT: The api_key is set via environment variable (TAVILY_API_KEY) and should not be
    modified by the LLM. Only change other parameters if you encounter errors or failures.
    
    Default values:
    - max_depth: 1 (default, good for most websites)
    - max_breadth: 20 (default, good balance between coverage and performance)
    - limit: 50 (default, good for comprehensive but not excessive crawling)
    - extract_depth: "basic" (default, use "advanced" for more thorough extraction)
    - format: "markdown" (default, use "text" for plain text)
    - timeout: 150.0 seconds (default, increased for crawling operations)
    - chunks_per_source: 3 (default, good balance between detail and length)
    """
    
    api_key: str | None = Field(default=None, description="Tavily API key (set via TAVILY_API_KEY environment variable)")
    max_depth: int = Field(default=1, description="Max depth of the crawl (default: 1)")
    max_breadth: int = Field(default=20, description="Max number of links per level (default: 20)")
    limit: int = Field(default=50, description="Total number of links to process (default: 50)")
    extract_depth: str = Field(default="basic", description="Extraction depth: 'basic' (default) or 'advanced'")
    format: str = Field(default="markdown", description="Format: 'markdown' (default) or 'text'")
    timeout: float = Field(default=150.0, description="Timeout in seconds (default: 150.0)")
    chunks_per_source: int = Field(default=3, description="Chunks per source (1-5, default: 3)")


class WebCrawlArgs(BaseModel):
    """Arguments for web crawling.
    
    Use only the 'url' parameter for most crawls. Only modify other parameters if you
    need specific filtering or formatting. Default values are optimized for general use.
    
    Default values:
    - instructions: None (default, use only for specific crawling instructions)
    - select_paths/select_domains: None (default, use only for specific path/domain selection)
    - exclude_paths/exclude_domains: None (default, use only for specific exclusions)
    - allow_external: True (default, disable only if you want to stay on the same domain)
    - include_images: False (default, enable only if you need images)
    - include_favicon: False (default, enable only if you need favicon URLs)
    """
    
    url: str = Field(..., description="Root URL to begin the crawl")
    instructions: str | None = Field(default=None, description="Natural language instructions for the crawler (default: None)")
    select_paths: list[str] | None = Field(default=None, description="Regex patterns to select specific paths (default: None)")
    select_domains: list[str] | None = Field(default=None, description="Regex patterns to select specific domains (default: None)")
    exclude_paths: list[str] | None = Field(default=None, description="Regex patterns to exclude specific paths (default: None)")
    exclude_domains: list[str] | None = Field(default=None, description="Regex patterns to exclude specific domains (default: None)")
    allow_external: bool = Field(default=True, description="Allow following links to external domains (default: True)")
    include_images: bool = Field(default=False, description="Include images in results (default: False)")
    include_favicon: bool = Field(default=False, description="Include favicon URLs (default: False)")


class WebCrawlResult(BaseModel):
    """Result of web crawling."""
    
    base_url: str
    results: list[dict[str, Any]]
    response_time: float
    request_id: str


class WebCrawlState(BaseToolState):
    """State for web crawling tool."""
    
    last_base_url: str | None = None
    last_page_count: int = 0
    total_requests: int = 0


class WebCrawl(BaseTool[WebCrawlArgs, WebCrawlResult, WebCrawlToolConfig, WebCrawlState]):
    """
    Crawl websites and extract content using Tavily API.
    
    Start from a base URL and crawl linked pages, extracting content and metadata.
    Useful for gathering information from entire websites or specific sections.
    """
    
    config: WebCrawlToolConfig
    state: WebCrawlState = Field(default_factory=WebCrawlState)
    
    async def run(
        self, args: WebCrawlArgs, ctx: InvokeContext | None = None
    ) -> AsyncGenerator[ToolStreamEvent | WebCrawlResult, None]:
        """Run the web crawling tool."""
        from os import getenv
        from tavily import TavilyClient
        
        # Get API key from config or environment variable
        api_key = self.config.api_key if self.config.api_key else getenv("TAVILY_API_KEY")
        if not api_key:
            raise ValueError("Tavily API key not provided. Set TAVILY_API_KEY environment variable or provide api_key in config.")
        
        # Create Tavily client
        client = TavilyClient(api_key=api_key)
        
        # Prepare crawl parameters
        crawl_params = {
            "url": args.url,
            "max_depth": self.config.max_depth,
            "max_breadth": self.config.max_breadth,
            "limit": self.config.limit,
            "extract_depth": self.config.extract_depth,
            "format": self.config.format,
            "timeout": self.config.timeout,
            "chunks_per_source": self.config.chunks_per_source,
        }
        
        # Add optional parameters
        if args.instructions:
            crawl_params["instructions"] = args.instructions
        if args.select_paths:
            crawl_params["select_paths"] = args.select_paths
        if args.select_domains:
            crawl_params["select_domains"] = args.select_domains
        if args.exclude_paths:
            crawl_params["exclude_paths"] = args.exclude_paths
        if args.exclude_domains:
            crawl_params["exclude_domains"] = args.exclude_domains
        crawl_params["allow_external"] = args.allow_external
        if args.include_images:
            crawl_params["include_images"] = args.include_images
        if args.include_favicon:
            crawl_params["include_favicon"] = args.include_favicon
        
        # Execute crawl
        response = client.crawl(**crawl_params)
        
        # Update state
        self.state.last_base_url = args.url
        self.state.last_page_count = len(response["results"])
        self.state.total_requests += 1
        
        # Return result
        result = WebCrawlResult(
            base_url=response["base_url"],
            results=response["results"],
            response_time=response["response_time"],
            request_id=response["request_id"],
        )
        yield result
