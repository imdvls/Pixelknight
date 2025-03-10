// Game constants
const TILE_SIZE = 16; // Each tile is 16x16 pixels
const SCALE = 1;      // Scale factor for rendering
const MIN_JUMP_VELOCITY = -200; // Minimum jump velocity when releasing jump key early

// Map dimensions
const MAP_WIDTH = 1000;
const MAP_HEIGHT = 240;

// Multiplayer settings
const WS_SERVER_URL = 'ws://localhost:8080'; // Local server address
let socket = null;
let playerId = null;
let otherPlayers = {}; // Store other players' data
let lastServerUpdate = 0; // Timestamp of last server update
let pendingInputs = []; // Store inputs that have been sent but not yet acknowledged
let serverTimeOffset = 0; // Difference between server and client time
let connectionInfo = { ip: '', status: 'disconnected' }; // Connection info for display

// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false; // Keep pixel art crisp

// Game state
let gameRunning = true;
let score = 0;
let lives = 3;

// Character properties
const character = {
    width: 16,
    height: 24, // Restore original height
    pos_x: 50,
    pos_y: 100,
    vel_x: 0,
    vel_y: 0,
    speed: 150,
    jumpSpeed: -350,
    gravity: 800, // Restore original gravity
    onGround: false,
    canJump: true,
    jumpCooldown: 0,
    maxJumpCooldown: 0.2,
    facingRight: true,
    sprite: null,
    animationFrame: 0,
    animationTimer: 0, // Restore animation timer
    forceJump: false, // Direct flag to force a jump
    // Sword attack properties
    attacking: false,
    attackCooldown: 0,
    attackDuration: 0.2,
    attackCooldownMax: 0.5,
    swordReach: 20,
    swordDamage: 1
};

// Camera properties
const camera = {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height
};

// Input handling - simplified
const keys = {
    left: false,
    right: false,
    jump: false,
    jumpJustPressed: false,
    attack: false,
    attackJustPressed: false
};

// Key codes for different browsers
const KEY_CODES = {
    LEFT: ['ArrowLeft', 'KeyA'],
    RIGHT: ['ArrowRight', 'KeyD'],
    JUMP: ['Space', 'ArrowUp', 'KeyW'],
    ATTACK: ['KeyX', 'KeyZ', 'ControlLeft', 'ControlRight'], // Attack keys
    DEBUG: ['Backquote', '`', 'Backtick'] // Add debug key codes
};

// Game objects
let map = [];
let collectibles = [];
let enemies = [];

// Initialize the game
let DEBUG_MODE = false; // Add debug mode flag
let debugInfo = []; // Array to store debug visualization data

// Sound system
let soundEnabled = false; // Start with sound disabled until user interaction
let audioContext = null;
const sounds = {
    jump: null,
    coin: null,
    damage: null,
    backgroundMusic: null,
    swordSwing: null, // Add sword swing sound
    enemyDefeat: null // Add enemy defeat sound
};

// Initialize sounds
function initSounds() {
    try {
        // Create audio context on first user interaction
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (!soundEnabled || !audioContext) return;
        
        // Jump sound - short upward beep
        sounds.jump = createSound(function(time) {
            const oscillator = audioContext.createOscillator();
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(300, time);
            oscillator.frequency.exponentialRampToValueAtTime(600, time + 0.1);
            return oscillator;
        }, 0.1);
        
        // Coin pickup sound - short high-pitched beep
        sounds.coin = createSound(function(time) {
            const oscillator = audioContext.createOscillator();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(800, time);
            oscillator.frequency.exponentialRampToValueAtTime(1200, time + 0.1);
            return oscillator;
        }, 0.1);
        
        // Damage sound - descending tone
        sounds.damage = createSound(function(time) {
            const oscillator = audioContext.createOscillator();
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(400, time);
            oscillator.frequency.exponentialRampToValueAtTime(100, time + 0.3);
            return oscillator;
        }, 0.3);
        
        // Sword swing sound - quick swoosh
        sounds.swordSwing = createSound(function(time) {
            const oscillator = audioContext.createOscillator();
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(500, time);
            oscillator.frequency.exponentialRampToValueAtTime(200, time + 0.15);
            return oscillator;
        }, 0.15);
        
        // Enemy defeat sound - satisfying pop
        sounds.enemyDefeat = createSound(function(time) {
            const oscillator = audioContext.createOscillator();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(300, time);
            oscillator.frequency.exponentialRampToValueAtTime(600, time + 0.05);
            oscillator.frequency.exponentialRampToValueAtTime(200, time + 0.2);
            return oscillator;
        }, 0.2);
        
        // Background music - simple looping pattern
        sounds.backgroundMusic = createLoopingMusic();
        
        console.log("Sounds initialized");
    } catch (e) {
        console.error("Error initializing sounds:", e);
    }
}

// Create a simple sound
function createSound(setupOscillator, duration) {
    return function(volume = 0.2) {
        if (!soundEnabled || !audioContext) return;
        
        try {
            const time = audioContext.currentTime;
            const gainNode = audioContext.createGain();
            const oscillator = setupOscillator(time);
            
            gainNode.gain.setValueAtTime(volume, time);
            gainNode.gain.exponentialRampToValueAtTime(0.01, time + duration);
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.start(time);
            oscillator.stop(time + duration);
        } catch (e) {
            console.error("Error playing sound:", e);
        }
    };
}

// Create looping background music
function createLoopingMusic() {
    let isPlaying = false;
    let musicInterval;

    const noteFrequencies = {
        "A3": 220.00,
        "A#3": 233.08,
        "B3": 246.94,
        "C4": 261.63,
        "C#4": 277.18,
        "D4": 293.66,
        "D#4": 311.13,
        "E4": 329.63,
        "F4": 349.23,
        "F#4": 369.99,
        "G4": 392.00,
        "G#4": 415.30,
        "A4": 440.00,
        "A#4": 466.16,
        "B4": 493.88,
        "C5": 523.25,
        "C#5": 554.37,
        "D5": 587.33,
        "D#5": 622.25,
        "E5": 659.25,
        "F5": 698.46,
        "F#5": 739.99,
        "G5": 783.99,
        "G#5": 830.61,
        "A5": 880.00,
        "A#5": 932.33,
        "B5": 987.77,
        "C6": 1046.50,
        "C#6": 1108.73,
        "D6": 1174.66,
        "D#6": 1244.51,
        "E6": 1318.51,
        "F6": 1396.91,
        "F#6": 1479.98,
        "G6": 1567.98,
        "G#6": 1661.22,
        "A6": 1760.00,
      };

    const notes = ["C5", "D5", "E5", "G5", "G#5", "G5", "E5", "D5"];
    const rests = [0.4, 0.0, 0.05, 0.2, 0.0, 0.5, 0.0, 0.0];
    const durations = [0.5, 0.25, 0.5, 0.55, 0.33, 0.33, 0.33, 0.33];
    let noteIndex = 0;
    
    let frequencies = [];
    for(let note in notes) {
        frequencies.push(noteFrequencies[notes[note]]);
    }

    function playNote() {
        if (!soundEnabled || !audioContext || !isPlaying) return;
        
        try {
            const time = audioContext.currentTime;
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.type = 'sine';

            oscillator.frequency.setValueAtTime(frequencies[noteIndex], time);
            
            gainNode.gain.setValueAtTime(0.1, time);
            gainNode.gain.exponentialRampToValueAtTime(0.01, time + durations[noteIndex] * 0.9);
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.start(time);
            oscillator.stop(time + durations[noteIndex]);
            
            noteIndex = (noteIndex + 1) % frequencies.length;
            
            musicInterval = setTimeout(playNote, durations[noteIndex] * 1000 + rests[noteIndex] * 1000);
        } catch (e) {
            console.error("Error playing music note:", e);
        }
    }
    
    return {
        play: function() {
            if (isPlaying || !soundEnabled || !audioContext) return;
            
            isPlaying = true;
            noteIndex = 0;

            playNote();
        },
        stop: function() {
            isPlaying = false;
            clearInterval(musicInterval);
        }
    };
}

// Play a sound
function playSound(soundName, volume) {
    if (!soundEnabled || !sounds[soundName]) return;
    sounds[soundName](volume);
}

// Enable sounds after user interaction
function enableSounds() {
    soundEnabled = true;
    
    // Initialize audio context if needed
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } else if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    // Initialize sounds
    initSounds();
    
    // Start background music
    if (sounds.backgroundMusic) {
        sounds.backgroundMusic.play();
    }
    
    // Update sound button
    const soundButton = document.getElementById('sound-button');
    if (soundButton) {
        soundButton.textContent = '🔊';
        soundButton.style.backgroundColor = '#0a0';
    }
    
    console.log("Sounds enabled");
}

// Disable sounds
function disableSounds() {
    soundEnabled = false;
    
    // Stop background music
    if (sounds.backgroundMusic) {
        sounds.backgroundMusic.stop();
    }
    
    // Update sound button
    const soundButton = document.getElementById('sound-button');
    if (soundButton) {
        soundButton.textContent = '🔇';
        soundButton.style.backgroundColor = '#444';
    }
    
    console.log("Sounds disabled");
}

// Toggle sounds
function toggleSounds() {
    if (soundEnabled) {
        disableSounds();
    } else {
        enableSounds();
    }
}

// Initialize WebSocket connection
function initWebSocket() {
    console.log("Initializing WebSocket connection to", WS_SERVER_URL);
    
    // Update connection status UI
    updateConnectionStatus('connecting');
    
    // Set connection info immediately
    const serverIP = WS_SERVER_URL.replace('ws://', '');
    connectionInfo = {
        ip: serverIP,
        status: 'connecting'
    };
    
    // Create WebSocket with error handling
    try {
        socket = new WebSocket(WS_SERVER_URL);
        
        socket.onopen = function() {
            console.log("WebSocket connection established");
            // Update connection status UI
            updateConnectionStatus('connected');
            // Send initial connection message
            socket.send(JSON.stringify({ type: 'connect' }));
        };
        
        socket.onmessage = function(event) {
            try {
                // Log raw message for debugging
                console.log("Raw message from server:", event.data);
                
                // Check if message is empty or invalid
                if (!event.data || event.data === "]" || event.data.trim() === "") {
                    console.warn("Received empty or invalid message from server");
                    return;
                }
                
                handleServerMessage(event);
            } catch (error) {
                console.error("Error in onmessage handler:", error);
            }
        };
        
        socket.onerror = function(error) {
            console.error("WebSocket error:", error);
            updateConnectionStatus('error');
        };
        
        socket.onclose = function(event) {
            console.log("WebSocket connection closed:", event.code, event.reason);
            updateConnectionStatus('disconnected');
            
            // Attempt to reconnect after 5 seconds
            setTimeout(function() {
                console.log("Attempting to reconnect...");
                initWebSocket();
            }, 5000);
        };
    } catch (error) {
        console.error("Error creating WebSocket connection:", error);
        updateConnectionStatus('error');
    }
}

// Update connection status UI
function updateConnectionStatus(status) {
    const connectionStatusElement = document.getElementById('connection-status');
    if (connectionStatusElement) {
        // Remove all status classes
        connectionStatusElement.classList.remove('connected', 'disconnected', 'connecting', 'error');
        // Add the current status class
        connectionStatusElement.classList.add(status);
        
        // Get server IP from WS_SERVER_URL
        const serverIP = WS_SERVER_URL.replace('ws://', '');
        
        // Update the text
        switch (status) {
            case 'connected':
                connectionStatusElement.textContent = `Connected to ${serverIP}`;
                break;
            case 'disconnected':
                connectionStatusElement.textContent = `Disconnected from ${serverIP}`;
                break;
            case 'connecting':
                connectionStatusElement.textContent = `Connecting to ${serverIP}...`;
                break;
            case 'error':
                connectionStatusElement.textContent = `Error connecting to ${serverIP}`;
                break;
        }
    }
    
    // Also update the IP display in the game UI
    updateIPDisplay(status);
}

