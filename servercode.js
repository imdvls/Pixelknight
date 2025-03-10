const WebSocket = require('ws');
const server = new WebSocket.Server({ 
  port: 8080,
  perMessageDeflate: false, // Disable compression which might cause issues
  // Add CORS headers for the WebSocket handshake
  verifyClient: (info) => {
    // Log connection attempts
    console.log(`Connection attempt from origin: ${info.origin || 'Unknown'}`);
    console.log(`Connection headers:`, info.req.headers);
    
    // Allow connections from any origin
    return true;
  }
});

// Log when server starts
console.log(`WebSocket server started on port 8080`);
console.log(`Local access: ws://localhost:8080`);
console.log(`Network access: Find your IP address using 'ifconfig' or 'ipconfig'`);

// Game constants
const TILE_SIZE = 16; // Each tile is 16x16 pixels
const MAP_WIDTH = 1000;
const MAP_HEIGHT = 240;
const TICK_RATE = 10; // 10 updates per second
const HEARTBEAT_INTERVAL = 3000;
const INACTIVITY_TIMEOUT = 30000;

let gameState = {
  players: {},
  enemies: [],
  collectibles: [],
  map: [],
  physics: { 
    gravity: 800, 
    jumpSpeed: -350, 
    speed: 150, 
    tileSize: 16,
    minJumpVelocity: -200
  }
};

let heartbeats = {};

// Initialize the game state
initializeGameState();

server.on('connection', ws => {
  const playerId = Date.now().toString();

  console.log("Connection: id = " + playerId);

  try {
    // Send initial handshake
    const handshakeData = {
      type: 'handshake',
      playerId,
      mapData: gameState.map,
      enemiesData: gameState.enemies,
      collectiblesData: gameState.collectibles,
      characterProperties: gameState.physics,
      serverTime: Date.now()
    };
    
    console.log("Sending handshake with:");
    console.log("- Map data size:", gameState.map.length);
    console.log("- Enemies:", gameState.enemies.length);
    console.log("- Collectibles:", gameState.collectibles.length);
    
    const handshakeJSON = JSON.stringify(handshakeData);
    console.log(`Handshake JSON length: ${handshakeJSON.length} bytes`);
    
    // Send using callback to check for errors
    ws.send(handshakeJSON, (err) => {
      if (err) {
        console.error("Error sending handshake:", err);
      } else {
        console.log("Handshake sent successfully");
      }
    });

    // Initialize player state
    gameState.players[playerId] = {
      id: playerId,
      pos_x: 50, 
      pos_y: 100, 
      vel_x: 0, 
      vel_y: 0, 
      width: 16,
      height: 24,
      onGround: false,
      facingRight: true,
      animationFrame: 0,
      lastProcessedInput: 0
    };

    heartbeats[playerId] = Date.now();

    ws.on('message', msg => {
      try {
        // Check if message is a string or buffer and handle accordingly
        const msgStr = msg instanceof Buffer ? msg.toString() : msg;
        
        // Log the raw message for debugging
        console.log(`Raw message from client ${playerId}:`, msgStr.substring(0, 100) + (msgStr.length > 100 ? '...' : ''));
        
        const data = JSON.parse(msgStr);

        if (data.type === 'heartbeat') {
          heartbeats[playerId] = Date.now();
          return;
        }

        if (data.type === 'input') {
          if (gameState.players[playerId]) {
            // Store the input state
            gameState.players[playerId].keys = data.keys;
            gameState.players[playerId].lastProcessedInput = data.sequence;
            heartbeats[playerId] = Date.now();
          }
        }
        
        if (data.type === 'collectCoin') {
          if (data.coinIndex >= 0 && data.coinIndex < gameState.collectibles.length) {
            gameState.collectibles[data.coinIndex].collected = true;
          }
        }
        
        if (data.type === 'swordAttack') {
          // Handle sword attack from client
          handleSwordAttack(data);
        }

        if (data.type === 'disconnect') {
          delete gameState.players[playerId];
          delete heartbeats[playerId];
          broadcast({ 
            type: 'playerDisconnected', 
            playerId 
          });
        }
      } catch (error) {
        console.error('Error processing message:', error);
        console.error('Raw message content:', msg);
      }
    });

    ws.on('close', () => {
      delete gameState.players[playerId];
      delete heartbeats[playerId];
      broadcast({ 
        type: 'playerDisconnected', 
        playerId 
      });
    });

    // Broadcast to all clients that a new player has joined
    broadcast({
      type: 'playerJoined',
      playerId,
      player: gameState.players[playerId]
    });
  } catch (error) {
    console.error("Error in connection handler:", error);
  }
});

