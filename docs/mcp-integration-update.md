# MCP Integration Update - Alternative Approach

## Overview

After analyzing the original proposal and considering the architecture of both Nod.ie and Unmute, I'd like to propose an alternative approach: **implementing MCP support in the Unmute backend** rather than directly in Nod.ie.

## Why This Approach?

### 1. Architectural Alignment
- Unmute already serves as the orchestration layer between STT, LLM, and TTS
- Adding MCP at this level creates a complete "context-aware voice AI" platform
- Follows the principle of keeping complexity in the backend

### 2. Broader Impact
- Benefits all Unmute clients (web interface, Nod.ie, future apps)
- Creates value for the entire Unmute ecosystem
- Positions KnowAll AI as a significant contributor to the Unmute project

### 3. Cleaner Separation
- Nod.ie remains focused on being an excellent voice UI
- Unmute handles all AI orchestration including MCP
- Easier to maintain and debug

## Detailed Implementation Plan

### Phase 1: MCP Client Foundation in Unmute

**Location**: `knowall-ai/unmute` fork

1. **Add MCP Python SDK**
   ```python
   # unmute/mcp_manager.py
   from mcp import MCPClient, StdioTransport
   import yaml
   
   class MCPManager:
       def __init__(self, config_path='mcp_servers.yaml'):
           self.servers = {}
           self.load_config(config_path)
       
       def load_config(self, path):
           """Load MCP server configurations from YAML"""
           with open(path) as f:
               config = yaml.safe_load(f)
               for server_config in config['servers']:
                   if server_config.get('enabled', True):
                       self.connect_server(server_config)
       
       async def connect_server(self, config):
           """Connect to an MCP server"""
           transport = StdioTransport(config['command'])
           client = MCPClient(transport)
           await client.initialize()
           self.servers[config['name']] = client
   ```

2. **Configuration Format**
   ```yaml
   # mcp_servers.yaml
   servers:
     - name: datetime
       transport: stdio
       command: ["python", "-m", "mcp_datetime"]
       enabled: true
       description: "Provides current date/time in any timezone"
     
     # User can add their own servers
     - name: bitcoin
       transport: stdio
       command: ["mcp-server-bitcoin", "--network", "mainnet"]
       enabled: false
       description: "Bitcoin node operations"
   ```

3. **Integration with Chatbot**
   ```python
   # unmute/llm/chatbot.py modifications
   class Chatbot:
       def __init__(self, mcp_manager=None):
           self.mcp_manager = mcp_manager
           # ... existing code ...
       
       async def get_mcp_context(self, user_input):
           """Gather relevant context from MCP servers"""
           if not self.mcp_manager:
               return ""
           
           contexts = []
           for server_name, client in self.mcp_manager.servers.items():
               try:
                   # Query each server for relevant resources
                   resources = await client.list_resources()
                   # Filter based on user input
                   relevant = self.filter_relevant_resources(resources, user_input)
                   if relevant:
                       context = await client.read_resources(relevant)
                       contexts.append(f"[{server_name}]: {context}")
               except Exception as e:
                   logger.warning(f"MCP server {server_name} error: {e}")
           
           return "\n".join(contexts)
   ```

### Phase 2: WebSocket Protocol Extensions

Add new message types for MCP management:

```python
# unmute/unmute_handler.py
async def handle_mcp_message(self, message):
    """Handle MCP-related WebSocket messages"""
    msg_type = message.get('type')
    
    if msg_type == 'mcp.servers.list':
        # Return list of configured MCP servers
        return {
            'type': 'mcp.servers.list',
            'servers': [
                {
                    'name': name,
                    'enabled': True,
                    'connected': client.is_connected(),
                    'capabilities': await client.get_capabilities()
                }
                for name, client in self.mcp_manager.servers.items()
            ]
        }
    
    elif msg_type == 'mcp.servers.configure':
        # Update MCP server configuration
        server_config = message.get('config')
        await self.update_mcp_config(server_config)
```

### Phase 3: Nod.ie Settings Integration