// Handle messages from the server
function handleServerMessage(message) {
    try {
        // Log raw message for debugging
        console.log("Processing message from server");
        
        // Check if message is empty or invalid
        if (!message.data || message.data === "]" || message.data.trim() === "") {
            console.warn("Received empty or invalid message from server");
            return;
        }
        
        const data = JSON.parse(message.data);
        console.log("Received message from server:", data.type);

        switch (data.type) {
            case 'handshake':
                console.log("Handshake received, player ID:", data.playerId);
                console.log("Map data:", data.mapData ? data.mapData.length : 'None');
                console.log("Enemies data:", data.enemiesData ? data.enemiesData.length : 'None');
                console.log("Collectibles data:", data.collectiblesData ? data.collectiblesData.length : 'None');
                
                playerId = data.playerId;
                initializeMapFromServer(data.mapData);
                initializeEnemiesFromServer(data.enemiesData);
                initializeCollectiblesFromServer(data.collectiblesData);
                updateCharacterProperties(data.characterProperties);
                serverTimeOffset = Date.now() - data.serverTime;
                updateConnectionStatus('connected');
                break;

            case 'gameState':
                // Log the number of players in the game state
                if (data.players) {
                    console.log(`Game state received: ${Object.keys(data.players).length} players`);
                    console.log("Player IDs in game state:", Object.keys(data.players).join(', '));
                }
                
                // Update local player position if server data exists
                if (data.players && data.players[playerId]) {
                    reconcilePlayerPosition(data.players[playerId]);
                    console.log("Player position from server:", data.players[playerId].pos_x, data.players[playerId].pos_y);
                    console.log("Local player position:", character.pos_x, character.pos_y);
                }
                
                updateOtherPlayers(data.players);
                updateEnemiesFromServer(data.enemies);
                updateCollectiblesFromServer(data.collectibles);
                serverTimeOffset = Date.now() - data.serverTime;
                break;

            case 'playerJoined':
                if (data.playerId !== playerId) {
                    console.log("Player joined:", data.playerId);
                    otherPlayers[data.playerId] = data.player;
                    otherPlayers[data.playerId].prevPos_x = data.player.pos_x;
                    otherPlayers[data.playerId].prevPos_y = data.player.pos_y;
                    updatePlayerCount(Object.keys(otherPlayers).length + 1);
                }
                break;

            case 'playerDisconnected':
                if (data.playerId !== playerId) {
                    console.log("Player disconnected:", data.playerId);
                    delete otherPlayers[data.playerId];
                    updatePlayerCount(Object.keys(otherPlayers).length + 1);
                }
                break;
                
            case 'playerSwordAttack':
                // Handle sword attack from another player
                if (data.playerId !== playerId && otherPlayers[data.playerId]) {
                    console.log(`Player ${data.playerId} is attacking with sword`);
                    const player = otherPlayers[data.playerId];
                    player.attacking = true;
                    player.attackTimer = 0.2; // Attack duration in seconds
                    player.facingRight = data.facingRight;
                    
                    // Play sword swing sound
                    playSound('swordSwing', 0.3); // Lower volume for other players
                }
                break;

            case 'enemyDefeated':
                // Handle enemy defeat
                if (data.enemyIndex >= 0 && data.enemyIndex < enemies.length) {
                    enemies[data.enemyIndex].defeated = true;
                    
                    // If this client defeated the enemy, add score
                    if (data.playerId === playerId) {
                        score += 50;
                    }
                    
                    // Play enemy defeat sound
                    playSound('enemyDefeat', 0.5);
                }
                break;

            case 'playerHit':
                if (data.id === playerId) {
                    loseLife(data.id);
                }
                break;
                
            default:
                console.log("Unknown message type:", data.type);
        }
    } catch (error) {
        console.error("Error handling server message:", error);
        console.error("Message content:", message.data);
    }
}

// Initialize map from server data
function initializeMapFromServer(mapData) {
    console.log("Initializing map from server data", mapData ? mapData.length : 'No map data');
    if (!mapData || mapData.length === 0) {
        console.error("Error: No map data received from server");
        // Create a fallback map if no data is received
        createMap();
    } else {
        map = mapData;
    }
}

// Initialize collectibles from server data
function initializeCollectiblesFromServer(collectiblesData) {
    console.log("Initializing collectibles from server data", collectiblesData ? collectiblesData.length : 'No collectibles data');
    if (!collectiblesData || collectiblesData.length === 0) {
        console.error("Error: No collectibles data received from server");
        // Create fallback collectibles if no data is received
        createCollectibles();
    } else {
        collectibles = collectiblesData.map(serverCollectible => {
            return {
                ...serverCollectible,
                // Ensure pos_x and pos_y are set for client-side rendering
                pos_x: serverCollectible.pos_x || serverCollectible.x,
                pos_y: serverCollectible.pos_y || serverCollectible.y
            };
        });
    }
}

// Initialize enemies from server data
function initializeEnemiesFromServer(enemiesData) {
    console.log("Initializing enemies from server data", enemiesData ? enemiesData.length : 'No enemies data');
    if (!enemiesData || enemiesData.length === 0) {
        console.error("Error: No enemies data received from server");
        // Create fallback enemies if no data is received
        createEnemies();
    } else {
        enemies = enemiesData.map(serverEnemy => {
            return {
                ...serverEnemy,
                // Add any client-specific properties needed for rendering
                prevPos_x: serverEnemy.x,
                prevPos_y: serverEnemy.y,
                targetPos_x: serverEnemy.x,
                targetPos_y: serverEnemy.y,
                interpolationStart: performance.now()
            };
        });
    }
}

// Update character properties from server data
function updateCharacterProperties(properties) {
    console.log("Updating character properties from server:", properties);
    
    // Apply physics properties
    if (properties.speed) character.speed = properties.speed;
    if (properties.jumpSpeed) character.jumpSpeed = properties.jumpSpeed;
    if (properties.gravity) character.gravity = properties.gravity;
    if (properties.minJumpVelocity) character.minJumpVelocity = properties.minJumpVelocity;
    
    // Log the updated character properties
    console.log("Updated character properties:", {
        speed: character.speed,
        jumpSpeed: character.jumpSpeed,
        gravity: character.gravity,
        minJumpVelocity: character.minJumpVelocity
    });
}

// Reconcile player position with server data
function reconcilePlayerPosition(serverPlayer) {
    // Process pending inputs to see which ones have been acknowledged
    const serverSequence = serverPlayer.lastProcessedInput || 0;
    
    // Remove acknowledged inputs
    pendingInputs = pendingInputs.filter(input => input.sequence > serverSequence);
    
    // Set position from server
    character.pos_x = serverPlayer.pos_x;
    character.pos_y = serverPlayer.pos_y;
    character.vel_x = serverPlayer.vel_x;
    character.vel_y = serverPlayer.vel_y;
    character.onGround = serverPlayer.onGround;
    character.facingRight = serverPlayer.facingRight;
    
    // Re-apply pending inputs
    pendingInputs.forEach(input => {
        // Apply input locally (simplified - actual implementation would need to match server physics)
        if (input.keys.left) character.pos_x -= character.speed * input.dt;
        if (input.keys.right) character.pos_x += character.speed * input.dt;
        // Jump and other actions would be applied similarly
    });
}

// Update other players from server data
function updateOtherPlayers(players) {
    if (!players) {
        console.warn("No players data received");
        return;
    }
    
    console.log("Updating other players. Total players from server:", Object.keys(players).length);
    console.log("Current player ID:", playerId);
    console.log("Players data:", Object.keys(players).join(', '));
    
    // Remove players that are no longer in the update
    Object.keys(otherPlayers).forEach(id => {
        if (id !== playerId && !players[id]) {
            console.log(`Removing player ${id} who is no longer present`);
            delete otherPlayers[id];
        }
    });
    
    // Update or add players
    Object.keys(players).forEach(id => {
        if (id !== playerId) {
            if (!otherPlayers[id]) {
                // New player
                console.log(`Adding new player ${id}`);
                otherPlayers[id] = {
                    ...players[id],
                    sprite: createCharacterSprite(), // Create sprite for new player
                    width: 16,
                    height: 24,
                    prevPos_x: players[id].pos_x,
                    prevPos_y: players[id].pos_y,
                    pos_x: players[id].pos_x,
                    pos_y: players[id].pos_y,
                    targetPos_x: players[id].pos_x,
                    targetPos_y: players[id].pos_y,
                    interpolationStart: performance.now(),
                    attacking: false,
                    attackTimer: 0,
                    swordReach: 20
                };
            } else {
                // Existing player - update with interpolation
                const player = otherPlayers[id];
                
                // Store previous position for interpolation
                player.prevPos_x = player.pos_x || players[id].pos_x;
                player.prevPos_y = player.pos_y || players[id].pos_y;
                
                // Update with new data
                player.targetPos_x = players[id].pos_x;
                player.targetPos_y = players[id].pos_y;
                player.pos_x = players[id].pos_x;
                player.pos_y = players[id].pos_y;
                player.facingRight = players[id].facingRight;
                player.animationFrame = players[id].animationFrame;
                player.interpolationStart = performance.now();
                
                // Update attack timer
                if (player.attacking) {
                    player.attackTimer -= 1/60; // Assume 60fps
                    if (player.attackTimer <= 0) {
                        player.attacking = false;
                    }
                }
            }
        }
    });
    
    console.log("Other players after update:", Object.keys(otherPlayers).length);
    console.log("Other player IDs:", Object.keys(otherPlayers).join(', '));
    
    // Update player count in UI
    updatePlayerCount(Object.keys(players).length);
}

// Update player count in UI
function updatePlayerCount(count) {
    const playerCountElement = document.getElementById('players-count');
    if (playerCountElement) {
        playerCountElement.textContent = count;
    }
}

// Update enemies from server data
function updateEnemiesFromServer(serverEnemies) {
    // Update existing enemies with server data
    serverEnemies.forEach((serverEnemy, index) => {
        if (index < enemies.length) {
            // Store previous position for interpolation
            enemies[index].prevPos_x = enemies[index].x;
            enemies[index].prevPos_y = enemies[index].y;
            
            // Set target position from server
            enemies[index].targetPos_x = serverEnemy.x;
            enemies[index].targetPos_y = serverEnemy.y;
            enemies[index].x = serverEnemy.x;
            enemies[index].y = serverEnemy.y;
            enemies[index].facingRight = serverEnemy.facingRight;
            enemies[index].defeated = serverEnemy.defeated;
            enemies[index].animationFrame = serverEnemy.animationFrame;
            enemies[index].interpolationStart = performance.now();
        } else {
            // New enemy from server
            enemies.push({
                ...serverEnemy,
                prevPos_x: serverEnemy.x,
                prevPos_y: serverEnemy.y,
                targetPos_x: serverEnemy.x,
                targetPos_y: serverEnemy.y,
                interpolationStart: performance.now()
            });
        }
    });
    
    // Remove enemies that are no longer in the server data
    if (serverEnemies.length < enemies.length) {
        enemies.length = serverEnemies.length;
    }
}

// Update collectibles from server data
function updateCollectiblesFromServer(serverCollectibles) {
    // Update collectibles array with server data
    serverCollectibles.forEach((serverCollectible, index) => {
        if (index < collectibles.length) {
            collectibles[index].collected = serverCollectible.collected;
            collectibles[index].animationFrame = serverCollectible.animationFrame;
        }
    });
}

// Send player input to server
function sendInputToServer() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        const input = {
            type: 'input',
            keys: { ...keys },
            sequence: pendingInputs.length > 0 ? pendingInputs[pendingInputs.length - 1].sequence + 1 : 1,
            timestamp: performance.now()
        };
        
        socket.send(JSON.stringify(input));
        
        // Store input for client-side prediction
        pendingInputs.push({
            ...input,
            dt: 1/60 // Assume 60fps for prediction
        });
        
        // Limit pending inputs array size
        if (pendingInputs.length > 20) {
            pendingInputs.shift();
        }
    }
}