// Game Loop
setInterval(() => {
  const now = Date.now();
  
  // Update players
  Object.entries(gameState.players).forEach(([id, player]) => {
    if (now - heartbeats[id] > INACTIVITY_TIMEOUT) {
      delete gameState.players[id];
      delete heartbeats[id];
      broadcast({ 
        type: 'playerDisconnected', 
        playerId: id 
      });
      return;
    }

    // Process player input
    processPlayerInput(player);

    // Apply physics
    player.vel_y += gameState.physics.gravity * (TICK_RATE / 1000);
    
    // Apply movement with collision detection
    movePlayerWithCollision(player, TICK_RATE / 1000);
  });

  // Update enemies
  updateEnemies(TICK_RATE / 1000);

  // Check for collisions
  checkCollisions();

  // Send game state to all clients
  if (Object.keys(gameState.players).length > 0) {
    console.log(`Broadcasting game state with ${Object.keys(gameState.players).length} players`);
    console.log("Player IDs:", Object.keys(gameState.players).join(', '));
    
    broadcast({ 
      type: 'gameState', 
      players: gameState.players, 
      enemies: gameState.enemies, 
      collectibles: gameState.collectibles,
      serverTime: Date.now()
    });
  }
}, TICK_RATE);

// Heartbeat monitoring
setInterval(() => {
  const now = Date.now();
  Object.keys(heartbeats).forEach(id => {
    if (now - heartbeats[id] > INACTIVITY_TIMEOUT) {
      delete gameState.players[id];
      delete heartbeats[id];
      broadcast({ 
        type: 'playerDisconnected', 
        playerId: id 
      });
    }
  });
}, HEARTBEAT_INTERVAL);

function processPlayerInput(player) {
  // Reset horizontal velocity
  player.vel_x = 0;
  
  // Apply input
  if (player.keys) {
    if (player.keys.left) {
      player.vel_x = -gameState.physics.speed;
      player.facingRight = false;
    }
    if (player.keys.right) {
      player.vel_x = gameState.physics.speed;
      player.facingRight = true;
    }
    if (player.keys.jump && player.onGround) {
      player.vel_y = gameState.physics.jumpSpeed;
      player.onGround = false;
    }
    // Variable jump height
    if (!player.keys.jump && player.vel_y < gameState.physics.minJumpVelocity) {
      player.vel_y = gameState.physics.minJumpVelocity;
    }
  }
}

function movePlayerWithCollision(player, dt) {
  // Horizontal movement
  const newX = player.pos_x + player.vel_x * dt;
  if (!checkHorizontalCollision(newX, player.pos_y, player)) {
    player.pos_x = newX;
  } else {
    player.vel_x = 0;
  }

  // Vertical movement
  const newY = player.pos_y + player.vel_y * dt;
  if (!checkVerticalCollision(player.pos_x, newY, player)) {
    player.pos_y = newY;
    player.onGround = false;
  } else {
    if (player.vel_y > 0) {
      player.onGround = true;
    }
    player.vel_y = 0;
  }


  // Check if character fell off the map
  if (player.pos_y > MAP_HEIGHT) {
    playerHit(player.id, 1);
  }
}

