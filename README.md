# Pixelknight

A multiplayer 2D platformer game with pixel art graphics, built with JavaScript and WebSockets.

## Features

- Real-time multiplayer gameplay
- Pixel art graphics rendered on HTML5 Canvas
- WebSocket-based client-server architecture
- Physics engine with collision detection
- Enemies with AI behavior
- Collectible items
- Sword combat system

## Getting Started

### Prerequisites

- Node.js (v12 or higher)

### Installation

1. Clone the repository
```
git clone <repository-url>
cd pixelknight
```

2. Install dependencies
```
npm install
```

3. Start the server
```
node servercode.js
```

4. Open the game in your browser
```
open index.html
```

## How to Play

- Use arrow keys or WASD to move
- Space to jump
- X, Z, or Ctrl to attack with sword
- Collect coins for points
- Defeat enemies with your sword
- Avoid falling into pits

## Multiplayer

- Multiple players can connect to the same server
- Players can see each other in real-time
- Players can collaborate to defeat enemies
- Sword attacks are visible to all players

## Development

The game consists of two main components:

1. **Client** (index.html, game.js, styles.css)
   - Handles rendering, input, and client-side prediction
   - Communicates with the server via WebSockets

2. **Server** (servercode.js)
   - Manages game state
   - Handles physics and collision detection
   - Broadcasts updates to all connected clients

## License

This project is licensed under the MIT License - see the LICENSE file for details. 