// Initialize the game
function init() {
    console.log("Initializing game...");
    
    // Reset game state
    gameRunning = true;
    score = 0;
    lives = 3;
    
    // Reset character position and state
    character.pos_x = 50;
    character.pos_y = 0;
    character.vel_x = 0;
    character.vel_y = 0;
    character.onGround = false;
    character.canJump = true;
    character.jumpCooldown = 0;
    character.facingRight = true;
    
    // Reset input state
    keys.left = false;
    keys.right = false;
    keys.jump = false;
    keys.jumpJustPressed = false;
    keys.attack = false;
    keys.attackJustPressed = false;
    
    // Initialize WebSocket connection for multiplayer
    initWebSocket();
    
    // Initialize with empty arrays until server data arrives
    console.log("Waiting for server data");
    map = [];
    collectibles = [];
    enemies = [];
    
    // Load character sprite
    character.sprite = createCharacterSprite();
    
    // Set up event listeners
    setupEventListeners();
    setupButtonControls();
    
    // Add sound button
    createSoundButton();
    
    // Start game loop
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
    
    // Add debug mode toggle
    window.addEventListener('keydown', function(e) {
        if (e.key === '`' || e.key === 'Backquote') { // Change to grave key (backtick)
            DEBUG_MODE = !DEBUG_MODE;
            console.log('Debug mode:', DEBUG_MODE);
        }
    });
    
    // Enable sounds on user interaction
    const enableSoundOnInteraction = function() {
        enableSounds();
        window.removeEventListener('click', enableSoundOnInteraction);
        window.removeEventListener('keydown', enableSoundOnInteraction);
        window.removeEventListener('touchstart', enableSoundOnInteraction);
    };
    
    window.addEventListener('click', enableSoundOnInteraction);
    window.addEventListener('keydown', enableSoundOnInteraction);
    window.addEventListener('touchstart', enableSoundOnInteraction);
    
    // Add event listener to close WebSocket connection when page is unloaded
    window.addEventListener('beforeunload', closeWebSocketConnection);
    
    console.log("Game initialized");
}

// Close WebSocket connection
function closeWebSocketConnection() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log("Closing WebSocket connection...");
        socket.send(JSON.stringify({ type: 'disconnect' }));
        socket.close();
        // Update connection status
        updateConnectionStatus('disconnected');
    }
}

// Create the game map
function createMap() {
    // Initialize map as a 2D array
    for (let y = 0; y < MAP_HEIGHT; y++) {
        map[y] = [];
        for (let x = 0; x < MAP_WIDTH; x++) {
            map[y][x] = { type: 'empty', solid: false, color: '#000' };
        }
    }
    
    // Create ground
    for (let x = 0; x < MAP_WIDTH; x++) {
        map[MAP_HEIGHT - 1][x] = { type: 'ground', solid: true, color: '#8B4513' };
        map[MAP_HEIGHT - 2][x] = { type: 'grass', solid: true, color: '#228B22' };
    }
    
    // Create platforms
    createPlatform(100, 180, 150);
    createPlatform(300, 150, 100);
    createPlatform(450, 120, 80);
    createPlatform(600, 150, 120);
    
    // Create a hole in the ground
    for (let x = 300; x <= 350; x++) {
        map[MAP_HEIGHT - 1][x] = { type: 'empty', solid: false, color: '#000' };
        map[MAP_HEIGHT - 2][x] = { type: 'empty', solid: false, color: '#000' };
    }
    
    // Create another hole
    for (let x = 500; x <= 530; x++) {
        map[MAP_HEIGHT - 1][x] = { type: 'empty', solid: false, color: '#000' };
        map[MAP_HEIGHT - 2][x] = { type: 'empty', solid: false, color: '#000' };
    }
}

// Create a platform at the specified position
function createPlatform(x, y, width) {
    for (let i = 0; i < width; i++) {
        map[y][x + i] = { type: 'platform', solid: true, color: '#8B4513' };
    }
}

// Create collectible items
function createCollectibles() {
}

// Add a collectible item
function addCollectible(x, y, type) {
    collectibles.push({
        x: x,
        y: y,
        width: 8,
        height: 8,
        type: type,
        collected: false,
        animationFrame: 0,
        animationTimer: 0
    });
}

// Create enemies
function createEnemies() {
    // Add enemies at various positions
    addEnemy(200, 238 - 16, 'slime', 150, 250);
    addEnemy(400, 238 - 16, 'robot', 380, 480);
    addEnemy(650, 148 - 16, 'bat', 600, 700);
}

// Add an enemy
function addEnemy(x, y, type, leftBound, rightBound) {
    enemies.push({
        x: x,
        y: y,
        width: 16,
        height: 16,
        type: type,
        vel_x: 50,
        vel_y: 0,
        leftBound: leftBound,
        rightBound: rightBound,
        facingRight: true,
        animationFrame: 0,
        animationTimer: 0,
        pixelMasks: createEnemyPixelMasks(type), // Add pixel masks for collision detection
        defeated: false, // Add a defeated state
        respawnTimer: 0, // Add respawn timer
        originalX: x, // Store original position for respawning
        originalY: y
    });
}

// Create pixel masks for an enemy type
function createEnemyPixelMasks(type) {
    const masks = [];
    
    switch(type) {
        case 'slime':
            // Create masks for both animation frames
            masks.push(createSlimeMask(0)); // Frame 0
            masks.push(createSlimeMask(1)); // Frame 1
            break;
        case 'robot':
            // Create masks for both animation frames
            masks.push(createRobotMask(0)); // Frame 0
            masks.push(createRobotMask(1)); // Frame 1
            break;
        case 'bat':
            // Create masks for both animation frames
            masks.push(createBatMask(0)); // Frame 0
            masks.push(createBatMask(1)); // Frame 1
            break;
    }
    
    return masks;
}

// Create a pixel mask for a slime enemy
function createSlimeMask(frame) {
    const mask = create2DArray(16, 16, false);
    
    // Base shape depends on animation frame
    if (frame === 0) {
        // Compressed shape
        fillRectInMask(mask, 2, 6, 12, 10);
        fillRectInMask(mask, 1, 8, 14, 8);
    } else {
        // Extended shape
        fillRectInMask(mask, 2, 4, 12, 12);
        fillRectInMask(mask, 1, 6, 14, 10);
    }
    
    // Eyes and mouth don't affect collision
    
    return mask;
}

// Create a pixel mask for a robot enemy
function createRobotMask(frame) {
    const mask = create2DArray(16, 16, false);
    
    // Robot body
    fillRectInMask(mask, 2, 2, 12, 12);
    
    // Legs
    if (frame === 0) {
        // First leg position
        fillRectInMask(mask, 3, 14, 3, 2);
        fillRectInMask(mask, 10, 14, 3, 2);
    } else {
        // Second leg position
        fillRectInMask(mask, 4, 14, 3, 2);
        fillRectInMask(mask, 9, 14, 3, 2);
    }
    
    // Arms
    fillRectInMask(mask, 1, 6, 1, 4);
    fillRectInMask(mask, 14, 6, 1, 4);
    
    // Antenna
    fillRectInMask(mask, 8, 0, 1, 2);
    
    return mask;
}

// Create a pixel mask for a bat enemy
function createBatMask(frame) {
    const mask = create2DArray(16, 16, false);
    
    // Bat body
    fillRectInMask(mask, 6, 6, 4, 6);
    
    // Wings
    if (frame === 0) {
        // Wings up
        fillRectInMask(mask, 2, 2, 4, 6);
        fillRectInMask(mask, 10, 2, 4, 6);
    } else {
        // Wings down
        fillRectInMask(mask, 2, 6, 4, 6);
        fillRectInMask(mask, 10, 6, 4, 6);
    }
    
    // Fangs
    fillRectInMask(mask, 6, 12, 1, 2);
    fillRectInMask(mask, 9, 12, 1, 2);
    
    return mask;
}

// Create a 2D array filled with a default value
function create2DArray(width, height, defaultValue) {
    const array = [];
    for (let y = 0; y < height; y++) {
        array[y] = [];
        for (let x = 0; x < width; x++) {
            array[y][x] = defaultValue;
        }
    }
    return array;
}

// Fill a rectangle in a mask with true values
function fillRectInMask(mask, x, y, width, height) {
    for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) {
            if (y + dy < mask.length && x + dx < mask[0].length) {
                mask[y + dy][x + dx] = true;
            }
        }
    }
}

// Check for collision between character and enemy using pixel-perfect collision
function checkCharacterEnemyCollision(enemy) {
    // First do a bounding box check
    const characterBox = {
        x: character.pos_x,
        y: character.pos_y,
        width: character.width,
        height: character.height
    };
    
    const enemyBox = {
        x: enemy.x,
        y: enemy.y,
        width: enemy.width,
        height: enemy.height
    };
    
    // Check if bounding boxes overlap
    const boxesOverlap = checkRectCollision(
        characterBox.x, characterBox.y, characterBox.width, characterBox.height,
        enemyBox.x, enemyBox.y, enemyBox.width, enemyBox.height
    );
    
    if (!boxesOverlap) {
        // If debug mode is on, draw the character hitbox in red
        if (DEBUG_MODE) {
            drawDebugBox(characterBox, '#FF0000'); // Red for character
            drawDebugBox(enemyBox, '#FF0000'); // Red for enemy
        }
        return false;
    }
    
    // Calculate the overlapping rectangle
    const overlapBox = {
        x: Math.max(characterBox.x, enemyBox.x),
        y: Math.max(characterBox.y, enemyBox.y),
        width: Math.min(characterBox.x + characterBox.width, enemyBox.x + enemyBox.width) - Math.max(characterBox.x, enemyBox.x),
        height: Math.min(characterBox.y + characterBox.height, enemyBox.y + enemyBox.height) - Math.max(characterBox.y, enemyBox.y)
    };
    
    // For debugging, draw the boxes
    if (DEBUG_MODE) {
        drawDebugBox(characterBox, '#FF0000'); // Red for character
        drawDebugBox(enemyBox, '#FF0000'); // Red for enemy
        drawDebugBox(overlapBox, '#00FF00'); // Green for intersection
    }
    
    // If bounding boxes collide, do a pixel-perfect check
    const characterFrame = character.animationFrame;
    const enemyFrame = enemy.animationFrame;
    
    // Check each pixel in the overlapping area
    for (let y = 0; y < overlapBox.height; y++) {
        for (let x = 0; x < overlapBox.width; x++) {
            // Calculate pixel positions in each sprite's local coordinate system
            const characterLocalX = overlapBox.x + x - characterBox.x;
            const characterLocalY = overlapBox.y + y - characterBox.y;
            const enemyLocalX = overlapBox.x + x - enemyBox.x;
            const enemyLocalY = overlapBox.y + y - enemyBox.y;
            
            // Handle character sprite flipping
            let characterPixelX = characterLocalX;
            if (!character.facingRight) {
                characterPixelX = character.width - 1 - characterLocalX;
            }
            
            // Check if both pixels are solid
            let characterPixelSolid = false;
            if (characterPixelX >= 0 && characterPixelX < character.width && 
                characterLocalY >= 0 && characterLocalY < character.height) {
                if (character.sprite && 
                    character.sprite[characterFrame] && 
                    character.sprite[characterFrame][characterLocalY]) {
                    const pixelColor = character.sprite[characterFrame][characterLocalY][characterPixelX];
                    characterPixelSolid = pixelColor !== null;
                }
            }
            
            let enemyPixelSolid = false;
            if (enemyLocalX >= 0 && enemyLocalX < enemy.width && 
                enemyLocalY >= 0 && enemyLocalY < enemy.height) {
                if (enemy.pixelMasks && 
                    enemy.pixelMasks[enemyFrame] && 
                    enemy.pixelMasks[enemyFrame][enemyLocalY] && 
                    enemy.pixelMasks[enemyFrame][enemyLocalY][enemyLocalX] === true) {
                    enemyPixelSolid = true;
                }
            }
            
            if (characterPixelSolid && enemyPixelSolid) {
                // If debug mode is on, highlight the pixel where collision occurs
                if (DEBUG_MODE) {
                    drawDebugPixel(overlapBox.x + x, overlapBox.y + y, '#FFFF00'); // Yellow for collision point
                }
                return true; // Collision detected
            }
        }
    }
    
    return false; // No collision
}