1. **Settings UI Enhancement**
   ```html
   <!-- In settings.html -->
   <div class="setting-group">
       <h3>MCP Servers</h3>
       <div id="mcp-servers-list"></div>
       <button onclick="addMCPServer()">Add Server</button>
   </div>
   ```

2. **Configuration Storage**
   ```javascript
   // Store user's MCP configurations
   const mcpConfig = {
       servers: [
           {
               name: 'datetime',
               enabled: true,
               command: ['python', '-m', 'mcp_datetime']
           },
           // User-added servers
           {
               name: 'my-bitcoin-node',
               enabled: true,
               command: ['mcp-bitcoin', '--rpc-url', 'http://localhost:8332']
           }
       ]
   };
   
   // Save to ~/.config/nodie/mcp-servers.json
   await ipcRenderer.invoke('save-mcp-config', mcpConfig);
   ```

3. **Dynamic Configuration Updates**
   ```javascript
   // In renderer.js
   async function updateMCPServers(config) {
       wsHandler.send({
           type: 'mcp.servers.configure',
           config: config
       });
   }
   ```

### Phase 4: Testing Strategy

1. **Unit Tests (Unmute)**
   ```python
   # tests/test_mcp_manager.py
   async def test_datetime_server():
       manager = MCPManager('test_config.yaml')
       context = await manager.query_context("what time is it")
       assert "current time" in context.lower()
   ```

2. **Integration Tests (Nod.ie)**
   ```javascript
   // tests/test-mcp-integration.js
   describe('MCP Integration', () => {
       it('should get time via voice command', async () => {
           await nodie.connect();
           await nodie.say("What time is it?");
           const response = await nodie.waitForResponse();
           expect(response).toMatch(/\d{1,2}:\d{2}/);
       });
   });
   ```

3. **Compatibility Tests**
   - Ensure existing Unmute web interface still works
   - Test with MCP disabled (fallback to normal operation)
   - Verify no performance regression

### Phase 5: Security & Performance

1. **Security Measures**
   - MCP servers run in separate processes
   - Whitelist allowed MCP commands
   - User confirmation for sensitive operations
   - Sandboxed execution environment

2. **Performance Optimization**
   - 5-second timeout for MCP queries
   - Parallel querying of multiple servers
   - Caching for frequently accessed resources
   - Lazy loading of MCP connections

## Migration Path

1. **Phase 1**: Basic implementation in `knowall-ai/unmute`
2. **Phase 2**: Add datetime MCP server for testing
3. **Phase 3**: Update Nod.ie settings UI
4. **Phase 4**: Create comprehensive test suite
5. **Phase 5**: Submit PR to upstream `kyutai-labs/unmute`

## Example User Interactions

```
User: "What time is it in Tokyo?"
[MCP datetime server provides context: "Tokyo time: 15:45 JST"]
Nod.ie: "It's 3:45 PM in Tokyo, which is 9 hours ahead of your local time."

User: "Check my Lightning balance"
[User's LND MCP server provides: "Balance: 500,000 sats, 5 channels"]
Nod.ie: "Your Lightning wallet has 500,000 sats across 5 active channels."

User: "What files are on my desktop?"
[Filesystem MCP server provides file list]
Nod.ie: "You have 15 files on your desktop, including 3 documents and 2 images from today."
```

## Benefits Over Original Approach

1. **Simpler Nod.ie codebase** - No complex MCP logic in Electron
2. **Reusable by all Unmute users** - Not just Nod.ie
3. **Better tool integration** - LLM can directly invoke MCP tools
4. **Upstream contribution** - Benefits entire community
5. **Cleaner testing** - Can test MCP independently of voice UI

## Next Steps

1. Create feature branch in `knowall-ai/unmute`
2. Implement basic MCP manager with datetime server
3. Test with existing Unmute web interface
4. Add WebSocket protocol extensions
5. Update Nod.ie settings to configure MCP servers
6. Create comprehensive test suite
7. Document configuration format
8. Submit PR to upstream Unmute

This approach transforms Unmute into a powerful "MCP-aware voice AI platform" while keeping Nod.ie focused on being an excellent voice interface.