// Check for horizontal collisions
function checkHorizontalCollision(newX, y, character) {
  // Get the previous position for side detection
  const prevLeftX = character.pos_x;
  const prevRightX = character.pos_x + character.width;
  const newLeftX = newX;
  const newRightX = newX + character.width;

  // Use more precise collision detection with floating point values
  const top = Math.floor(y);
  const bottom = Math.floor(y + character.height - 1);
  
  // Check multiple points along the character's height for better collision detection
  const checkPoints = Math.max(5, bottom - top + 1); // At least 5 check points
  
  // Calculate horizontal movement distance in pixels
  const movementDistance = Math.abs(newX - character.pos_x);
  
  // Log collision checks for debugging
  console.log(`Checking horizontal collision: Previous X=${character.pos_x}, New X=${newX}, Distance=${movementDistance}`);
  
  if (character.vel_x > 0) { // Moving right
    // Always perform ray casting regardless of movement distance
    console.log(`Ray casting for rightward movement from ${prevRightX} to ${newRightX}`);
    
    // Number of steps based on distance (at least 5 steps, more steps for larger distances)
    const steps = Math.max(5, Math.ceil(movementDistance / 4) + 3);
    
    // Check along the path
    for (let step = 0; step < steps; step++) {
      // Interpolate between previous and new position
      const t = step / (steps - 1);
      const checkX = Math.floor(character.pos_x + t * (newX - character.pos_x));
      const checkRight = Math.floor(checkX + character.width);
      
      // Check at multiple points vertically
      for (let i = 0; i < checkPoints; i++) {
        const checkY = Math.floor(top + (i * (bottom - top) / (checkPoints - 1)));
        
        // Make sure we're checking valid map coordinates
        if (checkRight >= 0 && checkRight < MAP_WIDTH && checkY >= 0 && checkY < MAP_HEIGHT) {
          if (gameState.map[checkY] && 
              gameState.map[checkY][checkRight] && 
              gameState.map[checkY][checkRight].solid) {
            console.log(`Collision detected during ray casting at step ${step}, position (${checkRight}, ${checkY})`);
            character.pos_x = checkRight - character.width;
            return true;
          }
        }
      }
    }
    
    // Traditional endpoint check at the destination
    // Right collision (right wall)
    const right = Math.floor(newX + character.width);
    
    // First check the center point for efficiency
    const centerY = Math.floor(top + (bottom - top) / 2);
    if (right >= 0 && right < MAP_WIDTH && centerY >= 0 && centerY < MAP_HEIGHT) {
      if (gameState.map[centerY] && gameState.map[centerY][right] && gameState.map[centerY][right].solid) {
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
        if (gameState.map[checkY] && gameState.map[checkY][right] && gameState.map[checkY][right].solid) {
          character.pos_x = right - character.width;
          return true;
        }
      }
    }
  } else if (character.vel_x < 0) { // Moving left
    // Always perform ray casting regardless of movement distance
    console.log(`Ray casting for leftward movement from ${prevLeftX} to ${newLeftX}`);
    
    // Number of steps based on distance (at least 5 steps, more steps for larger distances)
    const steps = Math.max(5, Math.ceil(movementDistance / 4) + 3);
    
    // Check along the path
    for (let step = 0; step < steps; step++) {
      // Interpolate between previous and new position
      const t = step / (steps - 1);
      const checkX = Math.floor(character.pos_x + t * (newX - character.pos_x));
      
      // Check at multiple points vertically
      for (let i = 0; i < checkPoints; i++) {
        const checkY = Math.floor(top + (i * (bottom - top) / (checkPoints - 1)));
        
        // Make sure we're checking valid map coordinates
        if (checkX >= 0 && checkX < MAP_WIDTH && checkY >= 0 && checkY < MAP_HEIGHT) {
          if (gameState.map[checkY] && 
              gameState.map[checkY][checkX] && 
              gameState.map[checkY][checkX].solid) {
            console.log(`Collision detected during ray casting at step ${step}, position (${checkX}, ${checkY})`);
            character.pos_x = checkX + 1;
            return true;
          }
        }
      }
    }
    
    // Traditional endpoint check at the destination
    // Left collision (left wall)
    const left = Math.floor(newX);
    
    // First check the center point for efficiency
    const centerY = Math.floor(top + (bottom - top) / 2);
    if (left >= 0 && left < MAP_WIDTH && centerY >= 0 && centerY < MAP_HEIGHT) {
      if (gameState.map[centerY] && gameState.map[centerY][left] && gameState.map[centerY][left].solid) {
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
        if (gameState.map[checkY] && gameState.map[checkY][left] && gameState.map[checkY][left].solid) {
          character.pos_x = left + 1;
          return true;
        }
      }
    }
  }
  
  return false;
}