// Draw a debug box with the specified color
function drawDebugBox(box, color) {
    // Store debug info for later rendering
    debugInfo.push({
        type: 'box',
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        color: color
    });
}

// Draw a debug pixel
function drawDebugPixel(x, y, color) {
    // Store debug info for later rendering
    debugInfo.push({
        type: 'pixel',
        x: x,
        y: y,
        color: color
    });
}

// Draw a debug rectangle fill
function drawDebugFill(x, y, width, height, color) {
    // Store debug info for later rendering
    debugInfo.push({
        type: 'fill',
        x: x,
        y: y,
        width: width,
        height: height,
        color: color
    });
}

// Create a simple character sprite
function createCharacterSprite() {
    const sprite = [];
    
    // Standing frame - more detailed character
    sprite[0] = [];
    for (let y = 0; y < character.height; y++) {
        sprite[0][y] = [];
        for (let x = 0; x < character.width; x++) {
            sprite[0][y][x] = null; // Start with transparent pixels
        }
    }
    
    // Head (helmet)
    const headColor = '#4287f5'; // Blue helmet
    const faceColor = '#FFD700'; // Gold face plate
    const skinColor = '#FFC0CB'; // Pink skin
    const bodyColor = '#FF4500'; // Orange-red body
    const armorColor = '#C0C0C0'; // Silver armor
    const legColor = '#0000CD'; // Dark blue legs
    const bootColor = '#8B4513'; // Brown boots
    
    // Helmet top
    for (let x = 3; x < 13; x++) {
        sprite[0][1][x] = headColor;
    }
    for (let x = 2; x < 14; x++) {
        sprite[0][2][x] = headColor;
    }
    
    // Helmet middle and face
    for (let y = 3; y < 7; y++) {
        for (let x = 1; x < 15; x++) {
            sprite[0][y][x] = headColor;
        }
        // Face area
        for (let x = 4; x < 12; x++) {
            sprite[0][y][x] = faceColor;
        }
    }
    
    // Eyes
    sprite[0][4][5] = '#000000';
    sprite[0][4][10] = '#000000';
    
    // Body
    for (let y = 7; y < 16; y++) {
        for (let x = 2; x < 14; x++) {
            sprite[0][y][x] = bodyColor;
        }
    }
    
    // Armor plates
    for (let y = 8; y < 12; y++) {
        for (let x = 4; x < 12; x++) {
            sprite[0][y][x] = armorColor;
        }
    }
    
    // Belt
    for (let x = 2; x < 14; x++) {
        sprite[0][15][x] = '#000000';
    }
    
    // Legs
    for (let y = 16; y < 20; y++) {
        // Left leg
        for (let x = 3; x < 7; x++) {
            sprite[0][y][x] = legColor;
        }
        // Right leg
        for (let x = 9; x < 13; x++) {
            sprite[0][y][x] = legColor;
        }
    }
    
    // Boots
    for (let y = 20; y < 24; y++) {
        // Left boot
        for (let x = 2; x < 7; x++) {
            sprite[0][y][x] = bootColor;
        }
        // Right boot
        for (let x = 9; x < 14; x++) {
            sprite[0][y][x] = bootColor;
        }
    }
    
    // Walking frame 1 - legs slightly apart
    sprite[1] = JSON.parse(JSON.stringify(sprite[0]));
    
    // Modify legs for walking frame 1
    for (let y = 16; y < 20; y++) {
        // Clear existing legs
        for (let x = 3; x < 13; x++) {
            sprite[1][y][x] = null;
        }
        
        // Left leg (moved left)
        for (let x = 2; x < 6; x++) {
            sprite[1][y][x] = legColor;
        }
        // Right leg (moved right)
        for (let x = 10; x < 14; x++) {
            sprite[1][y][x] = legColor;
        }
    }
    
    // Modify boots for walking frame 1
    for (let y = 20; y < 24; y++) {
        // Clear existing boots
        for (let x = 2; x < 14; x++) {
            sprite[1][y][x] = null;
        }
        
        // Left boot (moved left)
        for (let x = 1; x < 6; x++) {
            sprite[1][y][x] = bootColor;
        }
        // Right boot (moved right)
        for (let x = 10; x < 15; x++) {
            sprite[1][y][x] = bootColor;
        }
    }
    
    // Walking frame 2 - legs crossed
    sprite[2] = JSON.parse(JSON.stringify(sprite[0]));
    
    // Modify legs for walking frame 2
    for (let y = 16; y < 20; y++) {
        // Clear existing legs
        for (let x = 3; x < 13; x++) {
            sprite[2][y][x] = null;
        }
        
        // Left leg (moved right)
        for (let x = 5; x < 9; x++) {
            sprite[2][y][x] = legColor;
        }
        // Right leg (moved left)
        for (let x = 7; x < 11; x++) {
            sprite[2][y][x] = legColor;
        }
    }
    
    // Modify boots for walking frame 2
    for (let y = 20; y < 24; y++) {
        // Clear existing boots
        for (let x = 2; x < 14; x++) {
            sprite[2][y][x] = null;
        }
        
        // Left boot (moved right)
        for (let x = 4; x < 9; x++) {
            sprite[2][y][x] = bootColor;
        }
        // Right boot (moved left)
        for (let x = 7; x < 12; x++) {
            sprite[2][y][x] = bootColor;
        }
    }
    
    return sprite;
}

// Set up event listeners
function setupEventListeners() {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
}

// Handle key down events
function handleKeyDown(e) {
    console.log('Key down:', e.code);
    
    // Prevent default for game controls
    if(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyX', 'KeyZ', 'ControlLeft', 'ControlRight'].includes(e.code)) {
        e.preventDefault();
    }
    
    let inputChanged = false;
    
    if(e.code === 'ArrowLeft' || e.code === 'KeyA') {
        if (!keys.left) inputChanged = true;
        keys.left = true;
    }
    else if(e.code === 'ArrowRight' || e.code === 'KeyD') {
        if (!keys.right) inputChanged = true;
        keys.right = true;
    }
    else if(e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        // Use the direct jump method that works for the button
        console.log("Jump key pressed, calling doJump()");
        doJump();
        
        // Still set the key state for variable jump height
        if (!keys.jump) inputChanged = true;
        keys.jump = true;
        keys.jumpJustPressed = true;
    }
    else if(KEY_CODES.ATTACK.includes(e.code)) {
        if (!keys.attack) {
            keys.attackJustPressed = true;
            inputChanged = true;
        }
        keys.attack = true;
    }
    else if(e.code === 'KeyR') {
        resetGame();
    }
    
    // Send input to server if any input changed
    if (inputChanged) {
        console.log("Input changed, sending to server:", JSON.stringify(keys));
        sendInputToServer();
    }
}

// Handle key up events
function handleKeyUp(e) {
    console.log('Key up:', e.code);
    
    let inputChanged = false;
    
    if(e.code === 'ArrowLeft' || e.code === 'KeyA') {
        if (keys.left) inputChanged = true;
        keys.left = false;
    }
    else if(e.code === 'ArrowRight' || e.code === 'KeyD') {
        if (keys.right) inputChanged = true;
        keys.right = false;
    }
    else if(e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        if (keys.jump) inputChanged = true;
        keys.jump = false;
        keys.jumpJustPressed = false;
    }
    else if(KEY_CODES.ATTACK.includes(e.code)) {
        if (keys.attack) inputChanged = true;
        keys.attack = false;
        keys.attackJustPressed = false;
    }
    
    // Send input to server if any input changed
    if (inputChanged) {
        console.log("Input changed, sending to server:", JSON.stringify(keys));
        sendInputToServer();
    }
}

// Set up button controls
function setupButtonControls() {
    console.log("Setting up button controls...");
    
    const leftBtn = document.getElementById('btn-left');
    const rightBtn = document.getElementById('btn-right');
    const jumpBtn = document.getElementById('btn-jump');
    
    if(!leftBtn || !rightBtn || !jumpBtn) {
        console.error("Could not find game buttons!");
        return;
    }
    
    // Left button
    leftBtn.addEventListener('mousedown', function() {
        keys.left = true;
    });
    leftBtn.addEventListener('mouseup', function() {
        keys.left = false;
    });
    leftBtn.addEventListener('mouseleave', function() {
        keys.left = false;
    });
    leftBtn.addEventListener('touchstart', function(e) {
        e.preventDefault();
        keys.left = true;
    });
    leftBtn.addEventListener('touchend', function(e) {
        e.preventDefault();
        keys.left = false;
    });
    
    // Right button
    rightBtn.addEventListener('mousedown', function() {
        keys.right = true;
    });
    rightBtn.addEventListener('mouseup', function() {
        keys.right = false;
    });
    rightBtn.addEventListener('mouseleave', function() {
        keys.right = false;
    });
    rightBtn.addEventListener('touchstart', function(e) {
        e.preventDefault();
        keys.right = true;
    });
    rightBtn.addEventListener('touchend', function(e) {
        e.preventDefault();
        keys.right = false;
    });
    
    // Jump button - using direct jump method
    jumpBtn.addEventListener('click', function() {
        console.log("Jump button clicked!");
        doJump();
    });
    jumpBtn.addEventListener('touchstart', function(e) {
        e.preventDefault();
        console.log("Jump button touched!");
        doJump();
    });
    
    console.log("Button controls set up");
}

// Direct jump function
function doJump() {
    console.log("doJump called, onGround =", character.onGround, "canJump =", character.canJump);
    
    if (character.onGround && character.canJump) {
        console.log("JUMPING via direct method!");
        character.vel_y = character.jumpSpeed;
        character.onGround = false;
        character.canJump = false;
        character.jumpCooldown = 0.3;
        character.pos_y -= 1; // Small boost to ensure leaving ground
        character.forceJump = true;
        
        // Play jump sound
        playSound('jump');
    }
}

// Reset the game
function resetGame() {
    character.pos_x = 50;
    character.pos_y = 200;
    character.vel_x = 0;
    character.vel_y = 0;
    score = 0;
    lives = 3;
    gameRunning = true;
    
    // Reset collectibles
    collectibles.forEach(c => c.collected = false);
}

// Game timing
let lastTime = 0;

// Main game loop
function gameLoop(timestamp) {
    // Calculate delta time
    const dt = Math.min((timestamp - lastTime) / 1000, 0.1); // Cap at 0.1 seconds
    lastTime = timestamp;
    
    // Update game state
    update(dt);
    
    // Render the game
    render();
    
    // Request next frame
    requestAnimationFrame(gameLoop);
}

// Update game state
function update(dt) {
    if (gameRunning) {
        // Interpolate other players
        interpolateOtherPlayers(dt);
        
        // Interpolate enemies
        interpolateEnemies(dt);
        
        // Update local player with client-side prediction
        if (socket && socket.readyState === WebSocket.OPEN) {
            // Online mode: Use client-side prediction with server reconciliation
            updateCharacter(dt);
            console.log("Character position after update:", character.pos_x, character.pos_y);
            console.log("Character velocity:", character.vel_x, character.vel_y);
            console.log("Input keys:", JSON.stringify(keys));
        } else {
            // Offline mode: Use full local physics
            updateCharacter(dt);
            updateEnemies(dt);
        }
        
        // Update collectibles
        updateCollectibles(dt);
        
        // Update camera
        updateCamera();
        
        // Clear debug info for this frame
        debugInfo = [];
        
        // Check for collisions (client-side prediction only)
        checkCollisions();
    }
}

