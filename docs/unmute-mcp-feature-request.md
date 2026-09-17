# FEATURE: Add Model Context Protocol (MCP) Support to Unmute

## Overview

Add support for the Model Context Protocol (MCP) to Unmute, enabling LLMs to access external tools and data sources through a standardized protocol. This would transform Unmute from a voice conversation system into a voice-enabled action platform.

## Background

MCP is an open standard by Anthropic that allows AI assistants to connect to external tools and data sources. By integrating MCP into Unmute, users could:

- Query databases and APIs via voice
- Control system functions through natural language
- Access local files and resources
- Execute tools with voice commands

This feature request originates from our work on Nod.ie (https://github.com/knowall-ai/Nod.ie/issues/1), where we explored various approaches and concluded that implementing MCP at the Unmute level would benefit the entire ecosystem.

## Proposed Implementation

### 1. MCP Client Integration

Add an MCP manager to the Unmute backend that:
- Connects to configured MCP servers
- Provides context to the LLM before generating responses
- Handles tool execution requests from the LLM

```python
# unmute/mcp_manager.py
class MCPManager:
    def __init__(self, config_path='mcp_servers.yaml'):
        self.servers = {}
        self.load_config(config_path)
    
    async def get_context(self, user_input):
        """Gather relevant context from MCP servers"""
        # Query connected servers for relevant resources
```

### 2. Configuration System

Use a YAML configuration file for MCP servers:

```yaml
# mcp_servers.yaml
servers:
  - name: datetime
    transport: stdio
    command: ["python", "-m", "mcp_datetime"]
    enabled: true
    description: "Provides current date/time information"
```

### 3. LLM Integration

Enhance the chatbot to:
- Include MCP context in prompts
- Parse LLM responses for tool calls
- Execute tools and return results

### 4. WebSocket Protocol Extensions

Add new message types for MCP management:
- `mcp.servers.list` - List available MCP servers
- `mcp.servers.status` - Get connection status
- `mcp.tools.available` - List available tools

## Benefits

1. **Enhanced Capabilities**: Voice interfaces can now perform actions, not just conversations
2. **Extensibility**: Users can add any MCP server for custom functionality
3. **Standards-based**: Uses the open MCP standard
4. **Minimal Overhead**: MCP servers run as separate processes

## Example Use Cases

```
User: "What time is it in Tokyo?"
[MCP provides timezone data]
Assistant: "It's 3:45 PM in Tokyo"

User: "List the files on my desktop"
[MCP filesystem server provides data]
Assistant: "You have 5 documents and 3 images on your desktop"

User: "Check my database for today's orders"
[MCP database server queries data]
Assistant: "You have 47 orders today totaling $3,250"
```

## Implementation Approach

1. Start with a simple built-in MCP server (datetime) for testing
2. Add configuration system for user-provided servers
3. Implement context injection into LLM prompts
4. Add tool execution capabilities
5. Create tests and documentation

## Minimal Footprint

To avoid bloating Unmute:
- Include only a simple datetime MCP server for testing
- Users configure their own MCP servers
- MCP support can be disabled entirely if not needed

## Related Work

- MCP Specification: https://modelcontextprotocol.io/
- Nod.ie Integration Discussion: https://github.com/knowall-ai/Nod.ie/issues/1
- Our fork with initial exploration: https://github.com/knowall-ai/unmute

We're happy to contribute this implementation if there's interest from the Unmute team.