"""
Web search tools using Tavily SDK.

This module provides tools for web search, content extraction, and crawling
using the Tavily API.
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


class WebSearchToolConfig(BaseToolConfig):
    """Configuration for web search tools.
    
    IMPORTANT: The api_key is set via environment variable (TAVILY_API_KEY) and should not be
    modified by the LLM. Only change other parameters if you encounter errors or failures.
    
    Default values:
    - max_results: 5 (good for most queries, increase for comprehensive searches)
    - search_depth: "basic" (faster, use "advanced" for more thorough results)
    - timeout: 60.0 seconds (standard timeout, increase if getting timeout errors)
    """
    
    api_key: str | None = Field(default=None, description="Tavily API key (set via TAVILY_API_KEY environment variable)")
    max_results: int = Field(default=5, description="Maximum number of search results (default: 5)")
    search_depth: str = Field(default="basic", description="Search depth: 'basic' (default) or 'advanced'")
    timeout: float = Field(default=60.0, description="Timeout in seconds (default: 60.0)")


class WebSearchArgs(BaseModel):
    """Arguments for web search.
    
    Use only the 'query' parameter for most searches. Only modify other parameters if you
    need specific filtering or formatting. Default values are optimized for general use.
    
    Default values:
    - topic: "general" (default, use "news" or "finance" only for specific content)
    - time_range: None (default, use only when searching for recent content)
    - start_date/end_date: None (default, use only for date-specific searches)
    - include_answer: False (default, enable only if you need LLM-generated summary)
    - include_images: False (default, enable only if you need image results)
    - include_image_descriptions: False (default, enable only with include_images)
    - include_domains/exclude_domains: [] (default, use only for specific domain filtering)
    - country: None (default, use only to boost results from specific country)
    """
    
    query: str = Field(..., description="Search query")
    topic: str = Field(default="general", description="Search topic: 'general' (default), 'news', or 'finance'")
    time_range: str | None = Field(default=None, description="Time range: 'day', 'week', 'month', 'year' (default: None)")
    start_date: str | None = Field(default=None, description="Start date in YYYY-MM-DD format (default: None)")
    end_date: str | None = Field(default=None, description="End date in YYYY-MM-DD format (default: None)")
    include_answer: bool = Field(default=False, description="Include LLM-generated answer (default: False)")
    include_images: bool = Field(default=False, description="Include images in results (default: False)")
    include_image_descriptions: bool = Field(default=False, description="Include image descriptions (default: False)")
    include_domains: list[str] = Field(default_factory=list, description="Domains to include (default: [])")
    exclude_domains: list[str] = Field(default_factory=list, description="Domains to exclude (default: [])")
    country: str | None = Field(default=None, description="Country to boost results from (default: None)")


class WebSearchResult(BaseModel):
    """Result of a web search."""
    
    query: str
    results: list[dict[str, Any]]
    response_time: float
    request_id: str
    answer: str | None = None
    images: list[str] | list[dict[str, str]] | None = None


class WebSearchState(BaseToolState):
    """State for web search tool."""
    
    last_query: str | None = None
    last_results_count: int = 0
    total_requests: int = 0


class WebSearch(BaseTool[WebSearchArgs, WebSearchResult, WebSearchToolConfig, WebSearchState]):
    """
    Perform web searches using Tavily API.
    
    Search the web for information, news, or financial data. Results include
    titles, URLs, content snippets, and relevance scores.
    """
    
    config: WebSearchToolConfig
    state: WebSearchState = Field(default_factory=WebSearchState)
    
    async def run(
        self, args: WebSearchArgs, ctx: InvokeContext | None = None
    ) -> AsyncGenerator[ToolStreamEvent | WebSearchResult, None]:
        """Run the web search tool."""
        from os import getenv
        from tavily import TavilyClient
        
        # Get API key from config or environment variable
        api_key = self.config.api_key if self.config.api_key else getenv("TAVILY_API_KEY")
        if not api_key:
            raise ValueError("Tavily API key not provided. Set TAVILY_API_KEY environment variable or provide api_key in config.")
        
        # Create Tavily client
        client = TavilyClient(api_key=api_key)
        
        # Prepare search parameters
        search_params = {
            "query": args.query,
            "max_results": self.config.max_results,
            "search_depth": self.config.search_depth,
            "topic": args.topic,
            "timeout": self.config.timeout,
        }
        
        # Add optional parameters
        if args.time_range:
            search_params["time_range"] = args.time_range
        if args.start_date:
            search_params["start_date"] = args.start_date
        if args.end_date:
            search_params["end_date"] = args.end_date
        if args.include_answer:
            search_params["include_answer"] = args.include_answer
        if args.include_images:
            search_params["include_images"] = args.include_images
        if args.include_image_descriptions:
            search_params["include_image_descriptions"] = args.include_image_descriptions
        if args.include_domains:
            search_params["include_domains"] = args.include_domains
        if args.exclude_domains:
            search_params["exclude_domains"] = args.exclude_domains
        if args.country:
            search_params["country"] = args.country
        
        # Execute search
        response = client.search(**search_params)
        
        # Update state
        self.state.last_query = args.query
        self.state.last_results_count = len(response["results"])
        self.state.total_requests += 1
        
        # Return result
        result = WebSearchResult(
            query=response["query"],
            results=response["results"],
            response_time=response["response_time"],
            request_id=response["request_id"],
            answer=response.get("answer"),
            images=response.get("images"),
        )
        yield result