// Update character position and state
function updateCharacter(dt) {
    // Reset horizontal velocity
    character.vel_x = 0;
    
    // Apply input
    if (keys.left) {
        character.vel_x = -character.speed;
        character.facingRight = false;
        console.log("Moving left");
    }
    if (keys.right) {
        character.vel_x = character.speed;
        character.facingRight = true;
        console.log("Moving right");
    }
    
    // Handle jumping
    if (keys.jumpJustPressed && character.onGround && character.canJump) {
        character.vel_y = character.jumpSpeed;
        character.onGround = false;
        character.canJump = false;
        character.jumpCooldown = 0.2; // 200ms cooldown
        console.log("Jumping");
        
        // Play jump sound
        playSound('jump');
        
        // Reset the jump just pressed flag
        keys.jumpJustPressed = false;
    }
    
    // Variable jump height
    if (!keys.jump && character.vel_y < character.minJumpVelocity) {
        character.vel_y = character.minJumpVelocity;
    }
    
    // Apply gravity
    character.vel_y += character.gravity * dt;
    
    // Handle jumping
    if (character.jumpCooldown > 0) {
        character.jumpCooldown -= dt;
    }
    
    // Check if character is on ground
    const wasOnGround = character.onGround;
    character.onGround = checkGroundContact(character.pos_x, character.pos_y);
    
    // If character just landed, reset jump ability
    if (!wasOnGround && character.onGround) {
        character.canJump = true;
    }
    
    // Handle sword attack
    if (character.attackCooldown > 0) {
        character.attackCooldown -= dt;
    }
    
    // Start a new attack if the attack key was just pressed and not on cooldown
    if (keys.attackJustPressed && character.attackCooldown <= 0) {
        character.attacking = true;
        character.attackCooldown = character.attackDuration;
        console.log("Attacking with sword");
        
        // Play sword swing sound
        playSound('swordSwing');
        
        // Check for enemies in sword range
        attackWithSword();
        
        // Reset the attack just pressed flag
        keys.attackJustPressed = false;
    }
    
    // End attack after duration
    if (character.attacking && character.attackCooldown <= 0) {
        character.attacking = false;
        character.attackCooldown = character.attackCooldownMax;
    }
    
    // Move character with collision detection
    moveWithCollision(dt);
}

// Move character with collision detection
function moveWithCollision(dt) {
    // Calculate new positions
    const newPosX = character.pos_x + character.vel_x * dt;
    const newPosY = character.pos_y + character.vel_y * dt;
    
    console.log("Current position:", character.pos_x, character.pos_y);
    console.log("Velocity:", character.vel_x, character.vel_y);
    console.log("New position:", newPosX, newPosY);
    
    // Horizontal movement with collision detection
    const horizontalCollision = checkHorizontalCollision(newPosX, character.pos_y);
    if (!horizontalCollision) {
        character.pos_x = newPosX;
    } else {
        character.vel_x = 0; // Stop horizontal movement on collision
        console.log("Horizontal collision detected");
    }
    
    // Vertical movement with collision detection
    const verticalCollision = checkVerticalCollision(character.pos_x, newPosY);
    if (!verticalCollision) {
        character.pos_y = newPosY;
        if (character.vel_y > 0) {
            character.onGround = false;
        }
    } else {
        if (character.vel_y > 0) {
            character.onGround = true;
        }
        character.vel_y = 0; // Stop vertical movement on collision
        console.log("Vertical collision detected");
    }
    
    // Ensure character stays within map bounds
    if (character.pos_x < 0) {
        character.pos_x = 0;
    } else if (character.pos_x + character.width > MAP_WIDTH * TILE_SIZE) {
        character.pos_x = MAP_WIDTH * TILE_SIZE - character.width;
    }
    
    // Check if character fell off the map
    if (character.pos_y > MAP_HEIGHT * TILE_SIZE) {
        console.log("Character fell off the map");
        character.pos_x = 50;
        character.pos_y = 100;
        character.vel_x = 0;
        character.vel_y = 0;
    }
}

// Check if character is in contact with the ground
function checkGroundContact(x, y) {
    const left = Math.floor(x);
    const right = Math.floor(x + character.width - 1);
    const bottom = Math.floor(y + character.height);
    
    // Reduce debug logging to avoid console spam
    // console.log('Checking ground contact at bottom =', bottom);
    
    // Check multiple points along the bottom of the character
    const checkPoints = Math.max(5, right - left + 1);
    
    // First check the center point for efficiency
    const centerX = Math.floor(left + (right - left) / 2);
    if (centerX >= 0 && centerX < MAP_WIDTH && bottom >= 0 && bottom < MAP_HEIGHT) {
        if (map[bottom] && map[bottom][centerX] && map[bottom][centerX].solid) {
            return true;
        }
    }
    
    // Then check other points
    for (let i = 0; i < checkPoints; i++) {
        const checkX = Math.floor(left + (i * (right - left) / (checkPoints - 1)));
        
        // Skip the center point as we already checked it
        if (checkX === centerX) continue;
        
        // Make sure we're checking valid map coordinates
        if (checkX >= 0 && checkX < MAP_WIDTH && bottom >= 0 && bottom < MAP_HEIGHT) {
            if (map[bottom] && map[bottom][checkX] && map[bottom][checkX].solid) {
                return true;
            }
        }
    }
    
    // Also check the exact edges for better ground detection
    if (left >= 0 && left < MAP_WIDTH && bottom >= 0 && bottom < MAP_HEIGHT) {
        if (map[bottom] && map[bottom][left] && map[bottom][left].solid) {
            return true;
        }
    }
    
    if (right >= 0 && right < MAP_WIDTH && bottom >= 0 && bottom < MAP_HEIGHT) {
        if (map[bottom] && map[bottom][right] && map[bottom][right].solid) {
            return true;
        }
    }
    
    return false;
}

// Check for horizontal collisions
function checkHorizontalCollision(newX, y) {
    // Use more precise collision detection with floating point values
    const top = Math.floor(y);
    const bottom = Math.floor(y + character.height - 1);
    
    // Check more points along the character's height for better collision detection
    const checkPoints = Math.max(5, bottom - top + 1); // At least 5 check points
    
    if (character.vel_x > 0) { // Moving right
        // Right collision (right wall)
        const right = Math.floor(newX + character.width);
        
        // First check the center point for efficiency
        const centerY = Math.floor(top + (bottom - top) / 2);
        if (right >= 0 && right < MAP_WIDTH && centerY >= 0 && centerY < MAP_HEIGHT) {
            if (map[centerY] && map[centerY][right] && map[centerY][right].solid) {
                character.pos_x = right - character.width;
                return true;
            }
        }
        
        // Check multiple points along the right side of the character
        for (let i = 0; i < checkPoints; i++) {
            const checkY = Math.floor(top + (i * (bottom - top) / (checkPoints - 1)));
            
            // Skip the center point as we already checked it
            if (checkY === centerY) continue;
            
            // Make sure we're checking valid map coordinates
            if (right >= 0 && right < MAP_WIDTH && checkY >= 0 && checkY < MAP_HEIGHT) {
                if (map[checkY] && map[checkY][right] && map[checkY][right].solid) {
                    character.pos_x = right - character.width;
                    return true;
                }
            }
        }
        
        // Additional check for the exact edges
        if (right >= 0 && right < MAP_WIDTH && top >= 0 && top < MAP_HEIGHT) {
            if (map[top] && map[top][right] && map[top][right].solid) {
                character.pos_x = right - character.width;
                return true;
            }
        }
        
        if (right >= 0 && right < MAP_WIDTH && bottom >= 0 && bottom < MAP_HEIGHT) {
            if (map[bottom] && map[bottom][right] && map[bottom][right].solid) {
                character.pos_x = right - character.width;
                return true;
            }
        }
    } else if (character.vel_x < 0) { // Moving left
        // Left collision (left wall)
        const left = Math.floor(newX);
        
        // First check the center point for efficiency
        const centerY = Math.floor(top + (bottom - top) / 2);
        if (left >= 0 && left < MAP_WIDTH && centerY >= 0 && centerY < MAP_HEIGHT) {
            if (map[centerY] && map[centerY][left] && map[centerY][left].solid) {
                character.pos_x = left + 1;
                return true;
            }
        }
        
        // Check multiple points along the left side of the character
        for (let i = 0; i < checkPoints; i++) {
            const checkY = Math.floor(top + (i * (bottom - top) / (checkPoints - 1)));
            
            // Skip the center point as we already checked it
            if (checkY === centerY) continue;
            
            // Make sure we're checking valid map coordinates
            if (left >= 0 && left < MAP_WIDTH && checkY >= 0 && checkY < MAP_HEIGHT) {
                if (map[checkY] && map[checkY][left] && map[checkY][left].solid) {
                    character.pos_x = left + 1;
                    return true;
                }
            }
        }
        
        // Additional check for the exact edges
        if (left >= 0 && left < MAP_WIDTH && top >= 0 && top < MAP_HEIGHT) {
            if (map[top] && map[top][left] && map[top][left].solid) {
                character.pos_x = left + 1;
                return true;
            }
        }
        
        if (left >= 0 && left < MAP_WIDTH && bottom >= 0 && bottom < MAP_HEIGHT) {
            if (map[bottom] && map[bottom][left] && map[bottom][left].solid) {
                character.pos_x = left + 1;
                return true;
            }
        }
    }
    
    return false;
}

// Check for vertical collisions
function checkVerticalCollision(x, newY) {
    // Use more precise collision detection with floating point values
    const left = Math.floor(x);
    const right = Math.floor(x + character.width - 1);
    
    // Check more points along the character's width for better collision detection
    const checkPoints = Math.max(5, right - left + 1); // At least 5 check points
    
    if (character.vel_y > 0) { // Moving down
        // Bottom collision (floor)
        const bottom = Math.floor(newY + character.height);
        
        // First check the center point for efficiency
        const centerX = Math.floor(left + (right - left) / 2);
        if (centerX >= 0 && centerX < MAP_WIDTH && bottom >= 0 && bottom < MAP_HEIGHT) {
            if (map[bottom] && map[bottom][centerX] && map[bottom][centerX].solid) {
                character.pos_y = bottom - character.height;
                return true;
            }
        }
        
        // Check multiple points along the bottom of the character
        for (let i = 0; i < checkPoints; i++) {
            const checkX = Math.floor(left + (i * (right - left) / (checkPoints - 1)));
            
            // Skip the center point as we already checked it
            if (checkX === centerX) continue;
            
            // Make sure we're checking valid map coordinates
            if (checkX >= 0 && checkX < MAP_WIDTH && bottom >= 0 && bottom < MAP_HEIGHT) {
                if (map[bottom] && map[bottom][checkX] && map[bottom][checkX].solid) {
                    character.pos_y = bottom - character.height;
                    return true;
                }
            }
        }
        
        // Additional check for the exact edges
        if (left >= 0 && left < MAP_WIDTH && bottom >= 0 && bottom < MAP_HEIGHT) {
            if (map[bottom] && map[bottom][left] && map[bottom][left].solid) {
                character.pos_y = bottom - character.height;
                return true;
            }
        }
        
        if (right >= 0 && right < MAP_WIDTH && bottom >= 0 && bottom < MAP_HEIGHT) {
            if (map[bottom] && map[bottom][right] && map[bottom][right].solid) {
                character.pos_y = bottom - character.height;
                return true;
            }
        }
    } else if (character.vel_y < 0) { // Moving up
        // Top collision (ceiling)
        const top = Math.floor(newY);
        
        // First check the center point for efficiency
        const centerX = Math.floor(left + (right - left) / 2);
        if (centerX >= 0 && centerX < MAP_WIDTH && top >= 0 && top < MAP_HEIGHT) {
            if (map[top] && map[top][centerX] && map[top][centerX].solid) {
                character.pos_y = top + 1;
                return true;
            }
        }
        
        // Check multiple points along the top of the character
        for (let i = 0; i < checkPoints; i++) {
            const checkX = Math.floor(left + (i * (right - left) / (checkPoints - 1)));
            
            // Skip the center point as we already checked it
            if (checkX === centerX) continue;
            
            // Make sure we're checking valid map coordinates
            if (checkX >= 0 && checkX < MAP_WIDTH && top >= 0 && top < MAP_HEIGHT) {
                if (map[top] && map[top][checkX] && map[top][checkX].solid) {
                    character.pos_y = top + 1;
                    return true;
                }
            }
        }
        
        // Additional check for the exact edges
        if (left >= 0 && left < MAP_WIDTH && top >= 0 && top < MAP_HEIGHT) {
            if (map[top] && map[top][left] && map[top][left].solid) {
                character.pos_y = top + 1;
                return true;
            }
        }
        
        if (right >= 0 && right < MAP_WIDTH && top >= 0 && top < MAP_HEIGHT) {
            if (map[top] && map[top][right] && map[top][right].solid) {
                character.pos_y = top + 1;
                return true;
            }
        }
    }
    
    return false;
}

