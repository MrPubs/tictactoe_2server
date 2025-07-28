
// Setup Modules
const WebSocket = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const GameInstance = require('../game/game');
const Redis = require('ioredis')

class ServerInstance {
    constructor(port = process.env.PORT || 3001) {

        // Params
        this.port = port;
        this.server = http.createServer();
        this.wss = new WebSocket.Server({ server: this.server });
        
        // redis
        this.redis = new Redis({ host: 'redis', port: 6379 })

        // Callbacks
        this._setupConnectionHandling();
    }

    _setupConnectionHandling() {
        this.wss.on('connection', (ws) => {

            // Announce
            console.log('Client connected');

            // Assign Client id and prompt action
            ws.clientId = uuidv4();
            ws.send(JSON.stringify({ type: 'client_id', id: ws.clientId }));
              
            // try to parse data
            ws.on('message', (msg) => {

                let data;
                try {

                    data = JSON.parse(msg);
                    console.log(data);
                } 
                catch {
                    console.log("ha")
                    ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
                    return;
                }

                this._handleMessage(ws, data);
            });

            ws.on('close', () => {
                
                // Delete client from game
                this._exitGame(ws, {client_id:ws.clientId})

                // Delete client to game link
                this.redis.del(`client:${ws.clientId}`)
                console.log('Client disconnected');
            });
        });
    };

    _handleMessage(ws, data) {

      switch (data.type) {
      
        case 'show games':
            this._showExistingGames(ws);
            break;

        case 'new game':
            this._createNewGame(ws);
            break;

        case 'join game':
            this._joinGame(ws, data.payload);
            break;
        
        case 'exit':
            this._exitGame(ws, data.payload);
            break;

        case 'move':
            this._makeMove(ws, data.payload);
            break;

        default:
            ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${data.type}` }));
      };
    };
    
    async _makeMove(ws, payload) {
        
        // load board
        const game_id = JSON.parse(await this.redis.get(`client:${payload.client_id}`)).game_id
        const game = await this.loadGame(game_id)

        // Check for authority
        if (game.players[game.currentPlayer] === payload.client_id) {

            // Make move
            if (game.makeMove(payload.row, payload.col)) {
                this.saveGame(game_id, game)
                
                // check winner
                if (game.winner) {
                    
                    //notify winner!
                    this.redis.del(`game:${game_id}`)
                    ws.send(JSON.stringify({ type: 'winner', options:['show games','new game','join game']}))
                }
                else{
                    
                    // Notify other player its their turn
                    other_ws.send(JSON.stringify({ type: 'your_turn', boardrepr:game.board.toString()}))
                }
            }
            else {ws.send(JSON.stringify({ type: 'error', message:'tried an illegal move!'}))}
        }
        else {ws.send(JSON.stringify({ type: 'error', message:'tried playing not on turn!'}))};
    };

    async _exitGame(ws, payload) {
        
        const game_id = JSON.parse(await this.redis.get(`client:${payload.client_id}`)).game_id
        const game = await this.loadGame(game_id)

        // remove player from game
        if (game.players['x'] === payload.client_id) {
            game.players['x'] = null
            await this.saveGame(game_id, game)

        } else if (game.players['o'] === payload.client_id) {
            game.players['o'] = null
            await this.saveGame(game_id, game)
        }

        // if both empty close game
        if (game.players['x'] === null && game.players['o'] === null) {
            
            console.log(`Removing game: ${game_id}!`)
            await this.redis.del(`game:${game_id}`)
            // remove redis game
        }
        ws.send(JSON.stringify({ type: 'left_game', status: 'OK', options:['show games','new game', 'join game']}))
    }

    // show existing games
    async _showExistingGames(ws) {

        // List existing games and send to client
        // const existingGamesList = Array.from(this.games.keys());
        const existingGamesList = await this.getAllGameIds()
        ws.send(JSON.stringify({
             type: 'existing_games',
             message: existingGamesList, option: ['show games', 'new game', 'join game']}));
    };

    // create new game
    async _createNewGame(ws) {
        
        // create new game
        const game_uuid = uuidv4();
        const new_game = new GameInstance();
        await this.saveGame(game_uuid, new_game);
        console.log(`Game Created: <${game_uuid}>!`)

        //response
        ws.send(JSON.stringify({ type: 'game_created', uuid: game_uuid }));
    };

    // join a game
    async _joinGame(ws, payload) {

        // get the game
        const game = await this.loadGame(payload.game_id)
        
        // first check if x is not assigned
        if (game.players['x'] === null) {
            game.players['x'] = payload.client_id
            console.log(`client ${payload.client_id} assigned x`)
        }
        else if (game.players['o'] === null){
            game.players['o'] = payload.client_id
            console.log(`client ${payload.client_id} assigned o`)

        } else {
            // already full..
            ws.send(JSON.stringify({ type: 'error', message: 'Game is Full!'}))
        }
        await this.saveGame(payload.game_id, game);
        await this.redis.set(`client:${payload.client_id}`,JSON.stringify({game_id:payload.game_id,ws:ws}));
        ws.send(JSON.stringify({ type: 'joined_game', status: 'OK', options:['move','exit'], boardrepr: game.board.toString()}))

    };

    // get all game ids that are in redis
    async getAllGameIds() {
        const keys = await this.redis.keys('game:*');
        return keys.map(key => key.split(':')[1]); // extract only the gameId part
    };

    // save game on redis server
    async saveGame(gameId, game) {
        await this.redis.set(`game:${gameId}`, JSON.stringify(game.toJSON()));
    };

    // load game
    async loadGame(gameId) {
        const raw = await this.redis.get(`game:${gameId}`);
        return raw ? GameInstance.fromJSON(JSON.parse(raw)) : null;
    };

    start() {
      this.server.listen(this.port, () => {
        console.log(`Server listening on port ${this.port}`);
      });
    };
};

// start server
server = new ServerInstance()
server.start()