// Check for vertical collisions
function checkVerticalCollision(x, newY, character) {
  // Get the previous and new feet positions
  const prevFeetY = character.pos_y + character.height;
  const newFeetY = newY + character.height;
  
  // Use more precise collision detection with floating point values
  const left = Math.floor(x);
  const right = Math.floor(x + character.width - 1);
  
  // Check multiple points along the character's width for better collision detection
  const checkPoints = Math.max(5, right - left + 1); // At least 5 check points
  
  // For fast movement: check multiple points along the path of travel
  const movingDown = character.vel_y > 0;
  const movingUp = character.vel_y < 0;
  
  // Calculate the vertical movement distance in pixels
  const movementDistance = Math.abs(newY - character.pos_y);
  
  // Log collision checks for debugging
  console.log(`Checking vertical collision: Previous Y=${character.pos_y}, New Y=${newY}, Distance=${movementDistance}`);
  
  if (movingDown) { // Moving down
    // Always perform ray casting regardless of movement distance
    console.log(`Ray casting for downward movement from ${prevFeetY} to ${newFeetY}`);
    
    // Number of steps based on distance (at least 5 steps, more steps for larger distances)
    // For every 4 pixels of movement, add an extra step (minimum 5)
    const steps = Math.max(5, Math.ceil(movementDistance / 4) + 3);
    
    // Check along the path
    for (let step = 0; step < steps; step++) {
      // Interpolate between previous and new position
      const t = step / (steps - 1);
      const checkY = Math.floor(character.pos_y + t * (newY - character.pos_y));
      const checkBottom = Math.floor(checkY + character.height);
      
      // Check at multiple points horizontally
      for (let i = 0; i < checkPoints; i++) {
        const checkX = Math.floor(left + (i * (right - left) / (checkPoints - 1)));
        
        // Make sure we're checking valid map coordinates
        if (checkX >= 0 && checkX < MAP_WIDTH && checkBottom >= 0 && checkBottom < MAP_HEIGHT) {
          if (gameState.map[checkBottom] && 
              gameState.map[checkBottom][checkX] && 
              gameState.map[checkBottom][checkX].solid) {
            console.log(`Collision detected during ray casting at step ${step}, position (${checkX}, ${checkBottom})`);
            character.pos_y = checkBottom - character.height;
            return true;
          }
        }
      }
    }
    
    // Traditional collision check at the destination position if no collision was found during ray casting
    // Bottom collision (floor)
    const bottom = Math.floor(newY + character.height);
    
    // First check the center point for efficiency
    const centerX = Math.floor(left + (right - left) / 2);
    if (centerX >= 0 && centerX < MAP_WIDTH && bottom >= 0 && bottom < MAP_HEIGHT) {
      if (gameState.map[bottom] && gameState.map[bottom][centerX] && gameState.map[bottom][centerX].solid) {
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
        if (gameState.map[bottom] && gameState.map[bottom][checkX] && gameState.map[bottom][checkX].solid) {
          character.pos_y = bottom - character.height;
          return true;
        }
      }
    }
  } else if (movingUp) { // Moving up
    // Always perform ray casting regardless of movement distance
    console.log(`Ray casting for upward movement from ${character.pos_y} to ${newY}`);
    
    // Number of steps based on distance (at least 5 steps, more steps for larger distances)
    const steps = Math.max(5, Math.ceil(movementDistance / 4) + 3);
    
    // Check along the path
    for (let step = 0; step < steps; step++) {
      // Interpolate between previous and new position
      const t = step / (steps - 1);
      const checkY = Math.floor(character.pos_y + t * (newY - character.pos_y));
      
      // Check at multiple points horizontally
      for (let i = 0; i < checkPoints; i++) {
        const checkX = Math.floor(left + (i * (right - left) / (checkPoints - 1)));
        
        // Make sure we're checking valid map coordinates
        if (checkX >= 0 && checkX < MAP_WIDTH && checkY >= 0 && checkY < MAP_HEIGHT) {
          if (gameState.map[checkY] && 
              gameState.map[checkY][checkX] && 
              gameState.map[checkY][checkX].solid) {
            console.log(`Collision detected during ray casting at step ${step}, position (${checkX}, ${checkY})`);
            character.pos_y = checkY + 1;
            return true;
          }
        }
      }
    }
    
    // Traditional collision check at the destination position if no collision was found during ray casting
    // Top collision (ceiling)
    const top = Math.floor(newY);
    
    // First check the center point for efficiency
    const centerX = Math.floor(left + (right - left) / 2);
    if (centerX >= 0 && centerX < MAP_WIDTH && top >= 0 && top < MAP_HEIGHT) {
      if (gameState.map[top] && gameState.map[top][centerX] && gameState.map[top][centerX].solid) {
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
        if (gameState.map[top] && gameState.map[top][checkX] && gameState.map[top][checkX].solid) {
          character.pos_y = top + 1;
          return true;
        }
      }
    }
  }
  
  return false;
}