// Update enemies
function updateEnemies(dt) {
    enemies.forEach(enemy => {
        // Handle defeated enemies
        if (enemy.defeated) {
            // Increment respawn timer
            enemy.respawnTimer += dt;
            
            // Respawn after 5 seconds
            if (enemy.respawnTimer >= 5) {
                enemy.defeated = false;
                enemy.respawnTimer = 0;
                enemy.x = enemy.originalX;
                enemy.y = enemy.originalY;
                enemy.vel_x = 50 * (Math.random() > 0.5 ? 1 : -1); // Randomize direction
                enemy.facingRight = enemy.vel_x > 0;
            }
            return;
        }
        
        // Move enemy
        enemy.x += enemy.vel_x * dt;
        
        // Check bounds and reverse direction if needed
        if (enemy.x <= enemy.leftBound) {
            enemy.x = enemy.leftBound;
            enemy.vel_x = Math.abs(enemy.vel_x);
            enemy.facingRight = true;
        } else if (enemy.x >= enemy.rightBound) {
            enemy.x = enemy.rightBound;
            enemy.vel_x = -Math.abs(enemy.vel_x);
            enemy.facingRight = false;
        }
        
        // Update animation
        enemy.animationTimer += dt;
        if (enemy.animationTimer > 0.2) {
            enemy.animationTimer = 0;
            enemy.animationFrame = (enemy.animationFrame + 1) % 2;
        }
    });
}

// Update collectibles
function updateCollectibles(dt) {
    collectibles.forEach(collectible => {
        if (!collectible.collected) {
            // Update animation
            collectible.animationTimer += dt;
            if (collectible.animationTimer > 0.2) {
                collectible.animationTimer = 0;
                collectible.animationFrame = (collectible.animationFrame + 1) % 4;
            }
        }
    });
}

// Update camera position
function updateCamera() {
    // Center camera on character
    camera.x = character.pos_x - canvas.width / 2;
    
    // Clamp camera to map bounds
    if (camera.x < 0) camera.x = 0;
    if (camera.x > MAP_WIDTH - canvas.width) camera.x = MAP_WIDTH - canvas.width;
}

// Check for collisions with collectibles and enemies
function checkCollisions() {
    // For multiplayer, we only do basic collision detection for client-side prediction
    // The server is the authority on enemy collisions
    
    // Check for collectible collisions (client-side prediction)
    collectibles.forEach((coin, index) => {
        if (!coin.collected && checkRectCollision(
            character.pos_x, character.pos_y, character.width, character.height,
            coin.pos_x || coin.x, coin.pos_y || coin.y, coin.width, coin.height
        )) {
            // Mark as collected locally
            coin.collected = true;
            
            // Play sound
            playSound('coin', 0.5);
            
            // Increment score
            score += 10;
            updateHtmlUI();
            
            // Send collect message to server
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'collectCoin',
                    coinIndex: index,
                    timestamp: performance.now()
                }));
            }
        }
    });
    
    // Check for enemy collisions (client-side prediction only)
    // The server is authoritative for these collisions
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        // Only do full enemy collision detection in offline mode
        enemies.forEach(enemy => {
            // Skip defeated enemies
            if (enemy.defeated) return;
            
            // First check if character is landing on top of enemy using a simpler check
            const characterBottom = character.pos_y + character.height;
            const characterFeet = characterBottom - 2; // Just the bottom 2 pixels of the character
            const enemyTop = enemy.y;
            
            // For debugging, draw the "feet" area
            if (DEBUG_MODE) {
                drawDebugFill(character.pos_x, characterBottom - 2, character.width, 2, 'rgba(0, 0, 255, 0.5)'); // Semi-transparent blue
                drawDebugFill(enemy.x, enemy.y, enemy.width, 2, 'rgba(255, 165, 0, 0.5)'); // Semi-transparent orange
            }
            
            if (character.vel_y > 0 && // Character is falling
                characterFeet <= enemyTop && // Character's feet are at or above enemy's top
                characterBottom >= enemyTop && // Character's bottom is at or below enemy's top
                character.pos_x + 4 < enemy.x + enemy.width && // Horizontal overlap check
                character.pos_x + character.width - 4 > enemy.x) {
                
                // Character is landing on top of enemy
                character.vel_y = character.jumpSpeed * 0.7; // Bounce
                enemy.defeated = true; // Defeat the enemy
                score += 50;
                
                // Play jump sound (reuse for bounce)
                playSound('jump', 0.15);
                
                return; // Skip further checks for this enemy
            }
            
            // If not landing on top, check for other collisions
            if (checkCharacterEnemyCollision(enemy)) {
                
                // Play damage sound
                playSound('damage');
            }
        });
    } else {
        // In online mode, just do basic collision detection for visual feedback
        // The server will handle the actual collision logic
        enemies.forEach(enemy => {
            if (!enemy.defeated && checkRectCollision(
                character.pos_x, character.pos_y, character.width, character.height,
                enemy.x, enemy.y, enemy.width, enemy.height
            )) {
                // Just for visual feedback - no actual game logic here
                if (DEBUG_MODE) {
                    drawDebugBox({
                        x: enemy.x,
                        y: enemy.y,
                        width: enemy.width,
                        height: enemy.height
                    }, '#FF0000');
                }
            }
        });
    }
}

// Check if two rectangles are colliding
function checkRectCollision(x1, y1, w1, h1, x2, y2, w2, h2) {
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
}

// Lose a life
function loseLife(id) {
    if(id == playerId) {
        lives--;
        if (lives <= 0) {
            gameRunning = false;
        } else {
            // Reset character position
            character.pos_x = 50;
            character.pos_y = 200;
            character.vel_x = 0;
            character.vel_y = 0;
        }
    } else {
        otherPlayers[id].pos_x = 50;
        otherPlayers[id].pos_y = 200;
        otherPlayers[id].vel_x = 0;
        otherPlayers[id].vel_y = 0;
    }
}

// Render the game
function render() {
    // Clear the canvas
    ctx.fillStyle = '#87CEEB'; // Sky blue background
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw game elements
    drawMap();
    drawCollectibles();
    drawEnemies();
    
    // Draw other players
    drawOtherPlayers();
    
    // Draw local player
    drawCharacter();
    
    // Draw UI
    drawUI();
    
    // Draw connection status
    drawConnectionStatus();
    
    // Draw IP info
    drawIPInfo();
    
    // Draw debug visualization if enabled
    if (DEBUG_MODE) {
        renderDebugInfo();
    }
    
    if (!gameRunning) {
        drawGameOver();
    }
}

// Render debug information
function renderDebugInfo() {
    debugInfo.forEach(info => {
        switch(info.type) {
            case 'box':
                ctx.strokeStyle = info.color;
                ctx.lineWidth = 1;
                ctx.strokeRect(
                    info.x - camera.x,
                    info.y,
                    info.width,
                    info.height
                );
                break;
            case 'pixel':
                ctx.fillStyle = info.color;
                ctx.fillRect(
                    info.x - camera.x,
                    info.y,
                    1,
                    1
                );
                break;
            case 'fill':
                ctx.fillStyle = info.color;
                ctx.fillRect(
                    info.x - camera.x,
                    info.y,
                    info.width,
                    info.height
                );
                break;
        }
    });
}

// Draw the map
function drawMap() {
    const startX = Math.floor(camera.x);
    const endX = Math.min(Math.ceil(camera.x + canvas.width), MAP_WIDTH);
    
    for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = startX; x < endX; x++) {
            if (map[y] && map[y][x] && map[y][x].type !== 'empty') {
                ctx.fillStyle = map[y][x].color;
                ctx.fillRect(x - camera.x, y, 1, 1);
            }
        }
    }
}

// Draw collectibles
function drawCollectibles() {
    collectibles.forEach(collectible => {
        if (!collectible.collected) {
            if (collectible.type === 'coin') {
                drawCoin(collectible);
            }
        }
    });
}

// Draw a coin with animation
function drawCoin(coin) {
    const baseX = coin.x - camera.x;
    const baseY = coin.y;
    const frame = coin.animationFrame;
    
    // Gold color for the coin
    const goldColor = '#FFD700';
    const shineColor = '#FFFFFF';
    const shadowColor = '#B8860B';
    
    // Draw the coin based on animation frame
    switch(frame) {
        case 0: // Full coin
            // Outer edge (shadow)
            ctx.fillStyle = shadowColor;
            ctx.fillRect(baseX, baseY + 1, 8, 6);
            ctx.fillRect(baseX + 1, baseY, 6, 8);
            
            // Inner coin (gold)
            ctx.fillStyle = goldColor;
            ctx.fillRect(baseX + 1, baseY + 1, 6, 6);
            
            // Shine detail
            ctx.fillStyle = shineColor;
            ctx.fillRect(baseX + 2, baseY + 2, 2, 2);
            break;
            
        case 1: // Slightly narrower (rotating)
            // Outer edge (shadow)
            ctx.fillStyle = shadowColor;
            ctx.fillRect(baseX + 1, baseY + 1, 6, 6);
            
            // Inner coin (gold)
            ctx.fillStyle = goldColor;
            ctx.fillRect(baseX + 2, baseY + 1, 4, 6);
            
            // Shine detail
            ctx.fillStyle = shineColor;
            ctx.fillRect(baseX + 3, baseY + 2, 1, 2);
            break;
            
        case 2: // Thinnest (edge view)
            // Outer edge (shadow)
            ctx.fillStyle = shadowColor;
            ctx.fillRect(baseX + 2, baseY + 1, 4, 6);
            
            // Inner coin (gold)
            ctx.fillStyle = goldColor;
            ctx.fillRect(baseX + 3, baseY + 1, 2, 6);
            break;
            
        case 3: // Slightly wider again (rotating back)
            // Outer edge (shadow)
            ctx.fillStyle = shadowColor;
            ctx.fillRect(baseX + 1, baseY + 1, 6, 6);
            
            // Inner coin (gold)
            ctx.fillStyle = goldColor;
            ctx.fillRect(baseX + 2, baseY + 1, 4, 6);
            
            // Shine detail
            ctx.fillStyle = shineColor;
            ctx.fillRect(baseX + 4, baseY + 2, 1, 2);
            break;
    }
}

