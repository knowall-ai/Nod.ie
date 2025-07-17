const { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
require('dotenv').config();

console.log('Nod.ie starting...');

// Suppress file watcher warnings
app.commandLine.appendSwitch('disable-features', 'WatchFileSystem');
app.commandLine.appendSwitch('disable-file-system', 'true');
app.commandLine.appendSwitch('disable-dev-shm-usage');
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
process.env.ELECTRON_NO_ATTACH_CONSOLE = 'true';

// Ensure single instance
console.log('Checking for single instance...');
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running
  console.log('Another instance of Nod.ie is already running');
  app.quit();
  return;
} else {
  console.log('Got the lock, continuing...');
}

// Configuration store
const store = new Store({
  defaults: {
    assistantName: process.env.ASSISTANT_NAME,
    n8nWebhookUrl: process.env.N8N_WEBHOOK_URL,
    unmuteFrontendUrl: process.env.UNMUTE_FRONTEND_URL,
    unmuteBackendUrl: process.env.UNMUTE_BACKEND_URL,
    voiceModel: process.env.VOICE_MODEL,
    globalHotkey: process.env.GLOBAL_HOTKEY,
    position: { x: null, y: null }
  }
});

let mainWindow;
let tray;
let settingsWindow;

function createWindow() {
  // Create window - 300x300 to accommodate waveform
  mainWindow = new BrowserWindow({
    width: 300,
    height: 300,
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
  const display = require('electron').screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;
  
  if (position.x !== null && position.y !== null) {
    mainWindow.setPosition(position.x, position.y);
  } else {
    // Default to bottom-right corner (accounting for 300px window + margin)
    mainWindow.setPosition(screenWidth - 350, screenHeight - 350);
  }

  mainWindow.loadFile('index.html');
  
  // Force show window after a brief delay
  setTimeout(() => {
    console.log('Force showing window...');
    mainWindow.show();
    mainWindow.focus();
    mainWindow.moveTop();
  }, 100);
  
  // Removed console capture as it may cause issues
  
  // Handle renderer crashes
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer process crashed:', details);
    // Don't auto-reload on crash to avoid infinite loop
  });
  
  // Handle unresponsive renderer
  mainWindow.webContents.on('unresponsive', () => {
    console.error('Renderer process is unresponsive');
  });
  
  mainWindow.webContents.on('responsive', () => {
    console.log('Renderer process is responsive again');
  });
  
  // Debug window state
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Window loaded');
    console.log('- Size:', mainWindow.getSize());
    console.log('- Position:', mainWindow.getPosition());
    console.log('- Visible:', mainWindow.isVisible());
    console.log('- Minimized:', mainWindow.isMinimized());
    console.log('- Focused:', mainWindow.isFocused());
    
    // Ensure window is visible
    if (!mainWindow.isVisible()) {
      console.log('Window not visible, showing...');
      mainWindow.show();
    }
    if (!mainWindow.isFocused()) {
      console.log('Window not focused, focusing...');
      mainWindow.focus();
    }
    
    // Double-check visibility
    setTimeout(() => {
      if (!mainWindow.isVisible()) {
        console.log('Window still not visible, forcing...');
        mainWindow.showInactive();
        mainWindow.focus();
      }
    }, 1000);
  });
  
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
          showSettingsDialog();
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

function showSettingsDialog() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 500,
    height: 600,
    frame: true,
    transparent: false,
    alwaysOnTop: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
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
      click: () => {
        try {
          if (mainWindow) {
            console.log('Showing window...');
            mainWindow.show();
            mainWindow.focus();
            mainWindow.moveTop();
            
            // Force window to foreground
            const currentPos = mainWindow.getPosition();
            mainWindow.setPosition(currentPos[0], currentPos[1]);
          } else {
            console.error('mainWindow is null!');
          }
        } catch (error) {
          console.error('Error showing window:', error);
        }
      }
    },
    {
      label: 'Settings',
      click: () => {
        showSettingsDialog();
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
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          console.log('Tray clicked - showing window');
          mainWindow.show();
          mainWindow.focus();
          mainWindow.moveTop();
          
          // Keep existing position when showing from tray
        }
      }
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
  
  // Quit Nod.ie
  globalShortcut.register('CommandOrControl+Shift+Q', () => {
    console.log('Quit hotkey pressed');
    app.isQuitting = true;
    mainWindow.destroy();
    app.quit();
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

// Handle settings updates
ipcMain.on('settings-updated', (event, settings) => {
  console.log('Settings updated:', settings);
  // Notify renderer about avatar setting change
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('avatar-setting-changed', settings.avatarEnabled);
  }
});

app.whenReady().then(() => {
  console.log('App ready, creating window...');
  createWindow();
  createTray();
  registerGlobalShortcuts();
}).catch(err => {
  console.error('Error during app ready:', err);
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