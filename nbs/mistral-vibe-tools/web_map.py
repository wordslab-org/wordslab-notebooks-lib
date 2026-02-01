"""
Web sitemap tool using Tavily SDK.

This module provides a tool for generating sitemaps from websites.
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


class WebMapToolConfig(BaseToolConfig):
    """Configuration for web mapping tool.
    
    IMPORTANT: The api_key is set via environment variable (TAVILY_API_KEY) and should not be
    modified by the LLM. Only change other parameters if you encounter errors or failures.
    
    Default values:
    - max_depth: 1 (default, good for most websites)
    - max_breadth: 20 (default, good balance between coverage and performance)
    - limit: 50 (default, good for comprehensive but not excessive mapping)
    - timeout: 150.0 seconds (default, increased for mapping operations)
    """
    
    api_key: str | None = Field(default=None, description="Tavily API key (set via TAVILY_API_KEY environment variable)")
    max_depth: int = Field(default=1, description="Max depth of the mapping (default: 1)")
    max_breadth: int = Field(default=20, description="Max number of links per level (default: 20)")
    limit: int = Field(default=50, description="Total number of links to process (default: 50)")
    timeout: float = Field(default=150.0, description="Timeout in seconds (default: 150.0)")


class WebMapArgs(BaseModel):
    """Arguments for web mapping.
    
    Use only the 'url' parameter for most mappings. Only modify other parameters if you
    need specific filtering. Default values are optimized for general use.
    
    Default values:
    - instructions: None (default, use only for specific mapping instructions)
    - select_paths/select_domains: None (default, use only for specific path/domain selection)
    - exclude_paths/exclude_domains: None (default, use only for specific exclusions)
    - allow_external: True (default, disable only if you want to stay on the same domain)
    """
    
    url: str = Field(..., description="Root URL to begin the mapping")
    instructions: str | None = Field(default=None, description="Natural language instructions for the crawler (default: None)")
    select_paths: list[str] | None = Field(default=None, description="Regex patterns to select specific paths (default: None)")
    select_domains: list[str] | None = Field(default=None, description="Regex patterns to select specific domains (default: None)")
    exclude_paths: list[str] | None = Field(default=None, description="Regex patterns to exclude specific paths (default: None)")
    exclude_domains: list[str] | None = Field(default=None, description="Regex patterns to exclude specific domains (default: None)")
    allow_external: bool = Field(default=True, description="Allow following links to external domains (default: True)")


class WebMapResult(BaseModel):
    """Result of web mapping."""
    
    base_url: str
    results: list[str]
    response_time: float
    request_id: str


class WebMapState(BaseToolState):
    """State for web mapping tool."""
    
    last_base_url: str | None = None
    last_url_count: int = 0
    total_requests: int = 0


class WebMap(BaseTool[WebMapArgs, WebMapResult, WebMapToolConfig, WebMapState]):
    """
    Generate sitemaps from websites using Tavily API.
    
    Start from a base URL and discover all linked pages, returning a list of URLs.
    Useful for understanding website structure and finding relevant pages.
    """
    
    config: WebMapToolConfig
    state: WebMapState = Field(default_factory=WebMapState)
    
    async def run(
        self, args: WebMapArgs, ctx: InvokeContext | None = None
    ) -> AsyncGenerator[ToolStreamEvent | WebMapResult, None]:
        """Run the web mapping tool."""
        from os import getenv
        from tavily import TavilyClient
        
        # Get API key from config or environment variable
        api_key = self.config.api_key if self.config.api_key else getenv("TAVILY_API_KEY")
        if not api_key:
            raise ValueError("Tavily API key not provided. Set TAVILY_API_KEY environment variable or provide api_key in config.")
        
        # Create Tavily client
        client = TavilyClient(api_key=api_key)
        
        # Prepare map parameters
        map_params = {
            "url": args.url,
            "max_depth": self.config.max_depth,
            "max_breadth": self.config.max_breadth,
            "limit": self.config.limit,
            "timeout": self.config.timeout,
        }
        
        # Add optional parameters
        if args.instructions:
            map_params["instructions"] = args.instructions
        if args.select_paths:
            map_params["select_paths"] = args.select_paths
        if args.select_domains:
            map_params["select_domains"] = args.select_domains
        if args.exclude_paths:
            map_params["exclude_paths"] = args.exclude_paths
        if args.exclude_domains:
            map_params["exclude_domains"] = args.exclude_domains
        map_params["allow_external"] = args.allow_external
        
        # Execute mapping
        response = client.map(**map_params)
        
        # Update state
        self.state.last_base_url = args.url
        self.state.last_url_count = len(response["results"])
        self.state.total_requests += 1
        
        # Return result
        result = WebMapResult(
            base_url=response["base_url"],
            results=response["results"],
            response_time=response["response_time"],
            request_id=response["request_id"],
        )
        yield result