function updateEnemies(dt) {
  gameState.enemies.forEach(enemy => {
    if (enemy.defeated) {
      // Handle respawning
      enemy.respawnTimer -= dt;
      if (enemy.respawnTimer <= 0) {
        enemy.defeated = false;
        enemy.x = enemy.originalX;
        enemy.y = enemy.originalY;
        enemy.vel_x = 50; // Reset velocity
      }
      return;
    }

    // Move enemy
    if (enemy.facingRight) {
      enemy.x += enemy.vel_x * dt;
      if (enemy.x >= enemy.rightBound) {
        enemy.facingRight = false;
      }
    } else {
      enemy.x -= enemy.vel_x * dt;
      if (enemy.x <= enemy.leftBound) {
        enemy.facingRight = true;
      }
    }

    // Update animation
    enemy.animationTimer += dt;
    if (enemy.animationTimer >= 0.2) {
      enemy.animationTimer = 0;
      enemy.animationFrame = (enemy.animationFrame + 1) % 2;
    }
  });
}


// Check collision between character and enemy using pixel-perfect collision
function checkCharacterEnemyCollision(character, enemy) {
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
        return false;
    }
    
    // Calculate the overlapping rectangle
    const overlapBox = {
        x: Math.max(characterBox.x, enemyBox.x),
        y: Math.max(characterBox.y, enemyBox.y),
        width: Math.min(characterBox.x + characterBox.width, enemyBox.x + enemyBox.width) - Math.max(characterBox.x, enemyBox.x),
        height: Math.min(characterBox.y + characterBox.height, enemyBox.y + enemyBox.height) - Math.max(characterBox.y, enemyBox.y)
    };
    
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
                if (characterSprite && 
                  characterSprite[characterFrame] && 
                  characterSprite[characterFrame][characterLocalY]) {
                    const pixelColor = characterSprite[characterFrame][characterLocalY][characterPixelX];
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
                return true; // Collision detected
            }
        }
    }
    
    return false; // No collision
}

function checkCollisions() {
  // Check player-enemy collisions
  Object.values(gameState.players).forEach(player => {
    gameState.enemies.forEach(enemy => {
      if (!enemy.defeated) {
        // Check if player is landing on top of enemy
        const playerBottom = player.pos_y + player.height;
        const playerFeet = playerBottom - 2; // Just the bottom 2 pixels
        const enemyTop = enemy.y;

        if (player.vel_y > 0 && // Player is falling
            playerFeet <= enemyTop && // Player's feet are at or above enemy's top
            playerBottom >= enemyTop && // Player's bottom is at or below enemy's top
            player.pos_x + 4 < enemy.x + enemy.width && // Horizontal overlap check
            player.pos_x + player.width - 4 > enemy.x) {
          
          // Player is landing on top of enemy
          player.vel_y = gameState.physics.jumpSpeed * 0.7; // Bounce
          enemy.defeated = true; // Defeat the enemy
          enemy.respawnTimer = 5; // Respawn after 5 seconds
        } 
        // Check for other collisions using bounding box
        else if (checkCharacterEnemyCollision(player, enemy)) {
          // Player hit by enemy
          playerHit(player.id, 1);
        }
      }
    });

    // Check player-collectible collisions
    gameState.collectibles.forEach(collectible => {
      if (!collectible.collected && checkRectCollision(
        player.pos_x, player.pos_y, player.width, player.height,
        collectible.x, collectible.y, collectible.width, collectible.height
      )) {
        collectible.collected = true;
      }
    });
  });
}

function playerHit(id, damage) {
  let player = gameState.players[id];

  if(player) {
    // Reset character position
    gameState.players[id].pos_x = 50;
    gameState.players[id].pos_y = 200;
    gameState.players[id].vel_x = 0;
    gameState.players[id].vel_y = 0;

    broadcast({
      type: 'playerHit',
      damage: damage,
      id: id
    });
  }
}

function checkRectCollision(x1, y1, w1, h1, x2, y2, w2, h2) {
  return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
}

function broadcast(data) {
  try {
    // Make sure data is a valid object before stringifying
    if (!data || typeof data !== 'object') {
      console.error("Invalid data passed to broadcast:", data);
      return;
    }
    
    const message = JSON.stringify(data);
    console.log(`Broadcasting message type: ${data.type} (${message.length} bytes)`);
    
    let sentCount = 0;
    server.clients.forEach(client => {
      try {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message, (err) => {
            if (err) {
              console.error("Error sending message:", err);
            } else {
              sentCount++;
            }
          });
        }
      } catch (clientError) {
        console.error("Error sending message to client:", clientError);
      }
    });
    
    console.log(`Message sent to ${sentCount} clients`);
  } catch (error) {
    console.error("Error in broadcast function:", error);
  }
}

// Initialize the game state
function initializeGameState() {
  console.log("Initializing game state on server");
  createMap();
  createCollectibles();
  createEnemies();
  console.log("Game state initialized:");
  console.log("- Map size:", gameState.map.length);
  console.log("- Collectibles:", gameState.collectibles.length);
  console.log("- Enemies:", gameState.enemies.length);
}