// Draw enemies
function drawEnemies() {
    enemies.forEach(enemy => {
        // Skip defeated enemies or draw them differently
        if (enemy.defeated) {
            // Draw defeated state (optional)
            drawDefeatedEnemy(enemy);
            return;
        }
        
        // Draw based on enemy type
        switch(enemy.type) {
            case 'slime':
                drawSlimeEnemy(enemy);
                break;
            case 'robot':
                drawRobotEnemy(enemy);
                break;
            case 'bat':
                drawBatEnemy(enemy);
                break;
            default:
                // Fallback to simple rectangle
                ctx.fillStyle = '#FF00FF'; // Magenta
                ctx.fillRect(
                    enemy.x - camera.x,
                    enemy.y,
                    enemy.width,
                    enemy.height
                );
        }
    });
}

// Draw a slime enemy
function drawSlimeEnemy(enemy) {
    const baseX = enemy.x - camera.x;
    const baseY = enemy.y;
    const frame = enemy.animationFrame;
    
    // Slime body (green)
    ctx.fillStyle = '#00AA00';
    
    // Base shape depends on animation frame
    if (frame === 0) {
        // Compressed shape
        ctx.fillRect(baseX + 2, baseY + 6, 12, 10);
        ctx.fillRect(baseX + 1, baseY + 8, 14, 8);
    } else {
        // Extended shape
        ctx.fillRect(baseX + 2, baseY + 4, 12, 12);
        ctx.fillRect(baseX + 1, baseY + 6, 14, 10);
    }
    
    // Eyes (white with black pupils)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(baseX + 4, baseY + 8, 2, 2);
    ctx.fillRect(baseX + 10, baseY + 8, 2, 2);
    
    ctx.fillStyle = '#000000';
    ctx.fillRect(baseX + 5, baseY + 9, 1, 1);
    ctx.fillRect(baseX + 11, baseY + 9, 1, 1);
    
    // Mouth
    ctx.fillStyle = '#000000';
    if (frame === 0) {
        ctx.fillRect(baseX + 6, baseY + 12, 4, 1);
    } else {
        ctx.fillRect(baseX + 5, baseY + 13, 6, 1);
    }
    
    // Debug: Draw the pixel mask outline
    if (DEBUG_MODE) {
        drawPixelMask(enemy.pixelMasks[frame], baseX, baseY);
    }
}

// Draw a robot enemy
function drawRobotEnemy(enemy) {
    const baseX = enemy.x - camera.x;
    const baseY = enemy.y;
    const frame = enemy.animationFrame;
    const facingMod = enemy.facingRight ? 1 : -1;
    
    // Robot body (metallic gray)
    ctx.fillStyle = '#888888';
    ctx.fillRect(baseX + 2, baseY + 2, 12, 12);
    
    // Head details
    ctx.fillStyle = '#AAAAAA';
    ctx.fillRect(baseX + 3, baseY + 3, 10, 5);
    
    // Eye (changes color based on animation frame)
    ctx.fillStyle = frame === 0 ? '#FF0000' : '#FF6600';
    ctx.fillRect(baseX + 5 + (facingMod * 2), baseY + 4, 2, 2);
    
    // Antenna
    ctx.fillStyle = '#000000';
    ctx.fillRect(baseX + 8, baseY, 1, 2);
    
    // Legs
    ctx.fillStyle = '#555555';
    if (frame === 0) {
        // First leg position
        ctx.fillRect(baseX + 3, baseY + 14, 3, 2);
        ctx.fillRect(baseX + 10, baseY + 14, 3, 2);
    } else {
        // Second leg position
        ctx.fillRect(baseX + 4, baseY + 14, 3, 2);
        ctx.fillRect(baseX + 9, baseY + 14, 3, 2);
    }
    
    // Arms
    ctx.fillStyle = '#666666';
    ctx.fillRect(baseX + 1, baseY + 6, 1, 4);
    ctx.fillRect(baseX + 14, baseY + 6, 1, 4);
    
    // Debug: Draw the pixel mask outline
    if (DEBUG_MODE) {
        drawPixelMask(enemy.pixelMasks[frame], baseX, baseY);
    }
}

// Draw a bat enemy
function drawBatEnemy(enemy) {
    const baseX = enemy.x - camera.x;
    const baseY = enemy.y;
    const frame = enemy.animationFrame;
    
    // Bat body (dark purple)
    ctx.fillStyle = '#440044';
    ctx.fillRect(baseX + 6, baseY + 6, 4, 6);
    
    // Wings (change based on animation frame)
    ctx.fillStyle = '#660066';
    if (frame === 0) {
        // Wings up
        ctx.fillRect(baseX + 2, baseY + 2, 4, 6);
        ctx.fillRect(baseX + 10, baseY + 2, 4, 6);
    } else {
        // Wings down
        ctx.fillRect(baseX + 2, baseY + 6, 4, 6);
        ctx.fillRect(baseX + 10, baseY + 6, 4, 6);
    }
    
    // Eyes (red)
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(baseX + 5, baseY + 7, 2, 2);
    ctx.fillRect(baseX + 9, baseY + 7, 2, 2);
    
    // Fangs
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(baseX + 6, baseY + 12, 1, 2);
    ctx.fillRect(baseX + 9, baseY + 12, 1, 2);
    
    // Debug: Draw the pixel mask outline
    if (DEBUG_MODE) {
        drawPixelMask(enemy.pixelMasks[frame], baseX, baseY);
    }
}

// Draw a pixel mask for debugging
function drawPixelMask(mask, baseX, baseY) {
    if (!mask) return;
    
    ctx.strokeStyle = '#FF0000'; // Red outline
    
    for (let y = 0; y < mask.length; y++) {
        for (let x = 0; x < mask[y].length; x++) {
            if (mask[y][x]) {
                ctx.strokeRect(baseX + x, baseY + y, 1, 1);
            }
        }
    }
}

// Draw the character
function drawCharacter() {
    // Draw character sprite
    for (let y = 0; y < character.height; y++) {
        for (let x = 0; x < character.width; x++) {
            const pixelColor = character.sprite[character.animationFrame][y][x];
            if (pixelColor) { // Only draw non-null pixels
                ctx.fillStyle = pixelColor;
                ctx.fillRect(
                    character.pos_x + (character.facingRight ? x : character.width - 1 - x) - camera.x,
                    character.pos_y + y,
                    1,
                    1
                );
            }
        }
    }
    
    // Draw sword when attacking
    if (character.attacking) {
        drawSword();
    }
}

// Draw the sword
function drawSword() {
    // Sword position based on character facing direction
    const swordX = character.facingRight ? 
        character.pos_x + character.width : 
        character.pos_x - character.swordReach;
    
    const swordWidth = character.swordReach;
    const swordY = character.pos_y + 8; // Position sword at middle height
    const swordHeight = 8; // Thinner sword height
    
    // Draw sword with a more pixel-art style
    ctx.fillStyle = '#CCCCCC'; // Light gray for blade
    
    if (character.facingRight) {
        // Right-facing sword
        // Handle
        ctx.fillStyle = '#8B4513'; // Brown handle
        ctx.fillRect(
            character.pos_x + character.width - 2 - camera.x,
            character.pos_y + 10,
            4,
            6
        );
        
        // Guard
        ctx.fillStyle = '#FFD700'; // Gold guard
        ctx.fillRect(
            character.pos_x + character.width + 2 - camera.x,
            character.pos_y + 9,
            2,
            8
        );
        
        // Blade
        ctx.fillStyle = '#CCCCCC'; // Silver blade
        for (let i = 0; i < character.swordReach - 6; i++) {
            // Tapered blade (gets narrower toward the tip)
            const bladeHeight = Math.max(4 - Math.floor(i / 4), 1);
            const yOffset = Math.floor((8 - bladeHeight) / 2);
            
            ctx.fillRect(
                character.pos_x + character.width + 4 + i - camera.x,
                character.pos_y + 10 + yOffset,
                1,
                bladeHeight
            );
        }
        
        // Tip
        ctx.fillRect(
            character.pos_x + character.width + character.swordReach - 2 - camera.x,
            character.pos_y + 11,
            2,
            2
        );
    } else {
        // Left-facing sword
        // Handle
        ctx.fillStyle = '#8B4513'; // Brown handle
        ctx.fillRect(
            character.pos_x - 2 - camera.x,
            character.pos_y + 10,
            4,
            6
        );
        
        // Guard
        ctx.fillStyle = '#FFD700'; // Gold guard
        ctx.fillRect(
            character.pos_x - 4 - camera.x,
            character.pos_y + 9,
            2,
            8
        );
        
        // Blade
        ctx.fillStyle = '#CCCCCC'; // Silver blade
        for (let i = 0; i < character.swordReach - 6; i++) {
            // Tapered blade (gets narrower toward the tip)
            const bladeHeight = Math.max(4 - Math.floor(i / 4), 1);
            const yOffset = Math.floor((8 - bladeHeight) / 2);
            
            ctx.fillRect(
                character.pos_x - 5 - i - camera.x,
                character.pos_y + 10 + yOffset,
                1,
                bladeHeight
            );
        }
        
        // Tip
        ctx.fillRect(
            character.pos_x - character.swordReach - camera.x,
            character.pos_y + 11,
            2,
            2
        );
    }
    
    // Draw sword hitbox in debug mode
    if (DEBUG_MODE) {
        ctx.strokeStyle = '#FF0000';
        ctx.strokeRect(
            swordX - camera.x,
            swordY,
            swordWidth,
            swordHeight
        );
    }
}

// Draw UI elements
function drawUI() {
    ctx.fillStyle = '#FFF';
    ctx.font = '12px Arial';
    ctx.fillText(`Score: ${score}`, 10, 20);
    ctx.fillText(`Lives: ${lives}`, 10, 40);
    
    // Update the HTML UI elements
    updateHtmlUI();
}

// Update HTML UI elements
function updateHtmlUI() {
    // Update score and lives in the HTML
    const scoreDisplay = document.getElementById('score-display');
    const livesDisplay = document.getElementById('lives-display');
    
    if (scoreDisplay) {
        scoreDisplay.textContent = score;
    }
    
    if (livesDisplay) {
        livesDisplay.textContent = lives;
    }
}

// Draw game over screen
function drawGameOver() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#FFF';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 20);
    ctx.font = '16px Arial';
    ctx.fillText(`Final Score: ${score}`, canvas.width / 2, canvas.height / 2 + 10);
    ctx.fillText('Press R to restart', canvas.width / 2, canvas.height / 2 + 40);
    ctx.textAlign = 'left';
}

// Draw a defeated enemy (optional)
function drawDefeatedEnemy(enemy) {
    const baseX = enemy.x - camera.x;
    const baseY = enemy.y;
    
    // Draw a simple "defeated" state - you can customize this
    ctx.fillStyle = '#888888'; // Gray color for defeated enemies
    ctx.fillRect(baseX + 4, baseY + 12, 8, 4); // Flattened shape
    
    // Draw respawn indicator
    const respawnProgress = enemy.respawnTimer / 5; // 5 seconds to respawn
    const respawnWidth = 16 * respawnProgress;
    
    // Draw respawn progress bar
    ctx.fillStyle = 'rgba(0, 255, 0, 0.5)'; // Semi-transparent green
    ctx.fillRect(baseX, baseY - 5, respawnWidth, 2);
}

// Create sound toggle button
function createSoundButton() {
    const soundButton = document.createElement('button');
    soundButton.id = 'sound-button';
    soundButton.textContent = '🔇';
    soundButton.style.position = 'absolute';
    soundButton.style.top = '10px';
    soundButton.style.right = '10px';
    soundButton.style.width = '40px';
    soundButton.style.height = '40px';
    soundButton.style.fontSize = '20px';
    soundButton.style.backgroundColor = '#444';
    soundButton.style.color = '#fff';
    soundButton.style.border = 'none';
    soundButton.style.borderRadius = '5px';
    soundButton.style.cursor = 'pointer';
    soundButton.style.zIndex = '1000';
    
    soundButton.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleSounds();
    });
    
    document.body.appendChild(soundButton);
}

