const { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
require('dotenv').config();

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running
  console.log('Another instance of Nod.ie is already running');
  app.quit();
  return;
}

// Configuration store
const store = new Store({
  defaults: {
    assistantName: process.env.ASSISTANT_NAME,
    n8nWebhookUrl: process.env.N8N_WEBHOOK_URL,
    unmuteFrontendUrl: process.env.UNMUTE_FRONTEND_URL,
    unmuteBackendUrl: process.env.UNMUTE_BACKEND_URL,
    voice: process.env.VOICE_MODEL || 'unmute-prod-website/ex04_narration_longform_00001.wav',
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    globalHotkey: process.env.GLOBAL_HOTKEY,
    position: { x: null, y: null }
  }
});

let mainWindow;
let settingsWindow;
let tray;

function createWindow() {
  // Create a small circular window
  mainWindow = new BrowserWindow({
    width: 120,
    height: 120,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  // Load saved position or default to bottom-right
  const position = store.get('position');
  if (position.x && position.y) {
    mainWindow.setPosition(position.x, position.y);
  } else {
    const { width, height } = require('electron').screen.getPrimaryDisplay().workAreaSize;
    mainWindow.setPosition(width - 140, height - 140);
  }

  mainWindow.loadFile('index.html');
  
  // Save position when moved
  mainWindow.on('moved', () => {
    const [x, y] = mainWindow.getPosition();
    store.set('position', { x, y });
  });

  // Prevent window from being closed, just hide it (unless quitting)
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    } else {
      // Send cleanup signal to renderer
      mainWindow.webContents.send('app-will-quit');
    }
  });

  // Make window draggable by enabling drag on the window
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  
  // Make window draggable with simple approach
  mainWindow.webContents.on('did-finish-load', () => {
    // Window is draggable by default with CSS
  });
  
  // Enable right-click context menu
  mainWindow.webContents.on('context-menu', (event, params) => {
    event.preventDefault();
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Settings',
        click: () => {
          createSettingsWindow();
        }
      },
      { type: 'separator' },
      {
        label: 'Reload',
        accelerator: 'CmdOrCtrl+R',
        click: () => mainWindow.reload()
      },
      {
        label: 'Developer Tools',
        accelerator: 'CmdOrCtrl+Shift+I',
        click: () => mainWindow.webContents.openDevTools({ mode: 'detach' })
      },
      { type: 'separator' },
      {
        label: 'Hide Nod.ie',
        click: () => mainWindow.hide()
      },
      {
        label: 'Quit',
        accelerator: 'CmdOrCtrl+Q',
        click: () => {
          mainWindow.destroy();
          app.quit();
        }
      }
    ]);
    
    contextMenu.popup();
  });
}

function createSettingsWindow() {
  // If settings window already exists, focus it
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  
  settingsWindow = new BrowserWindow({
    width: 600,
    height: 700,
    frame: true,
    transparent: false,
    alwaysOnTop: false,
    resizable: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'Nod.ie Settings',
    parent: mainWindow,
    modal: false
  });
  
  settingsWindow.loadFile('settings.html');
  
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function createTray() {
  // Skip tray for now if icon doesn't exist
  const iconPath = path.join(__dirname, 'icon.png');
  const fs = require('fs');
  
  if (!fs.existsSync(iconPath)) {
    console.warn('Tray icon not found, skipping tray creation');
    return;
  }
  
  tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Nod.ie',
      click: () => mainWindow.show()
    },
    {
      label: 'Settings',
      click: () => {
        createSettingsWindow();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        mainWindow.destroy();
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('Nod.ie - AI Assistant');
  tray.setContextMenu(contextMenu);
  
  if (tray) {
    tray.on('click', () => {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });
  }
}

// Global hotkey handling
function registerGlobalShortcuts() {
  const hotkey = store.get('globalHotkey');
  
  // Register toggle mute hotkey
  globalShortcut.register(hotkey, () => {
    mainWindow.webContents.send('toggle-mute');
  });
  
  // Show Nod.ie window
  globalShortcut.register('CommandOrControl+Shift+A', () => {
    mainWindow.show();
  });
}

// IPC handlers for communication with renderer
ipcMain.handle('get-config', () => {
  return store.store;
});

ipcMain.handle('set-config', (event, key, value) => {
  store.set(key, value);
});

// Removed IPC handler for get-prompt - prompt is now hardcoded in websocket-handler.js

ipcMain.handle('send-to-claude', async (event, text) => {
  // Integration with Claude CLI
  const { exec } = require('child_process');
  exec(`echo "${text}" | claude`, (error, stdout, stderr) => {
    if (error) {
      console.error('Claude error:', error);
      return;
    }
    // Response will be handled by Claude hooks
  });
});

ipcMain.handle('send-notification', async (event, data) => {
  const n8nUrl = store.get('n8nWebhookUrl');
  if (n8nUrl) {
    const fetch = require('node-fetch');
    await fetch(n8nUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }
});

// Handle system prompt reading and writing
ipcMain.handle('read-system-prompt', async () => {
  const fs = require('fs').promises;
  const systemPromptPath = path.join(__dirname, 'SYSTEM-PROMPT.md');
  try {
    const content = await fs.readFile(systemPromptPath, 'utf8');
    return content;
  } catch (error) {
    throw new Error(`Failed to read system prompt: ${error.message}`);
  }
});

ipcMain.handle('write-system-prompt', async (event, content) => {
  const fs = require('fs').promises;
  const systemPromptPath = path.join(__dirname, 'SYSTEM-PROMPT.md');
  try {
    await fs.writeFile(systemPromptPath, content, 'utf8');
    return true;
  } catch (error) {
    throw new Error(`Failed to write system prompt: ${error.message}`);
  }
});

// Notify main window when settings are updated
ipcMain.handle('notify-settings-updated', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings-updated');
  }
  return true;
});

// Get available Ollama models
ipcMain.handle('get-ollama-models', async () => {
  try {
    const http = require('http');
    const url = new URL(store.get('ollamaUrl') || 'http://localhost:11434');
    
    return new Promise((resolve) => {
      const options = {
        hostname: url.hostname,
        port: url.port || 11434,
        path: '/api/tags',
        method: 'GET'
      };
      
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.models && Array.isArray(parsed.models)) {
              const modelNames = parsed.models.map(m => m.name);
              console.log('Ollama models found:', modelNames);
              resolve(modelNames);
            } else {
              console.log('No models in response');
              resolve(['llama3.2:3b']);
            }
          } catch (e) {
            console.error('Failed to parse Ollama response:', e);
            resolve(['llama3.2:3b']);
          }
        });
      });
      
      req.on('error', (error) => {
        console.error('Failed to connect to Ollama:', error.message);
        resolve(['llama3.2:3b']);
      });
      
      req.end();
    });
  } catch (error) {
    console.error('Failed to get Ollama models:', error);
    return ['llama3.2:3b'];
  }
});

// Handle window dragging
ipcMain.on('move-window', (event, { deltaX, deltaY }) => {
  if (mainWindow) {
    const bounds = mainWindow.getBounds();
    mainWindow.setBounds({
      x: bounds.x + deltaX,
      y: bounds.y + deltaY,
      width: bounds.width,
      height: bounds.height
    });
  }
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  registerGlobalShortcuts();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  
  // Send cleanup signal to renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-will-quit');
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Handle second instance attempt
app.on('second-instance', () => {
  // Someone tried to run a second instance, we should focus our window instead
  if (mainWindow) {
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});