// Create the game map
function createMap() {
  // Initialize map as a 2D array
  gameState.map = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    gameState.map[y] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      gameState.map[y][x] = { type: 'empty', solid: false, color: '#000' };
    }
  }
  
  // Create ground
  for (let x = 0; x < MAP_WIDTH; x++) {
    gameState.map[MAP_HEIGHT - 1][x] = { type: 'ground', solid: true, color: '#8B4513' };
    gameState.map[MAP_HEIGHT - 2][x] = { type: 'grass', solid: true, color: '#228B22' };
  }
  
  // Create platforms
  createPlatform(100, 180, 150);
  createPlatform(300, 150, 100);
  createPlatform(450, 120, 80);
  createPlatform(600, 150, 120);
  
  // Create a hole in the ground
  for (let x = 300; x <= 350; x++) {
    gameState.map[MAP_HEIGHT - 1][x] = { type: 'empty', solid: false, color: '#000' };
    gameState.map[MAP_HEIGHT - 2][x] = { type: 'empty', solid: false, color: '#000' };
  }
  
  // Create another hole
  for (let x = 500; x <= 530; x++) {
    gameState.map[MAP_HEIGHT - 1][x] = { type: 'empty', solid: false, color: '#000' };
    gameState.map[MAP_HEIGHT - 2][x] = { type: 'empty', solid: false, color: '#000' };
  }
}

// Create a platform at the specified position
function createPlatform(x, y, width) {
  for (let i = 0; i < width; i++) {
    gameState.map[y][x + i] = { type: 'platform', solid: true, color: '#8B4513' };
  }
}

// Create collectible items
function createCollectibles() {
  gameState.collectibles = [];
  
  // Add coins at various positions
  addCollectible(150, 160, 'coin');
  addCollectible(170, 160, 'coin');
  addCollectible(190, 160, 'coin');
  
  addCollectible(320, 130, 'coin');
  addCollectible(340, 130, 'coin');
  addCollectible(360, 130, 'coin');
  
  addCollectible(470, 100, 'coin');
  addCollectible(480, 100, 'coin');
  addCollectible(490, 100, 'coin');
  
  addCollectible(650, 130, 'coin');
  addCollectible(670, 130, 'coin');
}

// Add a collectible item
function addCollectible(x, y, type) {
  gameState.collectibles.push({
    x: x,
    y: y,
    pos_x: x, // Add pos_x for client compatibility
    pos_y: y, // Add pos_y for client compatibility
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
  gameState.enemies = [];
  
  // Add enemies at various positions
  addEnemy(200, 238 - 16, 'slime', 150, 250);
  addEnemy(400, 238 - 16, 'robot', 380, 480);
  addEnemy(650, 148 - 16, 'bat', 600, 700);
}

// Add an enemy
function addEnemy(x, y, type, leftBound, rightBound) {
  gameState.enemies.push({
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

const characterSprite = createCharacterSprite(16, 24);

// Create a simple character sprite
function createCharacterSprite(width, height) {
  const sprite = [];
  
  // Standing frame - more detailed character
  sprite[0] = [];
  for (let y = 0; y < height; y++) {
      sprite[0][y] = [];
      for (let x = 0; x < width; x++) {
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

// Handle sword attack from client
function handleSwordAttack(data) {
  const { playerId, swordX, swordY, swordWidth, swordHeight, facingRight } = data;
  
  // Verify the player exists
  if (!gameState.players[playerId]) return;
  
  // Broadcast the sword attack to all clients
  broadcast({
    type: 'playerSwordAttack',
    playerId: playerId,
    swordX: swordX,
    swordY: swordY,
    swordWidth: swordWidth,
    swordHeight: swordHeight,
    facingRight: facingRight
  });
  
  // Check for enemies in sword range
  gameState.enemies.forEach((enemy, index) => {
    // Skip already defeated enemies
    if (enemy.defeated) return;
    
    // Check if sword hitbox intersects with enemy
    if (checkRectCollision(
      swordX, swordY, swordWidth, swordHeight,
      enemy.x, enemy.y, enemy.width, enemy.height
    )) {
      // Defeat enemy
      enemy.defeated = true;
      enemy.respawnTimer = 5; // Respawn after 5 seconds
      
      // Broadcast enemy defeat to all clients
      broadcast({
        type: 'enemyDefeated',
        enemyIndex: index,
        playerId: playerId
      });
    }
  });
}