// Attack with sword
function attackWithSword() {
    // Calculate sword hitbox based on character position and facing direction
    const swordX = character.facingRight ? 
        character.pos_x + character.width : 
        character.pos_x - character.swordReach;
    
    const swordWidth = character.facingRight ? 
        character.swordReach : 
        character.swordReach;
    
    const swordY = character.pos_y + 8; // Position sword at middle height
    const swordHeight = 16; // Sword height
    
    // Send sword attack to server
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'swordAttack',
            playerId: playerId,
            swordX: swordX,
            swordY: swordY,
            swordWidth: swordWidth,
            swordHeight: swordHeight,
            facingRight: character.facingRight
        }));
    }
    
    // Client-side prediction for immediate feedback
    enemies.forEach(enemy => {
        // Skip defeated enemies
        if (enemy.defeated) return;
        
        // Check if sword hitbox intersects with enemy
        if (checkRectCollision(
            swordX, swordY, swordWidth, swordHeight,
            enemy.x, enemy.y, enemy.width, enemy.height
        )) {
            // Defeat enemy (client-side prediction)
            enemy.defeated = true;
            score += 50;
            
            // Play enemy defeat sound
            playSound('enemyDefeat');
        }
    });
}

// Interpolate other players between server updates
function interpolateOtherPlayers(dt) {
    const now = performance.now();
    const interpolationDuration = 100; // Match server update rate (100ms)
    
    Object.values(otherPlayers).forEach(player => {
        if (player.prevPos_x !== undefined && player.targetPos_x !== undefined) {
            const elapsed = now - (player.interpolationStart || 0);
            const t = Math.min(elapsed / interpolationDuration, 1);
            
            // Linear interpolation
            player.pos_x = player.prevPos_x + (player.targetPos_x - player.prevPos_x) * t;
            player.pos_y = player.prevPos_y + (player.targetPos_y - player.prevPos_y) * t;
            
            // Update animation
            if (player.targetPos_x !== player.prevPos_x || player.targetPos_y !== player.prevPos_y) {
                player.animationTimer = (player.animationTimer || 0) + dt;
                if (player.animationTimer >= 0.2) {
                    player.animationTimer = 0;
                    player.animationFrame = (player.animationFrame || 0 + 1) % 2;
                }
            }
        }
    });
}

// Interpolate enemies between server updates
function interpolateEnemies(dt) {
    const now = performance.now();
    const interpolationDuration = 100; // Match server update rate (100ms)
    
    enemies.forEach(enemy => {
        if (enemy.prevPos_x !== undefined && enemy.targetPos_x !== undefined) {
            const elapsed = now - (enemy.interpolationStart || 0);
            const t = Math.min(elapsed / interpolationDuration, 1);
            
            // Linear interpolation
            enemy.x = enemy.prevPos_x + (enemy.targetPos_x - enemy.prevPos_x) * t;
            enemy.y = enemy.prevPos_y + (enemy.targetPos_y - enemy.prevPos_y) * t;
            
            // Update animation if not controlled by server
            if (socket && socket.readyState !== WebSocket.OPEN) {
                enemy.animationTimer += dt;
                if (enemy.animationTimer >= 0.2) {
                    enemy.animationTimer = 0;
                    enemy.animationFrame = (enemy.animationFrame + 1) % 2;
                }
            }
        }
        
        enemy.pos_x = enemy.targetPos_x;
        enemy.pos_y = enemy.targetPos_y;
    });
}

// Draw other players
function drawOtherPlayers() {
    // Log how many other players we're trying to draw
    const numOtherPlayers = Object.keys(otherPlayers).length;
    
    if (numOtherPlayers === 0) {
        return;
    }
    
    Object.entries(otherPlayers).forEach(([id, player]) => {
        // Skip if invalid position
        if (typeof player.pos_x !== 'number' || typeof player.pos_y !== 'number') {
            console.warn(`Player ${id} has invalid position data`, player);
            return;
        }
        
        // Calculate screen position
        const screenX = Math.floor(player.pos_x - camera.x);
        const screenY = Math.floor(player.pos_y);
        
        // Only draw if on screen
        if (screenX < -player.width || screenX > canvas.width || 
            screenY < -player.height || screenY > canvas.height) {
            return; // Off screen
        }
        
        // If player doesn't have a sprite, create one
        if (!player.sprite || !player.sprite[0]) {
            player.sprite = createCharacterSprite();
        }
        
        // Draw player sprite with color tint
        const frameToUse = player.animationFrame || 0;
        
        // Draw the character sprite with a red tint
        if (player.sprite && player.sprite[frameToUse]) {
            try {
                for (let y = 0; y < (player.height || 24); y++) {
                    for (let x = 0; x < (player.width || 16); x++) {
                        if (player.sprite[frameToUse] && 
                            player.sprite[frameToUse][y] && 
                            player.sprite[frameToUse][y][x]) {
                            
                            const pixelColor = player.sprite[frameToUse][y][x];
                            if (pixelColor) {
                                // Apply red tint to the pixel color
                                const tintedColor = applyRedTint(pixelColor);
                                ctx.fillStyle = tintedColor;
                                ctx.fillRect(
                                    screenX + (player.facingRight ? x : (player.width || 16) - 1 - x),
                                    screenY + y,
                                    1,
                                    1
                                );
                            }
                        }
                    }
                }
            } catch (error) {
                console.error(`Error drawing sprite for player ${id}:`, error);
                
                // Fallback to red rectangle if sprite drawing fails
                ctx.fillStyle = '#FF0000';
                ctx.fillRect(screenX, screenY, player.width || 16, player.height || 24);
            }
        } else {
            // Fallback to red rectangle if no sprite
            ctx.fillStyle = '#FF0000';
            ctx.fillRect(screenX, screenY, player.width || 16, player.height || 24);
        }
        
        // Draw sword if player is attacking
        if (player.attacking) {
            drawOtherPlayerSword(player, screenX, screenY);
        }
        
        // Draw player ID above their head
        ctx.font = '10px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(`Player ${id.substring(id.length - 4)}`, screenX + (player.width || 16) / 2, screenY - 5);
    });
}

// Draw sword for other players
function drawOtherPlayerSword(player, screenX, screenY) {
    // Sword position based on player facing direction
    const swordX = player.facingRight ? 
        screenX + player.width : 
        screenX - player.swordReach;
    
    const swordWidth = player.swordReach;
    const swordY = screenY + 8; // Position sword at middle height
    const swordHeight = 8; // Thinner sword height
    
    if (player.facingRight) {
        // Right-facing sword
        // Handle
        ctx.fillStyle = '#8B4513'; // Brown handle
        ctx.fillRect(
            screenX + player.width - 2,
            screenY + 10,
            4,
            6
        );
        
        // Guard
        ctx.fillStyle = '#FFD700'; // Gold guard
        ctx.fillRect(
            screenX + player.width + 2,
            screenY + 9,
            2,
            8
        );
        
        // Blade
        ctx.fillStyle = '#FF6666'; // Red-tinted blade
        for (let i = 0; i < player.swordReach - 6; i++) {
            // Tapered blade (gets narrower toward the tip)
            const bladeHeight = Math.max(4 - Math.floor(i / 4), 1);
            const yOffset = Math.floor((8 - bladeHeight) / 2);
            
            ctx.fillRect(
                screenX + player.width + 4 + i,
                screenY + 10 + yOffset,
                1,
                bladeHeight
            );
        }
        
        // Tip
        ctx.fillRect(
            screenX + player.width + player.swordReach - 2,
            screenY + 11,
            2,
            2
        );
    } else {
        // Left-facing sword
        // Handle
        ctx.fillStyle = '#8B4513'; // Brown handle
        ctx.fillRect(
            screenX - 2,
            screenY + 10,
            4,
            6
        );
        
        // Guard
        ctx.fillStyle = '#FFD700'; // Gold guard
        ctx.fillRect(
            screenX - 4,
            screenY + 9,
            2,
            8
        );
        
        // Blade
        ctx.fillStyle = '#FF6666'; // Red-tinted blade
        for (let i = 0; i < player.swordReach - 6; i++) {
            // Tapered blade (gets narrower toward the tip)
            const bladeHeight = Math.max(4 - Math.floor(i / 4), 1);
            const yOffset = Math.floor((8 - bladeHeight) / 2);
            
            ctx.fillRect(
                screenX - 5 - i,
                screenY + 10 + yOffset,
                1,
                bladeHeight
            );
        }
        
        // Tip
        ctx.fillRect(
            screenX - player.swordReach,
            screenY + 11,
            2,
            2
        );
    }
}

// Helper function to apply red tint to a color
function applyRedTint(originalColor) {
    // If the color is already in hex format
    if (originalColor.startsWith('#')) {
        // Parse the hex color
        const r = parseInt(originalColor.substr(1, 2), 16);
        const g = parseInt(originalColor.substr(3, 2), 16);
        const b = parseInt(originalColor.substr(5, 2), 16);
        
        // Increase red component, decrease others
        const newR = Math.min(255, r + 50);
        const newG = Math.max(0, g - 30);
        const newB = Math.max(0, b - 30);
        
        // Convert back to hex
        return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
    }
    
    // If the color is in rgb/rgba format
    if (originalColor.startsWith('rgb')) {
        // Extract the RGB values
        const rgbMatch = originalColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)/);
        if (rgbMatch) {
            const r = parseInt(rgbMatch[1]);
            const g = parseInt(rgbMatch[2]);
            const b = parseInt(rgbMatch[3]);
            const a = rgbMatch[4] ? parseFloat(rgbMatch[4]) : 1;
            
            // Increase red component, decrease others
            const newR = Math.min(255, r + 50);
            const newG = Math.max(0, g - 30);
            const newB = Math.max(0, b - 30);
            
            // Return the tinted color
            return `rgba(${newR}, ${newG}, ${newB}, ${a})`;
        }
    }
    
    // If we can't parse the color, return red
    return '#FF0000';
}

// Draw connection status
function drawConnectionStatus() {
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    
    if (socket && socket.readyState === WebSocket.OPEN) {
        ctx.fillStyle = 'green';
        ctx.fillText('Connected', 10, 20);
    } else {
        ctx.fillStyle = 'red';
        ctx.fillText('Disconnected', 10, 20);
    }
}

// Initialize the game
init(); 

// Update IP display in the game UI
function updateIPDisplay(status) {
    // This will be called whenever the connection status changes
    // We'll use this to draw the IP address in the game canvas
    const serverIP = WS_SERVER_URL.replace('ws://', '');
    
    // Store the connection info to be rendered in the game UI
    connectionInfo = {
        ip: serverIP,
        status: status
    };
    
    console.log(`IP display updated: ${serverIP} (${status})`);
}

// Draw IP information in the game UI
function drawIPInfo() {
    if (!connectionInfo.ip) return;
    
    // Set font and style
    ctx.font = '16px Arial';
    ctx.textAlign = 'right';
    
    // Set color based on connection status
    switch (connectionInfo.status) {
        case 'connected':
            ctx.fillStyle = '#00CC00'; // Green
            break;
        case 'disconnected':
            ctx.fillStyle = '#CC0000'; // Red
            break;
        case 'connecting':
            ctx.fillStyle = '#CCCC00'; // Yellow
            break;
        case 'error':
            ctx.fillStyle = '#CC0000'; // Red
            break;
        default:
            ctx.fillStyle = '#FFFFFF'; // White
    }
    
    // Draw IP text in the top-right corner
    const text = `Server: ${connectionInfo.ip}`;
    ctx.fillText(text, canvas.width - 10, 25);
    
    // Add a border around the text for better visibility
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    const textWidth = ctx.measureText(text).width;
    ctx.strokeRect(canvas.width - textWidth - 15, 10, textWidth + 10, 20);
}